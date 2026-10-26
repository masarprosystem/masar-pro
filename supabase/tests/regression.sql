-- =====================================================================
-- Masar Pro — اختبار شامل لقاعدة البيانات (كل الأقسام + الصلاحيات)
-- بيتشغل على نسخة اختبار فاضية بعد local_stubs.sql و migrations 001→007
-- أي فشل بيوقف التشغيل ويطبع FAIL: <السبب>
-- =====================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

create schema if not exists t;
create table if not exists t.results (n serial, ok boolean, name text);

create or replace function t.pass(p text) returns void language plpgsql as $$
begin insert into t.results(ok, name) values (true, p); raise notice 'PASS  %', p; end $$;

create or replace function t.ok(c boolean, p text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAIL: %', p; end if; perform t.pass(p); end $$;

-- تشغيل SQL كمستخدم (null = زائر من غير تسجيل دخول)
create or replace function t.run_as(p_uid uuid, p_sql text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  execute 'set local role ' || case when p_uid is null then 'anon' else 'authenticated' end;
  execute p_sql;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create or replace function t.val_as(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  execute 'set local role ' || case when p_uid is null then 'anon' else 'authenticated' end;
  execute p_sql into v;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  return v;
end $$;

create or replace function t.err(p_uid uuid, p_sql text, p_pattern text, p_name text) returns void language plpgsql as $$
declare v_msg text;
begin
  begin
    perform t.run_as(p_uid, p_sql);
    v_msg := '__NO_ERROR__';
  exception when others then
    v_msg := sqlerrm;
  end;
  execute 'reset role';
  if v_msg = '__NO_ERROR__' then raise exception 'FAIL: % (كان المفروض يترفض)', p_name; end if;
  if v_msg !~* p_pattern then raise exception 'FAIL: % (اترفض بسبب تاني: %)', p_name, v_msg; end if;
  perform t.pass(p_name);
end $$;

-- ---------------------------------------------------------------------
-- تجهيز: مستخدمين ومكتبين
-- ---------------------------------------------------------------------
insert into auth.users(id, email) values
 ('10000000-0000-0000-0000-000000000001','owner1@x'), ('10000000-0000-0000-0000-000000000002','acc1@x'),
 ('10000000-0000-0000-0000-000000000003','ops1@x'),   ('10000000-0000-0000-0000-000000000004','hr1@x'),
 ('10000000-0000-0000-0000-000000000005','hr2@x'),    ('10000000-0000-0000-0000-000000000009','owner2@x');
insert into public.platform_admins(user_id) values ('00000000-0000-0000-0000-00000000000a') on conflict do nothing;

create temp table ids (k text primary key, v uuid);
grant select on ids to authenticated, anon;
do $$
declare o1 uuid; o2 uuid; admin uuid := '00000000-0000-0000-0000-00000000000a';
begin
  o1 := t.val_as(admin, $q$select public.admin_create_office('مكتب الاختبار')$q$)::uuid;
  o2 := t.val_as(admin, $q$select public.admin_create_office('مكتب تاني')$q$)::uuid;
  insert into ids values ('o1', o1), ('o2', o2);
  perform t.run_as(admin, format($q$insert into public.office_members(office_id,user_id,role,full_name) values
    (%L,'10000000-0000-0000-0000-000000000001','owner','صاحب المكتب'),
    (%L,'10000000-0000-0000-0000-000000000002','accountant','المحاسب'),
    (%L,'10000000-0000-0000-0000-000000000003','operations','الأوبريشن'),
    (%L,'10000000-0000-0000-0000-000000000004','hr','نهلة'),
    (%L,'10000000-0000-0000-0000-000000000005','hr','دعاء'),
    (%L,'10000000-0000-0000-0000-000000000009','owner','صاحب مكتب تاني')$q$, o1,o1,o1,o1,o1,o2));
  insert into ids select 'm_'||role||case when full_name='دعاء' then '2' else '' end, id from public.office_members where office_id=o1;
end $$;

-- ---------------------------------------------------------------------
-- 1) الأساس: الحسابات والاشتراكات والعزل
-- ---------------------------------------------------------------------
do $$
declare o1 uuid := (select v from ids where k='o1'); o2 uuid := (select v from ids where k='o2');
  owner uuid := '10000000-0000-0000-0000-000000000001'; hr uuid := '10000000-0000-0000-0000-000000000004';
  owner2 uuid := '10000000-0000-0000-0000-000000000009'; admin uuid := '00000000-0000-0000-0000-00000000000a';
begin
  perform t.ok((select count(*) from public.office_stages where office_id=o1 and is_core)=8, 'المكتب الجديد بيتعمله 8 مراحل أساسية');
  perform t.ok((select count(*) from public.carriers where office_id=o1)=7, 'المكتب الجديد بيتعمله 7 شركات شحن');
  perform t.ok(exists(select 1 from public.office_settings where office_id=o1), 'المكتب الجديد بيتعمله إعدادات');
  perform t.err(owner, format($q$insert into public.office_members(office_id,user_id,role) select %L, id, 'accountant' from auth.users where email='owner2@x'$q$, o1),
                'SEAT_LIMIT', 'حد الحسابات بيمنع حساب زيادة (محاسب تاني)');
  perform t.err(owner, format($q$update public.office_members set is_active=false where office_id=%L and role='owner'$q$, o1), 'LAST_OWNER', 'آخر صاحب مكتب مينفعش يتوقف');
  perform t.ok(t.val_as(owner2, format('select count(*) from public.office_members where office_id=%L', o1))::int = 0, 'مكتب مايشوفش حسابات مكتب تاني');
  perform t.err(hr, $q$select public.admin_create_office('x')$q$, 'NOT_ALLOWED', 'الـ HR ميقدرش يعمل مكتب');
  perform t.run_as(admin, format($q$select public.admin_record_payment(%L, 1999, 'كاش', 1)$q$, o1));
  perform t.ok((select status from public.subscriptions where office_id=o1)='active', 'تسجيل الدفعة بيفعّل الاشتراك');
end $$;

-- ---------------------------------------------------------------------
-- 2) التعيينات
-- ---------------------------------------------------------------------
do $$
declare o1 uuid := (select v from ids where k='o1'); o2 uuid := (select v from ids where k='o2');
  hr uuid := '10000000-0000-0000-0000-000000000004'; owner2 uuid := '10000000-0000-0000-0000-000000000009';
  owner uuid := '10000000-0000-0000-0000-000000000001'; c1 uuid; bosta uuid;
begin
  perform t.run_as(hr, format($q$insert into public.couriers(office_id, full_name, national_id, primary_phone, recruited_by)
     values (%L,'أحمد محمد علي حسن','29810151203949','01012345678',(select v from ids where k='m_hr'))$q$, o1));
  select id into c1 from public.couriers where office_id=o1 and national_id='29810151203949';
  insert into ids values ('c1', c1);
  perform t.ok((select birth_date from public.couriers where id=c1)='1998-10-15', 'الرقم القومي بيطلّع تاريخ الميلاد');
  perform t.ok((select gender from public.couriers where id=c1)='female', 'الرقم القومي بيطلّع النوع (الرقم 13 زوجي)');
  perform t.err(hr, format($q$update public.couriers set stage='blocked' where id=%L$q$, c1), 'STAGE_NOTE_REQUIRED', 'محظور من غير سبب بيترفض');
  perform t.err(hr, format($q$insert into public.couriers(office_id, full_name, national_id, primary_phone) values (%L,'مكرر مكرر مكرر','29810151203949','010')$q$, o1),
                'duplicate|unique', 'الرقم القومي المكرر بيترفض');
  perform t.err(hr, format($q$insert into public.couriers(office_id, full_name, national_id, primary_phone) values (%L,'غلط غلط غلط','29813451203948','010')$q$, o1),
                'INVALID_NATIONAL_ID', 'تاريخ ميلاد غلط في الرقم القومي بيترفض');
  perform t.ok(t.val_as(owner2, format('select count(*) from public.couriers where office_id=%L', o1))::int = 0, 'مكتب مايشوفش مناديب مكتب تاني');
  perform t.run_as(hr, format($q$delete from public.couriers where id=%L$q$, c1));
  perform t.ok(exists(select 1 from public.couriers where id=c1), 'الـ HR ميقدرش يمسح مندوب');
  select id into bosta from public.carriers where office_id=o1 and name='Bosta';
  insert into ids values ('bosta', bosta);
  perform t.run_as(hr, format($q$insert into public.courier_assignments(office_id,courier_id,carrier_id,hub) values (%L,%L,%L,'Maadi Hub')$q$, o1, c1, bosta));
  perform t.ok((select current_carrier_id from public.couriers where id=c1)=bosta, 'التعاقد بيحدّث الشركة الحالية للمندوب');
  update public.subscriptions set max_active_couriers = 1 where office_id=o1;
  perform t.run_as(hr, format($q$update public.couriers set stage='active' where id=%L$q$, c1));
  perform t.err(hr, format($q$insert into public.couriers(office_id, full_name, national_id, primary_phone, stage) values (%L,'مندوب نشط تاني','30001011209384','011','active')$q$, o1),
                'ACTIVE_LIMIT', 'حد المناديب النشطين في الاشتراك بيتطبق');
  update public.subscriptions set max_active_couriers = null where office_id=o1;
end $$;

-- ---------------------------------------------------------------------
-- 3) المراحل الخاصة بالمكتب (جديد)
-- ---------------------------------------------------------------------
do $$
declare o1 uuid := (select v from ids where k='o1'); o2 uuid := (select v from ids where k='o2');
  owner uuid := '10000000-0000-0000-0000-000000000001'; ops uuid := '10000000-0000-0000-0000-000000000003';
  hr uuid := '10000000-0000-0000-0000-000000000004'; c2 uuid; medical uuid; uniform uuid; core_training uuid; other_stage uuid;
