-- =====================================================================
-- Masar Pro — Migration 006: قسم الموظفين
-- ملفات الموظفين، الحضور والانصراف، العمولة على كل تعيين، مرتب الموظف الشهري
-- التشغيل: SQL Editor ← الصق الملف كله ← Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) الجداول
-- ---------------------------------------------------------------------

-- إعدادات المكتب للموظفين
create table if not exists public.staff_settings (
  office_id          uuid primary key references public.offices(id) on delete cascade,
  -- العمولة بتتحسب إمتى:
  --   on_active     = أول ما المندوب يبقى نشط
  --   active_days   = لما يكمل عدد أيام وهو نشط من غير ما يقع (الافتراضي)
  --   first_payroll = لما يظهر في أول شيت مرتبات
  commission_rule    text not null default 'active_days' check (commission_rule in ('on_active', 'active_days', 'first_payroll')),
  commission_days    int  not null default 15 check (commission_days between 1 and 120),
  default_commission numeric not null default 0 check (default_commission >= 0),
  allowed_lates      int  not null default 3 check (allowed_lates >= 0),   -- تأخيرات مسموحة في الشهر قبل الخصم
  updated_at         timestamptz not null default now()
);

-- ملف كل موظف (مربوط بحسابه في المكتب)
create table if not exists public.staff_profiles (
  member_id           uuid primary key references public.office_members(id) on delete cascade,
  office_id           uuid not null references public.offices(id) on delete cascade,
  job_title           text,
  base_salary         numeric not null default 0 check (base_salary >= 0),
  commission_per_hire numeric check (commission_per_hire >= 0),          -- لو فاضي = الافتراضي في الإعدادات
  hire_date           date,
  work_start          time not null default '10:00',
  work_end            time not null default '18:00',
  work_days           int[] not null default '{0,1,2,3,4,6}',             -- 0 = الأحد ... 6 = السبت (الجمعة إجازة)
  late_grace_minutes  int not null default 15 check (late_grace_minutes between 0 and 240),
  late_penalty        numeric not null default 0 check (late_penalty >= 0), -- خصم كل تأخير بعد المسموح
  notes               text,
  updated_at          timestamptz not null default now()
);
create index if not exists staff_profiles_office_idx on public.staff_profiles (office_id);

-- الإجازات الرسمية للمكتب
create table if not exists public.office_holidays (
  id        uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  day       date not null,
  name      text not null,
  unique (office_id, day)
);

-- الحضور والانصراف
create table if not exists public.attendance (
  id            uuid primary key default gen_random_uuid(),
  office_id     uuid not null references public.offices(id) on delete cascade,
  member_id     uuid not null references public.office_members(id) on delete cascade,
  day           date not null,
  status        text not null default 'present' check (status in ('present', 'absent', 'leave', 'holiday')),
  check_in      timestamptz,
  check_out     timestamptz,
  late_minutes  int not null default 0,
  in_lat        numeric, in_lng numeric,
  out_lat       numeric, out_lng numeric,
  notes         text,
  edited_by     uuid,
  created_at    timestamptz not null default now(),
  unique (member_id, day),
  check (check_out is null or check_in is null or check_out >= check_in)
);
create index if not exists attendance_office_day_idx on public.attendance (office_id, day);

