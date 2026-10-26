-- =====================================================================
-- Masar Pro — بيانات واقعية لمكتب "مكتب الأمل للخدمات اللوجستية"
--
-- قبل التشغيل:
--   1) من لوحة الـ Super Admin اعمل مكتب بالاسم ده بالظبط: مكتب الأمل للخدمات اللوجستية
--      ومعاه حساب صاحب المكتب.
--   2) ضيف للمكتب حسابات: محاسب، و2 أوبريشن، و3 HR على الأقل (بأسماء عربي حقيقية).
--   3) شغّل الملف ده من SQL Editor مرة واحدة.
--
-- بيعمل: حوالي 160 مندوب برحلة كاملة على آخر 4 شهور، تعاقدات مع شركات الشحن،
-- مرتبات آخر 3 شهور (بوسطة ونون وأمازون) مع الصرف، عُهد ومصروفات،
-- ملفات الموظفين وحضورهم، والعمولات وقسايم مرتبات الشهر اللي فات.
-- لو اتشغل تاني بيمسح بيانات المكتب ده بس ويعملها من جديد.
-- =====================================================================

do $seed$
declare
  v_office uuid;
  v_owner uuid; v_owner_user uuid;
  v_hr uuid[]; v_payers uuid[]; v_staff uuid[];
  v_carrier record;
  c_bosta uuid; c_noon uuid; c_amazon uuid; c_jt uuid; c_mylerz uuid;

  -- أسماء: [عربي, إنجليزي]
  m_ar text[] := array['محمد','أحمد','محمود','مصطفى','عمر','علي','حسن','حسين','خالد','إبراهيم','يوسف','عبدالله','عبدالرحمن','كريم','طارق','هاني','سامح','وليد','أسامة','شريف','عمرو','ياسر','إسلام','مينا','بيتر','رامي','حمادة','سيد','عادل','أيمن','تامر','هشام','شادي','وائل','جمال','سعيد','ناصر','رضا','فتحي','صلاح','أشرف','مجدي','عصام','زياد','مازن','بلال','أنس','حازم','باسم','ماجد'];
  m_en text[] := array['Mohamed','Ahmed','Mahmoud','Mostafa','Omar','Ali','Hassan','Hussein','Khaled','Ibrahim','Youssef','Abdallah','Abdelrahman','Karim','Tarek','Hany','Sameh','Waleed','Osama','Sherif','Amr','Yasser','Eslam','Mina','Peter','Ramy','Hamada','Sayed','Adel','Ayman','Tamer','Hesham','Shady','Wael','Gamal','Saeed','Nasser','Reda','Fathy','Salah','Ashraf','Magdy','Essam','Ziad','Mazen','Belal','Anas','Hazem','Bassem','Maged'];
  f_ar text[] := array['منى','فاطمة','زينب','هناء','سميرة','أمل','نادية','سعاد','عزة','نجلاء','رشا','داليا','مروة','إيمان','هبة','سحر','وفاء','نهى','عبير','ثناء'];
  -- أسماء الأب والجد (من غير الأسماء المسيحية) + أسماء مسيحية للأب والجد لو الاسم الأول مسيحي
  xt_ar text[] := array['جرجس','سمير','ماهر','نبيل','فايز','رأفت','عادل','صموئيل','عماد','ميلاد'];
  xt_en text[] := array['Gerges','Samir','Maher','Nabil','Fayez','Raafat','Adel','Samuel','Emad','Milad'];
  f_en text[] := array['Mona','Fatma','Zeinab','Hanaa','Samira','Amal','Nadia','Soad','Azza','Naglaa','Rasha','Dalia','Marwa','Eman','Heba','Sahar','Wafaa','Noha','Abeer','Sanaa'];
  fam_ar text[] := array['عبدالعزيز','السيد','عبدالحميد','الشافعي','النجار','الحداد','عبدالفتاح','رمضان','عبدالمنعم','الشربيني','حجازي','سليمان','عبدالله','فرج','بدوي','عثمان','الجمال','مرسي','شحاتة','زكي','المصري','عيسى','الفقي','غنيم','حمدي','قاسم','عطية','منصور','البنا','الطوخي'];
  fam_en text[] := array['Abdelaziz','Elsayed','Abdelhamid','Elshafei','Elnaggar','Elhaddad','Abdelfattah','Ramadan','Abdelmoneim','Elsherbiny','Hegazy','Soliman','Abdallah','Farag','Badawy','Osman','Elgamal','Morsy','Shehata','Zaky','Elmasry','Eissa','Elfeky','Ghoneim','Hamdy','Kassem','Attia','Mansour','Elbanna','Eltokhy'];

  -- المناطق: [المنطقة, الهب, كود الهب, الزون, عنوان, كود محافظة الميلاد المرجح]
  areas text[][] := array[
    ['المعادي','Maadi Hub','MA','Dar Elsalam-Basatin','المعادي - شارع 9','01'],
    ['مدينة نصر','Nasr City Hub','NC','Nasr City','مدينة نصر - الحي السابع','01'],
    ['المهندسين','Mohandseen Hub','MH','Mohandessin','المهندسين - شارع شهاب','21'],
    ['6 أكتوبر','October Hub','OC','Sheikh Zayed','6 أكتوبر - الحي المتميز','21'],
    ['إمبابة','Imbaba Hub','IM','Imbaba','إمبابة - شارع الوحدة','21'],
    ['مصر الجديدة','Heliopolis Hub','HP','Heliopolis','مصر الجديدة - الكوربة','01'],
    ['التجمع الخامس','New Cairo Hub','NCR','Rehab','التجمع الخامس - البنفسج','01'],
    ['المنصورة','El-Mansoura Hub','MN','Mansoura','المنصورة - توريل','12'],
    ['شبرا الخيمة','Shubra Hub','SH','Shubra Elkheima','شبرا الخيمة - الترعة البولاقية','14'],
    ['حدائق الأهرام','Hadayk October','HO','October Gardens','حدائق الأهرام - البوابة التانية','21']
  ];
  origin_gov text[] := array['22','23','24','25','26','17','13','16','18','12','14','15'];
  origin_name text[] := array['بني سويف','الفيوم','المنيا','أسيوط','سوهاج','المنوفية','الشرقية','الغربية','البحيرة','الدقهلية','القليوبية','كفر الشيخ'];
  sources text[] := array['إعلان فيسبوك','إعلان فيسبوك','إعلان فيسبوك','ترشيح من مندوب','ترشيح من مندوب','تسديد ميداني','مقر الشركة مباشر','واتساب'];
  left_after_training text[] := array['رفض ينزل بعد التدريب','لقى شغل تاني','قال الشغل تقيل عليه','مش بيرد على التليفون','المركبة مش جاهزة','سافر بلده'];
  left_after_active text[] := array['ساب الشغل من نفسه','لقى شغل تاني','مش بيرد على التليفون','نقل محافظة تانية'];
  inactive_notes text[] := array['مش منتظم في الشغل','إجازة طويلة','مشكلة في المركبة'];
  blocked_notes text[] := array['عجز ومرفضش يسدد','مشكلة مع شركة الشحن','شحنات لوست متكررة'];
  methods text[] := array['فودافون كاش','فودافون كاش','فودافون كاش','فودافون كاش','إنستاباي','إنستاباي','إنستاباي','كاش','كاش','تحويل بنكي'];

  stages text[]; n int := 0; i int; k int;
  st text; fem boolean; fi int; a_i int; ar_name text; en_name text; father text; grand text; fam_i int;
  birth date; gov text; nid text; phone text; veh text; veh_en text;
  t0 timestamptz; t_int timestamptz; t_pass timestamptz; t_train timestamptz; t_act timestamptz; t_end timestamptz;
  note text; cid uuid; rec uuid; carrier uuid; carrier_name text; hub text; zone text; prefix text;
  m int; mstart date; mend date; run uuid; days int; deliv int; fixed numeric; varr numeric; ded numeric; bon numeric; total numeric;
  adv numeric; def numeric; lost numeric; paid boolean; payer uuid; lkey text; line_count int := 0;
  member record; d date; ci timestamptz; late int;
