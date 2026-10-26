-- =====================================================================
-- Masar Pro — Migration 007: تعميم السيستم لكل مكاتب التعيين
--   1) مراحل تعيين خاصة بكل مكتب (فوق المراحل الأساسية، والأساسية بتفضل للتقارير والقواعد)
--   2) شروط ومستندات كل شركة شحن
--   3) تسعير الشركات وربحية المكتب
--   4) رابط تقديم عام للمناديب
--   5) إعدادات المكتب (رسائل واتساب، رابط التقديم)
-- كل التعديلات إضافات: مفيش عمود اتمسح ولا سلوك قديم اتغير
-- التشغيل: SQL Editor ← الصق الملف كله ← Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) مراحل التعيين لكل مكتب
-- ---------------------------------------------------------------------
create table if not exists public.office_stages (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete cascade,
  base_stage public.courier_stage not null,           -- المرحلة الأساسية اللي بتتحسب عليها التقارير والقواعد
  name       text not null check (length(trim(name)) between 1 and 40),
  is_core    boolean not null default false,          -- المراحل الأساسية: تتغير أسماؤها بس، مش بتتمسح
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (office_id, name)
);
create unique index if not exists office_stages_core_uniq on public.office_stages (office_id, base_stage) where is_core;
create index if not exists office_stages_office_idx on public.office_stages (office_id, sort_order);

create or replace function public.seed_office_stages(p_office uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.office_stages (office_id, base_stage, name, is_core, sort_order)
  select p_office, s::public.courier_stage, n, true, o * 10
  from (values ('applied','مُتقدم',1), ('interview','مقابلة',2), ('passed_interview','نجح في المقابلة',3), ('training','تدريب',4),
               ('active','نشط',5), ('inactive','غير نشط',6), ('blocked','محظور',7), ('left','ساب الشغل',8)) v(s, n, o)
  where not exists (select 1 from public.office_stages x where x.office_id = p_office and x.is_core and x.base_stage = v.s::public.courier_stage)
  on conflict (office_id, name) do nothing;
$$;

alter table public.couriers add column if not exists stage_id uuid references public.office_stages(id) on delete set null;
alter table public.couriers add column if not exists lead_campaign text;
alter table public.courier_stage_history add column if not exists stage_id uuid;
alter table public.courier_stage_history add column if not exists stage_name text;
create index if not exists couriers_office_stage_id_idx on public.couriers (office_id, stage_id) where stage_id is not null;

-- اسم المرحلة زي ما المكتب سمّاها
create or replace function public.stage_label(p_office uuid, p_stage public.courier_stage, p_stage_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select name from public.office_stages where id = p_stage_id),
    (select name from public.office_stages where office_id = p_office and is_core and base_stage = p_stage),
    p_stage::text);
$$;

-- قواعد المندوب (نفس قواعد 004 + المراحل الخاصة)
create or replace function public.couriers_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_limit int; v_active int; v_birth date; v_base public.courier_stage;
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

  -- مرحلة خاصة بالمكتب: المرحلة الأساسية بتتظبط منها
  if new.stage_id is not null and (tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id) then
    select base_stage into v_base from public.office_stages
     where id = new.stage_id and office_id = new.office_id and is_active;
    if v_base is null then
      raise exception 'INVALID_STAGE: المرحلة دي مش موجودة أو متوقفة' using errcode = 'P0001';
    end if;
    new.stage := v_base;
  elsif tg_op = 'UPDATE' and new.stage is distinct from old.stage and new.stage_id is not distinct from old.stage_id and new.stage_id is not null then
    -- اتغيرت المرحلة الأساسية من غير المرحلة الخاصة (تحديث قديم): المرحلة الخاصة تتشال لو مش من نفس النوع
    if not exists (select 1 from public.office_stages where id = new.stage_id and base_stage = new.stage) then
      new.stage_id := null;
    end if;
  end if;

  if tg_op = 'INSERT' or new.stage is distinct from old.stage or new.stage_id is distinct from old.stage_id then
    if new.stage in ('inactive', 'blocked') and coalesce(trim(new.stage_note), '') = '' then
      raise exception 'STAGE_NOTE_REQUIRED: لازم تكتب السبب لما تحوّل المندوب %', new.stage using errcode = 'P0001';
    end if;
    new.stage_changed_at := now();
    new.stage_changed_by := coalesce((select auth.uid()), new.stage_changed_by);

    if new.stage = 'active' and (tg_op = 'INSERT' or old.stage is distinct from 'active') then
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