-- مكافآت وخصومات وسلف الموظفين
create table if not exists public.staff_adjustments (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete cascade,
  member_id  uuid not null references public.office_members(id) on delete cascade,
  month      text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  kind       text not null check (kind in ('bonus', 'deduction', 'advance')),
  amount     numeric not null check (amount > 0),
  reason     text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists staff_adjustments_idx on public.staff_adjustments (office_id, month);

-- قسيمة المرتب بعد الصرف (لقطة ثابتة من الحسبة)
create table if not exists public.staff_payslips (
  id                uuid primary key default gen_random_uuid(),
  office_id         uuid not null references public.offices(id) on delete cascade,
  member_id         uuid not null references public.office_members(id) on delete cascade,
  month             text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  base_salary       numeric not null default 0,
  work_days         int not null default 0,
  present_days      int not null default 0,
  absent_days       int not null default 0,
  leave_days        int not null default 0,
  late_count        int not null default 0,
  absence_deduction numeric not null default 0,
  late_deduction    numeric not null default 0,
  commission_count  int not null default 0,
  commission_amount numeric not null default 0,
  bonuses           numeric not null default 0,
  deductions        numeric not null default 0,
  advances          numeric not null default 0,
  net               numeric not null default 0,
  pay_method        text,
  paid_by           uuid references public.office_members(id) on delete set null,
  paid_at           date not null default current_date,
  notes             text,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  unique (member_id, month)
);

-- ---------------------------------------------------------------------
-- 2) الصلاحيات
--    كل موظف يشوف بياناته. صاحب المكتب والمحاسب يشوفوا ويعدّلوا الكل.
--    الأوبريشن يشوف حضور الكل (متابعة).
-- ---------------------------------------------------------------------
create or replace function public.my_member_id(p_office uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.office_members where office_id = p_office and user_id = (select auth.uid()) and is_active limit 1;
$$;
create or replace function public.is_staff_manager(p_office uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (public.has_office_role(p_office, '{owner,accountant}') and public.office_has_module(p_office, 'staff'))
         or public.is_platform_admin();
$$;
grant execute on function public.my_member_id(uuid) to authenticated;
grant execute on function public.is_staff_manager(uuid) to authenticated;

alter table public.staff_settings    enable row level security;
alter table public.staff_profiles    enable row level security;
alter table public.office_holidays   enable row level security;
alter table public.attendance        enable row level security;
alter table public.staff_adjustments enable row level security;
alter table public.staff_payslips    enable row level security;

drop policy if exists ss_select on public.staff_settings;
create policy ss_select on public.staff_settings for select to authenticated using (public.can_read_module(office_id, 'staff'));
drop policy if exists ss_write on public.staff_settings;
create policy ss_write on public.staff_settings for all to authenticated
  using (public.can_write_module(office_id, 'staff', '{owner,accountant}')) with check (public.can_write_module(office_id, 'staff', '{owner,accountant}'));

drop policy if exists sp_select on public.staff_profiles;
create policy sp_select on public.staff_profiles for select to authenticated
  using (public.is_staff_manager(office_id) or (member_id = public.my_member_id(office_id) and public.office_has_module(office_id, 'staff')));
drop policy if exists sp_write on public.staff_profiles;
create policy sp_write on public.staff_profiles for all to authenticated
  using (public.can_write_module(office_id, 'staff', '{owner,accountant}')) with check (public.can_write_module(office_id, 'staff', '{owner,accountant}'));

drop policy if exists hol_select on public.office_holidays;
create policy hol_select on public.office_holidays for select to authenticated using (public.can_read_module(office_id, 'staff'));
drop policy if exists hol_write on public.office_holidays;
create policy hol_write on public.office_holidays for all to authenticated
  using (public.can_write_module(office_id, 'staff', '{owner,accountant}')) with check (public.can_write_module(office_id, 'staff', '{owner,accountant}'));

drop policy if exists att_select on public.attendance;
create policy att_select on public.attendance for select to authenticated
  using ((public.has_office_role(office_id, '{owner,accountant,operations}') and public.office_has_module(office_id, 'staff'))
         or public.is_platform_admin()
         or (member_id = public.my_member_id(office_id) and public.office_has_module(office_id, 'staff')));
drop policy if exists att_write on public.attendance;
create policy att_write on public.attendance for all to authenticated
  using (public.can_write_module(office_id, 'staff', '{owner,accountant}')) with check (public.can_write_module(office_id, 'staff', '{owner,accountant}'));

drop policy if exists adj_select on public.staff_adjustments;
create policy adj_select on public.staff_adjustments for select to authenticated
  using (public.is_staff_manager(office_id) or (member_id = public.my_member_id(office_id) and public.office_has_module(office_id, 'staff')));
drop policy if exists adj_write on public.staff_adjustments;
create policy adj_write on public.staff_adjustments for all to authenticated
  using (public.can_write_module(office_id, 'staff', '{owner,accountant}')) with check (public.can_write_module(office_id, 'staff', '{owner,accountant}'));

drop policy if exists slip_select on public.staff_payslips;
create policy slip_select on public.staff_payslips for select to authenticated
  using (public.is_staff_manager(office_id) or (member_id = public.my_member_id(office_id) and public.office_has_module(office_id, 'staff')));
drop policy if exists slip_delete on public.staff_payslips;
create policy slip_delete on public.staff_payslips for delete to authenticated
  using (public.can_write_module(office_id, 'staff', '{owner}'));

drop trigger if exists audit_staff_payslips on public.staff_payslips;
create trigger audit_staff_payslips after insert or delete on public.staff_payslips for each row execute function public.audit_trigger();
drop trigger if exists audit_staff_adjustments on public.staff_adjustments;
create trigger audit_staff_adjustments after insert or delete on public.staff_adjustments for each row execute function public.audit_trigger();
drop trigger if exists audit_staff_profiles on public.staff_profiles;
create trigger audit_staff_profiles after update on public.staff_profiles
  for each row when (old.base_salary is distinct from new.base_salary or old.commission_per_hire is distinct from new.commission_per_hire)
  execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- 3) تسجيل الحضور والانصراف (الموظف لنفسه بس، بتوقيت القاهرة)
-- ---------------------------------------------------------------------
create or replace function public.attendance_punch(p_office uuid, p_lat numeric default null, p_lng numeric default null)
returns public.attendance language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid := public.my_member_id(p_office);
  v_now timestamptz := now();
  v_local timestamp := v_now at time zone 'Africa/Cairo';
  v_today date := (v_now at time zone 'Africa/Cairo')::date;
  v_start time;
  v public.attendance;
begin
  if v_member is null then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  if not public.office_has_module(p_office, 'staff') or not public.office_is_writable(p_office) then
    raise exception 'NOT_ALLOWED: قسم الموظفين مش مفعّل أو الاشتراك موقوف' using errcode = '42501';
  end if;
  select coalesce((select work_start from public.staff_profiles where member_id = v_member), '10:00'::time) into v_start;

  select * into v from public.attendance where member_id = v_member and day = v_today for update;
  if not found then
    insert into public.attendance (office_id, member_id, day, status, check_in, late_minutes, in_lat, in_lng)
    values (p_office, v_member, v_today, 'present', v_now,
            greatest(0, floor(extract(epoch from (v_local::time - v_start)) / 60))::int, p_lat, p_lng)
    returning * into v;
  elsif v.check_in is null then
    update public.attendance set status = 'present', check_in = v_now, in_lat = p_lat, in_lng = p_lng,
           late_minutes = greatest(0, floor(extract(epoch from (v_local::time - v_start)) / 60))::int
     where id = v.id returning * into v;
  elsif v.check_out is null then
    update public.attendance set check_out = v_now, out_lat = p_lat, out_lng = p_lng where id = v.id returning * into v;
  else
    raise exception 'ALREADY_DONE: سجلت حضور وانصراف النهارده خلاص';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 4) المناديب اللي العمولة بتتحسب عليهم (حسب قاعدة المكتب)
