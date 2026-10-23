-- =====================================================================
-- Masar Pro — Migration 005: قسم المرتبات
-- شيتات شركات الشحن الشهرية، الصرف، ربط سطور المرتبات بملفات المناديب، العُهد، المصروفات
-- التشغيل: SQL Editor ← الصق الملف كله ← Run
-- =====================================================================

-- ربط أعمدة شيت كل شركة (بيتحفظ مرة ويتستخدم كل شهر)
alter table public.carriers add column if not exists payroll_mapping jsonb;

-- ---------------------------------------------------------------------
-- 1) الجداول
-- ---------------------------------------------------------------------
create table if not exists public.payroll_runs (
  id               uuid primary key default gen_random_uuid(),
  office_id        uuid not null references public.offices(id) on delete cascade,
  carrier_id       uuid not null references public.carriers(id) on delete restrict,
  month            text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  source_file_name text,
  imported_at      timestamptz not null default now(),
  imported_by      uuid references auth.users(id) default auth.uid(),
  notes            text,
  unique (office_id, carrier_id, month)
);
create index if not exists payroll_runs_office_month_idx on public.payroll_runs (office_id, month desc);

create table if not exists public.payroll_lines (
  id               uuid primary key default gen_random_uuid(),
  office_id        uuid not null references public.offices(id) on delete cascade,
  run_id           uuid not null references public.payroll_runs(id) on delete cascade,
  line_key         text not null,               -- Star Id أو الاسم بعد التنضيف
  star_id          text,
  carrier_name     text not null,               -- الاسم زي ما هو في شيت الشركة
  courier_id       uuid references public.couriers(id) on delete set null,
  hub              text,
  zone             text,
  vehicle          text,
  work_days        numeric not null default 0,
  deliveries       numeric not null default 0,
  rto              numeric not null default 0,
  pickups          numeric not null default 0,
  total_fixed      numeric not null default 0,
  total_variable   numeric not null default 0,
  total_deductions numeric not null default 0,
  total_bonus      numeric not null default 0,
  total_salary     numeric not null default 0,
  advances_sheet   numeric not null default 0,  -- السلف زي ما هي في الشيت
  deficit          numeric not null default 0,  -- العجز
  lost             numeric not null default 0,  -- الشحنات اللوست
  details          jsonb not null default '{}'::jsonb,
  -- الصرف
  advances         numeric,                     -- السلف اللي اتخصمت فعلاً (لو فاضية = سلف الشيت)
  net_due          numeric generated always as
                     (total_salary - coalesce(advances, advances_sheet) - deficit - lost) stored,
  paid             boolean not null default false,
  paid_amount      numeric,
  pay_method       text,
  paid_by          uuid references public.office_members(id) on delete set null,
  paid_at          date,
  pay_notes        text,
  pay_recorded_by  uuid,
  pay_recorded_at  timestamptz,
  created_at       timestamptz not null default now(),
  unique (run_id, line_key)
);
create index if not exists payroll_lines_run_idx     on public.payroll_lines (run_id);
create index if not exists payroll_lines_courier_idx on public.payroll_lines (courier_id) where courier_id is not null;
create index if not exists payroll_lines_paidby_idx  on public.payroll_lines (office_id, paid_by) where paid;

-- الربط الدائم: اسم المندوب في شيت الشركة ← ملفه في التعيينات
create table if not exists public.payroll_links (
  office_id  uuid not null references public.offices(id) on delete cascade,
  carrier_id uuid not null references public.carriers(id) on delete cascade,
  line_key   text not null,
  courier_id uuid not null references public.couriers(id) on delete cascade,
  linked_by  uuid default auth.uid(),
  linked_at  timestamptz not null default now(),
  primary key (office_id, carrier_id, line_key)
);

-- العُهدة: لكل موظف في كل شهر
create table if not exists public.custody (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete cascade,
  month      text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  member_id  uuid not null references public.office_members(id) on delete cascade,
  amount     numeric not null default 0 check (amount >= 0),
  notes      text,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  unique (office_id, month, member_id)
);

