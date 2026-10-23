-- =====================================================================
-- Masar Pro — Migration 001: Foundation (multi-tenant core)
-- المكاتب، الحسابات والأدوار، حدود الحسابات، الاشتراكات، Super Admin، سجل التعديلات، مساحة الملفات
--
-- التشغيل: Supabase Dashboard ← SQL Editor ← الصق الملف كله ← Run
-- قبل التشغيل: فعّل إضافة pg_cron من Database ← Extensions
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1) الأنواع
-- ---------------------------------------------------------------------
do $$ begin
  create type public.office_role as enum ('owner', 'accountant', 'operations', 'hr');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.subscription_status as enum ('trial', 'active', 'past_due', 'suspended', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  -- الأقسام اللي ممكن تتفعل لكل مكتب (التعيينات / المرتبات / الموظفين)
  create type public.app_module as enum ('recruitment', 'payroll', 'staff');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2) الجداول
-- ---------------------------------------------------------------------

-- أصحاب المنصة (Super Admin)
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- الباقات
create table if not exists public.plans (
  id                  text primary key,
  name                text not null,
  monthly_price       numeric(12,2) not null check (monthly_price >= 0),
  seats               jsonb not null,               -- {"owner":1,"accountant":1,"operations":2,"hr":5}
  extra_seat_price    numeric(12,2),                -- سعر الحساب الإضافي (يتحدد من Super Admin)
  max_active_couriers int,                          -- null = بدون حد
  modules             public.app_module[] not null default '{recruitment,payroll,staff}',
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

insert into public.plans (id, name, monthly_price, seats, max_active_couriers, modules)
values ('standard', 'Masar Pro Standard', 1999,
        '{"owner":1,"accountant":1,"operations":2,"hr":5}', 300, '{recruitment,payroll,staff}')
on conflict (id) do nothing;

-- المكاتب (العملاء)
create table if not exists public.offices (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique,
  phone      text,
  city       text,
  logo_path  text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- الاشتراك الحالي لكل مكتب
create table if not exists public.subscriptions (
  office_id            uuid primary key references public.offices(id) on delete cascade,
  plan_id              text not null references public.plans(id),
  status               public.subscription_status not null default 'trial',
  current_period_start date not null default current_date,
  current_period_end   date not null default (current_date + 14),
  grace_days           int  not null default 7 check (grace_days between 0 and 60),
  monthly_price        numeric(12,2) not null check (monthly_price >= 0), -- السعر المتفق عليه مع المكتب
  extra_seats          jsonb not null default '{}'::jsonb,                -- {"hr":2}
  max_active_couriers  int,                                               -- يتجاوز حد الباقة لو اتحدد
  modules              public.app_module[] not null,
  notes                text,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users(id)
);

-- مدفوعات الاشتراك
create table if not exists public.subscription_payments (
  id           uuid primary key default gen_random_uuid(),
  office_id    uuid not null references public.offices(id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  method       text not null,          -- إنستاباي / فودافون كاش / تحويل بنكي / كاش / Paymob
  reference    text,
  months       int not null default 1 check (months between 1 and 24),
  period_start date not null,
  period_end   date not null,
  paid_at      timestamptz not null default now(),
  recorded_by  uuid references auth.users(id),
  notes        text
);
create index if not exists subscription_payments_office_idx on public.subscription_payments (office_id, paid_at desc);

-- أعضاء كل مكتب وأدوارهم
create table if not exists public.office_members (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.office_role not null,
  full_name  text,
  phone      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (office_id, user_id)
);
create index if not exists office_members_user_idx   on public.office_members (user_id) where is_active;
create index if not exists office_members_office_idx on public.office_members (office_id, role) where is_active;

-- الدعوات (بتتبعت من Edge Function)
create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),
  office_id   uuid not null references public.offices(id) on delete cascade,
  email       text not null,
  role        public.office_role not null,
  full_name   text,
  invited_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz
);
create index if not exists invitations_office_idx on public.invitations (office_id);
create unique index if not exists invitations_pending_uniq on public.invitations (office_id, lower(email)) where accepted_at is null;

-- سجل التعديلات
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  office_id  uuid,                   -- بدون FK علشان السجل يفضل حتى لو المكتب اتمسح
  actor_id   uuid,
  action     text not null,          -- INSERT / UPDATE / DELETE / أو اسم إجراء
  entity     text not null,          -- اسم الجدول
  entity_id  text,
  data       jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_office_idx on public.audit_log (office_id, created_at desc);

-- ---------------------------------------------------------------------
-- 3) دوال مساعدة (بتستخدمها سياسات الصلاحيات)
-- ---------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

