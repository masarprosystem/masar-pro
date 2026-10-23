import { Outlet } from 'react-router-dom';
import { Building2, LayoutGrid, UserCog } from 'lucide-react';
import { useAuth } from '@/core/auth';
import { Shell } from './Shell';

export function AdminLayout() {
  const { memberships } = useAuth();
  return (
    <Shell
      top={<p className="mt-3 text-center text-xs font-extrabold text-gold-600">Super Admin</p>}
      groups={[
        { items: [{ to: '/admin', label: 'المكاتب والاشتراكات', icon: Building2, end: true }] },
        { items: [{ to: '/admin/profile', label: 'حسابي', icon: UserCog }] },
      ]}
      bottom={
        memberships.length > 0 && (
          <a href="/app" className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-200">
            <LayoutGrid className="h-4 w-4" /> الدخول على مكتبي
          </a>
        )
      }
    >
      <Outlet />
    </Shell>
  );
}
