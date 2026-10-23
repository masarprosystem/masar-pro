import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useOffice } from '@/core/office';
import { ROLE_LABEL, fmtDate, money } from '@/core/format';
import { useMembers } from '@/components/MembersManager';
import { Badge, Card, Empty, PageHeader, Spinner, Table } from '@/components/ui';
import { useMonth } from '@/modules/payroll/api';
import { monthLabel } from '@/modules/payroll/model';
import { MonthBar } from '@/modules/payroll/shared';
import { useAttendance, useCommissions, usePayslips, useProfiles, useSummary } from './api';
import { ATT_LABEL, DOW, cairoTime, dowOf, hoursBetween } from './model';
import { SlipBody } from './StaffPayrollPage';

export function MemberPage() {
  const { id = 'me' } = useParams();
  const { office, membership, role } = useOffice();
  const manager = role === 'owner' || role === 'accountant';
  const memberId = id === 'me' ? membership?.id : id;
  const [month, setMonth] = useMonth();
  const { data: members } = useMembers(office?.id || '');
  const { data: profiles } = useProfiles(office?.id);
  const { data: summary, isLoading } = useSummary(office?.id, month);
  const { data: commissions } = useCommissions(office?.id, month, memberId);
  const { data: attendance } = useAttendance(office?.id, month, memberId);
  const { data: slips } = usePayslips(office?.id, memberId);

  if (!memberId) return <Spinner />;
  if (!manager && memberId !== membership?.id) return <Navigate to="/app/staff/members/me" replace />;
  const m = members?.find((x) => x.id === memberId);
  const p = profiles?.find((x) => x.member_id === memberId);
  const row = summary?.find((r) => r.member_id === memberId);

  return (
    <div className="space-y-5">
      {manager && <Link to={`/app/staff/payroll?m=${month}`} className="inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:underline"><ArrowRight className="h-4 w-4" /> مرتبات الموظفين</Link>}
      <PageHeader
        title={m?.full_name || m?.email || 'ملفي'}
        subtitle={[p?.job_title || (m ? ROLE_LABEL[m.role] : ''), p?.hire_date ? `من ${fmtDate(p.hire_date)}` : null, p ? `الشغل \u2066${p.work_start.slice(0, 5)} – ${p.work_end.slice(0, 5)}\u2069` : null].filter(Boolean).join(' · ')}
        actions={<MonthBar month={month} onChange={setMonth} prefix="شهر" />}
      />
      {!p && <p className="rounded-lg bg-gold-50 p-3 text-sm font-bold text-gold-700 dark:bg-gold-700/20 dark:text-gold-300">لسه ملف الموظف ده متظبطش (المرتب الثابت والعمولة). {manager && <Link to="/app/staff/settings" className="underline">ظبطه من إعدادات الموظفين</Link>}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title={`حسبة ${monthLabel(month)}`} actions={row?.payslip ? <Badge tone="green">اتصرف</Badge> : <Badge tone="amber">لسه بتتحسب</Badge>}>
          {isLoading ? <Spinner /> : row ? <SlipBody r={row} /> : <Empty title="مفيش بيانات" />}
        </Card>

        <Card title={`عمولات التعيين (${commissions?.length || 0})`} className="lg:col-span-2 overflow-hidden [&>div:last-child]:p-0">
          <Table head={['المندوب', 'بقى نشط', 'العمولة اتحسبت']} empty={!commissions?.length && <Empty title="مفيش مناديب اتحسبت عليهم عمولة الشهر ده" />}>
            {(commissions || []).map((c) => (
              <tr key={c.courier_id}>
                <td className="px-4 py-2.5 font-bold"><Link to={`/app/recruitment/couriers/${c.courier_id}`} className="hover:text-brand-600">{c.courier_name}</Link></td>
                <td className="px-4 py-2.5 text-xs">{fmtDate(c.first_active)}</td>
                <td className="px-4 py-2.5 text-xs">{fmtDate(c.qualified_on)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      <Card title="الحضور" className="overflow-hidden [&>div:last-child]:p-0">
        <Table head={['اليوم', 'الحالة', 'الحضور', 'الانصراف', 'الساعات', 'ملاحظات']} empty={!attendance?.length && <Empty title="مفيش حضور مسجل الشهر ده" />}>
          {(attendance || []).map((a) => {
            const late = a.check_in && a.late_minutes > (p?.late_grace_minutes ?? 15);
            return (
              <tr key={a.id}>
                <td className="whitespace-nowrap px-4 py-2.5 text-xs">{DOW[dowOf(a.day)]} {fmtDate(a.day)}</td>
                <td className="px-4 py-2.5">{a.status === 'present' ? (late ? <Badge tone="gold">متأخر {a.late_minutes} د</Badge> : <Badge tone="green">حاضر</Badge>) : <Badge tone={a.status === 'absent' ? 'red' : 'blue'}>{ATT_LABEL[a.status]}</Badge>}</td>
                <td className="tabular px-4 py-2.5">{cairoTime(a.check_in)}</td>
                <td className="tabular px-4 py-2.5">{cairoTime(a.check_out)}</td>
                <td className="tabular px-4 py-2.5">{hoursBetween(a.check_in, a.check_out) ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{a.notes || ''}</td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Card title="المرتبات اللي اتصرفت" className="overflow-hidden [&>div:last-child]:p-0">
        <Table head={['الشهر', 'الثابت', 'العمولات', 'الخصومات', 'الصافي', 'اتصرف']} empty={!slips?.length && <Empty title="لسه مفيش مرتبات مصروفة" />}>
          {(slips || []).map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-2.5 font-bold">{monthLabel(s.month)}</td>
              <td className="tabular px-4 py-2.5">{money(s.base_salary)}</td>
              <td className="tabular px-4 py-2.5 text-brand-600">{money(s.commission_amount)} ({s.commission_count})</td>
              <td className="tabular px-4 py-2.5 text-red-600">{money(Number(s.absence_deduction) + Number(s.late_deduction) + Number(s.deductions) + Number(s.advances))}</td>
              <td className="tabular px-4 py-2.5 font-extrabold">{money(s.net)}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-xs">{fmtDate(s.paid_at)} · {s.pay_method || ''}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
