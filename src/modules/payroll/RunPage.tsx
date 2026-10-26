import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Link2, Trash2, Unlink } from 'lucide-react';
import { supabase } from '@/core/supabase';
import { useOffice } from '@/core/office';
import { errorMessage } from '@/core/errors';
import { fmtDate, money, ratio, todayStr } from '@/core/format';
import { useToast } from '@/core/toast';
import { Badge, Button, Empty, Field, Modal, PageHeader, SearchInput, Spinner, Stat, Table } from '@/components/ui';
import { ExportButton } from '@/components/ExportButton';
import { useCarriers } from '@/modules/recruitment/api';
import { STAGE_LABEL, type CourierStage } from '@/modules/recruitment/model';
import { StageBadge } from '@/modules/recruitment/StageModal';
import { searchCouriers, useRun, useRunLines } from './api';
import { WhatsAppMenu } from '@/core/whatsapp';
import { PAY_FIELD_LABEL, PAY_METHODS, cleanCarrierName, hasShort, lineAdvances, lineNet, monthLabel, type PayrollLine } from './model';
import { usePayers, usePayrollPerms } from './shared';

type LinkedCourier = { id: string; full_name: string; primary_phone: string; stage: CourierStage; stage_note: string | null };

function useLinkedCouriers(officeId: string | undefined, ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ['linked-couriers', officeId, key],
    enabled: Boolean(officeId) && key.length > 0,
    queryFn: async () => {
      const out: LinkedCourier[] = [];
      for (let i = 0; i < key.length; i += 200) {
        const { data, error } = await supabase.from('couriers').select('id, full_name, primary_phone, stage, stage_note').in('id', key.slice(i, i + 200));
        if (error) throw error;
        out.push(...(data as LinkedCourier[]));
      }
      return Object.fromEntries(out.map((c) => [c.id, c]));
    },
  });
}

const RISK: CourierStage[] = ['blocked', 'inactive', 'left'];

