import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Printer, Trash2 } from 'lucide-react';
import { supabase } from '@/core/supabase';
import { useOffice } from '@/core/office';
import { errorMessage } from '@/core/errors';
import { ROLE_LABEL, fmtDate, money, ratio } from '@/core/format';
import { useToast } from '@/core/toast';
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Spinner, Stat, Table } from '@/components/ui';
import { useMonth } from '@/modules/payroll/api';
import { PAY_METHODS, monthLabel } from '@/modules/payroll/model';
import { MonthBar, usePayers } from '@/modules/payroll/shared';
import { useAdjustments, useSummary } from './api';
import { ADJ_LABEL, type Adjustment, type SummaryRow } from './model';

export function StaffPayrollPage() {
  const { office, role, writable } = useOffice();
  const canEdit = writable && (role === 'owner' || role === 'accountant');
  const [month, setMonth] = useMonth();
  const { data, isLoading } = useSummary(office?.id, month);
  const { data: adjustments } = useAdjustments(office?.id, month);
  const [adj, setAdj] = useState<string | null>(null);
  const [pay, setPay] = useState<SummaryRow | null>(null);
  const [slip, setSlip] = useState<SummaryRow | null>(null);
  const rows = data || [];
  const paid = rows.filter((r) => r.payslip);
  const netOf = (r: SummaryRow) => (r.payslip ? Number(r.payslip.net) : Number(r.net));

  return (
    <div className="space-y-6">
      <PageHeader
        title="مرتبات الموظفين"
        subtitle="الصافي = الثابت + العمولات + المكافآت − الخصومات − السلف − خصم الغياب والتأخير. لحد ما تصرف، الأرقام بتتحدث مع الحضور والتعيينات."
        actions={<><MonthBar month={month} onChange={setMonth} />{canEdit && <Button variant="secondary" onClick={() => setAdj('')}><Plus className="h-4 w-4" /> مكافأة / خصم / سلفة</Button>}</>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="brand" label={`صافي مرتبات ${monthLabel(month)}`} value={money(rows.reduce((s, r) => s + netOf(r), 0))} sub={`${rows.length} موظف`} />
        <Stat label="اتصرف" value={ratio(paid.length, rows.length)} sub={`${money(paid.reduce((s, r) => s + netOf(r), 0))} ج.م`} />
        <Stat label="عمولات التعيين" value={money(rows.reduce((s, r) => s + Number(r.commission_amount), 0))} sub={`${rows.reduce((s, r) => s + r.commission_count, 0)} مندوب`} />
        <Stat label="خصومات الغياب والتأخير" value={<span className="text-red-600">{money(rows.reduce((s, r) => s + Number(r.absence_deduction) + Number(r.late_deduction), 0))}</span>} />
      </div>

      <div className="card overflow-hidden">
        {isLoading ? <Spinner /> : (
          <Table head={['الموظف', 'الثابت', 'الحضور', 'العمولات', 'مكافآت', 'خصومات وسلف', 'غياب وتأخير', 'الصافي', '']} empty={!rows.length && <Empty title="مفيش موظفين" />}>
            {rows.map((r) => {
              const s = r.payslip;
              const v = s || r;
              return (
                <tr key={r.member_id}>
                  <td className="px-4 py-3">
                    <Link to={`/app/staff/members/${r.member_id}?m=${month}`} className="font-bold hover:text-brand-600">{r.full_name || r.email}</Link>
                    <p className="text-[11px] text-slate-500">{ROLE_LABEL[r.role]}{!r.has_profile && <span className="font-bold text-gold-600"> · من غير ملف (المرتب صفر)</span>}</p>
                  </td>
                  <td className="tabular px-4 py-3">{money(v.base_salary)}</td>
                  <td className="tabular px-4 py-3 text-xs">{ratio(v.present_days, v.work_days)}{v.absent_days > 0 && <span className="text-red-600"> · غياب {v.absent_days}</span>}{v.late_count > 0 && <span className="text-gold-600"> · تأخير {v.late_count}</span>}</td>
                  <td className="tabular px-4 py-3 text-brand-600">{money(v.commission_amount)} <span className="text-[11px] text-slate-400">({v.commission_count})</span></td>
                  <td className="tabular px-4 py-3">{money(v.bonuses)}</td>
                  <td className="tabular px-4 py-3 text-red-600">{money(Number(v.deductions) + Number(v.advances))}</td>
                  <td className="tabular px-4 py-3 text-red-600">{money(Number(v.absence_deduction) + Number(v.late_deduction))}</td>
                  <td className="tabular px-4 py-3 text-base font-extrabold">{money(netOf(r))}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {s ? (
                      <div className="flex items-center gap-1"><Badge tone="green">اتصرف {fmtDate(s.paid_at)}</Badge><Button size="sm" variant="ghost" onClick={() => setSlip(r)} title="القسيمة"><Printer className="h-4 w-4" /></Button></div>
                    ) : canEdit ? (
                      <div className="flex gap-1"><Button size="sm" onClick={() => setPay(r)}>صرف</Button><Button size="sm" variant="ghost" onClick={() => setAdj(r.member_id)} title="مكافأة / خصم"><Plus className="h-4 w-4" /></Button></div>
                    ) : <Badge tone="amber">لسه</Badge>}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </div>

      {(adjustments || []).length > 0 && <AdjustmentsCard items={adjustments!} rows={rows} canEdit={canEdit} />}
      {adj !== null && <AdjustmentModal month={month} memberId={adj} rows={rows} onClose={() => setAdj(null)} />}
      {pay && <PayModal row={pay} month={month} onClose={() => setPay(null)} />}
      {slip && <SlipModal row={slip} month={month} onClose={() => setSlip(null)} />}
    </div>
  );
}

function AdjustmentsCard({ items, rows, canEdit }: { items: Adjustment[]; rows: SummaryRow[]; canEdit: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const name = (id: string) => rows.find((r) => r.member_id === id)?.full_name || '—';
  const paidIds = new Set(rows.filter((r) => r.payslip).map((r) => r.member_id));
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('staff_adjustments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-adjustments'] }); qc.invalidateQueries({ queryKey: ['staff-summary'] }); toast('اتمسح.', 'success'); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <Card title="المكافآت والخصومات والسلف" className="overflow-hidden [&>div:last-child]:p-0">
      <Table head={['الموظف', 'النوع', 'المبلغ', 'السبب', '']}>
        {items.map((a) => (
          <tr key={a.id}>
            <td className="px-4 py-2.5 font-bold">{name(a.member_id)}</td>
            <td className="px-4 py-2.5"><Badge tone={a.kind === 'bonus' ? 'green' : 'red'}>{ADJ_LABEL[a.kind]}</Badge></td>
            <td className="tabular px-4 py-2.5">{money(a.amount)}</td>
            <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">{a.reason}</td>
            <td className="px-4 py-2.5">{canEdit && !paidIds.has(a.member_id) && <Button size="sm" variant="ghost" onClick={() => confirm('مسح؟') && del.mutate(a.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>}</td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function AdjustmentModal({ month, memberId, rows, onClose }: { month: string; memberId: string; rows: SummaryRow[]; onClose: () => void }) {
  const { office } = useOffice();
  const toast = useToast();
  const qc = useQueryClient();
  const open = rows.filter((r) => !r.payslip);
  const [f, setF] = useState({ member_id: memberId || open[0]?.member_id || '', kind: 'bonus' as Adjustment['kind'], amount: '', reason: '' });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('staff_adjustments').insert({ office_id: office!.id, month, member_id: f.member_id, kind: f.kind, amount: Number(f.amount), reason: f.reason.trim() });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-adjustments'] }); qc.invalidateQueries({ queryKey: ['staff-summary'] }); toast('اتسجل.', 'success'); onClose(); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <Modal open onClose={onClose} title={`مكافأة / خصم / سلفة — ${monthLabel(month)}`} footer={<><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button loading={save.isPending} disabled={!f.member_id || !(Number(f.amount) > 0) || !f.reason.trim()} onClick={() => save.mutate()}>حفظ</Button></>}>
      <Field label="الموظف" htmlFor="j_m">
        <select id="j_m" className="field" value={f.member_id} onChange={(e) => setF({ ...f, member_id: e.target.value })}>
          {open.map((r) => <option key={r.member_id} value={r.member_id}>{r.full_name || r.email}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="النوع" htmlFor="j_k">
          <select id="j_k" className="field" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Adjustment['kind'] })}>
            {(Object.keys(ADJ_LABEL) as Adjustment['kind'][]).map((k) => <option key={k} value={k}>{ADJ_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="المبلغ (ج.م)" htmlFor="j_a"><input id="j_a" type="number" min="1" dir="ltr" className="field" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
      </div>
      <Field label="السبب" required htmlFor="j_r"><input id="j_r" className="field" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="مثلاً: حققت التارجت" /></Field>
    </Modal>
  );
}

function PayModal({ row, month, onClose }: { row: SummaryRow; month: string; onClose: () => void }) {
  const { office } = useOffice();
  const toast = useToast();
  const qc = useQueryClient();
  const { activePayers } = usePayers();
  const [f, setF] = useState({ method: PAY_METHODS[0], paid_by: '', notes: '' });
  const pay = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('staff_pay', { p_office: office!.id, p_month: month, p_member: row.member_id, p_method: f.method, p_paid_by: f.paid_by || null, p_notes: f.notes });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-summary'] }); qc.invalidateQueries({ queryKey: ['staff-payslips'] }); toast(`اتصرف مرتب ${row.full_name}.`, 'success'); onClose(); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <Modal open onClose={onClose} title={`صرف مرتب ${row.full_name || ''} — ${monthLabel(month)}`} footer={<><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button loading={pay.isPending} onClick={() => pay.mutate()}>تأكيد الصرف</Button></>}>
      <SlipBody r={row} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="طريقة الصرف" htmlFor="y_m"><select id="y_m" className="field" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="صرف عن طريق" htmlFor="y_b"><select id="y_b" className="field" value={f.paid_by} onChange={(e) => setF({ ...f, paid_by: e.target.value })}><option value="">—</option>{activePayers.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}</select></Field>
      </div>
      <Field label="ملاحظات" htmlFor="y_n"><input id="y_n" className="field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <p className="text-xs text-slate-500">بعد الصرف الأرقام بتتثبت في قسيمة، وأي تعديل في الحضور بعد كده مش هيغيرها.</p>
    </Modal>
  );
}

function SlipBody({ r }: { r: SummaryRow }) {
  const v = r.payslip || r;
  const line = (l: string, n: number, sign = '', cls = '') => (
    <div className="flex justify-between border-b border-slate-100 py-1.5 text-sm last:border-0 dark:border-slate-800"><span className="text-slate-600 dark:text-slate-300">{l}</span><span className={`tabular font-bold ${cls}`}>{sign}{money(n)}</span></div>
  );
  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">حضر {v.present_days} من {v.work_days} يوم شغل · غياب {v.absent_days} · إجازات {v.leave_days} · تأخير {v.late_count}</p>
      {line('المرتب الثابت', Number(v.base_salary))}
      {line(`عمولات التعيين (${v.commission_count} مندوب)`, Number(v.commission_amount), '+ ', 'text-brand-600')}
      {Number(v.bonuses) > 0 && line('مكافآت', Number(v.bonuses), '+ ', 'text-brand-600')}
      {Number(v.absence_deduction) > 0 && line(`خصم غياب (${v.absent_days} يوم)`, Number(v.absence_deduction), '− ', 'text-red-600')}
      {Number(v.late_deduction) > 0 && line('خصم تأخير', Number(v.late_deduction), '− ', 'text-red-600')}
      {Number(v.deductions) > 0 && line('خصومات', Number(v.deductions), '− ', 'text-red-600')}
      {Number(v.advances) > 0 && line('سلف', Number(v.advances), '− ', 'text-red-600')}
      <div className="mt-2 flex items-center justify-between rounded-lg bg-brand-600 p-3 text-white"><span className="font-bold">الصافي</span><span className="tabular text-2xl font-extrabold">{money(Number(v.net))}</span></div>
    </div>
  );
}

function SlipModal({ row, month, onClose }: { row: SummaryRow; month: string; onClose: () => void }) {
  const { office, role, writable } = useOffice();
  const toast = useToast();
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('staff_payslips').delete().eq('id', row.payslip!.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-summary'] }); qc.invalidateQueries({ queryKey: ['staff-payslips'] }); toast('اتلغى الصرف.', 'success'); onClose(); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <Modal open onClose={onClose} title={`قسيمة مرتب — ${monthLabel(month)}`} footer={<>{role === 'owner' && writable && <Button variant="danger" loading={del.isPending} onClick={() => confirm('إلغاء صرف المرتب ده؟ القسيمة هتتمسح والأرقام هترجع تتحسب.') && del.mutate()}>إلغاء الصرف</Button>}<Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة</Button></>}>
      <div className="flex items-center justify-between"><img src="/brand/masar-logo.png" alt="" className="h-10" /><div className="text-left text-xs text-slate-500"><p className="font-bold">{office?.name}</p><p>{monthLabel(month)}</p></div></div>
      <p className="font-extrabold">{row.full_name} <span className="text-xs font-normal text-slate-500">· {ROLE_LABEL[row.role]}</span></p>
      <SlipBody r={row} />
      <p className="text-xs text-slate-500">اتصرف {fmtDate(row.payslip?.paid_at)} · {row.payslip?.pay_method || ''}{row.payslip?.notes ? ` · ${row.payslip.notes}` : ''}</p>
    </Modal>
  );
}

export { SlipBody };
