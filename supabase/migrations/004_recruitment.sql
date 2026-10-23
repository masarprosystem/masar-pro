-- =====================================================================
-- Masar Pro — Migration 004: قسم التعيينات
-- المناديب، مراحل رحلة المندوب وتاريخها، شركات الشحن والتعاقدات، المستندات
-- التشغيل: SQL Editor ← الصق الملف كله ← Run
-- =====================================================================

create extension if not exists pg_trgm;

do $$ begin
  create type public.courier_stage as enum
    ('applied', 'interview', 'passed_interview', 'training', 'active', 'inactive', 'blocked', 'left');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 1) شركات الشحن (قائمة خاصة بكل مكتب)
-- ---------------------------------------------------------------------
create table if not exists public.carriers (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete cascade,
  name       text not null,
  is_active  boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (office_id, name)
);
create index if not exists carriers_office_idx on public.carriers (office_id, sort_order);

create or replace function public.seed_default_carriers(p_office uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.carriers (office_id, name, sort_order)
  select p_office, n, i from unnest(array['Bosta','Amazon','Noon','Jumia','Aramex','J&T','Mylerz']) with ordinality as t(n, i)
  on conflict (office_id, name) do nothing;
$$;

create or replace function public.offices_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin perform public.seed_default_carriers(new.id); return new; end $$;

drop trigger if exists offices_seed_carriers on public.offices;
create trigger offices_seed_carriers after insert on public.offices
  for each row execute function public.offices_after_insert();

-- المكاتب الموجودة قبل كده
select public.seed_default_carriers(id) from public.offices;

-- ---------------------------------------------------------------------
-- 2) المناديب
-- ---------------------------------------------------------------------
create table if not exists public.couriers (
  id                 uuid primary key default gen_random_uuid(),
  office_id          uuid not null references public.offices(id) on delete cascade,
  full_name          text not null check (length(trim(full_name)) > 1),
  national_id        text not null check (national_id ~ '^[23][0-9]{13}$'),
  birth_date         date,
  gender             text check (gender in ('male', 'female')),
  birth_governorate  text,                      -- كود المحافظة من الرقم القومي
  primary_phone      text not null,
  alt_phone          text,
  current_address    text,
  original_address   text,
  location_link      text,
  vehicle_type       text,
  assigned_area      text,
  lead_source        text,
  stage              public.courier_stage not null default 'applied',
  stage_note         text,
  stage_changed_at   timestamptz not null default now(),
  stage_changed_by   uuid references auth.users(id),
  recruited_by       uuid references public.office_members(id) on delete set null,  -- الـ HR صاحب التعيين (للعمولة)
  legacy_recruiter   text,                      -- اسم الـ HR من النظام القديم لو مش متسجل
  appointment_date   date not null default current_date,
  relatives          jsonb not null default '[]'::jsonb,   -- [{name, relation, phone}]
  external_links     jsonb not null default '{}'::jsonb,   -- روابط قديمة (Drive) من النظام القديم
  current_carrier_id uuid references public.carriers(id) on delete set null,
  current_hub        text,
  notes              text,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (office_id, national_id)
);
create index if not exists couriers_office_stage_idx   on public.couriers (office_id, stage);
create index if not exists couriers_office_created_idx on public.couriers (office_id, created_at desc);
create index if not exists couriers_office_carrier_idx on public.couriers (office_id, current_carrier_id);
create index if not exists couriers_office_recruiter_idx on public.couriers (office_id, recruited_by);
create index if not exists couriers_phone_idx          on public.couriers (office_id, primary_phone);
create index if not exists couriers_name_trgm_idx      on public.couriers using gin (full_name gin_trgm_ops);

-- تاريخ مراحل المندوب
create table if not exists public.courier_stage_history (
  id          bigint generated always as identity primary key,
  office_id   uuid not null references public.offices(id) on delete cascade,
  courier_id  uuid not null references public.couriers(id) on delete cascade,
  from_stage  public.courier_stage,
  to_stage    public.courier_stage not null,
  note        text,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);
create index if not exists stage_history_courier_idx on public.courier_stage_history (courier_id, changed_at desc);
create index if not exists stage_history_office_idx  on public.courier_stage_history (office_id, changed_at desc);

