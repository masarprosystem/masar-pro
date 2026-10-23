import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useOffice } from '@/core/office';
import { useMembers } from '@/components/MembersManager';
import { monthLabel } from './model';

export function MonthBar({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const shift = (d: number) => {
    const [y, m] = month.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1 + d, 1));
    onChange(`${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`);
  };
  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-[#121d19]">
      <button type="button" onClick={() => shift(-1)} className="rounded-md p-1.5 hover:bg-slate-100 dark:hover:bg-white/5" aria-label="الشهر اللي فات"><ChevronRight className="h-4 w-4" /></button>
      <label className="relative cursor-pointer px-2 text-sm font-extrabold text-brand-700 dark:text-brand-200">
        مرتبات {monthLabel(month)}
        <input type="month" value={month} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="اختيار الشهر" />
      </label>
      <button type="button" onClick={() => shift(1)} className="rounded-md p-1.5 hover:bg-slate-100 dark:hover:bg-white/5" aria-label="الشهر الجاي"><ChevronLeft className="h-4 w-4" /></button>
    </div>
  );
}

/** الموظفين اللي بيصرفوا أو بيمسكوا عُهدة */
export function usePayers() {
  const { office } = useOffice();
  const { data: members } = useMembers(office?.id || '');
  return useMemo(() => {
    const payers = (members || []).filter((m) => m.role !== 'hr');
    const name = Object.fromEntries((members || []).map((m) => [m.id, m.full_name || m.email || '—']));
    return { payers, activePayers: payers.filter((m) => m.is_active), name };
  }, [members]);
}

export function usePayrollPerms() {
  const { role, writable } = useOffice();
  return {
    canImport: writable && (role === 'owner' || role === 'accountant'),
    canPay: writable && (role === 'owner' || role === 'accountant' || role === 'operations'),
    canUnpay: writable && (role === 'owner' || role === 'accountant'),
    canCustody: writable && (role === 'owner' || role === 'accountant'),
    canAddExpense: writable && role !== 'hr',
    canDeleteExpense: writable && (role === 'owner' || role === 'accountant'),
    canDeleteRun: writable && role === 'owner',
  };
}
