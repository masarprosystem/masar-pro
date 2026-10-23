import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileUp, FileSpreadsheet } from 'lucide-react';
import { useOffice } from '@/core/office';
import { fmtDateTime, money, ratio } from '@/core/format';
import { Button, Empty, PageHeader, Spinner, Stat } from '@/components/ui';
import { useCarriers } from '@/modules/recruitment/api';
import { useMonth, useMonthLines, useRuns } from './api';
import { hasShort, lineNet, monthLabel } from './model';
import { MonthBar, usePayrollPerms } from './shared';
import { UploadModal } from './UploadModal';

export function PayrollHome() {
  const { office } = useOffice();
  const [month, setMonth] = useMonth();
  const perms = usePayrollPerms();
  const { data: runs, isLoading } = useRuns(office?.id, month);
  const { data: lines } = useMonthLines(office?.id, month);
  const { data: carriers } = useCarriers(office?.id);
  const [upload, setUpload] = useState(false);
  const carrierName = useMemo(() => Object.fromEntries((carriers || []).map((c) => [c.id, c.name])), [carriers]);

  const L = lines || [];
  const paid = L.filter((l) => l.paid);
  const due = L.reduce((s, l) => s + lineNet(l), 0);
  const paidSum = paid.reduce((s, l) => s + Number(l.paid_amount), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="صرف المرتبات"
        actions={
          <>
            <MonthBar month={month} onChange={setMonth} />
            {perms.canImport && <Button onClick={() => setUpload(true)}><FileUp className="h-4 w-4" /> رفع شيت مرتبات</Button>}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat tone="brand" label={`مناديب ${monthLabel(month)}`} value={L.length} />
        <Stat label="تم صرفهم" value={ratio(paid.length, L.length)} sub={<span className="text-brand-600">{L.length ? Math.round((paid.length / L.length) * 100) : 0}%</span>} />
        <Stat label="إجمالي المرتبات" value={money(L.reduce((s, l) => s + Number(l.total_salary), 0))} />
        <Stat label="الصافي المستحق" value={money(due)} />
        <Stat label="اتصرف فعلاً" value={<span className="text-brand-600">{money(paidSum)}</span>} sub={<span className="text-amber-600">متبقي {money(due - paidSum)}</span>} />
        <Stat label="عليهم عجز / لوست" value={<span className="text-red-600">{L.filter(hasShort).length}</span>} />
      </div>

      {isLoading ? <Spinner /> : !runs?.length ? (
        <div className="card">
          <Empty icon={<FileSpreadsheet className="h-12 w-12" />} title={`مفيش شيتات مرتبات لشهر ${monthLabel(month)}`}>
            {perms.canImport && <Button className="mt-2" onClick={() => setUpload(true)}><FileUp className="h-4 w-4" /> ارفع شيت بوسطة أو أي شركة</Button>}
          </Empty>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {runs.map((r) => {
            const rl = L.filter((l) => l.run_id === r.id);
            const rp = rl.filter((l) => l.paid);
            const pct = rl.length ? Math.round((rp.length / rl.length) * 100) : 0;
            const unlinked = rl.filter((l) => !l.courier_id).length;
            return (
              <Link key={r.id} to={`/app/payroll/runs/${r.id}?m=${month}`} className="card block space-y-3 p-5 transition hover:border-brand-400">
                <div className="flex items-center justify-between">
                  <p className="text-lg font-extrabold text-brand-800 dark:text-brand-100">{carrierName[r.carrier_id] || '—'}</p>
                  <span className="tabular text-sm font-bold">{rl.length} مندوب</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full bg-brand-600" style={{ width: `${pct}%` }} /></div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-slate-500">اتصرف</p><p className="tabular font-bold">{rp.length} ({pct}%)</p></div>
                  <div><p className="text-slate-500">الصافي</p><p className="tabular font-bold">{money(rl.reduce((s, l) => s + lineNet(l), 0))}</p></div>
                  <div><p className="text-slate-500">مش مربوطين</p><p className={`tabular font-bold ${unlinked ? 'text-gold-600' : ''}`}>{unlinked}</p></div>
                </div>
                <p className="text-[11px] text-slate-400">{r.source_file_name || ''} · اترفع {fmtDateTime(r.imported_at)}</p>
              </Link>
            );
          })}
        </div>
      )}

      <UploadModal open={upload} onClose={() => setUpload(false)} month={month} existingCarrierIds={(runs || []).map((r) => r.carrier_id)} />
    </div>
  );
}