create or replace function public.my_office_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select office_id from public.office_members
  where user_id = (select auth.uid()) and is_active;
$$;

create or replace function public.has_office_role(p_office uuid, p_roles public.office_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.office_members
    where office_id = p_office and user_id = (select auth.uid()) and is_active and role = any (p_roles)
  );
$$;

-- المكتب مسموح له يكتب؟ (موقوف أو ملغي = قراءة فقط)
create or replace function public.office_is_writable(p_office uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.subscriptions
    where office_id = p_office and status in ('trial', 'active', 'past_due')
  );
$$;

create or replace function public.office_has_module(p_office uuid, p_module public.app_module)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.subscriptions where office_id = p_office and p_module = any (modules));
$$;

-- حد الحسابات لدور معين في مكتب = حد الباقة + الإضافي
create or replace function public.seat_limit(p_office uuid, p_role public.office_role)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce((p.seats ->> p_role::text)::int, 0) + coalesce((s.extra_seats ->> p_role::text)::int, 0)
  from public.subscriptions s join public.plans p on p.id = s.plan_id
  where s.office_id = p_office;
$$;

-- ---------------------------------------------------------------------
-- 4) Triggers
-- ---------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists offices_touch on public.offices;
create trigger offices_touch before update on public.offices for each row execute function public.touch_updated_at();
drop trigger if exists members_touch on public.office_members;
create trigger members_touch before update on public.office_members for each row execute function public.touch_updated_at();
drop trigger if exists subs_touch on public.subscriptions;
create trigger subs_touch before update on public.subscriptions for each row execute function public.touch_updated_at();

-- منع تجاوز عدد الحسابات المسموح لكل دور
create or replace function public.enforce_seat_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_limit int; v_used int;
begin
  if not new.is_active then return new; end if;
  if tg_op = 'UPDATE' and old.is_active and old.role = new.role and old.office_id = new.office_id then
    return new;
  end if;
  v_limit := public.seat_limit(new.office_id, new.role);
  select count(*) into v_used from public.office_members
   where office_id = new.office_id and role = new.role and is_active and id <> new.id;
  if v_limit is null or v_used >= v_limit then
    raise exception 'SEAT_LIMIT_REACHED: لا يمكن إضافة حساب % جديد. المسموح %', new.role, coalesce(v_limit, 0)
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists office_members_seats on public.office_members;
create trigger office_members_seats before insert or update on public.office_members
  for each row execute function public.enforce_seat_limit();

-- حماية صاحب المكتب: ممنوع يتشال أو يتوقف آخر Owner
create or replace function public.protect_last_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_left int;
begin
  if old.role <> 'owner' or not old.is_active then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.role = 'owner' and new.is_active then return new; end if;
  -- حذف المكتب كله مسموح (الحذف بالتتابع)
  if tg_op = 'DELETE' and not exists (select 1 from public.offices where id = old.office_id) then return old; end if;
  select count(*) into v_left from public.office_members
   where office_id = old.office_id and role = 'owner' and is_active and id <> old.id;
  if v_left = 0 then
    raise exception 'LAST_OWNER: لازم يفضل صاحب مكتب واحد على الأقل' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists office_members_owner on public.office_members;
create trigger office_members_owner before update or delete on public.office_members
  for each row execute function public.protect_last_owner();

