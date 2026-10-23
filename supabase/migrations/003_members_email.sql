-- =====================================================================
-- Masar Pro — Migration 003: إيميل العضو في جدول الأعضاء
-- علشان صفحة الفريق تعرض إيميل كل موظف من غير ما تقرا جدول auth.users
-- =====================================================================
alter table public.office_members add column if not exists email text;

update public.office_members m
   set email = u.email
  from auth.users u
 where u.id = m.user_id and m.email is null;

create index if not exists office_members_email_idx on public.office_members (lower(email));
