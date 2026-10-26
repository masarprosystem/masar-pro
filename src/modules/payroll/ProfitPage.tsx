import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { supabase } from '@/core/supabase';
import { useOffice } from '@/core/office';
import { errorMessage } from '@/core/errors';
import { money } from '@/core/format';
import { useToast } from '@/core/toast';
import { ExportButton } from '@/components/ExportButton';
import { Card, PageHeader, Spinner, Stat, Table } from '@/components/ui';
import { useCarriers } from '@/modules/recruitment/api';
import { BILLING_LABEL, useCarrierBilling, type CarrierBilling } from '@/modules/recruitment/CarriersPage';
import { useSummary } from '@/modules/staff/api';
import { useExpenses, useMonth, useMonthLines, useRuns, type MonthLine } from './api';
import { monthLabel } from './model';
import { MonthBar } from './shared';

interface RunRevenue { run_id: string; office_id: string; amount: number; notes: string | null }

/** عمولة المكتب على السطر */
export function lineCommission(l: MonthLine, b?: CarrierBilling) {
  if (!b || b.model === 'none') return 0;
  if (b.model === 'per_shipment') return Number(l.deliveries || 0) * Number(b.rate);
  if (b.model === 'per_courier') return Number(b.rate);
  return (Number(l.total_salary || 0) * Number(b.rate)) / 100;
}

/** المستحق من الشركة على السطر = المرتب (لو الشركة بتحوّله) + عمولة المكتب */
export function lineRevenue(l: MonthLine, b?: CarrierBilling) {
  if (!b) return 0;
  return (b.covers_salaries ? Number(l.total_salary || 0) : 0) + lineCommission(l, b);
}