-- التعاقدات: المندوب نازل لأنهي شركة وأنهي هب
create table if not exists public.courier_assignments (
  id          uuid primary key default gen_random_uuid(),
  office_id   uuid not null references public.offices(id) on delete cascade,
  courier_id  uuid not null references public.couriers(id) on delete cascade,
  carrier_id  uuid not null references public.carriers(id) on delete restrict,
  hub         text,
  zone        text,
  start_date  date not null default current_date,
  end_date    date,
  is_current  boolean not null default true,
  notes       text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists assignments_courier_idx on public.courier_assignments (courier_id, start_date desc);
create index if not exists assignments_office_idx  on public.courier_assignments (office_id, carrier_id) where is_current;

-- المستندات (الملف نفسه في Storage bucket "documents")
create table if not exists public.courier_documents (
  id           uuid primary key default gen_random_uuid(),
  office_id    uuid not null references public.offices(id) on delete cascade,
  courier_id   uuid not null references public.couriers(id) on delete cascade,
  doc_type     text not null check (doc_type in
                 ('id_front', 'id_back', 'driving_license', 'vehicle_license', 'criminal_record', 'personal_photo', 'other')),
  storage_path text not null unique,
  mime_type    text,
  size_bytes   int,
  expires_at   date,
  notes        text,
  uploaded_by  uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index if not exists documents_courier_idx on public.courier_documents (courier_id);
create index if not exists documents_expiry_idx  on public.courier_documents (office_id, expires_at) where expires_at is not null;

-- مين سجّل: بيتملى لوحده من الحساب اللي عامل الدخول
alter table public.couriers            alter column created_by  set default auth.uid();
alter table public.courier_assignments alter column created_by  set default auth.uid();
alter table public.courier_documents   alter column uploaded_by set default auth.uid();

-- ---------------------------------------------------------------------
-- 3) Triggers
-- ---------------------------------------------------------------------
drop trigger if exists couriers_touch on public.couriers;
create trigger couriers_touch before update on public.couriers for each row execute function public.touch_updated_at();

-- استخراج تاريخ الميلاد والنوع والمحافظة من الرقم القومي + قواعد المراحل + حد المناديب النشطين
create or replace function public.couriers_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_limit int; v_active int; v_birth date;
begin
  new.full_name := regexp_replace(trim(new.full_name), '\s+', ' ', 'g');
  new.national_id := trim(new.national_id);

  if tg_op = 'INSERT' or new.national_id is distinct from old.national_id then
    begin
      v_birth := make_date(
        (case substr(new.national_id, 1, 1) when '2' then 1900 else 2000 end) + substr(new.national_id, 2, 2)::int,
        substr(new.national_id, 4, 2)::int, substr(new.national_id, 6, 2)::int);
    exception when others then
      raise exception 'INVALID_NATIONAL_ID: تاريخ الميلاد في الرقم القومي غير صحيح' using errcode = 'P0001';
    end;
    new.birth_date := v_birth;
    new.birth_governorate := substr(new.national_id, 8, 2);
    new.gender := case when substr(new.national_id, 13, 1)::int % 2 = 1 then 'male' else 'female' end;
  end if;

  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    if new.stage in ('inactive', 'blocked') and coalesce(trim(new.stage_note), '') = '' then
      raise exception 'STAGE_NOTE_REQUIRED: لازم تكتب السبب لما تحوّل المندوب %', new.stage using errcode = 'P0001';
    end if;
    new.stage_changed_at := now();
    new.stage_changed_by := coalesce((select auth.uid()), new.stage_changed_by);

    if new.stage = 'active' then
      select coalesce(s.max_active_couriers, p.max_active_couriers) into v_limit
        from public.subscriptions s join public.plans p on p.id = s.plan_id where s.office_id = new.office_id;
      if v_limit is not null then
        select count(*) into v_active from public.couriers
         where office_id = new.office_id and stage = 'active' and id <> new.id;
        if v_active >= v_limit then
          raise exception 'ACTIVE_LIMIT_REACHED: وصلت لحد % مندوب نشط في الاشتراك', v_limit using errcode = 'P0001';
        end if;
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists couriers_before_write on public.couriers;
create trigger couriers_before_write before insert or update on public.couriers
  for each row execute function public.couriers_before_write();

-- تسجيل كل تغيير مرحلة في التاريخ
create or replace function public.couriers_log_stage()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into public.courier_stage_history (office_id, courier_id, from_stage, to_stage, note, changed_by)
    values (new.office_id, new.id, case when tg_op = 'UPDATE' then old.stage end, new.stage,
            new.stage_note, coalesce((select auth.uid()), new.stage_changed_by));
  end if;
  return new;
end $$;

drop trigger if exists couriers_log_stage on public.couriers;
create trigger couriers_log_stage after insert or update on public.couriers
  for each row execute function public.couriers_log_stage();

drop trigger if exists audit_couriers on public.couriers;
create trigger audit_couriers after delete on public.couriers
  for each row execute function public.audit_trigger();

-- التعاقد الحالي: يقفل اللي قبله ويحدّث بيانات المندوب
create or replace function public.assignments_after_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_cur public.courier_assignments;
begin
  if tg_op in ('INSERT', 'UPDATE') and new.is_current then
    update public.courier_assignments
       set is_current = false, end_date = coalesce(end_date, greatest(new.start_date, start_date))
     where courier_id = new.courier_id and id <> new.id and is_current;
  end if;
  select * into v_cur from public.courier_assignments
   where courier_id = coalesce(new.courier_id, old.courier_id) and is_current
   order by start_date desc limit 1;
  update public.couriers set current_carrier_id = v_cur.carrier_id, current_hub = v_cur.hub
   where id = coalesce(new.courier_id, old.courier_id);
  return coalesce(new, old);
end $$;

drop trigger if exists assignments_after_write on public.courier_assignments;
create trigger assignments_after_write after insert or update or delete on public.courier_assignments
  for each row when (pg_trigger_depth() < 1) execute function public.assignments_after_write();

-- ---------------------------------------------------------------------
-- 4) الصلاحيات (RLS)
-- ---------------------------------------------------------------------
alter table public.carriers              enable row level security;
alter table public.couriers              enable row level security;
alter table public.courier_stage_history enable row level security;
alter table public.courier_assignments   enable row level security;
alter table public.courier_documents     enable row level security;

