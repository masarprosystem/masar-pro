import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Receipt } from 'lucide-react';
import { supabase } from '@/core/supabase';
import { useAuth } from '@/core/auth';
import { errorMessage } from '@/core/errors';
import {
  MODULES, MODULE_LABEL, PAYMENT_METHODS, ROLES, ROLE_LABEL, STATUSES, STATUS_LABEL, STATUS_TONE,
  daysUntil, fmtDate, fmtDateTime, money,
} from '@/core/format';
import { useToast } from '@/core/toast';
import type { AppModule, AuditRow, Office, OfficeRole, Subscription, SubscriptionStatus } from '@/core/types';
import { MembersManager, usePlan } from '@/components/MembersManager';
import { PaymentsTable } from '@/pages/app/OfficePages';
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Spinner, Stat, Table } from '@/components/ui';

function useOfficeAdmin(id: string) {
  return useQuery({
    queryKey: ['admin-office', id],
    queryFn: async () => {
      const [o, s] = await Promise.all([
        supabase.from('offices').select('*').eq('id', id).single(),
        supabase.from('subscriptions').select('*').eq('office_id', id).single(),
      ]);
      if (o.error) throw o.error;
      if (s.error) throw s.error;
      return { office: o.data as Office, subscription: s.data as Subscription };
    },
  });
}

export function AdminOfficeDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { data, isLoading, error } = useOfficeAdmin(id);
  const [paying, setPaying] = useState(false);

  if (isLoading) return <Spinner />;
  if (error || !data) return <p className="font-bold text-red-600">{errorMessage(error)}</p>;
  const { office, subscription: s } = data;
  const left = daysUntil(s.current_period_end);

  return (
    <div className="space-y-6">
      <Link to="/admin" className="inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:underline"><ArrowRight className="h-4 w-4" /> كل المكاتب</Link>
      <PageHeader
        title={office.name}
        subtitle={[office.city, office.phone, `اتعمل ${fmtDate(office.created_at)}`].filter(Boolean).join(' · ')}
        actions={<Button variant="gold" onClick={() => setPaying(true)}><Receipt className="h-4 w-4" /> تسجيل دفعة وتجديد</Button>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="brand" label="الحالة" value={STATUS_LABEL[s.status]} />
        <Stat label="ينتهي في" value={fmtDate(s.current_period_end)} sub={<span className={left < 0 ? 'text-red-600' : ''}>{left} يوم</span>} />
        <Stat label="الاشتراك الشهري" value={money(s.monthly_price)} sub="جنيه" />
        <Stat label="الأقسام" value={s.modules.length} sub={s.modules.map((m) => MODULE_LABEL[m]).join('، ')} />
      </div>

      <SubscriptionEditor subscription={s} />

      <div className="space-y-3">
        <h2 className="text-sm font-extrabold text-brand-800 dark:text-brand-200">الحسابات</h2>
        <MembersManager officeId={office.id} subscription={s} canEdit isAdmin currentUserId={user?.id} />
      </div>

      <Card title="المدفوعات" className="overflow-hidden [&>div:last-child]:p-0">
        <PaymentsTable officeId={office.id} />
      </Card>

      <AuditCard officeId={office.id} />

      <PaymentModal open={paying} onClose={() => setPaying(false)} subscription={s} />
    </div>
  );
}