begin
  perform t.run_as(owner, format($q$insert into public.office_stages(office_id, base_stage, name, sort_order) values (%L,'training','كشف طبي',35)$q$, o1));
  perform t.run_as(ops, format($q$insert into public.office_stages(office_id, base_stage, name, sort_order) values (%L,'training','استلام اليونيفورم',38)$q$, o1));
  select id into medical from public.office_stages where office_id=o1 and name='كشف طبي';
  select id into uniform from public.office_stages where office_id=o1 and name='استلام اليونيفورم';
  perform t.ok(medical is not null and uniform is not null, 'صاحب المكتب والأوبريشن يضيفوا مراحل');
  perform t.err(hr, format($q$insert into public.office_stages(office_id, base_stage, name) values (%L,'training','مرحلة HR')$q$, o1), 'row-level', 'الـ HR ميقدرش يضيف مراحل');
  perform t.run_as(owner, format($q$update public.office_stages set name='جديد' where office_id=%L and is_core and base_stage='applied'$q$, o1));
  perform t.ok(exists(select 1 from public.office_stages where office_id=o1 and is_core and base_stage='applied' and name='جديد'), 'المرحلة الأساسية تتغير اسمها');
  perform t.err(owner, format($q$delete from public.office_stages where office_id=%L and is_core and base_stage='left'$q$, o1), 'CORE_STAGE', 'المرحلة الأساسية متتمسحش');
  perform t.err(owner, format($q$update public.office_stages set base_stage='active' where office_id=%L and is_core and base_stage='training'$q$, o1), 'CORE_STAGE', 'نوع المرحلة الأساسية ميتغيرش');

  perform t.run_as(hr, format($q$insert into public.couriers(office_id, full_name, national_id, primary_phone, stage_id)
     values (%L,'محمود حسن جابر سيد','29505121402394','01123456789',%L)$q$, o1, medical));
  select id into c2 from public.couriers where office_id=o1 and national_id='29505121402394';
  perform t.ok((select stage from public.couriers where id=c2)='training', 'المرحلة الخاصة بتحدد المرحلة الأساسية (كشف طبي ← تدريب)');
  perform t.ok((select stage_name from public.courier_stage_history where courier_id=c2 order by id desc limit 1)='كشف طبي', 'تاريخ المندوب بيسجل اسم المرحلة الخاصة');
  perform t.run_as(hr, format($q$update public.couriers set stage_id=%L where id=%L$q$, uniform, c2));
  perform t.ok((select count(*) from public.courier_stage_history where courier_id=c2)=2, 'النقل بين مرحلتين خاصتين بيتسجل في التاريخ');
  perform t.run_as(hr, format($q$update public.couriers set stage='active' where id=%L$q$, c2));
  perform t.ok((select stage_id from public.couriers where id=c2) is null and (select stage from public.couriers where id=c2)='active',
               'تحديث المرحلة الأساسية بالطريقة القديمة بيشيل المرحلة الخاصة');
  select id into other_stage from public.office_stages where office_id=o2 and is_core and base_stage='interview';
  perform t.err(hr, format($q$update public.couriers set stage_id=%L where id=%L$q$, other_stage, c2), 'INVALID_STAGE', 'مرحلة مكتب تاني بتترفض');
  perform t.run_as(owner, format($q$update public.office_stages set is_active=false where id=%L$q$, uniform));
  perform t.err(hr, format($q$update public.couriers set stage_id=%L where id=%L$q$, uniform, c2), 'INVALID_STAGE', 'المرحلة الموقوفة متتختارش');
  perform t.ok(public.stage_label(o1, 'applied', null)='جديد', 'اسم المرحلة بيرجع زي ما المكتب سمّاها');