begin
  perform setseed(0.4242);

  select id into v_office from public.offices where name = 'مكتب الأمل للخدمات اللوجستية' limit 1;
  if v_office is null then
    raise exception 'اعمل المكتب الأول من لوحة الـ Super Admin بالاسم: مكتب الأمل للخدمات اللوجستية';
  end if;

  select id, user_id into v_owner, v_owner_user from public.office_members where office_id = v_office and role = 'owner' and is_active limit 1;
  if v_owner is null then raise exception 'المكتب محتاج حساب صاحب مكتب'; end if;
  select coalesce(array_agg(id order by created_at), '{}') into v_hr from public.office_members where office_id = v_office and role = 'hr' and is_active;
  select coalesce(array_agg(id order by role, created_at), '{}') into v_payers from public.office_members where office_id = v_office and role in ('accountant','operations') and is_active;
  if array_length(v_payers, 1) is null then v_payers := array[v_owner]; end if;
  if array_length(v_hr, 1) is null then v_hr := array[v_owner]; end if;

  -- تنضيف أي بيانات قديمة للمكتب ده
  delete from public.staff_payslips where office_id = v_office;
  delete from public.staff_adjustments where office_id = v_office;
  delete from public.attendance where office_id = v_office;
  delete from public.staff_profiles where office_id = v_office;
  delete from public.staff_settings where office_id = v_office;
  delete from public.expenses where office_id = v_office;
  delete from public.custody where office_id = v_office;
  delete from public.payroll_runs where office_id = v_office;
  delete from public.payroll_links where office_id = v_office;
  delete from public.couriers where office_id = v_office;

  -- الاشتراك شغال
  update public.subscriptions set status = 'active', current_period_start = current_date - 10, current_period_end = current_date + 20
   where office_id = v_office;

  perform public.seed_default_carriers(v_office);
  select id into c_bosta from public.carriers where office_id = v_office and name = 'Bosta';
  select id into c_noon from public.carriers where office_id = v_office and name = 'Noon';
  select id into c_amazon from public.carriers where office_id = v_office and name = 'Amazon';
  select id into c_jt from public.carriers where office_id = v_office and name = 'J&T';
  select id into c_mylerz from public.carriers where office_id = v_office and name = 'Mylerz';

  -- توزيع المراحل (حوالي 160 مندوب)
  stages := array_fill('active'::text, array[72]) || array_fill('training'::text, array[11]) || array_fill('passed_interview'::text, array[7])
         || array_fill('interview'::text, array[13]) || array_fill('applied'::text, array[17]) || array_fill('left_t'::text, array[16])
         || array_fill('left_a'::text, array[9]) || array_fill('inactive'::text, array[7]) || array_fill('blocked'::text, array[4]);

  create temp table if not exists _seed_c (cid uuid, en text, prefix text, carrier uuid, hub text, zone text, veh_en text, t_act timestamptz, t_end timestamptz) on commit drop;
  truncate _seed_c;

  foreach st in array stages loop
    n := n + 1;
    fem := random() < 0.03;
    fi := 1 + floor(random() * array_length(m_ar, 1))::int;
    fam_i := 1 + floor(random() * array_length(fam_ar, 1))::int;
    k := 1 + floor(random() * array_length(m_ar, 1))::int;          -- اسم الأب
    i := 1 + floor(random() * array_length(m_ar, 1))::int;          -- اسم الجد
    while m_ar[k] in ('مينا','بيتر') loop k := 1 + floor(random() * array_length(m_ar, 1))::int; end loop;
    while m_ar[i] in ('مينا','بيتر') loop i := 1 + floor(random() * array_length(m_ar, 1))::int; end loop;
    father := m_ar[k]; grand := m_ar[i];
    if fem then
      fi := 1 + floor(random() * array_length(f_ar, 1))::int;
      ar_name := f_ar[fi] || ' ' || father || ' ' || grand || ' ' || fam_ar[fam_i];
      en_name := f_en[fi] || ' ' || m_en[k] || ' ' || m_en[i];
    elsif m_ar[fi] in ('مينا','بيتر') then
      k := 1 + floor(random() * array_length(xt_ar, 1))::int;
      i := 1 + floor(random() * array_length(xt_ar, 1))::int;
      father := xt_ar[k]; grand := xt_ar[i];
      ar_name := m_ar[fi] || ' ' || father || ' ' || grand || ' ' || (array['حنا','عبدالمسيح','بطرس','ميخائيل','جرجس'])[1 + floor(random() * 5)::int];
      en_name := m_en[fi] || ' ' || xt_en[k] || ' ' || xt_en[i];
    else
      ar_name := m_ar[fi] || ' ' || father || ' ' || grand || ' ' || fam_ar[fam_i];
      en_name := m_en[fi] || ' ' || m_en[k] || ' ' || m_en[i];
    end if;

    a_i := 1 + floor(random() * array_length(areas, 1))::int;
    birth := date '1984-01-01' + floor(random() * (date '2006-06-01' - date '1984-01-01'))::int;
    gov := case when random() < 0.55 then areas[a_i][6] else origin_gov[1 + floor(random() * array_length(origin_gov, 1))::int] end;
    -- الرقم القومي: القرن + YYMMDD + المحافظة + مسلسل (الرقم قبل الأخير فردي للذكر) + رقم تحقق
    nid := case when extract(year from birth) >= 2000 then '3' else '2' end || to_char(birth, 'YYMMDD') || gov
           || lpad(((n * 37) % 1000)::text, 3, '0')
           || ((floor(random() * 5))::int * 2 + case when fem then 0 else 1 end)::text
           || (floor(random() * 10))::int::text;
    phone := (array['010','011','012','015'])[1 + floor(random() * 4)::int] || (10000000 + (n * 102947 + floor(random() * 50)::int) % 89999999)::text;

    veh := (array['موتسيكل','موتسيكل','موتسيكل','موتسيكل','ملاكي','ملاكي','ملاكي','فان','دبابة','بدون مركبة'])[1 + floor(random() * 10)::int];
    veh_en := case veh when 'ملاكي' then 'Sedan' when 'فان' then 'Van' when 'دبابة' then 'Van' when 'بدون مركبة' then 'Walker' else 'Motorbike' end;

    -- الخط الزمني
    t0 := case st
            when 'applied' then now() - make_interval(days => floor(random() * 9)::int, hours => floor(random() * 10)::int)
            when 'interview' then now() - make_interval(days => 2 + floor(random() * 10)::int)
            when 'passed_interview' then now() - make_interval(days => 5 + floor(random() * 12)::int)
            when 'training' then now() - make_interval(days => 8 + floor(random() * 10)::int)
            else now() - make_interval(days => 25 + floor(random() * 100)::int)
          end;
    t0 := date_trunc('hour', t0) + make_interval(hours => 0);
    t_int := t0 + make_interval(days => 1 + floor(random() * 3)::int, hours => floor(random() * 5)::int);
    t_pass := t_int + make_interval(hours => 2 + floor(random() * 30)::int);
    t_train := t_pass + make_interval(days => 1 + floor(random() * 3)::int);
    t_act := t_train + make_interval(days => 4 + floor(random() * 6)::int);
    t_end := null; note := null;
    if st = 'left_t' then t_end := t_train + make_interval(days => 1 + floor(random() * 5)::int);
      note := left_after_training[1 + floor(random() * array_length(left_after_training, 1))::int];
    elsif st in ('left_a', 'inactive', 'blocked') then
      t_end := t_act + make_interval(days => 6 + floor(random() * 50)::int);
      if t_end > now() - interval '1 day' then t_end := now() - make_interval(days => 1 + floor(random() * 3)::int); end if;
      note := case st when 'left_a' then left_after_active[1 + floor(random() * array_length(left_after_active, 1))::int]
                      when 'inactive' then inactive_notes[1 + floor(random() * array_length(inactive_notes, 1))::int]
                      else blocked_notes[1 + floor(random() * array_length(blocked_notes, 1))::int] end;
    end if;
    if st = 'training' and t_train > now() then t_train := now() - interval '2 days'; end if;

    rec := case when random() < 0.9 then v_hr[1 + floor(random() * array_length(v_hr, 1))::int] else v_owner end;

    insert into public.couriers (office_id, full_name, national_id, primary_phone, alt_phone, current_address, original_address,
      vehicle_type, assigned_area, lead_source, stage, stage_note, recruited_by, appointment_date, relatives, created_at, created_by)
    values (v_office, ar_name, nid, phone,
      case when random() < 0.35 then '01' || (array['0','1','2','5'])[1 + floor(random() * 4)::int] || lpad((floor(random() * 99999999))::int::text, 8, '0') end,
      areas[a_i][5] || ' - عمارة ' || (1 + floor(random() * 60))::int,
      origin_name[1 + floor(random() * array_length(origin_name, 1))::int],
      veh, areas[a_i][1], sources[1 + floor(random() * array_length(sources, 1))::int],
      (case st when 'left_t' then 'left' when 'left_a' then 'left' else st end)::public.courier_stage,
      note, rec, t0::date,
      jsonb_build_array(
        jsonb_build_object('name', father || ' ' || grand || ' ' || fam_ar[fam_i], 'relation', 'أب', 'phone', '010' || lpad((floor(random() * 99999999))::int::text, 8, '0')),
        jsonb_build_object('name', f_ar[1 + floor(random() * array_length(f_ar, 1))::int] || ' ' || fam_ar[1 + floor(random() * array_length(fam_ar, 1))::int], 'relation', 'أم', 'phone', '011' || lpad((floor(random() * 99999999))::int::text, 8, '0')),
        jsonb_build_object('name', m_ar[1 + floor(random() * array_length(m_ar, 1))::int] || ' ' || father || ' ' || fam_ar[fam_i], 'relation', 'أخ', 'phone', '012' || lpad((floor(random() * 99999999))::int::text, 8, '0'))),
      t0, v_owner_user)
    returning id into cid;

    -- تاريخ المراحل الحقيقي بدل اللي اتسجل وقت الإدخال
    delete from public.courier_stage_history where courier_id = cid;
    insert into public.courier_stage_history (office_id, courier_id, from_stage, to_stage, note, changed_by, changed_at)
    select v_office, cid, x.f::public.courier_stage, x.t::public.courier_stage, x.nt, v_owner_user, x.at
    from (values
      (null, 'applied', null::text, t0, 1),
      ('applied', 'interview', null, t_int, 2),
      ('interview', 'passed_interview', 'جاهز للتدريب', t_pass, 3),
      ('passed_interview', 'training', 'نزل التدريب', t_train, 4),
      ('training', 'active', null, t_act, 5),
      (case when st = 'left_t' then 'training' else 'active' end,
       case st when 'inactive' then 'inactive' when 'blocked' then 'blocked' else 'left' end, note, t_end, 6)
    ) as x(f, t, nt, at, ord)
    where (ord = 1)
       or (ord = 2 and st <> 'applied')
       or (ord = 3 and st not in ('applied','interview'))
       or (ord = 4 and st not in ('applied','interview','passed_interview'))
       or (ord = 5 and st in ('active','left_a','inactive','blocked'))
       or (ord = 6 and st in ('left_t','left_a','inactive','blocked'));

    update public.couriers set stage_changed_at = coalesce(t_end, case st when 'active' then t_act when 'training' then t_train
                                                                         when 'passed_interview' then t_pass when 'interview' then t_int else t0 end)
     where id = cid;

    -- شركة الشحن من أول التدريب
    if st not in ('applied','interview','passed_interview') then
      carrier := case when random() < 0.6 then c_bosta when random() < 0.45 then c_noon when random() < 0.6 then c_amazon when random() < 0.6 then c_jt else c_mylerz end;
      insert into public.courier_assignments (office_id, courier_id, carrier_id, hub, zone, start_date, end_date, is_current, created_by)
      values (v_office, cid, carrier, areas[a_i][2], areas[a_i][4], t_train::date,
              case when st in ('left_t','left_a') then t_end::date end, st not in ('left_t','left_a'), v_owner_user);
      if st <> 'left_t' then
        insert into _seed_c values (cid, en_name, areas[a_i][3], carrier, areas[a_i][2], areas[a_i][4], veh_en, t_act, t_end);
      end if;
    end if;
  end loop;

  -- ---------------- المرتبات: آخر 3 شهور ----------------
  for m in 1..3 loop
    mstart := (date_trunc('month', current_date) - make_interval(months => m))::date;
    mend := (mstart + interval '1 month - 1 day')::date;
    for v_carrier in select id, name from public.carriers where id in (c_bosta, c_noon, c_amazon) loop
      insert into public.payroll_runs (office_id, carrier_id, month, source_file_name, imported_at, imported_by)
      values (v_office, v_carrier.id, to_char(mstart, 'YYYY-MM'), v_carrier.name || ' ' || to_char(mstart, 'Mon YYYY') || '.xlsx',
              (mend + 3)::timestamptz + interval '11 hours', v_owner_user)
      returning id into run;
      for cid, en_name, prefix, hub, zone, veh_en, t_act, t_end in
        select s.cid, s.en, s.prefix, s.hub, s.zone, s.veh_en, s.t_act, s.t_end from _seed_c s
        where s.carrier = v_carrier.id and s.t_act::date <= mend - 3 and (s.t_end is null or s.t_end::date >= mstart + 3)
      loop
        days := least(26, greatest(3, (least(mend, coalesce(t_end::date, mend)) - greatest(mstart, t_act::date) + 1) * 26 / 30));
        days := greatest(1, days - floor(random() * 3)::int);
        deliv := days * (14 + floor(random() * 24)::int);
        fixed := days * case veh_en when 'Sedan' then 250 when 'Van' then 300 when 'Walker' then 120 else 175 end;
        varr := deliv * case veh_en when 'Sedan' then 18 when 'Van' then 19 when 'Walker' then 14 else 16 end;
        ded := case when random() < 0.3 then (2 + floor(random() * 9)::int) * 100 else 0 end;
        bon := case when random() < 0.14 then (5 + floor(random() * 25)::int) * 100 else 0 end;
        total := fixed + varr - ded + bon;
        adv := case when random() < 0.2 then (5 + floor(random() * 16)::int) * 100 else 0 end;
        def := case when random() < 0.08 then (2 + floor(random() * 13)::int) * 100 else 0 end;
        lost := case when random() < 0.05 then (3 + floor(random() * 17)::int) * 100 else 0 end;
        paid := m > 1 or random() < 0.6;
        payer := v_payers[1 + floor(random() * array_length(v_payers, 1))::int];
        lkey := 'N:' || lower(en_name);
        insert into public.payroll_lines (office_id, run_id, line_key, carrier_name, courier_id, hub, zone, vehicle,
          work_days, deliveries, rto, pickups, total_fixed, total_variable, total_deductions, total_bonus, total_salary,
          advances_sheet, deficit, lost, details, advances, paid, paid_amount, pay_method, paid_by, paid_at, pay_recorded_at)
        values (v_office, run, lkey, prefix || '-' || en_name || ' -C', case when random() < 0.9 or paid then cid end, hub, zone, veh_en,
          days, deliv, floor(random() * 4)::int, floor(random() * 3)::int, fixed, varr, ded, bon, total, adv, def, lost,
          jsonb_build_object('pkg_var', varr, 'ops_ded', ded, 'ops_bonus', bon),
          case when paid then adv end, paid, case when paid then total - adv - def - lost end,
          case when paid then methods[1 + floor(random() * array_length(methods, 1))::int] end,
          case when paid then payer end, case when paid then mend + 4 + floor(random() * 8)::int end,
          case when paid then (mend + 6)::timestamptz end)
        on conflict (run_id, line_key) do nothing;
        line_count := line_count + 1;
      end loop;
    end loop;

    -- العُهد: اللي صرفه كل موظف + فكة متبقية
    insert into public.custody (office_id, month, member_id, amount, updated_by)
    select v_office, to_char(mstart, 'YYYY-MM'), l.paid_by,
           ceil((sum(l.paid_amount) + 1500 + floor(random() * 4000)) / 500) * 500, v_owner_user
    from public.payroll_lines l join public.payroll_runs r on r.id = l.run_id
    where r.office_id = v_office and r.month = to_char(mstart, 'YYYY-MM') and l.paid
    group by l.paid_by;

    insert into public.expenses (office_id, month, spent_at, description, category, amount, paid_by, created_by)
    values
      (v_office, to_char(mstart, 'YYYY-MM'), mstart + 3, 'إعلانات فيسبوك لطلب مناديب', 'إعلانات', (25 + floor(random() * 20)::int) * 100, v_payers[1], v_owner_user),
      (v_office, to_char(mstart, 'YYYY-MM'), mstart + 8, 'باقة انترنت المكتب', 'انترنت واتصالات', 650, v_payers[1], v_owner_user),
      (v_office, to_char(mstart, 'YYYY-MM'), mstart + 12, 'شحن رصيد موبايلات الـ HR', 'انترنت واتصالات', 900, v_payers[array_length(v_payers, 1)], v_owner_user),
      (v_office, to_char(mstart, 'YYYY-MM'), mstart + 17, 'مواصلات مشاوير الهبات', 'مواصلات', (4 + floor(random() * 6)::int) * 100, v_payers[array_length(v_payers, 1)], v_owner_user),
      (v_office, to_char(mstart, 'YYYY-MM'), mstart + 22, 'طباعة إيصالات أمانة وعقود', 'أدوات', 350, v_payers[1], v_owner_user);
  end loop;

  -- الربط الدائم لأسماء بوسطة بملفات المناديب
  insert into public.payroll_links (office_id, carrier_id, line_key, courier_id, linked_by)
  select distinct on (r.carrier_id, l.line_key) v_office, r.carrier_id, l.line_key, l.courier_id, v_owner_user
  from public.payroll_lines l join public.payroll_runs r on r.id = l.run_id
  where l.office_id = v_office and l.courier_id is not null
  on conflict do nothing;

  -- ---------------- الموظفين ----------------
  insert into public.staff_settings (office_id, commission_rule, commission_days, default_commission, allowed_lates)
  values (v_office, 'active_days', 15, 150, 3);

  for member in select id, role from public.office_members where office_id = v_office and is_active and role <> 'owner' loop
    insert into public.staff_profiles (member_id, office_id, job_title, base_salary, commission_per_hire, hire_date, work_start, work_end, work_days, late_grace_minutes, late_penalty)
    values (member.id, v_office,
      case member.role when 'accountant' then 'محاسب' when 'operations' then 'مشرف أوبريشن' else 'مسؤول تعيينات' end,
      case member.role when 'accountant' then 7500 when 'operations' then 6500 else 5000 end,
      case when member.role = 'hr' then 150 end,
      current_date - (120 + floor(random() * 300))::int, '10:00', '18:00', '{0,1,2,3,4,6}', 15, 50);

    -- حضور آخر 45 يوم (أيام الشغل)
    for d in select g::date from generate_series(current_date - 45, current_date - 1, interval '1 day') g loop
      continue when extract(dow from d) = 5;
      if random() < 0.05 then
        insert into public.attendance (office_id, member_id, day, status, notes) values (v_office, member.id, d, 'leave', 'إجازة عارضة');
        continue;
      end if;
      continue when random() < 0.04; -- غياب
      late := case when random() < 0.18 then 16 + floor(random() * 45)::int else floor(random() * 12)::int end;
      ci := (d::timestamp + time '09:50' + make_interval(mins => late + 10)) at time zone 'Africa/Cairo';
      insert into public.attendance (office_id, member_id, day, status, check_in, check_out, late_minutes)
      values (v_office, member.id, d, 'present', ci,
              (d::timestamp + time '18:00' + make_interval(mins => floor(random() * 50)::int)) at time zone 'Africa/Cairo',
              greatest(0, late));
    end loop;
  end loop;

  insert into public.staff_adjustments (office_id, member_id, month, kind, amount, reason, created_by)
  select v_office, v_hr[1], to_char(current_date, 'YYYY-MM'), 'bonus', 500, 'أعلى نسبة مناديب كمّلوا الشهر', v_owner_user
  where v_hr[1] <> v_owner;

  -- قسايم مرتبات الشهر اللي فات (باسم صاحب المكتب)
  perform set_config('request.jwt.claim.sub', v_owner_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_user, 'role', 'authenticated')::text, true);
  for member in select sp.member_id from public.staff_profiles sp where sp.office_id = v_office loop
    begin
      perform public.staff_pay(v_office, to_char(current_date - interval '1 month', 'YYYY-MM'), member.member_id,
                               (array['كاش','إنستاباي'])[1 + floor(random() * 2)::int], v_payers[1], null);
    exception when others then
      raise notice 'قسيمة متعملتش: %', sqlerrm;
    end;
  end loop;

  raise notice 'تم: % مندوب، % سطر مرتبات', n, line_count;
end
$seed$;

-- ملخص سريع
select stage, count(*) from public.couriers c join public.offices o on o.id = c.office_id
where o.name = 'مكتب الأمل للخدمات اللوجستية' group by stage order by 2 desc;
