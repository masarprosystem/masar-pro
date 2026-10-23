import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/core/supabase';
import type { Adjustment, Attendance, Commission, Holiday, Payslip, StaffProfile, StaffSettings, SummaryRow } from './model';

const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return [`${month}-01`, new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)] as const;
};

export function useStaffSettings(officeId?: string) {
  return useQuery({
    queryKey: ['staff-settings', officeId],
    enabled: Boolean(officeId),
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_settings').select('*').eq('office_id', officeId!).maybeSingle();
      if (error) throw error;
      const fallback: StaffSettings = { office_id: officeId!, commission_rule: 'active_days', commission_days: 15, default_commission: 0, allowed_lates: 3 };
      return (data as StaffSettings | null) || fallback;
    },
  });
}

export function useProfiles(officeId?: string) {
  return useQuery({
    queryKey: ['staff-profiles', officeId],
    enabled: Boolean(officeId),
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_profiles').select('*').eq('office_id', officeId!);
      if (error) throw error;
      return data as StaffProfile[];
    },
  });
}

export function useAttendance(officeId: string | undefined, month: string, memberId?: string) {
  return useQuery({
    queryKey: ['attendance', officeId, month, memberId || 'all'],
    enabled: Boolean(officeId),
    queryFn: async () => {
      const [from, to] = monthRange(month);
      let q = supabase.from('attendance').select('*').eq('office_id', officeId!).gte('day', from).lte('day', to);
      if (memberId) q = q.eq('member_id', memberId);
      const { data, error } = await q.order('day').limit(5000);
      if (error) throw error;
      return data as Attendance[];
    },
  });
}

export function useTodayAttendance(officeId: string | undefined, day: string) {
  return useQuery({
    queryKey: ['attendance-today', officeId, day],
    enabled: Boolean(officeId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('attendance').select('*').eq('office_id', officeId!).eq('day', day);
      if (error) throw error;
      return data as Attendance[];
    },
  });
}

export function useSummary(officeId: string | undefined, month: string) {
  return useQuery({
    queryKey: ['staff-summary', officeId, month],
    enabled: Boolean(officeId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('staff_month_summary', { p_office: officeId, p_month: month });
      if (error) throw error;
      return data as SummaryRow[];
    },
  });
}

export function useAdjustments(officeId: string | undefined, month: string, memberId?: string) {
  return useQuery({
    queryKey: ['staff-adjustments', officeId, month, memberId || 'all'],
    enabled: Boolean(officeId),
    queryFn: async () => {
      let q = supabase.from('staff_adjustments').select('*').eq('office_id', officeId!).eq('month', month);
      if (memberId) q = q.eq('member_id', memberId);
      const { data, error } = await q.order('created_at');
      if (error) throw error;
      return data as Adjustment[];
    },
  });
}

export function useCommissions(officeId: string | undefined, month: string, memberId?: string) {
  return useQuery({
    queryKey: ['staff-commissions', officeId, month, memberId || 'all'],
    enabled: Boolean(officeId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('staff_commissions', { p_office: officeId, p_month: month, p_member: memberId || null });
      if (error) throw error;
      return data as Commission[];
    },
  });
}

export function usePayslips(officeId: string | undefined, memberId?: string) {
  return useQuery({
    queryKey: ['staff-payslips', officeId, memberId],
    enabled: Boolean(officeId && memberId),
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_payslips').select('*').eq('member_id', memberId!).order('month', { ascending: false });
      if (error) throw error;
      return data as Payslip[];
    },
  });
}

export function useHolidays(officeId?: string) {
  return useQuery({
    queryKey: ['holidays', officeId],
    enabled: Boolean(officeId),
    queryFn: async () => {
      const { data, error } = await supabase.from('office_holidays').select('*').eq('office_id', officeId!).order('day', { ascending: false }).limit(200);
      if (error) throw error;
      return data as Holiday[];
    },
  });
}