create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  office_id   uuid not null references public.offices(id) on delete cascade,
  month       text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  spent_at    date not null default current_date,
  description text not null check (length(trim(description)) > 0),
  category    text not null default 'أخرى',
  amount      numeric not null check (amount > 0),
  paid_by     uuid references public.office_members(id) on delete set null,
  notes       text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists expenses_office_month_idx on public.expenses (office_id, month);

-- ---------------------------------------------------------------------
-- 2) الصلاحيات
--    القراءة: صاحب المكتب والمحاسب والأوبريشن. الـ HR مالوش دعوة بالمرتبات.
--    الصرف وربط المناديب: من خلال الدوال تحت بس.
-- ---------------------------------------------------------------------
alter table public.payroll_runs  enable row level security;
alter table public.payroll_lines enable row level security;
alter table public.payroll_links enable row level security;
alter table public.custody       enable row level security;
alter table public.expenses      enable row level security;

create or replace function public.can_see_payroll(p_office uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (public.has_office_role(p_office, '{owner,accountant,operations}') and public.office_has_module(p_office, 'payroll'))
         or public.is_platform_admin();
$$;
grant execute on function public.can_see_payroll(uuid) to authenticated;

drop policy if exists runs_select on public.payroll_runs;
create policy runs_select on public.payroll_runs for select to authenticated using (public.can_see_payroll(office_id));
drop policy if exists runs_delete on public.payroll_runs;
create policy runs_delete on public.payroll_runs for delete to authenticated
  using (public.can_write_module(office_id, 'payroll', '{owner}'));

drop policy if exists lines_select on public.payroll_lines;
create policy lines_select on public.payroll_lines for select to authenticated using (public.can_see_payroll(office_id));

drop policy if exists links_select on public.payroll_links;
create policy links_select on public.payroll_links for select to authenticated using (public.can_see_payroll(office_id));

drop policy if exists custody_select on public.custody;
create policy custody_select on public.custody for select to authenticated using (public.can_see_payroll(office_id));
drop policy if exists custody_write on public.custody;
create policy custody_write on public.custody for all to authenticated
  using (public.can_write_module(office_id, 'payroll', '{owner,accountant}'))
  with check (public.can_write_module(office_id, 'payroll', '{owner,accountant}'));

drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses for select to authenticated using (public.can_see_payroll(office_id));
drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.can_write_module(office_id, 'payroll', '{owner,accountant,operations}'));
drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses for delete to authenticated
  using (public.can_write_module(office_id, 'payroll', '{owner,accountant}'));

-- سجل التعديلات على الفلوس
drop trigger if exists audit_payroll_lines on public.payroll_lines;
create trigger audit_payroll_lines after update on public.payroll_lines
  for each row when (old.paid is distinct from new.paid or old.paid_amount is distinct from new.paid_amount)
  execute function public.audit_trigger();