-- سجل التعديلات (Trigger عام يتركب على أي جدول فيه office_id)
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_row jsonb; v_office uuid;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_office := coalesce((v_row ->> 'office_id')::uuid, case when tg_table_name = 'offices' then (v_row ->> 'id')::uuid end);
  insert into public.audit_log (office_id, actor_id, action, entity, entity_id, data)
  values (
    v_office, (select auth.uid()), tg_op, tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'office_id'),
    case when tg_op = 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)) else v_row end
  );
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists audit_subscriptions on public.subscriptions;
create trigger audit_subscriptions after insert or update or delete on public.subscriptions
  for each row execute function public.audit_trigger();
drop trigger if exists audit_members on public.office_members;
create trigger audit_members after insert or update or delete on public.office_members
  for each row execute function public.audit_trigger();
drop trigger if exists audit_payments on public.subscription_payments;
create trigger audit_payments after insert or update or delete on public.subscription_payments
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- 5) سياسات الصلاحيات (RLS)
-- ---------------------------------------------------------------------
alter table public.platform_admins       enable row level security;
alter table public.plans                 enable row level security;
alter table public.offices               enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.office_members        enable row level security;
alter table public.invitations           enable row level security;
alter table public.audit_log             enable row level security;

-- platform_admins: كل واحد يشوف نفسه بس (علشان الواجهة تعرف هو Admin ولا لأ)
drop policy if exists pa_select on public.platform_admins;
create policy pa_select on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- plans
drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans for select to authenticated using (true);
drop policy if exists plans_admin on public.plans;
create policy plans_admin on public.plans for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

-- offices
drop policy if exists offices_select on public.offices;
create policy offices_select on public.offices for select to authenticated
  using (id in (select public.my_office_ids()) or (select public.is_platform_admin()));
drop policy if exists offices_owner_update on public.offices;
create policy offices_owner_update on public.offices for update to authenticated
  using (public.has_office_role(id, '{owner}') and public.office_is_writable(id))
  with check (public.has_office_role(id, '{owner}'));
drop policy if exists offices_admin on public.offices;
create policy offices_admin on public.offices for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

-- subscriptions: الأعضاء يشوفوا اشتراك مكتبهم، والتعديل للـ Admin بس
drop policy if exists subs_select on public.subscriptions;
create policy subs_select on public.subscriptions for select to authenticated
  using (office_id in (select public.my_office_ids()) or (select public.is_platform_admin()));
drop policy if exists subs_admin on public.subscriptions;
create policy subs_admin on public.subscriptions for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

-- subscription_payments: صاحب المكتب والمحاسب يشوفوا، والتسجيل للـ Admin
drop policy if exists pay_select on public.subscription_payments;
create policy pay_select on public.subscription_payments for select to authenticated
  using (public.has_office_role(office_id, '{owner,accountant}') or (select public.is_platform_admin()));
drop policy if exists pay_admin on public.subscription_payments;
create policy pay_admin on public.subscription_payments for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

-- office_members: أعضاء المكتب يشوفوا بعض، وصاحب المكتب بس يضيف ويعدّل
drop policy if exists members_select on public.office_members;
create policy members_select on public.office_members for select to authenticated
  using (office_id in (select public.my_office_ids()) or (select public.is_platform_admin()));
drop policy if exists members_owner_write on public.office_members;
create policy members_owner_write on public.office_members for all to authenticated
  using ((public.has_office_role(office_id, '{owner}') and public.office_is_writable(office_id)) or (select public.is_platform_admin()))
  with check ((public.has_office_role(office_id, '{owner}') and public.office_is_writable(office_id)) or (select public.is_platform_admin()));

-- invitations
drop policy if exists inv_owner on public.invitations;
create policy inv_owner on public.invitations for all to authenticated
  using (public.has_office_role(office_id, '{owner}') or (select public.is_platform_admin()))
  with check ((public.has_office_role(office_id, '{owner}') and public.office_is_writable(office_id)) or (select public.is_platform_admin()));

-- audit_log: قراءة فقط لصاحب المكتب والـ Admin (الكتابة من الـ Trigger)
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using (public.has_office_role(office_id, '{owner}') or (select public.is_platform_admin()));

-- ---------------------------------------------------------------------
-- 6) دوال الـ Super Admin
-- ---------------------------------------------------------------------

