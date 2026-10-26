import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Construction, Lock, UserSearch, Wallet, type LucideIcon } from 'lucide-react';
import { supabase } from '@/core/supabase';
import { WA_DEFAULTS, WA_LABEL, WA_VARS, useOfficeSettings, type WaKey } from '@/core/whatsapp';
import { useAuth } from '@/core/auth';
import { useOffice } from '@/core/office';
import { errorMessage } from '@/core/errors';
import { MODULES, MODULE_LABEL, ROLE_LABEL, STATUS_LABEL, STATUS_TONE, fmtDate, fmtDateTime, money } from '@/core/format';
import { useToast } from '@/core/toast';
import type { AppModule, Payment } from '@/core/types';
import { MembersManager, useMembers, usePlan } from '@/components/MembersManager';
import { Badge, Button, Card, Empty, Field, PageHeader, Spinner, Stat, Table } from '@/components/ui';

const MODULE_ICON: Record<AppModule, LucideIcon> = { recruitment: UserSearch, payroll: Wallet, staff: Briefcase };
const MODULE_DESC: Record<AppModule, string> = {
  recruitment: 'رحلة المندوب من التقديم للمقابلة والتدريب لحد ما يشتغل، ومستنداته وشركة الشحن اللي نازل لها.',
  payroll: 'رفع شيتات شركات الشحن، والسلف والعجز واللوست، والصرف والعُهد والتقرير الشهري.',
  staff: 'حضور وانصراف الموظفين، والعمولة على كل تعيين، والمرتب الثابت أوتوماتيك.',
};