drop trigger if exists audit_payroll_runs on public.payroll_runs;
create trigger audit_payroll_runs after delete on public.payroll_runs for each row execute function public.audit_trigger();
drop trigger if exists audit_custody on public.custody;
create trigger audit_custody after insert or update or delete on public.custody for each row execute function public.audit_trigger();
drop trigger if exists audit_expenses on public.expenses;
create trigger audit_expenses after insert or delete on public.expenses for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- 3) رفع شيت الشهر (لو الشهر مرفوع قبل كده: البيانات بتتحدث وسجلات الصرف بتفضل)
-- ---------------------------------------------------------------------
create or replace function public.payroll_import(
  p_office uuid, p_carrier uuid, p_month text, p_file text, p_lines jsonb, p_mapping jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_run uuid; v_total int; v_removed int; v_linked int; v_kept int;
begin
  if not public.can_write_module(p_office, 'payroll', '{owner,accountant}') then
    raise exception 'NOT_ALLOWED: رفع شيتات المرتبات لصاحب المكتب والمحاسب بس' using errcode = '42501';
  end if;
  if not exists (select 1 from public.carriers where id = p_carrier and office_id = p_office) then
    raise exception 'CARRIER_NOT_FOUND';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'EMPTY_FILE: الملف مفيهوش مناديب';
  end if;

  insert into public.payroll_runs (office_id, carrier_id, month, source_file_name, imported_by)
  values (p_office, p_carrier, p_month, p_file, auth.uid())
  on conflict (office_id, carrier_id, month)
  do update set source_file_name = excluded.source_file_name, imported_at = now(), imported_by = auth.uid()
  returning id into v_run;

  if p_mapping is not null then
    update public.carriers set payroll_mapping = p_mapping where id = p_carrier;
  end if;

  with x as (
    select * from jsonb_to_recordset(p_lines) as r(
      line_key text, star_id text, carrier_name text, hub text, zone text, vehicle text,
      work_days numeric, deliveries numeric, rto numeric, pickups numeric, total_fixed numeric,
      total_variable numeric, total_deductions numeric, total_bonus numeric, total_salary numeric,
      advances_sheet numeric, deficit numeric, lost numeric, details jsonb)
  )
  insert into public.payroll_lines as l (office_id, run_id, line_key, star_id, carrier_name, hub, zone, vehicle,
    work_days, deliveries, rto, pickups, total_fixed, total_variable, total_deductions, total_bonus, total_salary,
    advances_sheet, deficit, lost, details)
  select p_office, v_run, x.line_key, nullif(x.star_id, ''), x.carrier_name, x.hub, x.zone, x.vehicle,
    coalesce(x.work_days, 0), coalesce(x.deliveries, 0), coalesce(x.rto, 0), coalesce(x.pickups, 0),
    coalesce(x.total_fixed, 0), coalesce(x.total_variable, 0), coalesce(x.total_deductions, 0),
    coalesce(x.total_bonus, 0), coalesce(x.total_salary, 0), abs(coalesce(x.advances_sheet, 0)),
    abs(coalesce(x.deficit, 0)), abs(coalesce(x.lost, 0)), coalesce(x.details, '{}'::jsonb)
  from x where coalesce(x.line_key, '') <> ''
  on conflict (run_id, line_key) do update set
    star_id = excluded.star_id, carrier_name = excluded.carrier_name, hub = excluded.hub, zone = excluded.zone,
    vehicle = excluded.vehicle, work_days = excluded.work_days, deliveries = excluded.deliveries, rto = excluded.rto,
    pickups = excluded.pickups, total_fixed = excluded.total_fixed, total_variable = excluded.total_variable,
    total_deductions = excluded.total_deductions, total_bonus = excluded.total_bonus, total_salary = excluded.total_salary,
    advances_sheet = excluded.advances_sheet, deficit = excluded.deficit, lost = excluded.lost, details = excluded.details;

  -- السطور اللي اتشالت من الشيت الجديد (لو مكانتش اتصرفت)
  delete from public.payroll_lines
   where run_id = v_run and not paid
     and line_key not in (select r->>'line_key' from jsonb_array_elements(p_lines) r);
  get diagnostics v_removed = row_count;

  -- الربط المحفوظ من الشهور اللي فاتت
  update public.payroll_lines l set courier_id = pl.courier_id
    from public.payroll_links pl
   where l.run_id = v_run and l.courier_id is null
     and pl.office_id = p_office and pl.carrier_id = p_carrier and pl.line_key = l.line_key;

  select count(*), count(*) filter (where courier_id is not null), count(*) filter (where paid)
    into v_total, v_linked, v_kept from public.payroll_lines where run_id = v_run;

  return jsonb_build_object('run_id', v_run, 'total', v_total, 'linked', v_linked, 'kept_paid', v_kept, 'removed', v_removed);
end $$;

-- ---------------------------------------------------------------------
-- 4) الصرف وإلغاؤه وربط المندوب
-- ---------------------------------------------------------------------
create or replace function public.payroll_pay(
  p_line uuid, p_advances numeric, p_method text, p_paid_by uuid, p_paid_at date default current_date, p_notes text default null
) returns public.payroll_lines language plpgsql security definer set search_path = '' as $$
declare v public.payroll_lines;
begin
  select * into v from public.payroll_lines where id = p_line for update;
  if not found then raise exception 'LINE_NOT_FOUND'; end if;
  if not public.can_write_module(v.office_id, 'payroll', '{owner,accountant,operations}') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if coalesce(trim(p_method), '') = '' then raise exception 'METHOD_REQUIRED: اختار طريقة التحويل'; end if;
  if not exists (select 1 from public.office_members where id = p_paid_by and office_id = v.office_id) then
    raise exception 'PAID_BY_REQUIRED: اختار الموظف اللي حوّل';
  end if;
  update public.payroll_lines set
    advances = greatest(coalesce(p_advances, 0), 0),
    paid = true,
    paid_amount = total_salary - greatest(coalesce(p_advances, 0), 0) - deficit - lost,
    pay_method = trim(p_method),
    paid_by = p_paid_by,
    paid_at = coalesce(p_paid_at, current_date),
    pay_notes = nullif(trim(coalesce(p_notes, '')), ''),
    pay_recorded_by = auth.uid(),
    pay_recorded_at = now()
  where id = p_line returning * into v;
  return v;