end $$;

-- ---------------------------------------------------------------------
-- 4) شروط الشركات والتسعير وربحية المكتب (جديد)
-- ---------------------------------------------------------------------
do $$
declare o1 uuid := (select v from ids where k='o1'); bosta uuid := (select v from ids where k='bosta');
  owner uuid := '10000000-0000-0000-0000-000000000001'; acc uuid := '10000000-0000-0000-0000-000000000002';
  ops uuid := '10000000-0000-0000-0000-000000000003'; hr uuid := '10000000-0000-0000-0000-000000000004'; run uuid;
begin
  perform t.run_as(owner, format($q$update public.carriers set min_age=21, max_age=45, allowed_vehicles='{موتسيكل,ملاكي}', required_docs='{id_front,id_back,criminal_record}' where id=%L$q$, bosta));
  perform t.ok((select min_age from public.carriers where id=bosta)=21 and array_length((select required_docs from public.carriers where id=bosta),1)=3, 'شروط ومستندات الشركة بتتحفظ');
  perform t.err(owner, format($q$update public.carriers set min_age=5 where id=%L$q$, bosta), 'check', 'سن غير منطقي بيترفض');
  perform t.run_as(owner, format($q$insert into public.carrier_billing(carrier_id, office_id, model, rate, covers_salaries) values (%L,%L,'per_shipment',4.5,true)$q$, bosta, o1));
  perform t.ok(t.val_as(acc, 'select count(*) from public.carrier_billing')::int = 1, 'المحاسب يشوف تسعير الشركات');
  perform t.ok(t.val_as(ops, 'select count(*) from public.carrier_billing')::int = 0, 'الأوبريشن مايشوفش تسعير الشركات');
  perform t.ok(t.val_as(hr, 'select count(*) from public.carrier_billing')::int = 0, 'الـ HR مايشوفش تسعير الشركات');
  perform t.run_as(ops, format($q$update public.carrier_billing set rate=99 where carrier_id=%L$q$, bosta));
  perform t.ok((select rate from public.carrier_billing where carrier_id=bosta)=4.5, 'الأوبريشن ميقدرش يعدّل التسعير');
  run := (t.val_as(acc, format($q$select public.payroll_import(%L, %L, '2026-09', 'f.xlsx', '[{"line_key":"N:a","carrier_name":"A","total_salary":10000,"deliveries":500}]')->>'run_id'$q$, o1, bosta)))::uuid;
  insert into ids values ('run', run);
  perform t.run_as(acc, format($q$insert into public.run_revenue(run_id, office_id, amount) values (%L,%L,3000)$q$, run, o1));
  perform t.ok(t.val_as(acc, format('select amount from public.run_revenue where run_id=%L', run))::numeric = 3000, 'المحاسب يسجّل إيراد الشهر الفعلي');
  perform t.ok(t.val_as(ops, 'select count(*) from public.run_revenue')::int = 0, 'الأوبريشن مايشوفش الإيراد');
