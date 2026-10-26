import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { useOffice } from '@/core/office';
import { fmtDate, money } from '@/core/format';
import { Card, Empty, PageHeader, Spinner, Stat, Table, Button } from '@/components/ui';
import { ExportButton } from '@/components/ExportButton';
import { useCarriers } from '@/modules/recruitment/api';
import { useMonth } from './api';
import { cleanCarrierName, hasShort, lineAdvances, lineNet, monthLabel } from './model';
import { MonthBar, usePayers } from './shared';
import { useStaffBalances } from './MoneyPages';

export function ReportPage() {
  const { office } = useOffice();
  const [month, setMonth] = useMonth();
  const { name: payerName, payers } = usePayers();
  const { data: carriers } = useCarriers(office?.id);
  const { rows: staff, lines, expenses, isLoading } = useStaffBalances(month);
  const carrierName = useMemo(() => Object.fromEntries((carriers || []).map((c) => [c.id, c.name])), [carriers]);
  const [flt, setFlt] = useState({ carrier: '', status: '', short: '', method: '', by: '' });

  const paid = lines.filter((l) => l.paid);
  const paidSum = paid.reduce((s, l) => s + Number(l.paid_amount), 0);
  const custody = staff.reduce((s, r) => s + r.custody, 0);
  const exp = expenses.reduce((s, x) => s + Number(x.amount), 0);
  const group = <K extends string>(items: typeof lines, key: (l: (typeof lines)[number]) => K) =>
    Object.entries(items.reduce<Record<string, { n: number; salary: number; net: number; paid: number }>>((a, l) => {
      const k = key(l) || '—';
      a[k] = a[k] || { n: 0, salary: 0, net: 0, paid: 0 };
      a[k].n++;
      a[k].salary += Number(l.total_salary);
      a[k].net += lineNet(l);
      a[k].paid += l.paid ? Number(l.paid_amount) : 0;
      return a;
    }, {})).sort((a, b) => b[1].net - a[1].net);

  const filtered = lines.filter((l) =>
    (!flt.carrier || l.run.carrier_id === flt.carrier) &&
    (!flt.status || (flt.status === 'paid' ? l.paid : !l.paid)) &&
    (!flt.short || (flt.short === 'yes' ? hasShort(l) : !hasShort(l))) &&
    (!flt.method || l.pay_method === flt.method) &&
    (!flt.by || l.paid_by === flt.by));


  const methods = group(paid, (l) => l.pay_method || '—');
  const byCarrier = group(lines, (l) => carrierName[l.run.carrier_id] || '—');
  const byHub = group(lines, (l) => l.hub || '—').slice(0, 10);
  const byCat = Object.entries(expenses.reduce<Record<string, number>>((a, x) => ({ ...a, [x.category]: (a[x.category] || 0) + Number(x.amount) }), {}));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`التقرير النهائي — ${monthLabel(month)}`}
        actions={<div className="flex flex-wrap gap-2 print:hidden"><MonthBar month={month} onChange={setMonth} /><ExportButton fileName={`مرتبات-${month}`} rows={filtered} cols={[
            { header: 'المندوب', value: (l) => cleanCarrierName(l.carrier_name) }, { header: 'الشركة', value: (l) => carrierName[l.run.carrier_id] }, { header: 'الهب', value: (l) => l.hub },
            { header: 'التوصيلات', value: (l) => l.deliveries }, { header: 'إجمالي المرتب', value: (l) => Number(l.total_salary) }, { header: 'السلف', value: (l) => Number(lineAdvances(l) || 0) },
            { header: 'العجز', value: (l) => Number(l.deficit) }, { header: 'اللوست', value: (l) => Number(l.lost) }, { header: 'الصافي', value: (l) => lineNet(l) },
            { header: 'الحالة', value: (l) => (l.paid ? 'تم الصرف' : 'لسه') }, { header: 'طريقة التحويل', value: (l) => l.pay_method },
            { header: 'المحوّل', value: (l) => (l.paid_by ? payerName[l.paid_by] : '') }, { header: 'تاريخ الصرف', value: (l) => l.paid_at },
          ]} /><Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة / PDF</Button></div>}
      />
      {isLoading ? <Spinner /> : !lines.length ? <div className="card"><Empty title={`مفيش مرتبات مرفوعة لشهر ${monthLabel(month)}`} /></div> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat tone="brand" label="إجمالي المرتبات" value={money(lines.reduce((s, l) => s + Number(l.total_salary), 0))} sub={`${lines.length} مندوب`} />
            <Stat label="السلف" value={money(lines.reduce((s, l) => s + Number(lineAdvances(l)), 0))} />
            <Stat label="العجز" value={<span className="text-red-600">{money(lines.reduce((s, l) => s + Number(l.deficit), 0))}</span>} />
            <Stat label="اللوست" value={<span className="text-red-600">{money(lines.reduce((s, l) => s + Number(l.lost), 0))}</span>} />
            <Stat label="إجمالي الصافي" value={money(lines.reduce((s, l) => s + lineNet(l), 0))} sub={`اتصرف ${paid.length} من ${lines.length}`} />
          </div>

          <Card title="حركة الفلوس">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="العُهد الموزعة" value={money(custody)} />
              <Stat label="اتصرف على المناديب" value={money(paidSum)} />
              <Stat label="المصروفات" value={money(exp)} />
              <Stat label="الرصيد المتبقي" value={custody ? <span className={custody - paidSum - exp < 0 ? 'text-red-600' : 'text-brand-600'}>{money(custody - paidSum - exp)}</span> : '—'} sub={custody ? undefined : 'حدد العُهد من صفحة العُهد'} />
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card title="حسب شركة الشحن" className="overflow-hidden [&>div:last-child]:p-0">
              <Table head={['الشركة', 'المناديب', 'المرتبات', 'الصافي', 'اتصرف']}>
                {byCarrier.map(([k, v]) => <tr key={k}><td className="px-4 py-2.5 font-bold">{k}</td><td className="tabular px-4 py-2.5">{v.n}</td><td className="tabular px-4 py-2.5">{money(v.salary)}</td><td className="tabular px-4 py-2.5">{money(v.net)}</td><td className="tabular px-4 py-2.5 text-brand-600">{money(v.paid)}</td></tr>)}
              </Table>
            </Card>
            <Card title="حسب الموظف" className="overflow-hidden [&>div:last-child]:p-0">
              <Table head={['الموظف', 'العُهدة', 'صرف', 'مصروفات', 'المتبقي']}>
                {staff.filter((r) => r.custody || r.count || r.spent).map((r) => (
                  <tr key={r.member.id}><td className="px-4 py-2.5 font-bold">{r.member.full_name || r.member.email}</td><td className="tabular px-4 py-2.5">{money(r.custody)}</td><td className="tabular px-4 py-2.5">{money(r.disbursed)} <span className="text-xs text-slate-400">({r.count})</span></td><td className="tabular px-4 py-2.5">{money(r.spent)}</td><td className={`tabular px-4 py-2.5 font-bold ${r.remaining < 0 ? 'text-red-600' : ''}`}>{r.custody ? money(r.remaining) : '—'}</td></tr>
                ))}
              </Table>
            </Card>
            <Card title="حسب طريقة التحويل" className="overflow-hidden [&>div:last-child]:p-0">
              <Table head={['الطريقة', 'العدد', 'الإجمالي']} empty={!methods.length && <Empty title="لسه مفيش صرف" />}>
                {methods.map(([k, v]) => <tr key={k}><td className="px-4 py-2.5 font-bold">{k}</td><td className="tabular px-4 py-2.5">{v.n}</td><td className="tabular px-4 py-2.5">{money(v.paid)}</td></tr>)}
              </Table>
            </Card>
            <Card title="أكتر الهبات + المصروفات حسب الفئة" className="overflow-hidden [&>div:last-child]:p-0">
              <Table head={['', 'العدد', 'الإجمالي']}>
                {byHub.map(([k, v]) => <tr key={'h' + k}><td className="px-4 py-2.5 font-bold">{k}</td><td className="tabular px-4 py-2.5">{v.n}</td><td className="tabular px-4 py-2.5">{money(v.net)}</td></tr>)}
                {byCat.map(([k, v]) => <tr key={'c' + k} className="bg-gold-50/40 dark:bg-gold-700/10"><td className="px-4 py-2.5 font-bold">مصروف: {k}</td><td className="px-4 py-2.5">—</td><td className="tabular px-4 py-2.5">{money(v)}</td></tr>)}
              </Table>
            </Card>
          </div>

          <Card title="جدول المناديب" className="overflow-hidden [&>div:last-child]:p-0">
            <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3 print:hidden dark:border-slate-800">
              <select className="field !w-auto" value={flt.carrier} onChange={(e) => setFlt({ ...flt, carrier: e.target.value })} aria-label="الشركة"><option value="">كل الشركات</option>{(carriers || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <select className="field !w-auto" value={flt.status} onChange={(e) => setFlt({ ...flt, status: e.target.value })} aria-label="الحالة"><option value="">كل الحالات</option><option value="paid">تم الصرف</option><option value="pending">لسه</option></select>
              <select className="field !w-auto" value={flt.short} onChange={(e) => setFlt({ ...flt, short: e.target.value })} aria-label="العجز"><option value="">عجز/لوست: الكل</option><option value="yes">عليه عجز</option><option value="no">مفيش عجز</option></select>
              <select className="field !w-auto" value={flt.method} onChange={(e) => setFlt({ ...flt, method: e.target.value })} aria-label="الطريقة"><option value="">كل الطرق</option>{methods.map(([k]) => <option key={k}>{k}</option>)}</select>
              <select className="field !w-auto" value={flt.by} onChange={(e) => setFlt({ ...flt, by: e.target.value })} aria-label="المحوّل"><option value="">كل الموظفين</option>{payers.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}</select>
              <span className="self-center text-xs font-semibold text-slate-500">{filtered.length} مندوب · صافي {money(filtered.reduce((s, l) => s + lineNet(l), 0))}</span>
            </div>
            <Table head={['المندوب', 'الشركة', 'الهب', 'المرتب', 'السلف', 'عجز/لوست', 'الصافي', 'الطريقة', 'المحوّل', 'التاريخ']}>
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5 font-semibold">{cleanCarrierName(l.carrier_name)}</td>
                  <td className="px-4 py-2.5 text-xs">{carrierName[l.run.carrier_id]}</td>
                  <td className="px-4 py-2.5 text-xs">{l.hub}</td>
                  <td className="tabular px-4 py-2.5">{money(l.total_salary)}</td>
                  <td className="tabular px-4 py-2.5">{money(lineAdvances(l))}</td>
                  <td className={`tabular px-4 py-2.5 ${hasShort(l) ? 'font-bold text-red-600' : 'text-slate-400'}`}>{hasShort(l) ? money(Number(l.deficit) + Number(l.lost)) : '—'}</td>
                  <td className="tabular px-4 py-2.5 font-extrabold">{money(lineNet(l))}</td>
                  <td className="px-4 py-2.5 text-xs">{l.pay_method || <span className="font-bold text-amber-600">لسه</span>}</td>
                  <td className="px-4 py-2.5 text-xs">{l.paid_by ? payerName[l.paid_by] : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs">{fmtDate(l.paid_at)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