end $$;

create or replace function public.payroll_unpay(p_line uuid)
returns public.payroll_lines language plpgsql security definer set search_path = '' as $$
declare v public.payroll_lines;
begin
  select * into v from public.payroll_lines where id = p_line for update;
  if not found then raise exception 'LINE_NOT_FOUND'; end if;
  if not public.can_write_module(v.office_id, 'payroll', '{owner,accountant}') then
    raise exception 'NOT_ALLOWED: إلغاء الصرف لصاحب المكتب والمحاسب بس' using errcode = '42501';
  end if;
  update public.payroll_lines set paid = false, paid_amount = null, advances = null, pay_method = null,
         paid_by = null, paid_at = null, pay_notes = null, pay_recorded_by = auth.uid(), pay_recorded_at = now()
   where id = p_line returning * into v;
  return v;
end $$;

-- ربط سطر المرتب بملف مندوب (ويتطبق على كل الشهور لنفس الاسم في نفس الشركة)
create or replace function public.payroll_link(p_line uuid, p_courier uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v public.payroll_lines; v_carrier uuid; v_n int;
begin
  select l.* into v from public.payroll_lines l where l.id = p_line;
  if not found then raise exception 'LINE_NOT_FOUND'; end if;
  if not public.can_write_module(v.office_id, 'payroll', '{owner,accountant,operations}') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  select carrier_id into v_carrier from public.payroll_runs where id = v.run_id;

  if p_courier is null then
    delete from public.payroll_links where office_id = v.office_id and carrier_id = v_carrier and line_key = v.line_key;
    update public.payroll_lines l set courier_id = null
      from public.payroll_runs r
     where l.run_id = r.id and r.carrier_id = v_carrier and l.office_id = v.office_id and l.line_key = v.line_key;
    get diagnostics v_n = row_count;
    return v_n;
  end if;

  if not exists (select 1 from public.couriers where id = p_courier and office_id = v.office_id) then
    raise exception 'COURIER_NOT_FOUND';
  end if;
  insert into public.payroll_links (office_id, carrier_id, line_key, courier_id)
  values (v.office_id, v_carrier, v.line_key, p_courier)
  on conflict (office_id, carrier_id, line_key) do update set courier_id = excluded.courier_id, linked_at = now(), linked_by = auth.uid();
  update public.payroll_lines l set courier_id = p_courier
    from public.payroll_runs r
   where l.run_id = r.id and r.carrier_id = v_carrier and l.office_id = v.office_id and l.line_key = v.line_key;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

grant execute on function public.payroll_import(uuid, uuid, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.payroll_pay(uuid, numeric, text, uuid, date, text) to authenticated;
grant execute on function public.payroll_unpay(uuid) to authenticated;
grant execute on function public.payroll_link(uuid, uuid) to authenticated;
revoke execute on function public.payroll_import(uuid, uuid, text, text, jsonb, jsonb) from anon;
revoke execute on function public.payroll_pay(uuid, numeric, text, uuid, date, text) from anon;
revoke execute on function public.payroll_unpay(uuid) from anon;
revoke execute on function public.payroll_link(uuid, uuid) from anon;