end $$;

-- ---------------------------------------------------------------------
-- 5) المرتبات (رجوع للتأكد إن مفيش حاجة باظت)
-- ---------------------------------------------------------------------
do $$
declare o1 uuid := (select v from ids where k='o1'); bosta uuid := (select v from ids where k='bosta'); c1 uuid := (select v from ids where k='c1');
  acc uuid := '10000000-0000-0000-0000-000000000002'; ops uuid := '10000000-0000-0000-0000-000000000003';
  hr uuid := '10000000-0000-0000-0000-000000000004'; run uuid; l1 uuid; m_acc uuid := (select v from ids where k='m_accountant');
begin
  perform t.err(hr, format($q$select public.payroll_import(%L,%L,'2026-10','f','[{"line_key":"N:x","carrier_name":"x","total_salary":1}]')$q$, o1, bosta), 'NOT_ALLOWED', 'الـ HR ميرفعش شيت مرتبات');
  run := (t.val_as(acc, format($q$select public.payroll_import(%L,%L,'2026-10','f.xlsx',
     '[{"line_key":"N:ehab","carrier_name":"MND-Ehab -C","total_salary":11507,"lost":1500},{"line_key":"N:sami","carrier_name":"Sami","total_salary":963}]')->>'run_id'$q$, o1, bosta)))::uuid;
  select id into l1 from public.payroll_lines where run_id=run and line_key='N:ehab';
  perform t.run_as(ops, format($q$select public.payroll_pay(%L, 500, 'إنستاباي', %L)$q$, l1, m_acc));
  perform t.ok((select paid_amount from public.payroll_lines where id=l1)=9507, 'الصافي = 11,507 − 500 سلف − 1,500 لوست = 9,507');
  perform t.run_as(ops, format($q$select public.payroll_link(%L, %L)$q$, l1, c1));
  perform t.run_as(acc, format($q$select public.payroll_import(%L,%L,'2026-10','f2.xlsx','[{"line_key":"N:ehab","carrier_name":"MND-Ehab -C","total_salary":12000,"lost":1500}]')$q$, o1, bosta));
  perform t.ok((select paid from public.payroll_lines where id=l1) and not exists(select 1 from public.payroll_lines where run_id=run and line_key='N:sami'),
               'إعادة الرفع بتحافظ على الصرف وبتشيل اللي اتشال من الشيت');
  perform t.run_as(acc, format($q$select public.payroll_import(%L,%L,'2026-11','nov.xlsx','[{"line_key":"N:ehab","carrier_name":"MND-Ehab","total_salary":9000}]')$q$, o1, bosta));
  perform t.ok((select l.courier_id from public.payroll_lines l join public.payroll_runs r on r.id=l.run_id where r.month='2026-11' and r.office_id=o1)=c1, 'الربط بيتطبق لوحده على الشهر الجاي');
  perform t.err(ops, format($q$select public.payroll_unpay(%L)$q$, l1), 'NOT_ALLOWED', 'الأوبريشن ميقدرش يلغي صرف');
  perform t.ok(t.val_as(hr, 'select count(*) from public.payroll_lines')::int = 0, 'الـ HR مايشوفش المرتبات');
  perform t.err(ops, format($q$insert into public.custody(office_id,month,member_id,amount) values (%L,'2026-10',%L,1000)$q$, o1, m_acc), 'row-level', 'الأوبريشن ميسجلش عُهدة');
