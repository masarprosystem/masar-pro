import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Plus } from 'lucide-react';
import { useOffice } from '@/core/office';
import { todayStr } from '@/core/format';
import { useMembers } from '@/components/MembersManager';
import { Button, Card, Empty, PageHeader, Spinner, Stat, Table } from '@/components/ui';
import { ExportButton } from '@/components/ExportButton';
import { useOverview } from './api';
import { STAGES, STAGE_COLOR, STAGE_LABEL } from './model';

type Period = 'all' | 'month' | 'last_month' | '90';

function range(p: Period): [string | null, string | null] {
  const t = todayStr();
  const [y, m] = t.split('-').map(Number);
  if (p === 'month') return [`${y}-${String(m).padStart(2, '0')}-01`, t];
  if (p === 'last_month') {
    const d = new Date(Date.UTC(y, m - 2, 1));
    const end = new Date(Date.UTC(y, m - 1, 0));
    return [d.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
  }
  if (p === '90') return [new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10), t];
  return [null, null];
}

function Bars({ data, colors }: { data: [string, number][]; colors?: Record<string, string> }) {
  const max = Math.max(1, ...data.map(([, n]) => n));
  if (!data.length) return <Empty title="مفيش بيانات" />;
  return (
    <div className="space-y-2.5">
      {data.map(([k, n]) => (
        <div key={k}>
          <div className="mb-1 flex justify-between text-xs font-semibold"><span>{k}</span><span className="tabular">{n.toLocaleString('en-US')}</span></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: colors?.[k] || '#0b5a3a' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RecruitmentDashboard() {
  const { office, can, writable, role } = useOffice();
  const [period, setPeriod] = useState<Period>('all');
  const [from, to] = range(period);
  const { data: o, isLoading } = useOverview(office?.id, from, to);
  const { data: members } = useMembers(office?.id || '');
  const memberName = useMemo(() => Object.fromEntries((members || []).map((m) => [m.id, m.full_name || m.email || ''])), [members]);
  const sorted = (r: Record<string, number> | undefined) => Object.entries(r || {}).sort((a, b) => b[1] - a[1]);

  const st = o?.by_stage || {};
  const pipeline = (st.applied || 0) + (st.interview || 0) + (st.passed_interview || 0);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="لوحة التعيينات"
        actions={
          <>
            <select className="field !w-auto" value={period} onChange={(e) => setPeriod(e.target.value as Period)} aria-label="الفترة">
              <option value="all">كل الفترات</option>
              <option value="month">الشهر ده</option>
              <option value="last_month">الشهر اللي فات</option>
              <option value="90">آخر 90 يوم</option>
            </select>
            {can('recruitment') && writable && role !== 'accountant' && <Link to="/app/recruitment/couriers/new"><Button><Plus className="h-4 w-4" /> مندوب جديد</Button></Link>}
          </>
        }
      />
      {isLoading || !o ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat tone="brand" label="إجمالي المسجلين" value={o.total.toLocaleString('en-US')} />
            <Stat label="نشط" value={<span className="text-brand-600">{st.active || 0}</span>} sub={`${pct(st.active || 0, o.total)}% من المسجلين`} />
            <Stat label="مقابلات وانتظار" value={pipeline} />
            <Stat label="في التدريب" value={<span className="text-amber-600">{st.training || 0}</span>} />
            <Stat label="وقعوا بعد المقابلة/التدريب" value={<span className="text-red-600">{o.passed_interview_or_training_then_dropped}</span>} sub={`من ${o.reached_training} وصلوا التدريب`} />
          </div>

          {(o.expired_docs > 0 || o.expiring_docs > 0) && (
            <div className="flex items-center gap-2 rounded-lg border border-gold-100 bg-gold-50 p-3 text-sm font-bold text-gold-700 dark:border-gold-700 dark:bg-gold-700/20 dark:text-gold-300">
              <AlertTriangle className="h-4 w-4" />
              {o.expired_docs > 0 && <span>{o.expired_docs} مستند منتهي.</span>}
              {o.expiring_docs > 0 && <span>{o.expiring_docs} مستند هينتهي خلال 30 يوم.</span>}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card title="توزيع المناديب على المراحل">
              <Bars data={STAGES.filter((s) => st[s]).map((s) => [STAGE_LABEL[s], st[s]!])} colors={Object.fromEntries(STAGES.map((s) => [STAGE_LABEL[s], STAGE_COLOR[s]]))} />
            </Card>
            <Card title="مسار التعيين">
              <Bars data={[
                ['اتسجلوا', o.total],
                ['وصلوا التدريب', o.reached_training],
                ['اشتغلوا (بقوا نشطين)', o.reached_active],
              ]} colors={{ 'اتسجلوا': '#94a3b8', 'وصلوا التدريب': '#f59e0b', 'اشتغلوا (بقوا نشطين)': '#0b5a3a' }} />
              <p className="mt-4 text-xs text-slate-500">
                نسبة اللي اشتغلوا من اللي وصلوا التدريب: <b className="tabular">{pct(o.reached_active, o.reached_training)}%</b>
              </p>
            </Card>
            <Card title="النشطين حسب شركة الشحن"><Bars data={sorted(o.by_carrier)} colors={{}} /></Card>
            <Card title="مصدر المناديب"><Bars data={sorted(o.by_source)} /></Card>
          </div>

          <Card title="أداء مسؤولي التعيين" className="overflow-hidden [&>div:last-child]:p-0" actions={<ExportButton size="sm" fileName="أداء-مسؤولي-التعيين" rows={o.by_recruiter} cols={[
            { header: 'المسؤول', value: (r) => (r.member_id && memberName[r.member_id]) || r.legacy || 'غير محدد' }, { header: 'سجّل', value: (r) => r.total },
            { header: 'وصلوا التدريب', value: (r) => r.trained }, { header: 'بقوا نشطين', value: (r) => r.active }, { header: 'وقعوا بعد التدريب', value: (r) => r.dropped_after_training },
            { header: 'نسبة التفعيل %', value: (r) => pct(r.active, r.total) },
          ]} />}>
            <Table head={['المسؤول', 'سجّل', 'وصلوا التدريب', 'بقوا نشطين', 'وقعوا بعد التدريب', 'نسبة التفعيل']} empty={!o.by_recruiter.length && <Empty title="مفيش بيانات" />}>
              {o.by_recruiter.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-bold">{(r.member_id && memberName[r.member_id]) || r.legacy || 'غير محدد'}</td>
                  <td className="tabular px-4 py-3">{r.total}</td>
                  <td className="tabular px-4 py-3">{r.trained}</td>
                  <td className="tabular px-4 py-3 font-bold text-brand-600">{r.active}</td>
                  <td className="tabular px-4 py-3 text-red-600">{r.dropped_after_training}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full bg-brand-600" style={{ width: `${pct(r.active, r.total)}%` }} /></div>
                      <span className="tabular text-xs font-bold">{pct(r.active, r.total)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