create or replace function public.couriers_log_stage()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage or new.stage_id is distinct from old.stage_id then
    insert into public.courier_stage_history (office_id, courier_id, from_stage, to_stage, note, changed_by, stage_id, stage_name)
    values (new.office_id, new.id, case when tg_op = 'UPDATE' then old.stage end, new.stage,
            new.stage_note, coalesce((select auth.uid()), new.stage_changed_by),
            new.stage_id, public.stage_label(new.office_id, new.stage, new.stage_id));
  end if;
  return new;
end $$;

alter table public.office_stages enable row level security;
drop policy if exists ostages_select on public.office_stages;
create policy ostages_select on public.office_stages for select to authenticated
  using (office_id in (select public.my_office_ids()) or (select public.is_platform_admin()));
drop policy if exists ostages_write on public.office_stages;
create policy ostages_write on public.office_stages for all to authenticated
  using (public.can_write_module(office_id, 'recruitment', '{owner,operations}'))
  with check (public.can_write_module(office_id, 'recruitment', '{owner,operations}'));

-- المرحلة الأساسية مينفعش تتمسح ولا نوعها يتغير
create or replace function public.office_stages_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.is_core then raise exception 'CORE_STAGE: المراحل الأساسية بتتغير أسماؤها بس' using errcode = 'P0001'; end if;
    return old;
  end if;
  if old.is_core and (new.base_stage <> old.base_stage or not new.is_core or not new.is_active) then
    raise exception 'CORE_STAGE: المراحل الأساسية بتتغير أسماؤها بس' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists office_stages_guard on public.office_stages;
create trigger office_stages_guard before update or delete on public.office_stages
  for each row execute function public.office_stages_guard();

-- ---------------------------------------------------------------------
-- 2) شروط ومستندات كل شركة شحن
-- ---------------------------------------------------------------------
alter table public.carriers add column if not exists min_age int check (min_age is null or min_age between 16 and 80);
alter table public.carriers add column if not exists max_age int check (max_age is null or max_age between 16 and 80);
alter table public.carriers add column if not exists allowed_vehicles text[] not null default '{}';
alter table public.carriers add column if not exists required_docs text[] not null default '{}';

-- ---------------------------------------------------------------------
-- 3) تسعير الشركات (سري: صاحب المكتب والمحاسب بس) + إيراد الشهر الفعلي
--    المستحق من الشركة = مرتبات المناديب (لو الشركة بتحوّلها) + عمولة المكتب
-- ---------------------------------------------------------------------
create table if not exists public.carrier_billing (
  carrier_id uuid primary key references public.carriers(id) on delete cascade,
  office_id  uuid not null references public.offices(id) on delete cascade,
  model      text not null default 'none' check (model in ('none', 'per_shipment', 'per_courier', 'percent')),  -- عمولة المكتب
  rate       numeric not null default 0 check (rate >= 0),
  covers_salaries boolean not null default true,      -- الشركة بتحوّل مرتبات المناديب للمكتب فوق العمولة
  notes      text,
  updated_at timestamptz not null default now()
);
alter table public.carrier_billing add column if not exists covers_salaries boolean not null default true;
create table if not exists public.run_revenue (
  run_id     uuid primary key references public.payroll_runs(id) on delete cascade,
  office_id  uuid not null references public.offices(id) on delete cascade,
  amount     numeric not null check (amount >= 0),
  notes      text,
  updated_at timestamptz not null default now()
);
alter table public.carrier_billing enable row level security;
alter table public.run_revenue enable row level security;
drop policy if exists cb_all on public.carrier_billing;
create policy cb_all on public.carrier_billing for all to authenticated
  using ((public.has_office_role(office_id, '{owner,accountant}') and public.office_has_module(office_id, 'payroll')) or public.is_platform_admin())
  with check (public.can_write_module(office_id, 'payroll', '{owner,accountant}'));