export function ProfitPage() {
  const { office, role, writable, can } = useOffice();
  const toast = useToast();
  const qc = useQueryClient();
  const [month, setMonth] = useMonth();
  const { data: carriers } = useCarriers(office?.id);
  const { data: billing } = useCarrierBilling(office?.id);
  const { data: runs } = useRuns(office?.id, month);
  const { data: lines, isLoading } = useMonthLines(office?.id, month);
  const { data: expenses } = useExpenses(office?.id, month);
  const staffOn = can('staff') && (role === 'owner' || role === 'accountant');
  const staffQ = useSummary(staffOn ? office?.id : undefined, month);
  const runIds = (runs || []).map((r) => r.id);
  const { data: overrides } = useQuery({
    queryKey: ['run-revenue', office?.id, month, runIds.join(',')],
    enabled: runIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('run_revenue').select('*').in('run_id', runIds);
      if (error) throw error;
      return data as RunRevenue[];
    },
  });

  const byCarrier = useMemo(() => {
    return (runs || []).map((r) => {
      const ls = (lines || []).filter((l) => l.run_id === r.id);
      const b = billing?.find((x) => x.carrier_id === r.carrier_id);
      const calc = ls.reduce((s, l) => s + lineRevenue(l, b), 0);
      const ov = overrides?.find((o) => o.run_id === r.id);
      const revenue = ov ? Number(ov.amount) : calc;
      const salaries = ls.reduce((s, l) => s + Number(l.total_salary || 0), 0);
      return {
        run: r, name: carriers?.find((k) => k.id === r.carrier_id)?.name || '—', billing: b, calc, override: ov, revenue, salaries,
        couriers: ls.length, deliveries: ls.reduce((s, l) => s + Number(l.deliveries || 0), 0), margin: revenue - salaries,
      };
    });
  }, [runs, lines, billing, overrides, carriers]);

  const byHub = useMemo(() => {
    const m: Record<string, { hub: string; revenue: number; salaries: number; couriers: number }> = {};
    for (const l of lines || []) {
      const run = runs?.find((r) => r.id === l.run_id);
      const b = billing?.find((x) => x.carrier_id === run?.carrier_id);
      const row = byCarrier.find((x) => x.run.id === l.run_id);
      // لو فيه إيراد فعلي للشهر، بيتوزع على الهبات بنسبة الإيراد المحسوب (أو المرتبات لو مفيش تسعير)
      let rev = lineRevenue(l, b);
      if (row?.override) {
        const base = row.calc > 0 ? lineRevenue(l, b) / row.calc : row.salaries > 0 ? Number(l.total_salary || 0) / row.salaries : 0;
        rev = Number(row.override.amount) * base;
      }
      const hub = l.hub || 'من غير هب';
      m[hub] ||= { hub, revenue: 0, salaries: 0, couriers: 0 };
      m[hub].revenue += rev;
      m[hub].salaries += Number(l.total_salary || 0);
      m[hub].couriers += 1;
    }
    return Object.values(m).sort((a, b) => b.revenue - b.salaries - (a.revenue - a.salaries));
  }, [lines, runs, billing, byCarrier]);

  const revenue = byCarrier.reduce((s, x) => s + x.revenue, 0);
  const salaries = byCarrier.reduce((s, x) => s + x.salaries, 0);
  const exp = (expenses || []).reduce((s, e) => s + Number(e.amount), 0);
  const staffCost = staffOn ? (staffQ.data || []).reduce((s, r) => s + Number(r.payslip ? r.payslip.net : r.net), 0) : 0;
  const profit = revenue - salaries - exp - staffCost;
  const noBilling = byCarrier.filter((x) => !x.override && !x.billing);

  const saveOverride = useMutation({
    mutationFn: async ({ runId, amount }: { runId: string; amount: string }) => {
      if (amount.trim() === '') {
        const { error } = await supabase.from('run_revenue').delete().eq('run_id', runId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('run_revenue').upsert({ run_id: runId, office_id: office!.id, amount: Number(amount), updated_at: new Date().toISOString() });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['run-revenue'] }); toast('اتحفظ.', 'success'); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const [edit, setEdit] = useState<Record<string, string>>({});
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

  return (
    <div className="space-y-6">
      <PageHeader
        title="ربحية المكتب"
        subtitle="الربح = المستحق من شركات الشحن − مرتبات المناديب − المصروفات − مرتبات الموظفين"
        actions={<>
          <MonthBar month={month} onChange={setMonth} prefix="ربحية" />
          <ExportButton fileName={`ربحية-${month}`} rows={byCarrier} cols={[
            { header: 'الشركة', value: (x) => x.name }, { header: 'المناديب', value: (x) => x.couriers }, { header: 'الشحنات', value: (x) => x.deliveries },
            { header: 'المستحق من الشركة', value: (x) => Math.round(x.revenue) }, { header: 'مرتبات المناديب', value: (x) => Math.round(x.salaries) },
            { header: 'ربح المكتب', value: (x) => Math.round(x.margin) },
          ]} />
        </>}
      />

      {noBilling.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-gold-200 bg-gold-50 p-3 text-sm text-gold-800 dark:border-gold-700/40 dark:bg-gold-700/10 dark:text-gold-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{noBilling.map((x) => x.name).join('، ')}: مفيش حساب متسجل مع الشركة، فالمستحق محسوب صفر. سجّله من <Link to="/app/recruitment/carriers" className="font-bold underline">شركات الشحن</Link>، أو اكتب المبلغ الفعلي في الجدول تحت.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="المستحق من الشركات" value={money(revenue)} />
        <Stat label="مرتبات المناديب" value={<span className="text-red-600">{money(salaries)}</span>} />
        <Stat label="المصروفات" value={<span className="text-red-600">{money(exp)}</span>} />
        <Stat label="مرتبات الموظفين" value={<span className="text-red-600">{staffOn ? money(staffCost) : '—'}</span>} sub={staffOn ? undefined : 'قسم الموظفين مش مفعّل'} />
        <Stat tone="brand" label={`صافي ربح ${monthLabel(month)}`} value={money(profit)} sub={revenue > 0 ? `${pct(profit, revenue)} من المستحق` : undefined} />
      </div>

      <Card title="حسب الشركة" className="overflow-hidden [&>div:last-child]:p-0">
        {isLoading ? <Spinner /> : (
          <Table head={['الشركة', 'المناديب', 'الشحنات', 'الحساب مع الشركة', 'المستحق من الشركة', 'مرتبات المناديب', 'ربح المكتب', '']} empty={!byCarrier.length && <p className="p-8 text-center text-sm text-slate-500">مفيش شيتات مرتبات مرفوعة الشهر ده.</p>}>
            {byCarrier.map((x) => (
              <tr key={x.run.id}>
                <td className="px-4 py-3 font-bold">{x.name}</td>
                <td className="tabular px-4 py-3">{x.couriers}</td>
                <td className="tabular px-4 py-3">{money(x.deliveries)}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{x.billing ? <>{x.billing.covers_salaries ? 'المرتبات + ' : ''}{x.billing.model !== 'none' ? `${BILLING_LABEL[x.billing.model]}: ${Number(x.billing.rate).toLocaleString('en-US')}${x.billing.model === 'percent' ? '%' : ''}` : 'من غير عمولة'}</> : '—'}</td>
                <td className="px-4 py-3">
                  {writable ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number" min="0" dir="ltr" className="field !w-32 !py-1.5 tabular"
                        value={edit[x.run.id] ?? (x.override ? String(x.override.amount) : '')}
                        placeholder={money(Math.round(x.calc))}
                        onChange={(e) => setEdit({ ...edit, [x.run.id]: e.target.value })}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v !== (x.override ? String(x.override.amount) : '')) saveOverride.mutate({ runId: x.run.id, amount: v });
                        }}
                        aria-label={`المستحق من ${x.name}`}
                      />
                      {x.override && <span className="text-[10px] font-bold text-gold-600">فعلي</span>}
                    </div>
                  ) : <span className="tabular">{money(x.revenue)}</span>}
                </td>
                <td className="tabular px-4 py-3 text-red-600">{money(x.salaries)}</td>
                <td className={`tabular px-4 py-3 font-extrabold ${x.margin >= 0 ? 'text-brand-600' : 'text-red-600'}`}>{money(x.margin)}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{pct(x.margin, x.revenue)}</td>
              </tr>
            ))}
          </Table>
        )}
        <p className="px-4 py-3 text-[11px] text-slate-500">المستحق = المرتبات اللي الشركة بتحوّلها + عمولة المكتب. سيب الخانة فاضية والسيستم يحسبها، أو اكتب إجمالي المبلغ اللي الشركة حوّلته فعلاً الشهر ده.</p>
      </Card>

      <Card title="حسب الهب" className="overflow-hidden [&>div:last-child]:p-0">
        <Table head={['الهب', 'المناديب', 'المستحق', 'المرتبات', 'ربح المكتب']}>
          {byHub.map((h) => (
            <tr key={h.hub}>
              <td className="px-4 py-3 font-bold">{h.hub}</td>
              <td className="tabular px-4 py-3">{h.couriers}</td>
              <td className="tabular px-4 py-3">{money(Math.round(h.revenue))}</td>
              <td className="tabular px-4 py-3 text-red-600">{money(h.salaries)}</td>
              <td className={`tabular px-4 py-3 font-extrabold ${h.revenue - h.salaries >= 0 ? 'text-brand-600' : 'text-red-600'}`}>{money(Math.round(h.revenue - h.salaries))}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
