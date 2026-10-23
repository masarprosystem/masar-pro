import type { OfficeRole } from '@/core/types';

export interface StaffSettings {
  office_id: string;
  commission_rule: 'on_active' | 'active_days' | 'first_payroll';
  commission_days: number;
  default_commission: number;
  allowed_lates: number;
}

export interface StaffProfile {
  member_id: string;
  office_id: string;
  job_title: string | null;
  base_salary: number;
  commission_per_hire: number | null;
  hire_date: string | null;
  work_start: string;
  work_end: string;
  work_days: number[];
  late_grace_minutes: number;
  late_penalty: number;
  notes: string | null;
}

export type AttStatus = 'present' | 'absent' | 'leave' | 'holiday';
export interface Attendance {
  id: string;
  office_id: string;
  member_id: string;
  day: string;
  status: AttStatus;
  check_in: string | null;
  check_out: string | null;
  late_minutes: number;
  in_lat: number | null;
  in_lng: number | null;
  notes: string | null;
}

export interface Adjustment { id: string; member_id: string; month: string; kind: 'bonus' | 'deduction' | 'advance'; amount: number; reason: string; created_at: string }

export interface Payslip {
  id: string; member_id: string; month: string; base_salary: number; work_days: number; present_days: number; absent_days: number;
  leave_days: number; late_count: number; absence_deduction: number; late_deduction: number; commission_count: number;
  commission_amount: number; bonuses: number; deductions: number; advances: number; net: number; pay_method: string | null;
  paid_by: string | null; paid_at: string; notes: string | null;
}

export interface SummaryRow {
  member_id: string; full_name: string | null; email: string | null; role: OfficeRole; is_active: boolean; has_profile: boolean;
  base_salary: number; commission_rate: number; work_days: number; present_days: number; leave_days: number; absent_days: number;
  late_count: number; allowed_lates: number; commission_count: number; commission_amount: number; bonuses: number;
  deductions: number; advances: number; absence_deduction: number; late_deduction: number; net: number; payslip: Payslip | null;
}

export interface Commission { courier_id: string; member_id: string; courier_name: string; first_active: string; qualified_on: string }
export interface Holiday { id: string; office_id: string; day: string; name: string }

export const RULE_LABEL: Record<StaffSettings['commission_rule'], string> = {
  on_active: 'أول ما المندوب يبقى نشط',
  active_days: 'لما المندوب يكمل عدد أيام وهو نشط من غير ما يقع',
  first_payroll: 'لما المندوب يظهر في أول شيت مرتبات',
};
export const ADJ_LABEL: Record<Adjustment['kind'], string> = { bonus: 'مكافأة', deduction: 'خصم', advance: 'سلفة' };
export const ATT_LABEL: Record<AttStatus, string> = { present: 'حاضر', absent: 'غياب', leave: 'إجازة', holiday: 'إجازة رسمية' };
export const DOW = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
export const DOW_SHORT = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];

export const cairoToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
export const cairoTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }) : '—';
export const hoursBetween = (a: string | null, b: string | null) => {
  if (!a || !b) return null;
  const h = (Date.parse(b) - Date.parse(a)) / 3_600_000;
  return Math.round(h * 10) / 10;
};
export const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
};
export const dowOf = (day: string) => new Date(day + 'T12:00:00Z').getUTCDay();