drop policy if exists rr_all on public.run_revenue;
create policy rr_all on public.run_revenue for all to authenticated
  using ((public.has_office_role(office_id, '{owner,accountant}') and public.office_has_module(office_id, 'payroll')) or public.is_platform_admin())
  with check (public.can_write_module(office_id, 'payroll', '{owner,accountant}'));
drop trigger if exists audit_carrier_billing on public.carrier_billing;
create trigger audit_carrier_billing after insert or update or delete on public.carrier_billing for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- 4) إعدادات المكتب
-- ---------------------------------------------------------------------
create table if not exists public.office_settings (
  office_id     uuid primary key references public.offices(id) on delete cascade,
  apply_enabled boolean not null default false,
  apply_intro   text,
  wa_templates  jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);
alter table public.office_settings enable row level security;
drop policy if exists os_select on public.office_settings;
create policy os_select on public.office_settings for select to authenticated
  using (office_id in (select public.my_office_ids()) or (select public.is_platform_admin()));
drop policy if exists os_write on public.office_settings;
create policy os_write on public.office_settings for all to authenticated
  using ((public.has_office_role(office_id, '{owner}') and public.office_is_writable(office_id)) or (select public.is_platform_admin()))
  with check ((public.has_office_role(office_id, '{owner}') and public.office_is_writable(office_id)) or (select public.is_platform_admin()));

do $$ begin
  alter table public.offices add constraint offices_slug_format check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{2,39}$');
exception when duplicate_object then null; end $$;

-- كل مكتب جديد: شركات + مراحل + إعدادات
create or replace function public.offices_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.seed_default_carriers(new.id);
  perform public.seed_office_stages(new.id);
  insert into public.office_settings (office_id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- المكاتب الموجودة
select public.seed_office_stages(id) from public.offices;
insert into public.office_settings (office_id) select id from public.offices on conflict do nothing;

-- ---------------------------------------------------------------------
-- 5) رابط التقديم العام (من غير تسجيل دخول)
-- ---------------------------------------------------------------------
create or replace function public.public_office(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', o.id, 'name', o.name, 'intro', s.apply_intro,
           'accepting', s.apply_enabled and public.office_is_writable(o.id) and public.office_has_module(o.id, 'recruitment'))
  from public.offices o join public.office_settings s on s.office_id = o.id
  where o.slug = lower(trim(p_slug));
$$;