function SubscriptionEditor({ subscription: s }: { subscription: Subscription }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: plan } = usePlan(s.plan_id);
  const init = () => ({
    status: s.status,
    period_end: s.current_period_end,
    price: String(s.monthly_price),
    extra: Object.fromEntries(ROLES.map((r) => [r, String(s.extra_seats?.[r] || 0)])) as Record<OfficeRole, string>,
    modules: [...s.modules],
    max: s.max_active_couriers == null ? '' : String(s.max_active_couriers),
    notes: s.notes || '',
  });
  const [f, setF] = useState(init);
  useEffect(() => setF(init()), [s.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const mut = useMutation({
    mutationFn: async () => {
      const extra = Object.fromEntries(ROLES.map((r) => [r, Math.max(0, Number(f.extra[r]) || 0)]).filter(([, v]) => Number(v) > 0));
      const { error } = await supabase.rpc('admin_update_subscription', {
        p_office: s.office_id,
        p_status: f.status,
        p_period_end: f.period_end,
        p_monthly_price: Number(f.price) || 0,
        p_extra_seats: extra,
        p_modules: f.modules,
        p_max_active_couriers: f.max === '' ? null : Number(f.max),
        p_notes: f.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-office', s.office_id] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      toast('اتحفظ الاشتراك.', 'success');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const toggleModule = (m: AppModule) =>
    setF((x) => ({ ...x, modules: x.modules.includes(m) ? x.modules.filter((y) => y !== m) : [...x.modules, m] }));

  return (
    <Card title="تعديل الاشتراك" actions={<Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Field label="الحالة" htmlFor="s_status">
          <select id="s_status" className="field" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as SubscriptionStatus })}>
            {STATUSES.map((x) => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}
          </select>
        </Field>
        <Field label="تاريخ الانتهاء" htmlFor="s_end"><input id="s_end" type="date" className="field" value={f.period_end} onChange={(e) => setF({ ...f, period_end: e.target.value })} /></Field>
        <Field label="الاشتراك الشهري (ج.م)" htmlFor="s_price"><input id="s_price" type="number" min="0" dir="ltr" className="field" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
        <Field label="حد المناديب النشطين" hint={`الباقة: ${plan?.max_active_couriers ?? '—'}`} htmlFor="s_max"><input id="s_max" type="number" min="0" dir="ltr" className="field" placeholder="حد الباقة" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} /></Field>
      </div>

      <p className="mb-2 mt-5 text-xs font-bold text-slate-700 dark:text-slate-300">حسابات إضافية فوق الباقة</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {ROLES.map((r) => (
          <Field key={r} label={`${ROLE_LABEL[r]} (الباقة ${plan?.seats?.[r] ?? 0})`} htmlFor={`x_${r}`}>
            <input id={`x_${r}`} type="number" min="0" dir="ltr" className="field" value={f.extra[r]} onChange={(e) => setF({ ...f, extra: { ...f.extra, [r]: e.target.value } })} />
          </Field>
        ))}
      </div>

      <p className="mb-2 mt-5 text-xs font-bold text-slate-700 dark:text-slate-300">الأقسام المفعّلة</p>
      <div className="flex flex-wrap gap-2">
        {MODULES.map((m) => (
          <label key={m} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold ${f.modules.includes(m) ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200' : 'border-slate-300 text-slate-500 dark:border-slate-700'}`}>
            <input type="checkbox" className="accent-brand-600" checked={f.modules.includes(m)} onChange={() => toggleModule(m)} /> {MODULE_LABEL[m]}
          </label>
        ))}
      </div>

      <div className="mt-5">
        <Field label="ملاحظات داخلية" htmlFor="s_notes"><textarea id="s_notes" rows={2} className="field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setF(init())}>تراجع</Button>
        <Button loading={mut.isPending} onClick={() => mut.mutate()} disabled={!f.modules.length}>حفظ الاشتراك</Button>
      </div>
    </Card>
  );
}

function PaymentModal({ open, onClose, subscription: s }: { open: boolean; onClose: () => void; subscription: Subscription }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ months: '1', amount: String(s.monthly_price), method: PAYMENT_METHODS[0], reference: '', notes: '' });
  useEffect(() => {
    if (open) setF({ months: '1', amount: String(s.monthly_price), method: PAYMENT_METHODS[0], reference: '', notes: '' });
  }, [open, s.monthly_price]);

  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_record_payment', {
        p_office: s.office_id,
        p_amount: Number(f.amount),
        p_method: f.method,
        p_months: Number(f.months),
        p_reference: f.reference || null,
        p_notes: f.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-office', s.office_id] });
      qc.invalidateQueries({ queryKey: ['payments', s.office_id] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      toast('اتسجلت الدفعة واتجدد الاشتراك.', 'success');
      onClose();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تسجيل دفعة وتجديد الاشتراك"
      footer={<><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button loading={mut.isPending} disabled={!(Number(f.amount) > 0)} onClick={() => mut.mutate()}>تسجيل</Button></>}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="عدد الشهور" htmlFor="p_m">
          <select id="p_m" className="field" value={f.months} onChange={(e) => setF({ ...f, months: e.target.value, amount: String(Number(s.monthly_price) * Number(e.target.value)) })}>
            {[1, 2, 3, 6, 12].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'شهر' : 'شهور'}</option>)}
          </select>
        </Field>
        <Field label="المبلغ (ج.م)" htmlFor="p_a"><input id="p_a" type="number" min="1" dir="ltr" className="field" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="طريقة الدفع" htmlFor="p_meth">
          <select id="p_meth" className="field" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
            {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="رقم العملية / المرجع" htmlFor="p_ref"><input id="p_ref" dir="ltr" className="field" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
      </div>
      <Field label="ملاحظات" htmlFor="p_n"><input id="p_n" className="field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <p className="text-xs text-slate-500">لو الاشتراك المدفوع لسه شغال، المدة بتتضاف على تاريخ انتهائه. لو تجربة أو منتهي، بيبدأ من النهارده.</p>
    </Modal>
  );
}

const ACTION_LABEL: Record<string, string> = { INSERT: 'إضافة', UPDATE: 'تعديل', DELETE: 'حذف' };
const ENTITY_LABEL: Record<string, string> = { subscriptions: 'الاشتراك', office_members: 'حساب', subscription_payments: 'دفعة' };

function AuditCard({ officeId }: { officeId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['audit', officeId],
    queryFn: async () => {
      const { data, error } = await supabase.from('audit_log').select('*').eq('office_id', officeId).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data as AuditRow[];
    },
  });
  const describe = (a: AuditRow) => {
    const d = (a.data || {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const row = d.new || d;
    if (a.entity === 'office_members') return `${row.full_name || row.email || ''} — ${ROLE_LABEL[row.role as OfficeRole] || ''}${d.old && d.old.is_active !== d.new?.is_active ? (d.new?.is_active ? ' (تفعيل)' : ' (إيقاف)') : ''}`;
    if (a.entity === 'subscriptions') return `${STATUS_LABEL[row.status as SubscriptionStatus] || ''} — حتى ${fmtDate(row.current_period_end)}`;
    if (a.entity === 'subscription_payments') return `${money(row.amount)} ج.م — ${row.method || ''}`;
    return '';
  };
  return (
    <Card title="سجل التعديلات (آخر 50)" className="overflow-hidden [&>div:last-child]:p-0">
      {isLoading ? <Spinner /> : (
        <Table head={['الوقت', 'العملية', 'على', 'التفاصيل']} empty={!data?.length && <Empty title="مفيش تعديلات" />}>
          {(data || []).map((a) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap px-4 py-2.5 text-xs">{fmtDateTime(a.created_at)}</td>
              <td className="px-4 py-2.5"><Badge tone={a.action === 'DELETE' ? 'red' : a.action === 'INSERT' ? 'green' : 'slate'}>{ACTION_LABEL[a.action] || a.action}</Badge></td>
              <td className="px-4 py-2.5 text-xs font-bold">{ENTITY_LABEL[a.entity] || a.entity}</td>
              <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">{describe(a)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