-- ---------------------------------------------------------------------
create or replace function public.staff_qualified_hires(p_office uuid)
returns table (courier_id uuid, member_id uuid, courier_name text, first_active date, qualified_on date)
language sql stable security definer set search_path = '' as $$
  with s as (
    select coalesce((select commission_rule from public.staff_settings where office_id = p_office), 'active_days') as rule,
           coalesce((select commission_days from public.staff_settings where office_id = p_office), 15) as days
  ),
  fa as (
    select h.courier_id, min(h.changed_at) as first_active
    from public.courier_stage_history h
    where h.office_id = p_office and h.to_stage = 'active'
    group by h.courier_id
  ),
  fp as (
    select l.courier_id, min(r.month) as first_month
    from public.payroll_lines l join public.payroll_runs r on r.id = l.run_id
    where l.office_id = p_office and l.courier_id is not null
    group by l.courier_id
  )
  select c.id, c.recruited_by, c.full_name,
         (fa.first_active at time zone 'Africa/Cairo')::date,
         case s.rule
           when 'on_active'     then (fa.first_active at time zone 'Africa/Cairo')::date
           when 'first_payroll' then to_date(fp.first_month || '-01', 'YYYY-MM-DD')
           else ((fa.first_active at time zone 'Africa/Cairo')::date + s.days)
         end
  from public.couriers c
  cross join s
  left join fa on fa.courier_id = c.id
  left join fp on fp.courier_id = c.id
  where c.office_id = p_office and c.recruited_by is not null
    and case s.rule
          when 'on_active' then fa.first_active is not null
          when 'first_payroll' then fp.first_month is not null
          else fa.first_active is not null
               and (fa.first_active at time zone 'Africa/Cairo')::date + s.days <= (now() at time zone 'Africa/Cairo')::date
               and not exists (
                 select 1 from public.courier_stage_history x
                 where x.courier_id = c.id and x.to_stage in ('inactive', 'left', 'blocked')
                   and x.changed_at > fa.first_active and x.changed_at < fa.first_active + make_interval(days => s.days))
        end;
$$;
revoke execute on function public.staff_qualified_hires(uuid) from public, anon, authenticated;

