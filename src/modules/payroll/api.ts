import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/core/supabase';
import { fetchAll } from '@/core/sheets';
import { thisMonth, type Custody, type Expense, type PayrollLine, type PayrollRun } from './model';

const MONTH_KEY = 'masar.payMonth';

/** الشهر المختار: من الرابط، أو آخر شهر اتفتح، أو الشهر الحالي */
export function useMonth(): [string, (m: string) => void] {
  const [params, setParams] = useSearchParams();
  const month = params.get('m') || localStorage.getItem(MONTH_KEY) || thisMonth();
  const set = (m: string) => {
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    localStorage.setItem(MONTH_KEY, m);
    const next = new URLSearchParams(params);
    next.set('m', m);
    setParams(next, { replace: true });
  };
  return [month, set];
}

export function useRuns(officeId: string | undefined, month: string) {
  return useQuery({
    queryKey: ['payroll-runs', officeId, month],
    enabled: Boolean(officeId),
    queryFn: async () => {
      const { data, error } = await supabase.from('payroll_runs').select('*').eq('office_id', officeId!).eq('month', month).order('imported_at');
      if (error) throw error;
      return data as PayrollRun[];
    },
  });
}

export function useRun(id?: string) {
  return useQuery({
    queryKey: ['payroll-run', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('payroll_runs').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as PayrollRun;
    },
  });
}

export function useRunLines(runId?: string) {
  return useQuery({
    queryKey: ['payroll-lines', runId],
    enabled: Boolean(runId),
    queryFn: () =>
      fetchAll<PayrollLine>((from, to) => supabase.from('payroll_lines').select('*').eq('run_id', runId!).order('carrier_name').range(from, to)),
  });
}

export type MonthLine = PayrollLine & { run: { month: string; carrier_id: string } };

export function useMonthLines(officeId: string | undefined, month: string) {
  return useQuery({
    queryKey: ['payroll-month-lines', officeId, month],
    enabled: Boolean(officeId),
    queryFn: () =>
      fetchAll<MonthLine>((from, to) =>
        supabase
          .from('payroll_lines')
          .select('*, run:payroll_runs!inner(month, carrier_id)')
          .eq('office_id', officeId!)
          .eq('run.month', month)
          .order('carrier_name')
          .range(from, to),
      ),
  });
}

export function useCustody(officeId: string | undefined, month: string) {
  return useQuery({
    queryKey: ['custody', officeId, month],
    enabled: Boolean(officeId),
    queryFn: async () => {
      const { data, error } = await supabase.from('custody').select('*').eq('office_id', officeId!).eq('month', month);
      if (error) throw error;
      return data as Custody[];
    },
  });
}

export function useExpenses(officeId: string | undefined, month: string) {
  return useQuery({
    queryKey: ['expenses', officeId, month],
    enabled: Boolean(officeId),
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select('*').eq('office_id', officeId!).eq('month', month).order('spent_at', { ascending: false });
      if (error) throw error;
      return data as Expense[];
    },
  });
}

export type CourierPayrollRow = Pick<PayrollLine, 'id' | 'work_days' | 'deliveries' | 'total_salary' | 'net_due' | 'paid' | 'paid_amount' | 'deficit' | 'lost' | 'hub'> & {
  run: { month: string; carrier_id: string };
};

export function useCourierPayroll(courierId?: string, enabled = true) {
  return useQuery({
    queryKey: ['courier-payroll', courierId],
    enabled: Boolean(courierId) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_lines')
        .select('id, work_days, deliveries, total_salary, net_due, paid, paid_amount, deficit, lost, hub, run:payroll_runs!inner(month, carrier_id)')
        .eq('courier_id', courierId!);
      if (error) throw error;
      return ((data || []) as unknown as CourierPayrollRow[]).sort((a, b) => a.run.month.localeCompare(b.run.month));
    },
  });
}

export async function searchCouriers(officeId: string, q: string) {
  const term = q.replace(/[,()*%\\]/g, ' ').trim();
  if (term.length < 2) return [];
  const digits = term.replace(/\D/g, '');
  let query = supabase.from('couriers').select('id, full_name, primary_phone, stage, current_hub').eq('office_id', officeId);
  query = digits.length >= 4 ? query.or(`primary_phone.ilike.%${digits}%,national_id.ilike.%${digits}%`) : query.ilike('full_name', `%${term}%`);
  const { data, error } = await query.limit(8);
  if (error) throw error;
  return data as { id: string; full_name: string; primary_phone: string; stage: string; current_hub: string | null }[];
}
