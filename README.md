# Masar Pro — نظام إدارة وتعيين مناديب التوصيل

منتج من **A Tech Solution**. منصة SaaS متعددة المكاتب لمكاتب تعيين مناديب الشحن.

## التقنيات
React + TypeScript + Vite · Tailwind · TanStack Query · Supabase (Postgres, Auth, RLS, Edge Functions, Storage) · Vercel

## هيكل المشروع
```
src/core/          تسجيل الدخول، المكتب الحالي، الصلاحيات، الأدوات المشتركة
src/modules/recruitment/   قسم التعيينات
src/modules/payroll/       قسم المرتبات
src/modules/staff/         قسم الموظفين
public/templates/          Template رفع المناديب
src/components/    عناصر الواجهة + إدارة الحسابات
src/layouts/       القائمة الجانبية (المكتب / Super Admin)
src/pages/app/     صفحات المكتب
src/pages/admin/   صفحات Super Admin
src/pages/Landing.tsx   الصفحة التعريفية (الرابط الرئيسي /) وفيها زرار تسجيل الدخول
supabase/migrations/   ملفات قاعدة البيانات بالترتيب (001، 002، 003 ...)
supabase/functions/    Edge Functions
```

## متغيرات البيئة (Vercel ← Settings ← Environment Variables)
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

## التشغيل على جهازك (اختياري)
```
npm install
cp .env.example .env.local   # وحط القيم
npm run dev
```

## المراحل
1. ✅ الأساس: المكاتب، الحسابات والأدوار، الاشتراكات، Super Admin
2. ✅ التعيينات: لوحة، مناديب، رحلة المندوب، شركات الشحن، مستندات مضغوطة، نقل من الشيت القديم
3. ✅ المرتبات: رفع شيتات أي شركة شحن، الصرف، ربط المناديب، العُهد، المصروفات، التقرير النهائي، أداء المندوب شهر بشهر
4. ✅ الموظفين: الحضور والانصراف، سجل الحضور، العمولة على كل تعيين، مرتبات الموظفين والقسائم

التفاصيل المعمارية الكاملة في `CLAUDE.md`.