-- مساعد: عضو في المكتب والقسم مفعّل
create or replace function public.can_read_module(p_office uuid, p_module public.app_module)
returns boolean language sql stable security definer set search_path = '' as $$
  select (p_office in (select public.my_office_ids()) and public.office_has_module(p_office, p_module))
         or public.is_platform_admin();
$$;
create or replace function public.can_write_module(p_office uuid, p_module public.app_module, p_roles public.office_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_office_role(p_office, p_roles) and public.office_has_module(p_office, p_module)
         and public.office_is_writable(p_office);
$$;
grant execute on function public.can_read_module(uuid, public.app_module) to authenticated;
grant execute on function public.can_write_module(uuid, public.app_module, public.office_role[]) to authenticated;

-- carriers: الكل يقرا، صاحب المكتب والأوبريشن يعدّلوا
drop policy if exists carriers_select on public.carriers;
create policy carriers_select on public.carriers for select to authenticated
  using (office_id in (select public.my_office_ids()) or (select public.is_platform_admin()));
drop policy if exists carriers_write on public.carriers;
create policy carriers_write on public.carriers for all to authenticated
  using (public.can_write_module(office_id, 'recruitment', '{owner,operations}'))
  with check (public.can_write_module(office_id, 'recruitment', '{owner,operations}'));

-- couriers
drop policy if exists couriers_select on public.couriers;
create policy couriers_select on public.couriers for select to authenticated
  using (public.can_read_module(office_id, 'recruitment'));
drop policy if exists couriers_insert on public.couriers;
create policy couriers_insert on public.couriers for insert to authenticated
  with check (public.can_write_module(office_id, 'recruitment', '{owner,operations,hr}'));
drop policy if exists couriers_update on public.couriers;
create policy couriers_update on public.couriers for update to authenticated
  using (public.can_write_module(office_id, 'recruitment', '{owner,operations,hr}'))
  with check (public.can_write_module(office_id, 'recruitment', '{owner,operations,hr}'));
drop policy if exists couriers_delete on public.couriers;
create policy couriers_delete on public.couriers for delete to authenticated
  using (public.can_write_module(office_id, 'recruitment', '{owner}'));

-- stage history: قراءة بس (الكتابة من الـ Trigger)
drop policy if exists history_select on public.courier_stage_history;
create policy history_select on public.courier_stage_history for select to authenticated
  using (public.can_read_module(office_id, 'recruitment'));

-- assignments
drop policy if exists assignments_select on public.courier_assignments;
create policy assignments_select on public.courier_assignments for select to authenticated
  using (public.can_read_module(office_id, 'recruitment'));
drop policy if exists assignments_write on public.courier_assignments;
create policy assignments_write on public.courier_assignments for all to authenticated
  using (public.can_write_module(office_id, 'recruitment', '{owner,operations,hr}'))
  with check (public.can_write_module(office_id, 'recruitment', '{owner,operations,hr}'));

-- documents
drop policy if exists documents_select on public.courier_documents;
create policy documents_select on public.courier_documents for select to authenticated
  using (public.can_read_module(office_id, 'recruitment'));
drop policy if exists documents_insert on public.courier_documents;
create policy documents_insert on public.courier_documents for insert to authenticated
  with check (public.can_write_module(office_id, 'recruitment', '{owner,operations,hr}')
              and split_part(storage_path, '/', 1) = office_id::text);
drop policy if exists documents_update on public.courier_documents;
create policy documents_update on public.courier_documents for update to authenticated
  using (public.can_write_module(office_id, 'recruitment', '{owner,operations,hr}'))
  with check (public.can_write_module(office_id, 'recruitment', '{owner,operations,hr}'));
drop policy if exists documents_delete on public.courier_documents;
create policy documents_delete on public.courier_documents for delete to authenticated
  using (public.can_write_module(office_id, 'recruitment', '{owner,hr}'));

-- ---------------------------------------------------------------------
-- 5) لوحة التعيينات (بتحترم صلاحيات المستخدم)
-- ---------------------------------------------------------------------
create or replace function public.recruitment_overview(p_office uuid, p_from date default null, p_to date default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with c as (
    select * from public.couriers
    where office_id = p_office
      and (p_from is null or appointment_date >= p_from)
      and (p_to   is null or appointment_date <= p_to)
  ),
  h as (
    select distinct courier_id, to_stage from public.courier_stage_history
    where office_id = p_office and courier_id in (select id from c)
  )
  select jsonb_build_object(
    'total',          (select count(*) from c),
    'by_stage',       (select coalesce(jsonb_object_agg(stage, n), '{}') from (select stage, count(*) n from c group by stage) x),
    'by_source',      (select coalesce(jsonb_object_agg(coalesce(lead_source, 'غير محدد'), n), '{}') from (select lead_source, count(*) n from c group by lead_source) x),
    'by_vehicle',     (select coalesce(jsonb_object_agg(coalesce(vehicle_type, 'غير محدد'), n), '{}') from (select vehicle_type, count(*) n from c group by vehicle_type) x),
    'by_carrier',     (select coalesce(jsonb_object_agg(coalesce(k.name, 'بدون شركة'), n), '{}')
                         from (select current_carrier_id, count(*) n from c where stage = 'active' group by current_carrier_id) x
                         left join public.carriers k on k.id = x.current_carrier_id),
    'by_recruiter',   (select coalesce(jsonb_agg(jsonb_build_object(
                          'member_id', recruited_by, 'legacy', legacy_recruiter, 'total', n, 'active', a,
                          'trained', t, 'dropped_after_training', d) order by n desc), '[]')
                         from (select recruited_by, case when recruited_by is null then legacy_recruiter end legacy_recruiter,
                                      count(*) n,
                                      count(*) filter (where stage = 'active') a,
                                      count(*) filter (where id in (select courier_id from h where to_stage = 'training')) t,
                                      count(*) filter (where stage in ('inactive','left','blocked')
                                                        and id in (select courier_id from h where to_stage in ('passed_interview','training'))
                                                        and id not in (select courier_id from h where to_stage = 'active')) d
                                 from c group by 1, 2) x),
    'reached_training', (select count(distinct courier_id) from h where to_stage = 'training'),
    'reached_active',   (select count(distinct courier_id) from h where to_stage = 'active'),
    'passed_interview_or_training_then_dropped',
                        (select count(*) from c where stage in ('inactive','left','blocked')
                           and id in (select courier_id from h where to_stage in ('passed_interview','training'))
                           and id not in (select courier_id from h where to_stage = 'active')),
    'by_month',       (select coalesce(jsonb_object_agg(m, n), '{}') from
                         (select to_char(appointment_date, 'YYYY-MM') m, count(*) n from c group by 1) x),
    'expiring_docs',  (select count(*) from public.courier_documents d
                         where d.office_id = p_office and d.expires_at between current_date and current_date + 30),
    'expired_docs',   (select count(*) from public.courier_documents d
                         where d.office_id = p_office and d.expires_at < current_date)
  );
$$;
grant execute on function public.recruitment_overview(uuid, date, date) to authenticated;
revoke execute on function public.recruitment_overview(uuid, date, date) from anon;
