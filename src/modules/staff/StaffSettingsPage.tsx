import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/core/supabase';
import { useOffice } from '@/core/office';
import { errorMessage } from '@/core/errors';
import { ROLE_LABEL, fmtDate } from '@/core/format';
import { useToast } from '@/core/toast';
import { useMembers } from '@/components/MembersManager';
import { Button, Card, Field, PageHeader, Spinner } from '@/components/ui';
import type { Member } from '@/core/types';
import { useHolidays, useProfiles, useStaffSettings } from './api';
import { DOW, RULE_LABEL, type StaffProfile, type StaffSettings } from './model';

export function StaffSettingsPage() {
  const { office, writable, role } = useOffice();
  const canEdit = writable && (role === 'owner' || role === 'accountant');
  const { data: members } = useMembers(office?.id || '');
  const { data: profiles, isLoading } = useProfiles(office?.id);
  return (
    <div className="space-y-6">
      <PageHeader title="إعدادات الموظفين" subtitle="المرتب الثابت والعمولة ومواعيد الشغل لكل موظف، وقاعدة حساب العمولة للمكتب كله." />
      <RulesCard canEdit={canEdit} />
      <div className="space-y-3">
        <h2 className="text-sm font-extrabold text-brand-800 dark:text-brand-200">ملفات الموظفين</h2>
        {isLoading ? <Spinner /> : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {(members || []).filter((m) => m.is_active).map((m) => (
              <ProfileCard key={m.id} member={m} profile={profiles?.find((p) => p.member_id === m.id)} canEdit={canEdit} />
            ))}
          </div>
        )}
      </div>
      <HolidaysCard canEdit={canEdit} />
    </div>
  );
}

