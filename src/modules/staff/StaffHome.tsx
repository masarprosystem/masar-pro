import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, LogIn, LogOut, MapPin } from 'lucide-react';
import { supabase } from '@/core/supabase';
import { useOffice } from '@/core/office';
import { errorMessage } from '@/core/errors';
import { ROLE_LABEL, money } from '@/core/format';
import { useToast } from '@/core/toast';
import { useMembers } from '@/components/MembersManager';
import { Badge, Button, Card, PageHeader, Spinner, Stat, Table } from '@/components/ui';
import { thisMonth, monthLabel } from '@/modules/payroll/model';
import { useProfiles, useSummary, useTodayAttendance } from './api';
import { cairoTime, cairoToday, hoursBetween, type Attendance } from './model';

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 6000, maximumAge: 60_000 },
    );
  });
}

export function StaffHome() {
  const { office, membership, role } = useOffice();
  const today = cairoToday();
  const { data: todayRows, isLoading } = useTodayAttendance(office?.id, today);
  const mine = todayRows?.find((a) => a.member_id === membership?.id) || null;
  const isMonitor = role === 'owner' || role === 'accountant' || role === 'operations';

  return (
    <div className="space-y-6">
      <PageHeader title="الحضور والانصراف" subtitle={new Date().toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long' })} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {isLoading ? <Spinner /> : <PunchCard mine={mine} />}
        <div className="lg:col-span-2"><MyMonth /></div>
      </div>
      {isMonitor && <TeamToday rows={todayRows || []} />}
    </div>
  );
}

function PunchCard({ mine }: { mine: Attendance | null }) {
  const { office } = useOffice();
  const toast = useToast();
  const qc = useQueryClient();
  const [locating, setLocating] = useState(false);
  const done = Boolean(mine?.check_in && mine?.check_out);
  const checkedIn = Boolean(mine?.check_in && !mine?.check_out);

  const punch = useMutation({
    mutationFn: async () => {
      setLocating(true);
      const pos = await getPosition();
      setLocating(false);
      const { data, error } = await supabase.rpc('attendance_punch', { p_office: office!.id, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null });
      if (error) throw error;
      return data as Attendance;
    },
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['attendance-today'] });
      qc.invalidateQueries({ queryKey: ['attendance'] });
      qc.invalidateQueries({ queryKey: ['staff-summary'] });
      toast(a.check_out ? `اتسجل انصرافك ${cairoTime(a.check_out)}` : `اتسجل حضورك ${cairoTime(a.check_in)}${a.late_minutes > 0 ? ` (متأخر ${a.late_minutes} دقيقة)` : ''}`, 'success');
    },
    onError: (e) => { setLocating(false); toast(errorMessage(e), 'error'); },
  });

  return (
    <div className="card flex flex-col items-center gap-4 p-6 text-center">
      <div className={`flex h-16 w-16 items-center justify-center rounded-full ${done ? 'bg-slate-100 text-slate-500 dark:bg-slate-800' : checkedIn ? 'bg-gold-50 text-gold-600' : 'bg-brand-50 text-brand-600 dark:bg-brand-900/40'}`}>
        <Clock className="h-8 w-8" />
      </div>
      <div>
        <p className="text-sm font-bold text-slate-500">{done ? 'خلصت يومك' : checkedIn ? 'إنت في الشغل دلوقتي' : mine?.status === 'leave' ? 'النهارده إجازة' : 'لسه مسجلتش حضور'}</p>
        {mine?.check_in && (
          <p className="tabular mt-1 text-sm">
            حضور <b>{cairoTime(mine.check_in)}</b>{mine.check_out && <> · انصراف <b>{cairoTime(mine.check_out)}</b> · {hoursBetween(mine.check_in, mine.check_out)} ساعة</>}
          </p>
        )}
        {mine && mine.late_minutes > 0 && <p className="mt-1 text-xs font-bold text-gold-600">متأخر {mine.late_minutes} دقيقة</p>}
      </div>
      {!done && mine?.status !== 'leave' && (
        <Button className="w-full !py-4 !text-base" variant={checkedIn ? 'gold' : 'primary'} loading={punch.isPending} onClick={() => punch.mutate()}>
          {checkedIn ? <><LogOut className="h-5 w-5" /> تسجيل انصراف</> : <><LogIn className="h-5 w-5" /> تسجيل حضور</>}
        </Button>
      )}
      <p className="flex items-center gap-1 text-[11px] text-slate-400"><MapPin className="h-3 w-3" /> {locating ? 'بنحدد مكانك...' : 'الموقع بيتسجل مع الحضور لو سمحت بيه'}</p>
    </div>
  );
}

