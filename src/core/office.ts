import { useAuth } from './auth';
import { daysUntil } from './format';
import type { AppModule, OfficeRole } from './types';

export type Area = AppModule | 'team' | 'settings' | 'subscription';

// مين يشوف إيه (الصلاحيات الحقيقية متطبقة في قاعدة البيانات، ده للعرض بس)
const ACCESS: Record<Area, OfficeRole[]> = {
  recruitment: ['owner', 'accountant', 'operations', 'hr'],
  payroll: ['owner', 'accountant', 'operations'],
  staff: ['owner', 'accountant', 'operations', 'hr'],
  team: ['owner'],
  settings: ['owner'],
  subscription: ['owner', 'accountant'],
};

export function useOffice() {
  const { memberships, currentOfficeId } = useAuth();
  const membership = memberships.find((m) => m.office_id === currentOfficeId) || memberships[0] || null;
  const office = membership?.office || null;
  const subscription = office?.subscription || null;
  const role = membership?.role || null;
  const status = subscription?.status || null;
  const writable = status === 'trial' || status === 'active' || status === 'past_due';
  const daysLeft = subscription ? daysUntil(subscription.current_period_end) : 0;
  const graceLeft = subscription ? daysLeft + subscription.grace_days : 0;

  const can = (area: Area) => {
    if (!role) return false;
    if (!ACCESS[area].includes(role)) return false;
    if (area === 'recruitment' || area === 'payroll' || area === 'staff') {
      return Boolean(subscription?.modules?.includes(area));
    }
    return true;
  };

  return { membership, office, subscription, role, status, writable, daysLeft, graceLeft, can };
}
