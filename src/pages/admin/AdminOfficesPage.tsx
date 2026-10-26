import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Search } from 'lucide-react';
import { supabase } from '@/core/supabase';
import { createMember } from '@/core/functions';
import { errorMessage } from '@/core/errors';
import { STATUSES, STATUS_LABEL, STATUS_TONE, fmtDate, fmtDateTime, generatePassword, money } from '@/core/format';
import { useToast } from '@/core/toast';
import type { OfficeOverview, SubscriptionStatus } from '@/core/types';
import { Badge, Button, Empty, Field, Modal, PageHeader, Spinner, Stat, Table } from '@/components/ui';
import { ExportButton } from '@/components/ExportButton';

export function useOverview() {
  return useQuery({
    queryKey: ['admin-overview'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_offices_overview');
      if (error) throw error;
      return data as OfficeOverview[];
    },
  });
}

export function AdminOfficesPage() {
  const { data, isLoading, error } = useOverview();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<SubscriptionStatus | ''>('');
  const [creating, setCreating] = useState(false);

  const rows = useMemo(
    () =>
      (data || []).filter(
        (o) =>
          (!status || o.status === status) &&
          (!q || [o.office_name, o.city, o.phone, o.owner_email].some((v) => String(v || '').toLowerCase().includes(q.toLowerCase()))),
      ),
    [data, q, status],
  );
  const all = data || [];
  const count = (s: SubscriptionStatus[]) => all.filter((o) => s.includes(o.status)).length;
  const mrr = all.filter((o) => o.status === 'active' || o.status === 'past_due').reduce((s, o) => s + Number(o.monthly_price), 0);
  const expiringSoon = all.filter((o) => (o.status === 'active' || o.status === 'trial') && o.days_left <= 7).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="المكاتب والاشتراكات"
        subtitle="كل المكاتب المشتركة في Masar Pro"
        actions={<>
          <ExportButton fileName="المكاتب" rows={data || []} cols={[
            { header: 'المكتب', value: (o) => o.office_name }, { header: 'المدينة', value: (o) => o.city }, { header: 'التليفون', value: (o) => o.phone },
            { header: 'صاحب المكتب', value: (o) => o.owner_email }, { header: 'الحالة', value: (o) => STATUS_LABEL[o.status] }, { header: 'ينتهي', value: (o) => o.current_period_end },
            { header: 'الحسابات', value: (o) => `${o.members_active}/${o.seats_total}` }, { header: 'الاشتراك الشهري', value: (o) => Number(o.monthly_price) }, { header: 'آخر نشاط', value: (o) => o.last_activity },
          ]} />
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> مكتب جديد</Button>
        </>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat tone="brand" label="الدخل الشهري المتكرر" value={money(mrr)} sub="جنيه / شهر" />
        <Stat label="مكاتب نشطة" value={count(['active'])} />
        <Stat label="فترة تجريبية" value={count(['trial'])} />
        <Stat label="متأخر / موقوف" value={<span className="text-red-600">{count(['past_due', 'suspended'])}</span>} />
        <Stat label="بتنتهي خلال 7 أيام" value={<span className="text-gold-600">{expiringSoon}</span>} />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3 dark:border-slate-800">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" />
            <input className="field pr-9" placeholder="بحث بالاسم أو المدينة أو الإيميل" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
          </div>
          <select className="field !w-auto" value={status} onChange={(e) => setStatus(e.target.value as SubscriptionStatus | '')} aria-label="الحالة">
            <option value="">كل الحالات</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        {isLoading ? (
          <Spinner />
        ) : error ? (
          <p className="p-6 text-sm font-bold text-red-600">{errorMessage(error)}</p>
        ) : (
          <Table
            head={['المكتب', 'صاحب المكتب', 'الحالة', 'ينتهي', 'الحسابات', 'الاشتراك', 'آخر نشاط']}
            empty={!rows.length && <Empty icon={<Building2 className="h-10 w-10" />} title="مفيش مكاتب" />}
          >
            {rows.map((o) => (
              <tr key={o.office_id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => nav(`/admin/offices/${o.office_id}`)}>
                <td className="px-4 py-3"><p className="font-bold">{o.office_name}</p><p className="text-xs text-slate-500">{o.city || '—'}</p></td>
                <td className="px-4 py-3 text-xs" dir="ltr" style={{ textAlign: 'right' }}>{o.owner_email || <span className="text-red-500">بدون صاحب</span>}</td>
                <td className="px-4 py-3"><Badge tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Badge></td>
                <td className="whitespace-nowrap px-4 py-3"><p>{fmtDate(o.current_period_end)}</p><p className={`text-xs ${o.days_left < 0 ? 'text-red-600' : o.days_left <= 7 ? 'text-gold-600' : 'text-slate-500'}`}>{o.days_left} يوم</p></td>
                <td className="tabular px-4 py-3">{o.members_active} / {o.seats_total}</td>
                <td className="tabular px-4 py-3 font-bold">{money(o.monthly_price)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{fmtDateTime(o.last_activity)}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <CreateOfficeModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => nav(`/admin/offices/${id}`)} />
    </div>
  );
}

function CreateOfficeModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const blank = () => ({ name: '', phone: '', city: '', trial_days: '14', price: '1999', owner_name: '', owner_email: '', owner_phone: '', owner_password: generatePassword() });
  const [f, setF] = useState(blank);
  const set = (k: keyof ReturnType<typeof blank>) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const mut = useMutation({
    mutationFn: async () => {
      const { data: officeId, error } = await supabase.rpc('admin_create_office', {
        p_name: f.name.trim(),
        p_phone: f.phone.trim() || null,
        p_city: f.city.trim() || null,
        p_plan: 'standard',
        p_trial_days: Number(f.trial_days) || 0,
        p_monthly_price: Number(f.price) || null,
      });
      if (error) throw error;
      try {
        await createMember({ office_id: officeId as string, email: f.owner_email.trim().toLowerCase(), password: f.owner_password, full_name: f.owner_name.trim(), phone: f.owner_phone.trim(), role: 'owner' });
      } catch (e) {
        toast(`المكتب اتعمل، بس حساب صاحب المكتب متعملش: ${errorMessage(e)}. تقدر تضيفه من صفحة المكتب.`, 'error');
      }
      return officeId as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      const text = `أهلاً بيك في Masar Pro\nالرابط: ${window.location.origin}\nالإيميل: ${f.owner_email.trim().toLowerCase()}\nكلمة السر: ${f.owner_password}`;
      navigator.clipboard?.writeText(text).catch(() => {});
      toast('اتعمل المكتب، واتنسخت بيانات دخول صاحبه.', 'success');
      setF(blank());
      onClose();
      onCreated(id);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const valid = f.name.trim() && f.owner_name.trim() && /\S+@\S+\.\S+/.test(f.owner_email) && f.owner_password.length >= 8;

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="إضافة مكتب جديد"
      footer={<><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button loading={mut.isPending} disabled={!valid} onClick={() => mut.mutate()}>إنشاء المكتب</Button></>}
    >
      <p className="text-xs font-extrabold text-gold-600">بيانات المكتب</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="اسم المكتب" required htmlFor="c_name"><input id="c_name" className="field" value={f.name} onChange={set('name')} /></Field>
        <Field label="التليفون" htmlFor="c_phone"><input id="c_phone" dir="ltr" className="field" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="المدينة" htmlFor="c_city"><input id="c_city" className="field" value={f.city} onChange={set('city')} /></Field>
        <Field label="أيام التجربة" htmlFor="c_trial"><input id="c_trial" type="number" min="0" dir="ltr" className="field" value={f.trial_days} onChange={set('trial_days')} /></Field>
        <Field label="الاشتراك الشهري (ج.م)" htmlFor="c_price"><input id="c_price" type="number" min="0" dir="ltr" className="field" value={f.price} onChange={set('price')} /></Field>
      </div>
      <p className="pt-2 text-xs font-extrabold text-gold-600">حساب صاحب المكتب</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="الاسم" required htmlFor="c_oname"><input id="c_oname" className="field" value={f.owner_name} onChange={set('owner_name')} /></Field>
        <Field label="الموبايل" htmlFor="c_ophone"><input id="c_ophone" dir="ltr" className="field" value={f.owner_phone} onChange={set('owner_phone')} /></Field>
        <Field label="الإيميل" required htmlFor="c_oemail"><input id="c_oemail" type="email" dir="ltr" className="field" value={f.owner_email} onChange={set('owner_email')} /></Field>
        <Field label="كلمة سر مبدئية" required htmlFor="c_opass">
          <div className="flex gap-2">
            <input id="c_opass" dir="ltr" className="field font-mono" value={f.owner_password} onChange={set('owner_password')} />
            <Button variant="secondary" onClick={() => setF((x) => ({ ...x, owner_password: generatePassword() }))}>توليد</Button>
          </div>
        </Field>
      </div>
    </Modal>
  );
}