create or replace function public.assert_platform_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ALLOWED: الإجراء ده للـ Super Admin بس' using errcode = '42501';
  end if;
end $$;

-- إنشاء مكتب جديد باشتراك تجريبي
create or replace function public.admin_create_office(
  p_name text, p_phone text default null, p_city text default null,
  p_plan text default 'standard', p_trial_days int default 14, p_monthly_price numeric default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_plan public.plans;
begin
  perform public.assert_platform_admin();
  select * into v_plan from public.plans where id = p_plan and is_active;
  if not found then raise exception 'PLAN_NOT_FOUND: %', p_plan; end if;
  insert into public.offices (name, phone, city, created_by)
  values (trim(p_name), p_phone, p_city, auth.uid()) returning id into v_id;
  insert into public.subscriptions (office_id, plan_id, status, current_period_start, current_period_end,
                                    monthly_price, modules, max_active_couriers, updated_by)
  values (v_id, v_plan.id, 'trial', current_date, current_date + greatest(p_trial_days, 0),
          coalesce(p_monthly_price, v_plan.monthly_price), v_plan.modules, null, auth.uid());
  return v_id;
end $$;

-- تعديل اشتراك مكتب (الحالة، السعر، الحسابات الإضافية، الأقسام، تاريخ الانتهاء)
create or replace function public.admin_update_subscription(
  p_office uuid,
  p_status public.subscription_status default null,
  p_period_end date default null,
  p_monthly_price numeric default null,
  p_extra_seats jsonb default null,
  p_modules public.app_module[] default null,
  p_max_active_couriers int default null,
  p_notes text default null
) returns public.subscriptions language plpgsql security definer set search_path = '' as $$
declare v public.subscriptions;
begin
  perform public.assert_platform_admin();
  update public.subscriptions set
    status              = coalesce(p_status, status),
    current_period_end  = coalesce(p_period_end, current_period_end),
    monthly_price       = coalesce(p_monthly_price, monthly_price),
    extra_seats         = coalesce(p_extra_seats, extra_seats),
    modules             = coalesce(p_modules, modules),
    max_active_couriers = coalesce(p_max_active_couriers, max_active_couriers),
    notes               = coalesce(p_notes, notes),
    updated_by          = auth.uid()
  where office_id = p_office returning * into v;
  if not found then raise exception 'OFFICE_NOT_FOUND'; end if;
  return v;
end $$;

-- تسجيل دفعة وتجديد الاشتراك تلقائياً
create or replace function public.admin_record_payment(
  p_office uuid, p_amount numeric, p_method text, p_months int default 1,
  p_reference text default null, p_notes text default null
) returns public.subscriptions language plpgsql security definer set search_path = '' as $$
declare v public.subscriptions; v_start date; v_end date;
begin
  perform public.assert_platform_admin();
  select * into v from public.subscriptions where office_id = p_office for update;
  if not found then raise exception 'OFFICE_NOT_FOUND'; end if;
  -- اشتراك مدفوع ولسه شغال: يتمد من آخره. تجربة أو خلص أو موقوف: يبدأ من النهارده
  v_start := case when v.status in ('active', 'past_due') and v.current_period_end >= current_date
                  then v.current_period_end else current_date end;
  v_end := (v_start + make_interval(months => p_months))::date;
  insert into public.subscription_payments (office_id, amount, method, reference, months, period_start, period_end, recorded_by, notes)
  values (p_office, p_amount, p_method, p_reference, p_months, v_start, v_end, auth.uid(), p_notes);
  update public.subscriptions set status = 'active', current_period_start = v_start,
         current_period_end = v_end, updated_by = auth.uid()
  where office_id = p_office returning * into v;
  return v;
end $$;

-- نظرة عامة على كل المكاتب لشاشة الـ Super Admin
create or replace function public.admin_offices_overview()
returns table (
  office_id uuid, office_name text, city text, phone text, plan_id text, status public.subscription_status,
  current_period_end date, days_left int, monthly_price numeric, modules public.app_module[],
  members_active int, seats_total int, owner_email text, last_activity timestamptz, created_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  return query
  select o.id, o.name, o.city, o.phone, s.plan_id, s.status, s.current_period_end,
         (s.current_period_end - current_date)::int,
         s.monthly_price, s.modules,
         (select count(*)::int from public.office_members m where m.office_id = o.id and m.is_active),
         (select coalesce(sum(value::int), 0)::int from jsonb_each_text(p.seats))
           + (select coalesce(sum(value::int), 0)::int from jsonb_each_text(s.extra_seats)),
         (select u.email::text from public.office_members m join auth.users u on u.id = m.user_id
           where m.office_id = o.id and m.role = 'owner' and m.is_active order by m.created_at limit 1),
         (select max(a.created_at) from public.audit_log a where a.office_id = o.id),
         o.created_at
  from public.offices o
  join public.subscriptions s on s.office_id = o.id
  join public.plans p on p.id = s.plan_id
  order by s.current_period_end;
end $$;

-- ---------------------------------------------------------------------
-- 7) تحديث حالات الاشتراك يومياً
-- ---------------------------------------------------------------------
create or replace function public.refresh_subscription_statuses()
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- خلص الاشتراك ← متأخر في الدفع (لسه يقدر يشتغل خلال المهلة)
  update public.subscriptions set status = 'past_due'
   where status in ('trial', 'active') and current_period_end < current_date;
  -- خلصت المهلة ← موقوف (قراءة فقط)
  update public.subscriptions set status = 'suspended'
   where status = 'past_due' and current_period_end + grace_days < current_date;
end $$;

revoke execute on function public.refresh_subscription_statuses() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 8) مساحة الملفات (مستندات المناديب والموظفين)
--     المسار: <office_id>/<أي حاجة>   مثال: 3f2a.../couriers/<courier_id>/id_front.webp
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 2097152,
        array['image/webp', 'image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists docs_select on storage.objects;
create policy docs_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (
    (storage.foldername(name))[1] in (select id::text from public.offices where id in (select public.my_office_ids()))
    or (select public.is_platform_admin())));