-- العمولات اللي اتحسبت في شهر (للعرض في ملف الموظف)
create or replace function public.staff_commissions(p_office uuid, p_month text, p_member uuid default null)
returns table (courier_id uuid, member_id uuid, courier_name text, first_active date, qualified_on date)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_staff_manager(p_office)
          or (public.office_has_module(p_office, 'staff') and p_member is not null and p_member = public.my_member_id(p_office))) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  return query
    select q.* from public.staff_qualified_hires(p_office) q
    where to_char(q.qualified_on, 'YYYY-MM') = p_month and (p_member is null or q.member_id = p_member)
    order by q.qualified_on;
end $$;

-- ---------------------------------------------------------------------
-- 5) حسبة مرتب الموظفين للشهر
--    الصافي = الثابت + العمولات + المكافآت − الخصومات − السلف − خصم الغياب − خصم التأخير
--    خصم يوم الغياب = الثابت ÷ 30
-- ---------------------------------------------------------------------
create or replace function public.staff_month_summary(p_office uuid, p_month text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_mgr boolean := public.is_staff_manager(p_office);
  v_me uuid := public.my_member_id(p_office);
  v_start date := to_date(p_month || '-01', 'YYYY-MM-DD');
  v_end date := (to_date(p_month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
  v_until date := least((to_date(p_month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date, (now() at time zone 'Africa/Cairo')::date);
  v_allowed int := coalesce((select allowed_lates from public.staff_settings where office_id = p_office), 3);
  v_default numeric := coalesce((select default_commission from public.staff_settings where office_id = p_office), 0);
  v_out jsonb;
begin
  if not public.office_has_module(p_office, 'staff') or (not v_mgr and v_me is null) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  with m as (
    select om.id, om.full_name, om.email, om.role, om.is_active,
           coalesce(p.base_salary, 0) base_salary,
           coalesce(p.commission_per_hire, v_default) commission_rate,
           coalesce(p.work_days, '{0,1,2,3,4,6}') work_dow,
           coalesce(p.late_grace_minutes, 15) grace,
           coalesce(p.late_penalty, 0) late_penalty,
           greatest(v_start, coalesce(p.hire_date, v_start)) from_day,
           p.member_id is not null has_profile
    from public.office_members om
    left join public.staff_profiles p on p.member_id = om.id
    where om.office_id = p_office and (v_mgr or om.id = v_me)
      and (om.is_active or exists (select 1 from public.attendance a where a.member_id = om.id and a.day between v_start and v_end))
  ),
  days as (select d::date d from generate_series(v_start, v_until, interval '1 day') d),
  wd as (
    select m.id member_id, d.d
    -- الغياب بيتحسب بس للموظفين اللي ليهم ملف (مرتب ومواعيد)
    from m join days d on m.has_profile and d.d >= m.from_day and extract(dow from d.d)::int = any (m.work_dow)
    where not exists (select 1 from public.office_holidays h where h.office_id = p_office and h.day = d.d)
  ),
  att as (
    select wd.member_id,
           count(*) work_days,
           count(*) filter (where a.check_in is not null and a.status = 'present') present_days,
           count(*) filter (where a.status in ('leave', 'holiday')) leave_days,
           count(*) filter (where a.id is null or (a.check_in is null and a.status not in ('leave', 'holiday')) or a.status = 'absent') absent_days
    from wd left join public.attendance a on a.member_id = wd.member_id and a.day = wd.d
    group by wd.member_id
  ),
  late as (
    -- التأخير بيتحسب في أيام الشغل بس (مش الإجازات ولا لو جه يوم الجمعة)
    select a.member_id, count(*) late_count
    from public.attendance a
    join m on m.id = a.member_id
    join wd on wd.member_id = a.member_id and wd.d = a.day
    where a.check_in is not null and a.late_minutes > m.grace
    group by a.member_id
  ),
  com as (
    select q.member_id, count(*) n
    from public.staff_qualified_hires(p_office) q
    where to_char(q.qualified_on, 'YYYY-MM') = p_month
    group by q.member_id
  ),
  adj as (
    select member_id,
           sum(amount) filter (where kind = 'bonus') bonuses,
           sum(amount) filter (where kind = 'deduction') deductions,
           sum(amount) filter (where kind = 'advance') advances
    from public.staff_adjustments where office_id = p_office and month = p_month
    group by member_id
  ),
  calc as (
    select m.*,
           coalesce(att.work_days, 0) work_days, coalesce(att.present_days, 0) present_days,
           coalesce(att.leave_days, 0) leave_days, coalesce(att.absent_days, 0) absent_days,
           coalesce(late.late_count, 0) late_count,
           coalesce(com.n, 0) commission_count,
           coalesce(com.n, 0) * m.commission_rate commission_amount,
           coalesce(adj.bonuses, 0) bonuses, coalesce(adj.deductions, 0) deductions, coalesce(adj.advances, 0) advances,
           round(coalesce(att.absent_days, 0) * m.base_salary / 30.0, 2) absence_deduction,
           greatest(coalesce(late.late_count, 0) - v_allowed, 0) * m.late_penalty late_deduction
    from m
    left join att on att.member_id = m.id
    left join late on late.member_id = m.id
    left join com on com.member_id = m.id
    left join adj on adj.member_id = m.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'member_id', c.id, 'full_name', c.full_name, 'email', c.email, 'role', c.role, 'is_active', c.is_active,
           'has_profile', c.has_profile, 'base_salary', c.base_salary, 'commission_rate', c.commission_rate,
           'work_days', c.work_days, 'present_days', c.present_days, 'leave_days', c.leave_days, 'absent_days', c.absent_days,
           'late_count', c.late_count, 'allowed_lates', v_allowed,
           'commission_count', c.commission_count, 'commission_amount', c.commission_amount,
           'bonuses', c.bonuses, 'deductions', c.deductions, 'advances', c.advances,
           'absence_deduction', c.absence_deduction, 'late_deduction', c.late_deduction,
           'net', c.base_salary + c.commission_amount + c.bonuses - c.deductions - c.advances - c.absence_deduction - c.late_deduction,
           'payslip', (select to_jsonb(s) from public.staff_payslips s where s.member_id = c.id and s.month = p_month)
         ) order by c.full_name), '[]'::jsonb)
    into v_out
  from calc c;
  return v_out;
end $$;

-- صرف مرتب موظف: بتتحفظ قسيمة ثابتة بالأرقام الحالية
create or replace function public.staff_pay(p_office uuid, p_month text, p_member uuid, p_method text, p_paid_by uuid, p_notes text default null)
returns public.staff_payslips language plpgsql security definer set search_path = '' as $$
declare r jsonb; v public.staff_payslips;
begin
  if not public.can_write_module(p_office, 'staff', '{owner,accountant}') then
    raise exception 'NOT_ALLOWED: صرف مرتبات الموظفين لصاحب المكتب والمحاسب بس' using errcode = '42501';
  end if;
  if exists (select 1 from public.staff_payslips where member_id = p_member and month = p_month) then
    raise exception 'ALREADY_PAID: مرتب الشهر ده اتصرف قبل كده';
  end if;
  select x into r from jsonb_array_elements(public.staff_month_summary(p_office, p_month)) x where x->>'member_id' = p_member::text;
  if r is null then raise exception 'MEMBER_NOT_FOUND'; end if;
  insert into public.staff_payslips (office_id, member_id, month, base_salary, work_days, present_days, absent_days, leave_days,
         late_count, absence_deduction, late_deduction, commission_count, commission_amount, bonuses, deductions, advances, net,
         pay_method, paid_by, notes)
  values (p_office, p_member, p_month, (r->>'base_salary')::numeric, (r->>'work_days')::int, (r->>'present_days')::int,
          (r->>'absent_days')::int, (r->>'leave_days')::int, (r->>'late_count')::int, (r->>'absence_deduction')::numeric,
          (r->>'late_deduction')::numeric, (r->>'commission_count')::int, (r->>'commission_amount')::numeric,
          (r->>'bonuses')::numeric, (r->>'deductions')::numeric, (r->>'advances')::numeric, (r->>'net')::numeric,
          nullif(trim(coalesce(p_method, '')), ''), p_paid_by, nullif(trim(coalesce(p_notes, '')), ''))
  returning * into v;
  return v;
end $$;

grant execute on function public.attendance_punch(uuid, numeric, numeric) to authenticated;
grant execute on function public.staff_commissions(uuid, text, uuid) to authenticated;
grant execute on function public.staff_month_summary(uuid, text) to authenticated;
grant execute on function public.staff_pay(uuid, text, uuid, text, uuid, text) to authenticated;
revoke execute on function public.attendance_punch(uuid, numeric, numeric) from anon;
revoke execute on function public.staff_commissions(uuid, text, uuid) from anon;
revoke execute on function public.staff_month_summary(uuid, text) from anon;
revoke execute on function public.staff_pay(uuid, text, uuid, text, uuid, text) from anon;