create or replace function public.public_apply(p_slug text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_office uuid; v_ok boolean; v_nid text; v_phone text; v_name text; v_birth date; v_age int;
  v_id uuid; v_doc jsonb; v_rel jsonb := '[]'::jsonb; r jsonb;
begin
  select o.id, s.apply_enabled and public.office_is_writable(o.id) and public.office_has_module(o.id, 'recruitment')
    into v_office, v_ok
  from public.offices o join public.office_settings s on s.office_id = o.id where o.slug = lower(trim(p_slug));
  if v_office is null or not v_ok then
    return jsonb_build_object('ok', false, 'error', 'التقديم مقفول دلوقتي. كلم المكتب مباشرة.');
  end if;

  v_name := regexp_replace(trim(coalesce(p->>'full_name', '')), '\s+', ' ', 'g');
  v_nid := regexp_replace(coalesce(p->>'national_id', ''), '\D', '', 'g');
  v_phone := regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g');
  if length(v_name) < 6 or array_length(string_to_array(v_name, ' '), 1) < 3 then
    return jsonb_build_object('ok', false, 'error', 'اكتب اسمك ثلاثي على الأقل زي البطاقة');
  end if;
  if v_nid !~ '^[23][0-9]{13}$' then return jsonb_build_object('ok', false, 'error', 'الرقم القومي لازم يكون 14 رقم'); end if;
  if v_phone !~ '^01[0125][0-9]{8}$' then return jsonb_build_object('ok', false, 'error', 'رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01'); end if;
  begin
    v_birth := make_date((case substr(v_nid, 1, 1) when '2' then 1900 else 2000 end) + substr(v_nid, 2, 2)::int,
                         substr(v_nid, 4, 2)::int, substr(v_nid, 6, 2)::int);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'الرقم القومي غير صحيح');
  end;
  v_age := extract(year from age(current_date, v_birth));
  if v_age < 18 then return jsonb_build_object('ok', false, 'error', 'لازم يكون سنك 18 سنة أو أكتر'); end if;

  -- متسجل قبل كده: منقولش تفاصيل
  if exists (select 1 from public.couriers where office_id = v_office and national_id = v_nid) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  -- حماية بسيطة من الإغراق
  if (select count(*) from public.couriers where office_id = v_office and lead_source = 'رابط التقديم'
        and created_at > now() - interval '10 minutes') >= 40 then
    return jsonb_build_object('ok', false, 'error', 'فيه ضغط على التقديم دلوقتي، جرّب كمان شوية');
  end if;

  for r in select * from jsonb_array_elements(coalesce(p->'relatives', '[]'::jsonb)) limit 3 loop
    if coalesce(trim(r->>'name'), '') <> '' then
      v_rel := v_rel || jsonb_build_array(jsonb_build_object('name', left(trim(r->>'name'), 80), 'relation', left(trim(coalesce(r->>'relation', '')), 30),
                                                             'phone', left(regexp_replace(coalesce(r->>'phone', ''), '\D', '', 'g'), 15)));
    end if;
  end loop;

  insert into public.couriers (office_id, full_name, national_id, primary_phone, alt_phone, current_address, vehicle_type,
                               assigned_area, lead_source, lead_campaign, stage, relatives, notes)
  values (v_office, left(v_name, 120), v_nid, v_phone,
          nullif(left(regexp_replace(coalesce(p->>'alt_phone', ''), '\D', '', 'g'), 15), ''),
          nullif(left(trim(coalesce(p->>'address', '')), 200), ''), nullif(left(trim(coalesce(p->>'vehicle', '')), 30), ''),
          nullif(left(trim(coalesce(p->>'area', '')), 60), ''), 'رابط التقديم', nullif(left(trim(coalesce(p->>'campaign', '')), 60), ''),
          'applied', v_rel, 'سجّل من رابط التقديم')
  returning id into v_id;

  -- المستندات اللي اترفعت قبل الطلب (لازم تكون في فولدر التقديم بتاع المكتب)
  for v_doc in select * from jsonb_array_elements(coalesce(p->'documents', '[]'::jsonb)) limit 6 loop
    if v_doc->>'doc_type' in ('id_front', 'id_back', 'driving_license', 'vehicle_license', 'criminal_record', 'personal_photo')
       and (v_doc->>'path') like v_office::text || '/apply/%'
       and exists (select 1 from storage.objects where bucket_id = 'documents' and name = v_doc->>'path') then
      insert into public.courier_documents (office_id, courier_id, doc_type, storage_path, mime_type, size_bytes)
      values (v_office, v_id, v_doc->>'doc_type', v_doc->>'path', left(coalesce(v_doc->>'mime', ''), 40), nullif(v_doc->>'size', '')::int)
      on conflict (storage_path) do nothing;
    end if;
  end loop;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.public_office(text) to anon, authenticated;
grant execute on function public.public_apply(text, jsonb) to anon, authenticated;
grant execute on function public.stage_label(uuid, public.courier_stage, uuid) to authenticated;

-- رفع المستندات من رابط التقديم: في فولدر <office_id>/apply/ بس، ولمكتب فاتح التقديم
create or replace function public.apply_open_office_ids()
returns setof text language sql stable security definer set search_path = '' as $$
  select o.id::text from public.offices o join public.office_settings s on s.office_id = o.id
  where s.apply_enabled and public.office_is_writable(o.id);
$$;
grant execute on function public.apply_open_office_ids() to anon, authenticated;

drop policy if exists docs_apply_insert on storage.objects;
create policy docs_apply_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[2] = 'apply'
    and (storage.foldername(name))[1] in (select public.apply_open_office_ids()));