function RulesCard({ canEdit }: { canEdit: boolean }) {
  const { office } = useOffice();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useStaffSettings(office?.id);
  const [f, setF] = useState<StaffSettings | null>(null);
  useEffect(() => { if (data) setF(data); }, [data]);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('staff_settings').upsert({ ...f!, office_id: office!.id, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-settings'] }); qc.invalidateQueries({ queryKey: ['staff-summary'] }); toast('اتحفظت الإعدادات.', 'success'); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  if (!f) return <Spinner />;
  return (
    <Card title="قاعدة العمولة والتأخير">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <Field label="العمولة بتتحسب إمتى؟" htmlFor="r_rule" hint="الافتراضي بيحميك من دفع عمولة على مندوب ساب بعد التدريب أو بعد أيام.">
            <select id="r_rule" className="field" value={f.commission_rule} disabled={!canEdit} onChange={(e) => setF({ ...f, commission_rule: e.target.value as StaffSettings['commission_rule'] })}>
              {(Object.keys(RULE_LABEL) as StaffSettings['commission_rule'][]).map((k) => <option key={k} value={k}>{RULE_LABEL[k]}</option>)}
            </select>
          </Field>
        </div>
        {f.commission_rule === 'active_days' && (
          <Field label="عدد الأيام" htmlFor="r_days"><input id="r_days" type="number" min="1" max="120" dir="ltr" className="field" disabled={!canEdit} value={f.commission_days} onChange={(e) => setF({ ...f, commission_days: Number(e.target.value) })} /></Field>
        )}
        <Field label="العمولة الافتراضية (ج.م للمندوب)" htmlFor="r_def"><input id="r_def" type="number" min="0" dir="ltr" className="field" disabled={!canEdit} value={f.default_commission} onChange={(e) => setF({ ...f, default_commission: Number(e.target.value) })} /></Field>
        <Field label="تأخيرات مسموحة في الشهر" htmlFor="r_late" hint="بعدها كل تأخير عليه خصم حسب ملف الموظف"><input id="r_late" type="number" min="0" dir="ltr" className="field" disabled={!canEdit} value={f.allowed_lates} onChange={(e) => setF({ ...f, allowed_lates: Number(e.target.value) })} /></Field>
      </div>
      {canEdit && <div className="mt-4 flex justify-end"><Button loading={save.isPending} onClick={() => save.mutate()}>حفظ</Button></div>}
    </Card>
  );
}

function ProfileCard({ member, profile, canEdit }: { member: Member; profile?: StaffProfile; canEdit: boolean }) {
  const { office } = useOffice();
  const toast = useToast();
  const qc = useQueryClient();
  const init = () => ({
    job_title: profile?.job_title || '',
    base_salary: String(profile?.base_salary ?? ''),
    commission_per_hire: profile?.commission_per_hire == null ? '' : String(profile.commission_per_hire),
    hire_date: profile?.hire_date || '',
    work_start: (profile?.work_start || '10:00').slice(0, 5),
    work_end: (profile?.work_end || '18:00').slice(0, 5),
    work_days: profile?.work_days || [0, 1, 2, 3, 4, 6],
    late_grace_minutes: String(profile?.late_grace_minutes ?? 15),
    late_penalty: String(profile?.late_penalty ?? 0),
  });
  const [f, setF] = useState(init);
  useEffect(() => setF(init()), [profile]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('staff_profiles').upsert({
        member_id: member.id, office_id: office!.id, job_title: f.job_title.trim() || null,
        base_salary: Number(f.base_salary) || 0,
        commission_per_hire: f.commission_per_hire === '' ? null : Number(f.commission_per_hire),
        hire_date: f.hire_date || null, work_start: f.work_start, work_end: f.work_end, work_days: f.work_days,
        late_grace_minutes: Number(f.late_grace_minutes) || 0, late_penalty: Number(f.late_penalty) || 0,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-profiles'] }); qc.invalidateQueries({ queryKey: ['staff-summary'] }); toast(`اتحفظ ملف ${member.full_name || ''}.`, 'success'); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const set = (k: keyof ReturnType<typeof init>) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggleDay = (d: number) => setF((x) => ({ ...x, work_days: x.work_days.includes(d) ? x.work_days.filter((y) => y !== d) : [...x.work_days, d].sort() }));

  return (
    <Card title={<>{member.full_name || member.email} <span className="text-xs font-normal text-slate-500">· {ROLE_LABEL[member.role]}</span></>} actions={!profile && <span className="text-[11px] font-bold text-gold-600">لسه متظبطش</span>}>
      <fieldset disabled={!canEdit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="الوظيفة" htmlFor={`jt_${member.id}`}><input id={`jt_${member.id}`} className="field" value={f.job_title} onChange={set('job_title')} placeholder={ROLE_LABEL[member.role]} /></Field>
          <Field label="المرتب الثابت" htmlFor={`bs_${member.id}`}><input id={`bs_${member.id}`} type="number" min="0" dir="ltr" className="field" value={f.base_salary} onChange={set('base_salary')} /></Field>
          <Field label="عمولة المندوب" htmlFor={`cm_${member.id}`} hint="فاضي = الافتراضي"><input id={`cm_${member.id}`} type="number" min="0" dir="ltr" className="field" value={f.commission_per_hire} onChange={set('commission_per_hire')} /></Field>
          <Field label="تاريخ التعيين" htmlFor={`hd_${member.id}`}><input id={`hd_${member.id}`} type="date" className="field" value={f.hire_date} onChange={set('hire_date')} /></Field>
          <Field label="ميعاد الحضور" htmlFor={`ws_${member.id}`}><input id={`ws_${member.id}`} type="time" className="field" value={f.work_start} onChange={set('work_start')} /></Field>
          <Field label="ميعاد الانصراف" htmlFor={`we_${member.id}`}><input id={`we_${member.id}`} type="time" className="field" value={f.work_end} onChange={set('work_end')} /></Field>
          <Field label="سماح التأخير (دقيقة)" htmlFor={`lg_${member.id}`}><input id={`lg_${member.id}`} type="number" min="0" dir="ltr" className="field" value={f.late_grace_minutes} onChange={set('late_grace_minutes')} /></Field>
          <Field label="خصم التأخيرة" htmlFor={`lp_${member.id}`}><input id={`lp_${member.id}`} type="number" min="0" dir="ltr" className="field" value={f.late_penalty} onChange={set('late_penalty')} /></Field>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">أيام الشغل</p>
          <div className="flex flex-wrap gap-1.5">
            {[6, 0, 1, 2, 3, 4, 5].map((d) => (
              <button key={d} type="button" onClick={() => toggleDay(d)} className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${f.work_days.includes(d) ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200' : 'border-slate-200 text-slate-400 dark:border-slate-700'}`}>{DOW[d]}</button>
            ))}
          </div>
        </div>
      </fieldset>
      {canEdit && <div className="mt-3 flex justify-end"><Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>حفظ الملف</Button></div>}
    </Card>
  );
}

function HolidaysCard({ canEdit }: { canEdit: boolean }) {
  const { office } = useOffice();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useHolidays(office?.id);
  const [f, setF] = useState({ day: '', name: '' });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('office_holidays').insert({ office_id: office!.id, day: f.day, name: f.name.trim() });
      if (error) throw error;
    },
    onSuccess: () => { setF({ day: '', name: '' }); qc.invalidateQueries({ queryKey: ['holidays'] }); qc.invalidateQueries({ queryKey: ['staff-summary'] }); toast('اتضافت الإجازة.', 'success'); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('office_holidays').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['holidays'] }); qc.invalidateQueries({ queryKey: ['staff-summary'] }); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <Card title="الإجازات الرسمية" actions={<span className="text-xs text-slate-500">مش بتتحسب غياب لحد</span>}>
      {canEdit && (
        <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }} className="mb-4 flex flex-wrap gap-2">
          <input type="date" required className="field !w-auto" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} aria-label="اليوم" />
          <input required className="field !w-60" placeholder="مثلاً: عيد الأضحى" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="الاسم" />
          <Button type="submit" loading={add.isPending}><Plus className="h-4 w-4" /> إضافة</Button>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        {(data || []).map((h) => (
          <span key={h.id} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700">
            <b>{h.name}</b> {fmtDate(h.day)}
            {canEdit && <button onClick={() => del.mutate(h.id)} aria-label="مسح" className="text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>}
          </span>
        ))}
        {!data?.length && <p className="text-sm text-slate-500">مفيش إجازات متسجلة.</p>}
      </div>
    </Card>
  );
}
