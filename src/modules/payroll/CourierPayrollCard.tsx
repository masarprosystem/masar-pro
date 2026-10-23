import { TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useOffice } from '@/core/office';
import { money } from '@/core/format';
import { Card, Empty, Spinner } from '@/components/ui';
import { useCarriers } from '@/modules/recruitment/api';
import { useCourierPayroll } from './api';
import { monthLabel } from './model';

/** مرتبات المندوب شهر بشهر وتطور أداؤه (بيظهر لصاحب المكتب والمحاسب والأوبريشن) */
export function CourierPayrollCard({ courierId }: { courierId: string }) {
  const { office, can } = useOffice();
  const allowed = can('payroll');
  const { data, isLoading } = useCourierPayroll(courierId, allowed);
  const { data: carriers } = useCarriers(office?.id);
  if (!allowed) return null;

  // نجمع الشهر الواحد لو المندوب كان في أكتر من شركة
  const months = Object.values(
    (data || []).reduce<Record<string, { month: string; deliveries: number; days: number; salary: number; net: number; paid: boolean; carriers: Set<string> }>>((a, r) => {
      const m = r.run.month;
      a[m] = a[m] || { month: m, deliveries: 0, days: 0, salary: 0, net: 0, paid: true, carriers: new Set() };
      a[m].deliveries += Number(r.deliveries);
      a[m].days += Number(r.work_days);
      a[m].salary += Number(r.total_salary);
      a[m].net += r.paid ? Number(r.paid_amount) : Number(r.net_due);
      a[m].paid = a[m].paid && r.paid;
      a[m].carriers.add(carriers?.find((c) => c.id === r.run.carrier_id)?.name || '');
      return a;
    }, {}),
  ).sort((a, b) => a.month.localeCompare(b.month));

  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const last3 = avg(months.slice(-3).map((m) => m.deliveries));
  const prev3 = avg(months.slice(-6, -3).map((m) => m.deliveries));
  const change = prev3 ? Math.round(((last3 - prev3) / prev3) * 100) : null;
  const max = Math.max(1, ...months.map((m) => m.deliveries));

  return (
    <Card title="المرتبات والأداء">
      {isLoading ? <Spinner /> : !months.length ? (
        <Empty icon={<Wallet className="h-8 w-8" />} title="لسه مالوش مرتبات مربوطة. اربطه من صفحة صرف المرتبات." />
      ) : (
        <div className="space-y-4">
          {change !== null && (
            <p className={`flex items-center gap-2 rounded-lg p-2.5 text-xs font-bold ${change <= -20 ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' : change >= 10 ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200' : 'bg-slate-50 text-slate-600 dark:bg-white/5 dark:text-slate-300'}`}>
              {change < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
              التوصيلات في آخر 3 شهور {change >= 0 ? 'زادت' : 'قلّت'} {Math.abs(change)}% عن الـ 3 اللي قبلهم
            </p>
          )}
          <div className="flex h-24 items-end gap-1.5" aria-label="التوصيلات شهر بشهر">
            {months.slice(-12).map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1" title={`${monthLabel(m.month)}: ${m.deliveries} توصيلة`}>
                <div className="w-full rounded-t bg-brand-500" style={{ height: `${Math.max(4, (m.deliveries / max) * 80)}px` }} />
                <span className="text-[9px] text-slate-400">{m.month.slice(5)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1.5 text-xs">
            {[...months].reverse().map((m) => (
              <div key={m.month} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5 last:border-0 dark:border-slate-800">
                <div><p className="font-bold">{monthLabel(m.month)}</p><p className="text-slate-500">{[...m.carriers].filter(Boolean).join('، ')} · {m.deliveries} توصيلة · {m.days} يوم</p></div>
                <div className="text-left"><p className="tabular font-extrabold">{money(m.net)}</p><p className={m.paid ? 'text-brand-600' : 'text-amber-600'}>{m.paid ? 'اتصرف' : 'لسه'}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