end $$;

-- ---------------------------------------------------------------------
-- 6) الموظفين (رجوع)
-- ---------------------------------------------------------------------
do $$
declare o1 uuid := (select v from ids where k='o1'); hr uuid := '10000000-0000-0000-0000-000000000004'; acc uuid := '10000000-0000-0000-0000-000000000002';
  m_hr uuid := (select v from ids where k='m_hr'); m_acc uuid := (select v from ids where k='m_accountant'); v jsonb;
begin
  perform t.run_as(hr, format($q$select public.attendance_punch(%L)$q$, o1));
  perform t.run_as(hr, format($q$select public.attendance_punch(%L)$q$, o1));
  perform t.ok((select check_out is not null from public.attendance where member_id=m_hr and day=(now() at time zone 'Africa/Cairo')::date), 'تسجيل حضور وانصراف');
  perform t.err(hr, format($q$select public.attendance_punch(%L)$q$, o1), 'ALREADY_DONE', 'الحضور مايتسجلش مرتين في اليوم');
  perform t.run_as(hr, format($q$update public.attendance set late_minutes=0 where member_id=%L$q$, m_hr));
  perform t.ok(t.val_as(hr, format($q$select jsonb_array_length(public.staff_month_summary(%L, to_char(current_date,'YYYY-MM')))$q$, o1))::int = 1, 'الموظف يشوف حسبته هو بس');
  insert into public.staff_profiles(member_id, office_id, base_salary, commission_per_hire) values (m_hr, o1, 6000, 150);
  perform t.err(hr, format($q$select public.staff_pay(%L, to_char(current_date,'YYYY-MM'), %L, 'كاش', %L)$q$, o1, m_hr, m_acc), 'NOT_ALLOWED', 'الموظف ميصرفش لنفسه');
  perform t.run_as(acc, format($q$select public.staff_pay(%L, to_char(current_date,'YYYY-MM'), %L, 'كاش', %L)$q$, o1, m_hr, m_acc));
  perform t.ok(exists(select 1 from public.staff_payslips where member_id=m_hr), 'المحاسب يصرف ويتعمل قسيمة');
  perform t.err(acc, format($q$select public.staff_pay(%L, to_char(current_date,'YYYY-MM'), %L, 'كاش', %L)$q$, o1, m_hr, m_acc), 'ALREADY_PAID', 'المرتب مايتصرفش مرتين');