export function HomePage() {
  const { membership, office, subscription, role, status, daysLeft, can } = useOffice();
  const { data: members } = useMembers(office?.id || '');
  const { data: plan } = usePlan(subscription?.plan_id);
  const active = (members || []).filter((m) => m.is_active).length;
  const seats = plan ? Object.values(plan.seats).reduce((a, b) => a + (Number(b) || 0), 0) + Object.values(subscription?.extra_seats || {}).reduce((a, b) => a + (Number(b) || 0), 0) : 0;

  return (
    <div className="space-y-6">
      <PageHeader title={`أهلاً ${membership?.full_name || ''}`} subtitle={`${office?.name} — ${role ? ROLE_LABEL[role] : ''}`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="brand" label="حالة الاشتراك" value={status ? STATUS_LABEL[status] : '—'} sub={subscription ? `ينتهي ${fmtDate(subscription.current_period_end)}` : ''} />
        <Stat label="أيام متبقية" value={Math.max(daysLeft, 0)} />
        <Stat label="الحسابات المستخدمة" value={<>{active}<span className="text-base text-slate-400"> / {seats || '—'}</span></>} />
        <Stat label="حد المناديب النشطين" value={subscription?.max_active_couriers ?? plan?.max_active_couriers ?? '—'} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {MODULES.map((m) => {
          const Icon = MODULE_ICON[m];
          const enabled = can(m);
          const inPlan = subscription?.modules?.includes(m);
          return (
            <div key={m} className={`card space-y-3 p-5 ${enabled ? '' : 'opacity-60'}`}>
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-200">
                  <Icon className="h-5 w-5" />
                </div>
                {!inPlan ? <Badge><Lock className="h-3 w-3" /> مش ضمن الاشتراك</Badge> : !enabled ? <Badge>مش متاح لدورك</Badge> : <Badge tone="green">شغال</Badge>}
              </div>
              <h3 className="font-extrabold text-brand-800 dark:text-brand-100">{MODULE_LABEL[m]}</h3>
              <p className="text-sm leading-relaxed text-slate-500">{MODULE_DESC[m]}</p>
              {enabled && <Link to={`/app/${m}`} className="inline-block text-sm font-bold text-brand-600 hover:underline">فتح القسم ←</Link>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ComingSoon({ module }: { module: AppModule }) {
  const Icon = MODULE_ICON[module];
  return (
    <div className="space-y-6">
      <PageHeader title={MODULE_LABEL[module]} />
      <div className="card">
        <Empty icon={<Construction className="h-12 w-12" />} title={`قسم ${MODULE_LABEL[module]} تحت التطوير`}>
          <p className="max-w-md text-sm">{MODULE_DESC[module]}</p>
          <Icon className="mt-2 h-6 w-6 text-gold-500" />
        </Empty>
      </div>
    </div>
  );
}

export function TeamPage() {
  const { office, subscription, writable } = useOffice();
  const { user } = useAuth();
  if (!office) return <Spinner />;
  return (
    <div className="space-y-6">
      <PageHeader title="الفريق والحسابات" subtitle="كل دور ليه عدد حسابات حسب الاشتراك. الحساب الموقوف بيفضّي مكانه لحد تاني." />
      <MembersManager officeId={office.id} subscription={subscription} canEdit={writable} currentUserId={user?.id} />
    </div>
  );
}

export function OfficeSettingsPage() {
  const { office, writable } = useOffice();
  const { reload } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', phone: '', city: '' });
  useEffect(() => {
    if (office) setForm({ name: office.name, phone: office.phone || '', city: office.city || '' });
  }, [office]);
  const mut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('offices').update({ name: form.name.trim(), phone: form.phone.trim() || null, city: form.city.trim() || null }).eq('id', office!.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('row-level security');
    },
    onSuccess: async () => {
      await reload();
      toast('اتحفظت بيانات المكتب.', 'success');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title="بيانات المكتب" />
      <Card>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-4">
          <Field label="اسم المكتب" required htmlFor="o_name"><input id="o_name" required className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!writable} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="رقم التليفون" htmlFor="o_phone"><input id="o_phone" dir="ltr" className="field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!writable} /></Field>
            <Field label="المدينة" htmlFor="o_city"><input id="o_city" className="field" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} disabled={!writable} /></Field>
          </div>
          <Button type="submit" loading={mut.isPending} disabled={!writable || !form.name.trim()}>حفظ</Button>
        </form>
      </Card>
      <WhatsAppTemplatesCard />
    </div>
  );
}

function WhatsAppTemplatesCard() {
  const { office, role, writable } = useOffice();
  const canEdit = writable && role === 'owner';
  const toast = useToast();
  const qc = useQueryClient();
  const { data: settings } = useOfficeSettings(office?.id);
  const [t, setT] = useState<Record<WaKey, string>>(WA_DEFAULTS);
  useEffect(() => { if (settings) setT({ ...WA_DEFAULTS, ...settings.wa_templates }); }, [settings]);
  const save = useMutation({
    mutationFn: async () => {
      const custom = Object.fromEntries((Object.keys(t) as WaKey[]).filter((k) => t[k].trim() && t[k].trim() !== WA_DEFAULTS[k]).map((k) => [k, t[k].trim()]));
      const { error } = await supabase.from('office_settings').upsert({
        office_id: office!.id, apply_enabled: settings?.apply_enabled ?? false, apply_intro: settings?.apply_intro ?? null, wa_templates: custom, updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['office-settings'] }); toast('اتحفظت الرسائل.', 'success'); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <Card title="رسائل واتساب الجاهزة">
      <div className="space-y-4">
        {(Object.keys(WA_LABEL) as WaKey[]).map((k) => (
          <Field key={k} label={WA_LABEL[k]} htmlFor={`wa_${k}`} hint={`المتغيرات: ${WA_VARS[k].join(' ')}`}>
            <textarea id={`wa_${k}`} rows={k === 'payslip' ? 4 : 3} className="field" value={t[k]} disabled={!canEdit} onChange={(e) => setT({ ...t, [k]: e.target.value })} />
          </Field>
        ))}
        {canEdit && (
          <div className="flex gap-2">
            <Button loading={save.isPending} onClick={() => save.mutate()}>حفظ الرسائل</Button>
            <Button variant="ghost" onClick={() => setT(WA_DEFAULTS)}>رجوع للرسائل الأصلية</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export function usePayments(officeId?: string) {
  return useQuery({
    queryKey: ['payments', officeId],
    enabled: Boolean(officeId),
    queryFn: async () => {
      const { data, error } = await supabase.from('subscription_payments').select('*').eq('office_id', officeId!).order('paid_at', { ascending: false });
      if (error) throw error;
      return data as Payment[];
    },
  });
}

export function PaymentsTable({ officeId }: { officeId: string }) {
  const { data, isLoading } = usePayments(officeId);
  if (isLoading) return <Spinner />;
  return (
    <Table head={['التاريخ', 'المبلغ', 'الطريقة', 'المدة', 'الفترة', 'مرجع']} empty={!data?.length && <Empty title="مفيش مدفوعات مسجلة" />}>
      {(data || []).map((p) => (
        <tr key={p.id}>
          <td className="whitespace-nowrap px-4 py-3">{fmtDateTime(p.paid_at)}</td>
          <td className="tabular px-4 py-3 font-bold">{money(p.amount)} ج.م</td>
          <td className="px-4 py-3">{p.method}</td>
          <td className="px-4 py-3">{p.months} شهر</td>
          <td className="whitespace-nowrap px-4 py-3">{fmtDate(p.period_start)} ← {fmtDate(p.period_end)}</td>
          <td className="px-4 py-3 text-slate-500">{p.reference || '—'}</td>
        </tr>
      ))}
    </Table>
  );
}

export function SubscriptionPage() {
  const { office, subscription, daysLeft } = useOffice();
  const { data: plan } = usePlan(subscription?.plan_id);
  if (!office || !subscription) return <Spinner />;
  return (
    <div className="space-y-6">
      <PageHeader title="الاشتراك" subtitle="للتجديد أو زيادة الحسابات كلم فريق Masar Pro." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="brand" label="الحالة" value={STATUS_LABEL[subscription.status]} />
        <Stat label="الاشتراك الشهري" value={`${money(subscription.monthly_price)}`} sub="جنيه" />
        <Stat label="ينتهي في" value={fmtDate(subscription.current_period_end)} sub={`${Math.max(daysLeft, 0)} يوم`} />
        <Stat label="الباقة" value={plan?.name?.replace('Masar Pro ', '') || subscription.plan_id} />
      </div>
      <Card title="الأقسام المفعّلة">
        <div className="flex flex-wrap gap-2">
          {MODULES.map((m) => (
            <Badge key={m} tone={subscription.modules.includes(m) ? 'green' : 'slate'}>{MODULE_LABEL[m]}</Badge>
          ))}
          <Badge tone={STATUS_TONE[subscription.status]}>{STATUS_LABEL[subscription.status]}</Badge>
        </div>
      </Card>
      <Card title="المدفوعات" className="overflow-hidden [&>div:last-child]:p-0">
        <PaymentsTable officeId={office.id} />
      </Card>
    </div>
  );
}