function MyMonth() {
  const { office, membership } = useOffice();
  const month = thisMonth();
  const { data, isLoading } = useSummary(office?.id, month);
  const me = data?.find((r) => r.member_id === membership?.id);
  if (isLoading) return <Spinner />;
  if (!me) return null;
  return (
    <Card title={`شهري — ${monthLabel(month)}`} actions={<Link to="/app/staff/members/me" className="text-xs font-bold text-brand-600 hover:underline">التفاصيل والعمولات ←</Link>}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="أيام حضور" value={`${me.present_days}`} sub={`من ${me.work_days} يوم شغل لحد النهارده`} />
        <Stat label="غياب" value={<span className={me.absent_days ? 'text-red-600' : ''}>{me.absent_days}</span>} />
        <Stat label="تأخير" value={<span className={me.late_count > me.allowed_lates ? 'text-gold-600' : ''}>{me.late_count}</span>} sub={`المسموح ${me.allowed_lates}`} />
        <Stat label="عمولات التعيين" value={<span className="text-brand-600">{me.commission_count}</span>} sub={`${money(me.commission_amount)} ج.م`} />
      </div>
      {me.has_profile && me.base_salary > 0 && (
        <p className="mt-4 rounded-lg bg-brand-50 p-3 text-sm dark:bg-brand-900/30">
          مرتبك المتوقع لحد النهارده: <b className="tabular text-brand-700 dark:text-brand-200">{money(me.net)} ج.م</b>
          <span className="text-xs text-slate-500"> (الثابت {money(me.base_salary)} + العمولات {money(me.commission_amount)}{me.absence_deduction + me.late_deduction > 0 ? ` − خصم غياب وتأخير ${money(me.absence_deduction + me.late_deduction)}` : ''})</span>
        </p>
      )}
    </Card>
  );
}

function TeamToday({ rows }: { rows: Attendance[] }) {
  const { office, role } = useOffice();
  const canOpen = role === 'owner' || role === 'accountant';
  const { data: members } = useMembers(office?.id || '');
  const { data: profiles } = useProfiles(office?.id);
  const dow = new Date(cairoToday() + 'T12:00:00Z').getUTCDay();
  const list = useMemo(() => (members || []).filter((m) => m.is_active).map((m) => {
    const a = rows.find((r) => r.member_id === m.id);
    const p = profiles?.find((x) => x.member_id === m.id);
    const workday = (p?.work_days || [0, 1, 2, 3, 4, 6]).includes(dow);
    return { m, a, p, workday };
  }), [members, rows, profiles, dow]);
  const present = list.filter((x) => x.a?.check_in).length;
  const late = list.filter((x) => x.a?.check_in && x.a.late_minutes > (x.p?.late_grace_minutes ?? 15)).length;
  const missing = list.filter((x) => x.p && x.workday && !x.a?.check_in && x.a?.status !== 'leave').length;

  return (
    <Card title="الفريق النهارده" actions={<div className="flex gap-2"><Badge tone="green">حاضر {present}</Badge><Badge tone="gold">متأخر {late}</Badge><Badge tone="red">لسه مجاش {missing}</Badge></div>} className="overflow-hidden [&>div:last-child]:p-0">
      <Table head={['الموظف', 'الدور', 'الحضور', 'الانصراف', 'الحالة']}>
        {list.map(({ m, a, p, workday }) => {
          const isLate = a?.check_in && a.late_minutes > (p?.late_grace_minutes ?? 15);
          return (
            <tr key={m.id}>
              <td className="px-4 py-3 font-bold">{canOpen ? <Link to={`/app/staff/members/${m.id}`} className="hover:text-brand-600">{m.full_name || m.email}</Link> : m.full_name || m.email}</td>
              <td className="px-4 py-3 text-xs">{ROLE_LABEL[m.role]}</td>
              <td className="tabular px-4 py-3">{cairoTime(a?.check_in || null)}</td>
              <td className="tabular px-4 py-3">{cairoTime(a?.check_out || null)}</td>
              <td className="px-4 py-3">
                {a?.status === 'leave' ? <Badge tone="blue">إجازة</Badge>
                  : a?.check_in ? (isLate ? <Badge tone="gold">متأخر {a.late_minutes} د</Badge> : <Badge tone="green">في الميعاد</Badge>)
                  : !p ? <Badge>من غير ملف</Badge> : workday ? <Badge tone="red">لسه مجاش</Badge> : <Badge>مش يوم شغله</Badge>}
              </td>
            </tr>
          );
        })}
      </Table>
    </Card>
  );
}