export function RunPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { office } = useOffice();
  const perms = usePayrollPerms();
  const { name: payerName } = usePayers();
  const { data: run, isLoading: lr } = useRun(id);
  const { data: lines, isLoading } = useRunLines(id);
  const { data: carriers } = useCarriers(office?.id);
  const { data: couriers } = useLinkedCouriers(office?.id, (lines || []).map((l) => l.courier_id).filter(Boolean) as string[]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [hub, setHub] = useState('');
  const [link, setLink] = useState('');
  const [open, setOpen] = useState<PayrollLine | null>(null);

  const hubs = useMemo(() => [...new Set((lines || []).map((l) => l.hub).filter(Boolean))].sort() as string[], [lines]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (lines || []).filter((l) => {
      const c = l.courier_id ? couriers?.[l.courier_id] : null;
      return (
        (!t || l.carrier_name.toLowerCase().includes(t) || (c?.full_name || '').includes(q.trim()) || (c?.primary_phone || '').includes(t)) &&
        (!status || (status === 'paid' ? l.paid : status === 'pending' ? !l.paid : status === 'short' ? hasShort(l) : status === 'risk' ? c && RISK.includes(c.stage) : true)) &&
        (!hub || l.hub === hub) &&
        (!link || (link === 'linked' ? l.courier_id : !l.courier_id))
      );
    });
  }, [lines, couriers, q, status, hub, link]);

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('payroll_runs').delete().eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      qc.invalidateQueries({ queryKey: ['payroll-month-lines'] });
      toast('اتحذف الشيت.', 'success');
      nav(`/app/payroll?m=${run?.month}`);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (lr || isLoading) return <Spinner />;
  if (!run) return <p className="font-bold text-red-600">الشيت مش موجود</p>;
  const carrier = carriers?.find((c) => c.id === run.carrier_id)?.name || '';
  const L = lines || [];
  const paid = L.filter((l) => l.paid);

  return (
    <div className="space-y-5">
      <Link to={`/app/payroll?m=${run.month}`} className="inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:underline"><ArrowRight className="h-4 w-4" /> مرتبات {monthLabel(run.month)}</Link>
      <PageHeader
        title={`${carrier} — ${monthLabel(run.month)}`}
        subtitle={run.source_file_name || undefined}
        actions={<>
          <ExportButton fileName={`${carrier}-${run.month}`} rows={list} cols={[
            { header: 'الاسم في الشيت', value: (l) => cleanCarrierName(l.carrier_name) }, { header: 'المندوب', value: (l) => (l.courier_id ? couriers?.[l.courier_id]?.full_name : '') },
            { header: 'الهب', value: (l) => l.hub }, { header: 'أيام', value: (l) => l.work_days }, { header: 'التوصيلات', value: (l) => l.deliveries },
            { header: 'إجمالي المرتب', value: (l) => Number(l.total_salary) }, { header: 'السلف', value: (l) => Number(lineAdvances(l) || 0) },
            { header: 'العجز', value: (l) => Number(l.deficit) }, { header: 'اللوست', value: (l) => Number(l.lost) }, { header: 'الصافي', value: (l) => lineNet(l) },
            { header: 'الحالة', value: (l) => (l.paid ? 'اتصرف' : 'لسه') }, { header: 'طريقة التحويل', value: (l) => l.pay_method }, { header: 'تاريخ الصرف', value: (l) => l.paid_at },
          ]} />
          {perms.canDeleteRun && <Button variant="danger" loading={del.isPending} onClick={() => confirm(`حذف شيت ${carrier} لشهر ${monthLabel(run.month)} بكل سجلات الصرف بتاعته؟`) && del.mutate()}><Trash2 className="h-4 w-4" /> حذف الشيت</Button>}
        </>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat tone="brand" label="المناديب" value={L.length} sub={`${L.filter((l) => l.courier_id).length} مربوطين بملفاتهم`} />
        <Stat label="تم صرفهم" value={ratio(paid.length, L.length)} />
        <Stat label="إجمالي المرتبات" value={money(L.reduce((s, l) => s + Number(l.total_salary), 0))} />
        <Stat label="الصافي" value={money(L.reduce((s, l) => s + lineNet(l), 0))} sub={`اتصرف ${money(paid.reduce((s, l) => s + Number(l.paid_amount), 0))}`} />
        <Stat label="عجز + لوست" value={<span className="text-red-600">{money(L.reduce((s, l) => s + Number(l.deficit) + Number(l.lost), 0))}</span>} sub={`${L.filter(hasShort).length} مندوب`} />
      </div>

      <div className="card flex flex-wrap gap-2 p-3">
        <SearchInput value={q} onChange={setQ} placeholder="بحث بالاسم أو الموبايل" />
        <select className="field !w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="الحالة">
          <option value="">كل الحالات</option>
          <option value="pending">لسه متصرفش</option>
          <option value="paid">تم الصرف</option>
          <option value="short">عليه عجز / لوست</option>
          <option value="risk">موقوف أو محظور في التعيينات</option>
        </select>
        <select className="field !w-auto" value={hub} onChange={(e) => setHub(e.target.value)} aria-label="الهب">
          <option value="">كل الهبات</option>
          {hubs.map((h) => <option key={h}>{h}</option>)}
        </select>
        <select className="field !w-auto" value={link} onChange={(e) => setLink(e.target.value)} aria-label="الربط">
          <option value="">مربوط وغير مربوط</option>
          <option value="linked">مربوط بملفه</option>
          <option value="unlinked">مش مربوط</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <Table head={['المندوب', 'الهب', 'إجمالي المرتب', 'السلف', 'عجز / لوست', 'الصافي', 'الحالة']} empty={!list.length && <Empty title="مفيش نتايج" />}>
          {list.map((l) => {
            const c = l.courier_id ? couriers?.[l.courier_id] : null;
            const risk = c && RISK.includes(c.stage);
            return (
              <tr key={l.id} onClick={() => setOpen(l)} className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 ${risk ? 'bg-red-50/60 dark:bg-red-950/30' : ''}`}>
                <td className="px-4 py-3">
                  <p className="font-bold">{c?.full_name || cleanCarrierName(l.carrier_name)}</p>
                  {c ? (
                    <p className={`text-[11px] ${risk ? 'font-bold text-red-600' : 'text-slate-500'}`}><Link2 className="inline h-3 w-3" /> {cleanCarrierName(l.carrier_name)} · {STAGE_LABEL[c.stage]}</p>
                  ) : <p className="text-[11px] text-gold-600">مش مربوط بملف في التعيينات</p>}
                </td>
                <td className="px-4 py-3 text-xs">{l.hub}<p className="text-slate-400">{l.vehicle}</p></td>
                <td className="tabular px-4 py-3">{money(l.total_salary)}</td>
                <td className="tabular px-4 py-3">{money(lineAdvances(l))}</td>
                <td className={`tabular px-4 py-3 ${hasShort(l) ? 'font-bold text-red-600' : 'text-slate-400'}`}>{hasShort(l) ? money(Number(l.deficit) + Number(l.lost)) : '—'}</td>
                <td className="tabular px-4 py-3 font-extrabold text-brand-800 dark:text-brand-100">{money(lineNet(l))}</td>
                <td className="px-4 py-3">
                  {l.paid ? (
                    <><Badge tone="green">تم الصرف</Badge><p className="mt-0.5 text-[11px] text-slate-500">{l.pay_method} · {l.paid_by ? payerName[l.paid_by] : ''}</p></>
                  ) : <Badge tone="amber">لسه</Badge>}
                  {l.paid && Number(l.paid_amount) !== Number(l.net_due) && <p className="mt-0.5 text-[11px] font-bold text-red-600">الشيت اتعدل بعد الصرف</p>}
                </td>
              </tr>
            );
          })}
        </Table>
      </div>

      <PaymentModal line={open} courier={open?.courier_id ? couriers?.[open.courier_id] || null : null} onClose={() => setOpen(null)} />
    </div>
  );
}

function PaymentModal({ line, courier, onClose }: { line: PayrollLine | null; courier: LinkedCourier | null; onClose: () => void }) {
  const { office } = useOffice();
  const toast = useToast();
  const qc = useQueryClient();
  const perms = usePayrollPerms();
  const { data: run } = useRun(line?.run_id);
  const { activePayers, name: payerName } = usePayers();
  const [f, setF] = useState({ advances: '0', method: '', paid_by: '', paid_at: todayStr(), notes: '' });
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchCouriers>>>([]);

  useEffect(() => {
    if (!line) return;
    setF({
      advances: String(lineAdvances(line) || 0),
      method: line.pay_method || '',
      paid_by: line.paid_by || '',
      paid_at: line.paid_at || todayStr(),
      notes: line.pay_notes || '',
    });
    setSearch('');
    setResults([]);
  }, [line]);

  useEffect(() => {
    if (!office || search.trim().length < 2) { setResults([]); return; }
    let live = true;
    searchCouriers(office.id, search).then((r) => live && setResults(r)).catch(() => {});
    return () => { live = false; };
  }, [search, office]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['payroll-lines', line?.run_id] });
    qc.invalidateQueries({ queryKey: ['payroll-month-lines'] });
    qc.invalidateQueries({ queryKey: ['linked-couriers'] });
    qc.invalidateQueries({ queryKey: ['courier-payroll'] });
  };
  const pay = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('payroll_pay', {
        p_line: line!.id, p_advances: Number(f.advances) || 0, p_method: f.method, p_paid_by: f.paid_by, p_paid_at: f.paid_at, p_notes: f.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast(`اتسجل صرف ${money(net)} ج.م`, 'success'); onClose(); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const unpay = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('payroll_unpay', { p_line: line!.id });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast('اتلغى تسجيل الصرف.', 'success'); onClose(); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const linkMut = useMutation({
    mutationFn: async (courierId: string | null) => {
      const { data, error } = await supabase.rpc('payroll_link', { p_line: line!.id, p_courier: courierId });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n, courierId) => { refresh(); toast(courierId ? `اتربط (${n} شهر)` : 'اتشال الربط', 'success'); onClose(); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (!line) return null;
  const net = Number(line.total_salary) - (Number(f.advances) || 0) - Number(line.deficit) - Number(line.lost);
  const risk = courier && RISK.includes(courier.stage);
  const item = (l: string, v: number, cls = '') => (
    <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-white/5"><p className="text-[10px] font-bold text-slate-500">{l}</p><p className={`tabular text-sm font-extrabold ${cls}`}>{money(v)}</p></div>
  );

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={courier?.full_name || cleanCarrierName(line.carrier_name)}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">{line.paid ? `اتصرف ${fmtDate(line.paid_at)} — ${line.paid_by ? payerName[line.paid_by] : ''}` : 'لسه متصرفش'}</p>
          <div className="flex gap-2">
            {line.paid && perms.canUnpay && <Button variant="danger" loading={unpay.isPending} onClick={() => confirm('إلغاء تسجيل الصرف؟') && unpay.mutate()}>إلغاء الصرف</Button>}
            {perms.canPay && <Button loading={pay.isPending} disabled={!f.method || !f.paid_by} onClick={() => (net >= 0 || confirm('الصافي بالسالب، تكمل؟')) && pay.mutate()}>{line.paid ? 'تحديث الصرف' : 'تأكيد الصرف'}</Button>}
          </div>
        </div>
      }
    >
      <p className="-mt-2 text-xs text-slate-500">{line.carrier_name} · {[line.hub, line.zone, line.vehicle].filter(Boolean).join(' · ')} · {line.work_days} يوم</p>
      {risk && (
        <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <AlertTriangle className="h-4 w-4" /> المندوب حالته "{STAGE_LABEL[courier!.stage]}" في التعيينات{courier!.stage_note ? `: ${courier!.stage_note}` : ''}. اتأكد قبل الصرف.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {item('التوصيلات', line.deliveries)}{item('RTO', line.rto)}{item('Pickups', line.pickups)}{item('الثابت', line.total_fixed)}{item('المتغير', line.total_variable)}
        {item('الخصومات', line.total_deductions, 'text-red-600')}{item('البونص', line.total_bonus, 'text-brand-600')}{item('إجمالي المرتب', line.total_salary)}
        {item('العجز', line.deficit, line.deficit ? 'text-red-600' : '')}{item('اللوست', line.lost, line.lost ? 'text-red-600' : '')}
      </div>
      {Object.keys(line.details || {}).length > 0 && (
        <p className="text-[11px] text-slate-500">{Object.entries(line.details).filter(([, v]) => v).map(([k, v]) => `${PAY_FIELD_LABEL[k as keyof typeof PAY_FIELD_LABEL] || k}: ${money(v)}`).join(' · ')}</p>
      )}

      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        {courier ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs text-slate-500">مربوط بملف</p>
              <Link to={`/app/recruitment/couriers/${courier.id}`} className="font-bold text-brand-600 hover:underline">{courier.full_name}</Link>
              <span className="mr-2"><StageBadge stage={courier.stage} /></span>
              <a href={`tel:${courier.primary_phone}`} className="tabular mr-2 text-sm" dir="ltr">{courier.primary_phone}</a>
            </div>
            <WhatsAppMenu size="sm" phone={courier.primary_phone} name={courier.full_name} keys={['payslip', 'general']} extra={{
              'الشهر': monthLabel(run?.month || ''),
              'التفاصيل': [`التوصيلات: ${money(line.deliveries)}`, `إجمالي المرتب: ${money(line.total_salary)}`,
                line.total_deductions ? `الخصومات: ${money(line.total_deductions)}` : '', line.total_bonus ? `البونص: ${money(line.total_bonus)}` : '',
                Number(f.advances) ? `السلف: ${money(Number(f.advances))}` : '', line.deficit ? `العجز: ${money(line.deficit)}` : '', line.lost ? `اللوست: ${money(line.lost)}` : '']
                .filter(Boolean).join('\n'),
              'الصافي': money(net),
            }} />
            {perms.canPay && <Button size="sm" variant="ghost" loading={linkMut.isPending} onClick={() => linkMut.mutate(null)}><Unlink className="h-4 w-4" /> فك الربط</Button>}
          </div>
        ) : perms.canPay ? (
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">اربطه بملفه في التعيينات (مرة واحدة وبيفضل كل شهر)</p>
            <input className="field" placeholder="اكتب اسمه بالعربي أو رقم موبايله" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="بحث عن المندوب" />
            {results.length > 0 && (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                {results.map((r) => (
                  <button key={r.id} type="button" onClick={() => linkMut.mutate(r.id)} className="flex w-full items-center justify-between px-3 py-2 text-right text-sm hover:bg-brand-50 dark:hover:bg-white/5">
                    <span className="font-bold">{r.full_name}</span>
                    <span className="tabular text-xs text-slate-500" dir="ltr">{r.primary_phone} · {STAGE_LABEL[r.stage as CourierStage]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : <p className="text-xs text-slate-500">مش مربوط بملف في التعيينات</p>}
      </div>

      {perms.canPay && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="السلف (ج.م)" htmlFor="p_adv"><input id="p_adv" type="number" min="0" dir="ltr" className="field" value={f.advances} onChange={(e) => setF({ ...f, advances: e.target.value })} /></Field>
          <Field label="طريقة التحويل" required htmlFor="p_method">
            <select id="p_method" className="field" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
              <option value="">اختار...</option>
              {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="اتحول عن طريق" required htmlFor="p_by">
            <select id="p_by" className="field" value={f.paid_by} onChange={(e) => setF({ ...f, paid_by: e.target.value })}>
              <option value="">اختار...</option>
              {activePayers.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
            </select>
          </Field>
          <Field label="تاريخ الصرف" htmlFor="p_date"><input id="p_date" type="date" className="field" value={f.paid_at} onChange={(e) => setF({ ...f, paid_at: e.target.value })} /></Field>
          <div className="md:col-span-2"><Field label="ملاحظات" htmlFor="p_notes"><input id="p_notes" className="field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field></div>
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl bg-brand-600 p-4 text-white">
        <div><p className="text-sm font-bold">الصافي المستحق</p><p className="text-[11px] text-brand-100">إجمالي المرتب − (السلف + العجز + اللوست)</p></div>
        <p className={`tabular text-3xl font-extrabold ${net < 0 ? 'text-red-200' : ''}`}>{money(net)}</p>
      </div>
      {line.paid && Number(line.paid_amount) !== Number(line.net_due) && (
        <p className="text-xs font-bold text-red-600">اتصرف {money(line.paid_amount)}، وبعدها الشيت اتعدل والصافي بقى {money(line.net_due)}. اضغط "تحديث الصرف" لو هتصرف الفرق.</p>
      )}
    </Modal>
  );
}