drop policy if exists docs_insert on storage.objects;
create policy docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents'
    and (storage.foldername(name))[1] in (select id::text from public.offices o
         where o.id in (select public.my_office_ids()) and public.office_is_writable(o.id)));

drop policy if exists docs_update on storage.objects;
create policy docs_update on storage.objects for update to authenticated
  using (bucket_id = 'documents'
    and (storage.foldername(name))[1] in (select id::text from public.offices o
         where o.id in (select public.my_office_ids()) and public.office_is_writable(o.id)));

drop policy if exists docs_delete on storage.objects;
create policy docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents'
    and (storage.foldername(name))[1] in (select id::text from public.offices o
         where o.id in (select public.my_office_ids())
           and public.has_office_role(o.id, '{owner,hr}') and public.office_is_writable(o.id)));

-- ---------------------------------------------------------------------
-- 9) صلاحيات تشغيل الدوال
-- ---------------------------------------------------------------------
grant execute on function public.is_platform_admin()                    to authenticated;
grant execute on function public.my_office_ids()                        to authenticated;
grant execute on function public.has_office_role(uuid, public.office_role[]) to authenticated;
grant execute on function public.office_is_writable(uuid)               to authenticated;
grant execute on function public.office_has_module(uuid, public.app_module) to authenticated;
grant execute on function public.seat_limit(uuid, public.office_role)   to authenticated;
grant execute on function public.admin_create_office(text, text, text, text, int, numeric) to authenticated;
grant execute on function public.admin_update_subscription(uuid, public.subscription_status, date, numeric, jsonb, public.app_module[], int, text) to authenticated;
grant execute on function public.admin_record_payment(uuid, numeric, text, int, text, text) to authenticated;
grant execute on function public.admin_offices_overview()               to authenticated;
revoke execute on function public.admin_create_office(text, text, text, text, int, numeric) from anon;
revoke execute on function public.admin_update_subscription(uuid, public.subscription_status, date, numeric, jsonb, public.app_module[], int, text) from anon;
revoke execute on function public.admin_record_payment(uuid, numeric, text, int, text, text) from anon;
revoke execute on function public.admin_offices_overview() from anon;