end $$;

-- ---------------------------------------------------------------------
-- 7) رابط التقديم العام (جديد)
-- ---------------------------------------------------------------------
do $$
declare o1 uuid := (select v from ids where k='o1'); owner uuid := '10000000-0000-0000-0000-000000000001'; hr uuid := '10000000-0000-0000-0000-000000000004';
  r jsonb; path text; cid uuid;
begin
  perform t.err(owner, format($q$update public.offices set slug='Bad Slug' where id=%L$q$, o1), 'slug_format|check', 'رابط المكتب لازم حروف إنجليزي صغيرة');
  perform t.run_as(owner, format($q$update public.offices set slug='alamal' where id=%L$q$, o1));
  r := t.val_as(null, $q$select public.public_office('alamal')$q$)::jsonb;
  perform t.ok((r->>'accepting')::boolean = false, 'الرابط مقفول لحد ما المكتب يفتحه');
  r := t.val_as(null, $q$select public.public_apply('alamal', '{"full_name":"كريم سامي عبدالله","national_id":"29001011209381","phone":"01055554444"}')$q$)::jsonb;
  perform t.ok((r->>'ok')::boolean = false, 'التقديم بيترفض والرابط مقفول');
  perform t.run_as(hr, format($q$update public.office_settings set apply_enabled=true where office_id=%L$q$, o1));
  perform t.ok(not (select apply_enabled from public.office_settings where office_id=o1), 'الـ HR ميقدرش يفتح رابط التقديم');
  perform t.run_as(owner, format($q$update public.office_settings set apply_enabled=true where office_id=%L$q$, o1));
  perform t.ok((t.val_as(null, $q$select public.public_office('alamal')$q$)::jsonb->>'accepting')::boolean, 'صاحب المكتب يفتح الرابط');

  path := o1::text || '/apply/abc123/id_front.webp';
  perform t.run_as(null, format($q$insert into storage.objects(bucket_id, name) values ('documents', %L)$q$, path));
  perform t.ok(exists(select 1 from storage.objects where name=path), 'الزائر يرفع صورة البطاقة في فولدر التقديم');
  perform t.err(null, format($q$insert into storage.objects(bucket_id, name) values ('documents', %L)$q$, o1::text || '/couriers/x/a.webp'),
                'row-level', 'الزائر ميقدرش يرفع بره فولدر التقديم');
  perform t.err(null, format($q$insert into storage.objects(bucket_id, name) values ('documents', %L)$q$, (select v from ids where k='o2')::text || '/apply/x/a.webp'),
                'row-level', 'الزائر ميقدرش يرفع لمكتب قافل التقديم');

  r := t.val_as(null, format($q$select public.public_apply('alamal', '{"full_name":"كريم سامي عبدالله","national_id":"29001011209381","phone":"01055554444",
        "vehicle":"موتسيكل","area":"المعادي","campaign":"fb-oct","relatives":[{"name":"سامي عبدالله","relation":"أب","phone":"01011112222"}],
        "documents":[{"doc_type":"id_front","path":"%s","size":"150000","mime":"image/webp"},{"doc_type":"id_back","path":"%s/apply/fake.webp"}]}')$q$, path, o1))::jsonb;
  perform t.ok((r->>'ok')::boolean, 'الزائر يقدّم من الرابط');
  select id into cid from public.couriers where office_id=o1 and national_id='29001011209381';
  perform t.ok((select stage from public.couriers where id=cid)='applied' and (select lead_source from public.couriers where id=cid)='رابط التقديم'
               and (select lead_campaign from public.couriers where id=cid)='fb-oct', 'المتقدم بيدخل "مُتقدم" ومصدره والحملة متسجلين');
  perform t.ok((select count(*) from public.courier_documents where courier_id=cid)=1, 'بيتسجل المستند الحقيقي بس، والمسار المزيف بيتجاهل');
  r := t.val_as(null, $q$select public.public_apply('alamal', '{"full_name":"كريم سامي عبدالله","national_id":"29001011209381","phone":"01055554444"}')$q$)::jsonb;
  perform t.ok((r->>'duplicate')::boolean and (select count(*) from public.couriers where national_id='29001011209381')=1, 'التقديم المكرر مابيعملش مندوب تاني');
  r := t.val_as(null, $q$select public.public_apply('alamal', '{"full_name":"صغير صغير صغير","national_id":"31201011209381","phone":"01055554444"}')$q$)::jsonb;
  perform t.ok((r->>'ok')::boolean = false, 'أقل من 18 سنة بيترفض');
  r := t.val_as(null, $q$select public.public_apply('alamal', '{"full_name":"رقم غلط هنا","national_id":"29001011209382","phone":"123"}')$q$)::jsonb;
  perform t.ok((r->>'ok')::boolean = false, 'رقم موبايل غلط بيترفض');
  perform t.ok(coalesce(t.val_as(null, 'select count(*) from public.couriers')::int, 0) = 0, 'الزائر مايشوفش أي بيانات') ;
end $$;

-- ---------------------------------------------------------------------
-- 8) الاشتراك الموقوف = قراءة بس
-- ---------------------------------------------------------------------
do $$
declare o1 uuid := (select v from ids where k='o1'); hr uuid := '10000000-0000-0000-0000-000000000004';
begin
  update public.subscriptions set status='suspended' where office_id=o1;
  perform t.ok(t.val_as(hr, format('select count(*) from public.couriers where office_id=%L', o1))::int > 0, 'المكتب الموقوف يقدر يشوف بياناته');
  perform t.err(hr, format($q$insert into public.couriers(office_id, full_name, national_id, primary_phone) values (%L,'موقوف موقوف موقوف','29001011209389','010')$q$, o1),
                'row-level', 'المكتب الموقوف ميقدرش يضيف');
  perform t.ok((t.val_as(null, $q$select public.public_office('alamal')$q$)::jsonb->>'accepting')::boolean = false, 'رابط التقديم بيتقفل لوحده لما الاشتراك يتوقف');
  update public.subscriptions set status='active' where office_id=o1;
end $$;

select format('%s اختبار نجحوا، %s فشلوا', count(*) filter (where ok), count(*) filter (where not ok)) as "النتيجة" from t.results;
