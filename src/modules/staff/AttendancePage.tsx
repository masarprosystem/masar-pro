import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/core/supabase';
import { useOffice } from '@/core/office';
import { errorMessage } from '@/core/errors';
import { useToast } from '@/core/toast';
import { useMembers } from '@/components/MembersManager';
import { Button, Field, Modal, PageHeader, Spinner } from '@/components/ui';
import { useMonth } from '@/modules/payroll/api';
import { MonthBar } from '@/modules/payroll/shared';
import { useAttendance, useHolidays, useProfiles } from './api';
import { ATT_LABEL, DOW_SHORT, cairoTime, cairoToday, daysInMonth, dowOf, type AttStatus, type Attendance, type StaffProfile } from './model';

/** وقت بتوقيت القاهرة (يوم + ساعة) ← ISO */
function cairoToIso(day: string, hhmm: string) {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const local = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
  const asUtc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }));
  const offset = local.getTime() - asUtc.getTime();
  return new Date(guess - offset).toISOString();
}
const lateOf = (hhmm: string, start: string) => {
  const [a, b] = hhmm.split(':').map(Number);
  const [c, d] = start.slice(0, 5).split(':').map(Number);
  return Math.max(0, a * 60 + b - (c * 60 + d));
};

export function AttendancePage() {
  const { office, role, writable } = useOffice();
  const canEdit = writable && (role === 'owner' || role === 'accountant');
  const [month, setMonth] = useMonth();
  const { data: members } = useMembers(office?.id || '');
  const { data: rows, isLoading } = useAttendance(office?.id, month);
  const { data: profiles } = useProfiles(office?.id);
  const { data: holidays } = useHolidays(office?.id);
  const [edit, setEdit] = useState<{ memberId: string; day: string; row: Attendance | null } | null>(null);
  const days = daysInMonth(month);
  const today = cairoToday();
  const holidaySet = useMemo(() => new Set((holidays || []).map((h) => h.day)), [holidays]);
  const byKey = useMemo(() => Object.fromEntries((rows || []).map((r) => [`${r.member_id}|${r.day}`, r])), [rows]);
  const list = (members || []).filter((m) => m.is_active || (rows || []).some((r) => r.member_id === m.id));

  const cell = (p: StaffProfile | undefined, memberId: string, day: string) => {
    const a = byKey[`${memberId}|${day}`];
    const workday = (p?.work_days || [0, 1, 2, 3, 4, 6]).includes(dowOf(day)) && !holidaySet.has(day);
    const future = day > today;
    if (a?.status === 'leave') return { t: 'إ', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300', title: 'إجازة' };
    if (a?.status === 'holiday' || holidaySet.has(day)) return { t: '·', cls: 'bg-slate-100 text-slate-400 dark:bg-slate-800', title: 'إجازة رسمية' };
    if (a?.check_in) {
      const late = a.late_minutes > (p?.late_grace_minutes ?? 15);
      return { t: late ? 'ت' : '✓', cls: late ? 'bg-gold-100 text-gold-700' : 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200', title: `${cairoTime(a.check_in)} – ${cairoTime(a.check_out)}${late ? ` · متأخر ${a.late_minutes} د` : ''}` };
    }
    if (!workday) return { t: '', cls: 'bg-slate-50 dark:bg-white/5', title: 'مش يوم شغل' };
    if (future || !p || (p.hire_date && day < p.hire_date)) return { t: '', cls: '', title: p ? '' : 'الموظف لسه من غير ملف' };
    return { t: 'غ', cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300', title: 'غياب' };
  };

  return (
    <div className="space-y-5">
      <PageHeader title="سجل الحضور" subtitle="✓ حضر في الميعاد · ت متأخر · غ غياب · إ إجازة" actions={<MonthBar month={month} onChange={setMonth} prefix="حضور" />} />
      {isLoading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="text-center text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-white/5">
                <th className="sticky right-0 z-10 min-w-[150px] bg-slate-50 px-3 py-2 text-right dark:bg-[#16231e]">الموظف</th>
                {days.map((d) => (
                  <th key={d} className={`min-w-[30px] px-0.5 py-2 font-bold ${d === today ? 'text-brand-600' : 'text-slate-500'}`}>
                    <div>{Number(d.slice(8))}</div><div className="text-[9px] font-normal">{DOW_SHORT[dowOf(d)]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const p = profiles?.find((x) => x.member_id === m.id);
                return (
                  <tr key={m.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="sticky right-0 z-10 bg-white px-3 py-1.5 text-right font-bold dark:bg-[#121d19]"><Link to={`/app/staff/members/${m.id}?m=${month}`} className="hover:text-brand-600">{m.full_name || m.email}</Link></td>
                    {days.map((d) => {
                      const c = cell(p, m.id, d);
                      return (
                        <td key={d} className="p-0.5">
                          <button
                            type="button"
                            title={c.title}
                            disabled={!canEdit}
                            onClick={() => setEdit({ memberId: m.id, day: d, row: byKey[`${m.id}|${d}`] || null })}
                            className={`h-7 w-7 rounded text-[11px] font-bold ${c.cls} ${canEdit ? 'hover:ring-2 hover:ring-brand-400' : 'cursor-default'}`}
                          >
                            {c.t}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <EditModal
          {...edit}
          name={list.find((m) => m.id === edit.memberId)?.full_name || ''}
          profile={profiles?.find((x) => x.member_id === edit.memberId)}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}

function EditModal({ memberId, day, row, name, profile, onClose }: { memberId: string; day: string; row: Attendance | null; name: string; profile?: StaffProfile; onClose: () => void }) {
  const { office } = useOffice();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({
    status: (row?.status || 'present') as AttStatus,
    in: row?.check_in ? cairoTime(row.check_in) : (profile?.work_start || '10:00').slice(0, 5),
    out: row?.check_out ? cairoTime(row.check_out) : '',
    notes: row?.notes || '',
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['attendance'] });
    qc.invalidateQueries({ queryKey: ['attendance-today'] });
    qc.invalidateQueries({ queryKey: ['staff-summary'] });
  };
  const save = useMutation({
    mutationFn: async () => {
      const present = f.status === 'present';
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from('attendance').upsert({
        office_id: office!.id, member_id: memberId, day, status: f.status,
        check_in: present && f.in ? cairoToIso(day, f.in) : null,
        check_out: present && f.out ? cairoToIso(day, f.out) : null,
        late_minutes: present && f.in ? lateOf(f.in, profile?.work_start || '10:00') : 0,
        notes: f.notes.trim() || null,
        edited_by: u.user?.id,
      }, { onConflict: 'member_id,day' });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast('اتحفظ.', 'success'); onClose(); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('attendance').delete().eq('id', row!.id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast('اتمسح السجل.', 'success'); onClose(); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`${name} — ${new Date(day + 'T12:00:00Z').toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}`}
      footer={<>{row && <Button variant="danger" loading={del.isPending} onClick={() => del.mutate()}>مسح السجل</Button>}<Button variant="secondary" onClick={onClose}>إلغاء</Button><Button loading={save.isPending} onClick={() => save.mutate()}>حفظ</Button></>}
    >
      <Field label="الحالة" htmlFor="a_status">
        <select id="a_status" className="field" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as AttStatus })}>
          {(Object.keys(ATT_LABEL) as AttStatus[]).map((s) => <option key={s} value={s}>{ATT_LABEL[s]}</option>)}
        </select>
      </Field>
      {f.status === 'present' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="الحضور" htmlFor="a_in"><input id="a_in" type="time" className="field" value={f.in} onChange={(e) => setF({ ...f, in: e.target.value })} /></Field>
          <Field label="الانصراف" htmlFor="a_out"><input id="a_out" type="time" className="field" value={f.out} onChange={(e) => setF({ ...f, out: e.target.value })} /></Field>
        </div>
      )}
      <Field label="ملاحظات" htmlFor="a_notes"><input id="a_notes" className="field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="مثلاً: إذن نص يوم" /></Field>
      {f.status === 'present' && f.in && <p className="text-xs text-slate-500">ميعاد الحضور {(profile?.work_start || '10:00').slice(0, 5)} — التأخير هيتحسب {lateOf(f.in, profile?.work_start || '10:00')} دقيقة.</p>}
    </Modal>
  );
}
