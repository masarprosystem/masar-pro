import type { AppModule, OfficeRole, Seats, SubscriptionStatus } from './types';

export const money = (n: number | null | undefined) => Math.round(Number(n) || 0).toLocaleString('en-US');

// \u2066...\u2069 بيعزلوا التاريخ عن اتجاه الكلام العربي عشان ميتقلبش
const ltr = (s: string) => `\u2066${s}\u2069`;

/** نسبة زي 3 / 41 من غير ما تتقلب في النص العربي */
export const ratio = (a: number, b: number) => `\u2066${a} / ${b}\u2069`;

export const fmtDate = (d: string | null | undefined) => (d ? ltr(String(d).slice(0, 10)) : '—');

export const fmtDateTime = (d: string | null | undefined) =>
  d ? ltr(new Date(d).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'short', timeStyle: 'short' })) : '—';

export const todayStr = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const daysUntil = (d: string) => {
  const end = Date.parse(String(d).slice(0, 10) + 'T00:00:00Z');
  const today = Date.parse(todayStr() + 'T00:00:00Z');
  return Math.round((end - today) / 86_400_000);
};

export const ROLES: OfficeRole[] = ['owner', 'accountant', 'operations', 'hr'];
export const ROLE_LABEL: Record<OfficeRole, string> = {
  owner: 'صاحب المكتب',
  accountant: 'محاسب',
  operations: 'أوبريشن',
  hr: 'HR',
};

export const MODULES: AppModule[] = ['recruitment', 'payroll', 'staff'];
export const MODULE_LABEL: Record<AppModule, string> = {
  recruitment: 'التعيينات',
  payroll: 'المرتبات',
  staff: 'الموظفين',
};

export const STATUSES: SubscriptionStatus[] = ['trial', 'active', 'past_due', 'suspended', 'cancelled'];
export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: 'فترة تجريبية',
  active: 'نشط',
  past_due: 'متأخر في الدفع',
  suspended: 'موقوف',
  cancelled: 'ملغي',
};
export const STATUS_TONE: Record<SubscriptionStatus, Tone> = {
  trial: 'blue',
  active: 'green',
  past_due: 'amber',
  suspended: 'red',
  cancelled: 'slate',
};
export type Tone = 'blue' | 'green' | 'amber' | 'red' | 'slate' | 'gold';

export const PAYMENT_METHODS = ['إنستاباي', 'فودافون كاش', 'تحويل بنكي', 'كاش'];

export const seatLimit = (planSeats: Seats | undefined, extra: Seats | undefined, role: OfficeRole) =>
  (Number(planSeats?.[role]) || 0) + (Number(extra?.[role]) || 0);

export function generatePassword(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (v) => chars[v % chars.length]).join('');
}
