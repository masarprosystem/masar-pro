import { Outlet } from 'react-router-dom';
import {
  Building2, CreditCard, FileUp, Home, LayoutDashboard, ShieldCheck, Truck, UserCog, UserSearch, Users, Wallet, Briefcase,
} from 'lucide-react';
import { useAuth } from '@/core/auth';
import { useOffice } from '@/core/office';
import { STATUS_LABEL } from '@/core/format';
import { Shell, type NavGroup } from './Shell';

export function AppLayout() {
  const { memberships, currentOfficeId, setCurrentOfficeId, isPlatformAdmin } = useAuth();
  const { office, status, daysLeft, graceLeft, can, role } = useOffice();

  const groups: NavGroup[] = [
    { items: [{ to: '/app', label: 'الرئيسية', icon: Home, end: true }] },
  ];
  if (can('recruitment'))
    groups.push({
      title: 'التعيينات',
      items: [
        { to: '/app/recruitment', label: 'لوحة التعيينات', icon: LayoutDashboard, end: true },
        { to: '/app/recruitment/couriers', label: 'المناديب', icon: UserSearch },
        { to: '/app/recruitment/carriers', label: 'شركات الشحن', icon: Truck },
        ...(role === 'owner' || role === 'operations' ? [{ to: '/app/recruitment/import', label: 'نقل من شيت قديم', icon: FileUp }] : []),
      ],
    });
  if (can('payroll')) groups.push({ title: 'المرتبات', items: [{ to: '/app/payroll', label: 'صرف المرتبات', icon: Wallet }] });
  if (can('staff')) groups.push({ title: 'الموظفين', items: [{ to: '/app/staff', label: 'الموظفين والحضور', icon: Briefcase }] });
  const officeItems = [
    can('team') && { to: '/app/team', label: 'الفريق والحسابات', icon: Users },
    can('subscription') && { to: '/app/subscription', label: 'الاشتراك', icon: CreditCard },
    can('settings') && { to: '/app/settings', label: 'بيانات المكتب', icon: Building2 },
  ].filter(Boolean) as NavGroup['items'];
  if (officeItems.length) groups.push({ title: 'المكتب', items: officeItems });
  groups.push({ items: [{ to: '/app/profile', label: 'حسابي', icon: UserCog }] });

  const banner =
    status === 'trial' && daysLeft <= 7 ? (
      <Bar tone="blue">فترة تجريبية — فاضل {Math.max(daysLeft, 0)} يوم. كلم فريق Masar Pro عشان تفعّل الاشتراك.</Bar>
    ) : status === 'active' && daysLeft <= 5 && role === 'owner' ? (
      <Bar tone="blue">الاشتراك هيتجدد خلال {Math.max(daysLeft, 0)} يوم.</Bar>
    ) : status === 'past_due' ? (
      <Bar tone="amber">الاشتراك انتهى. فاضل {Math.max(graceLeft, 0)} يوم قبل ما الحساب يتحول لقراءة فقط.</Bar>
    ) : status === 'suspended' || status === 'cancelled' ? (
      <Bar tone="red">الاشتراك {STATUS_LABEL[status]} — تقدر تشوف بياناتك بس مش هتقدر تضيف أو تعدّل. كلم فريق Masar Pro.</Bar>
    ) : null;

  return (
    <Shell
      groups={groups}
      banner={banner}
      top={
        memberships.length > 1 ? (
          <select className="field mt-3 text-xs font-bold" value={currentOfficeId || ''} onChange={(e) => setCurrentOfficeId(e.target.value)} aria-label="المكتب">
            {memberships.map((m) => (
              <option key={m.office_id} value={m.office_id}>{m.office.name}</option>
            ))}
          </select>
        ) : (
          <p className="mt-3 text-center text-sm font-extrabold text-brand-700 dark:text-brand-200">{office?.name}</p>
        )
      }
      bottom={
        isPlatformAdmin && (
          <a href="/admin" className="flex items-center gap-2 rounded-lg bg-gold-50 px-3 py-2 text-xs font-bold text-gold-700 hover:bg-gold-100 dark:bg-gold-700/20 dark:text-gold-300">
            <ShieldCheck className="h-4 w-4" /> لوحة Super Admin
          </a>
        )
      }
    >
      <Outlet />
    </Shell>
  );
}

function Bar({ tone, children }: { tone: 'blue' | 'amber' | 'red'; children: React.ReactNode }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-900',
    amber: 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900',
    red: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900',
  };
  return <div role="status" className={`border-b px-4 py-2.5 text-center text-sm font-bold md:px-8 ${tones[tone]}`}>{children}</div>;
}
