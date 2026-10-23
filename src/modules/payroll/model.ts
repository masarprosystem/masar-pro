import { normHeader } from '@/core/sheets';

export interface PayrollRun {
  id: string;
  office_id: string;
  carrier_id: string;
  month: string;
  source_file_name: string | null;
  imported_at: string;
  notes: string | null;
}

export interface PayrollLine {
  id: string;
  office_id: string;
  run_id: string;
  line_key: string;
  star_id: string | null;
  carrier_name: string;
  courier_id: string | null;
  hub: string | null;
  zone: string | null;
  vehicle: string | null;
  work_days: number;
  deliveries: number;
  rto: number;
  pickups: number;
  total_fixed: number;
  total_variable: number;
  total_deductions: number;
  total_bonus: number;
  total_salary: number;
  advances_sheet: number;
  deficit: number;
  lost: number;
  details: Record<string, number>;
  advances: number | null;
  net_due: number;
  paid: boolean;
  paid_amount: number | null;
  pay_method: string | null;
  paid_by: string | null;
  paid_at: string | null;
  pay_notes: string | null;
  pay_recorded_at: string | null;
}

export interface Custody { id: string; office_id: string; month: string; member_id: string; amount: number; notes: string | null }
export interface Expense {
  id: string; office_id: string; month: string; spent_at: string; description: string; category: string;
  amount: number; paid_by: string | null; notes: string | null; created_at: string;
}

/** حقول شيت المرتبات وأسماء الأعمدة المحتملة (بوسطة أولاً) */
export const PAY_FIELDS = {
  carrier_name: ['Star Name', 'Courier Name', 'Driver Name', 'Name', 'اسم المندوب', 'الاسم'],
  star_id: ['Star Id', 'Star ID', 'StarId', 'Courier Id', 'كود المندوب'],
  hub: ['Hub', 'الهب', 'الفرع'],
  zone: ['Zone', 'الزون'],
  vehicle: ['Vehicle Type', 'Vehicle', 'نوع المركبة'],
  work_days: ['#Working', 'Working Days', 'Working', 'أيام العمل'],
  deliveries: ['#Deliveries', 'Deliveries', 'التوصيلات', 'عدد الشحنات'],
  rto: ['#RTO Stops', 'RTO Stops', 'RTO'],
  pickups: ['#Pickup Stops', 'Pickup Stops', 'Pickups'],
  total_fixed: ['Total Fixed', 'الثابت'],
  total_variable: ['Total Variable', 'المتغير'],
  total_deductions: ['Total Deductions', 'إجمالي الخصومات', 'الخصومات'],
  total_bonus: ['Total Bonus', 'البونص', 'الحوافز'],
  total_salary: ['Total Salary', 'إجمالي المرتب', 'المرتب', 'Salary'],
  advances_sheet: ['السلف', 'Advances'],
  deficit: ['العجز', 'Deficit', 'Shortage'],
  lost: ['الشحنات اللوست', 'اللوست', 'Lost Shipments', 'Lost'],
  // تفاصيل إضافية بتتحفظ للعرض في ملف المندوب
  pkg_var: ['Total Package Variable'],
  pickups_var: ['Total Pickups Variable'],
  fake_exc: ['Fake Exceptions Deductions'],
  ops_ded: ['Ops Deductions'],
  fleet_ded: ['Fleet Deductions'],
  ops_bonus: ['Ops Bonus'],
  fleet_bonus: ['Fleet Bonus'],
} as const;
export type PayField = keyof typeof PAY_FIELDS;

export const PAY_FIELD_LABEL: Record<PayField, string> = {
  carrier_name: 'اسم المندوب', star_id: 'كود المندوب (Star Id)', hub: 'الهب', zone: 'الزون', vehicle: 'المركبة',
  work_days: 'أيام العمل', deliveries: 'التوصيلات', rto: 'المرتجعات RTO', pickups: 'البيك أب',
  total_fixed: 'الثابت', total_variable: 'المتغير', total_deductions: 'الخصومات', total_bonus: 'البونص',
  total_salary: 'إجمالي المرتب', advances_sheet: 'السلف', deficit: 'العجز', lost: 'الشحنات اللوست',
  pkg_var: 'متغير الشحنات', pickups_var: 'متغير البيك أب', fake_exc: 'خصم Fake Exceptions', ops_ded: 'خصم الأوبريشن',
  fleet_ded: 'خصم الفليت', ops_bonus: 'بونص الأوبريشن', fleet_bonus: 'بونص الفليت',
};
export const MAIN_FIELDS: PayField[] = ['carrier_name', 'star_id', 'hub', 'zone', 'vehicle', 'work_days', 'deliveries', 'rto', 'pickups', 'total_fixed', 'total_variable', 'total_deductions', 'total_bonus', 'total_salary', 'advances_sheet', 'deficit', 'lost'];
export const DETAIL_FIELDS: PayField[] = ['pkg_var', 'pickups_var', 'fake_exc', 'ops_ded', 'fleet_ded', 'ops_bonus', 'fleet_bonus'];
export const REQUIRED_FIELDS: PayField[] = ['carrier_name', 'total_salary'];

export const PAY_METHODS = ['إنستاباي', 'فودافون كاش', 'تحويل بنكي', 'كاش'];
export const EXPENSE_CATEGORIES = ['إعلانات', 'أدوات', 'صيانة', 'انترنت واتصالات', 'إيجار ومرافق', 'رواتب موظفين', 'مواصلات', 'أخرى'];

/** اسم المندوب من غير كود الهب في الأول ولا -C في الآخر، عشان يفضل ثابت لو نقل هب */
export function cleanCarrierName(n: string) {
  return String(n || '').replace(/"/g, '').replace(/\s+/g, ' ').replace(/\s*-\s*B?C\s*$/i, '').trim();
}
export function lineKey(starId: string, name: string) {
  const sid = String(starId || '').trim();
  if (sid) return 'S:' + sid;
  return 'N:' + normHeader(cleanCarrierName(name).replace(/^[A-Z]{1,5}-/, ''));
}

export const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
export const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  const names = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  return `${names[mo - 1]} ${y}`;
};
export const hasShort = (l: Pick<PayrollLine, 'deficit' | 'lost'>) => l.deficit > 0 || l.lost > 0;
export const lineNet = (l: PayrollLine) => (l.paid ? Number(l.paid_amount) : Number(l.net_due));
export const lineAdvances = (l: PayrollLine) => (l.advances ?? l.advances_sheet);
