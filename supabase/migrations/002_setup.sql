-- =====================================================================
-- Masar Pro — Migration 002: التشغيل اليومي + تعيين الـ Super Admin
-- شغّله بعد 001، وبعد ما تعمل لنفسك حساب من Authentication ← Users ← Add user
-- =====================================================================

-- 1) تحديث حالات الاشتراكات كل يوم الساعة 1 بالليل بتوقيت UTC (3 الفجر بتوقيت مصر)
--    محتاج إضافة pg_cron تكون متفعلة من Database ← Extensions
select cron.unschedule(jobid) from cron.job where jobname = 'masar-refresh-subscriptions';
select cron.schedule('masar-refresh-subscriptions', '0 1 * * *', $$select public.refresh_subscription_statuses();$$);

-- 2) خلي حسابك Super Admin (غيّر الإيميل لو هتدخل بإيميل تاني)
insert into public.platform_admins (user_id)
select id from auth.users where email = 'masar.pro.system@gmail.com'
on conflict do nothing;

-- للتأكد: لازم يرجع صف واحد
select u.email, a.created_at from public.platform_admins a join auth.users u on u.id = a.user_id;
