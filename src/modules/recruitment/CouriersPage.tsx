import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Columns3, List, Plus, UserSearch } from 'lucide-react';
import { useOffice } from '@/core/office';
import { fmtDate } from '@/core/format';
import { useMembers } from '@/components/MembersManager';
import { Button, Empty, PageHeader, SearchInput, Spinner, Table } from '@/components/ui';
import { ExportButton } from '@/components/ExportButton';
import { PAGE_SIZE, fetchAllCouriers, useCarriers, useCouriers, usePipeline, type CourierFilters, type CourierRow } from './api';
import { PIPELINE, STAGE_COLOR, VEHICLES, ageFrom } from './model';
import { StageBadge, StageModal, useStageLabel, useStageOptions } from './StageModal';

export function CouriersPage() {
  const { office, writable, role } = useOffice();
  const canEdit = writable && role !== 'accountant';
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'board' ? 'board' : 'list';
  const f: CourierFilters = {
    q: params.get('q') || '',
    stage: (params.get('stage') || '') as CourierFilters['stage'],
    carrier: params.get('carrier') || '',
    recruiter: params.get('recruiter') || '',
    vehicle: params.get('vehicle') || '',
    page: Number(params.get('page') || 0),
  };
  const setF = (patch: Partial<CourierFilters> & { view?: string }) => {
    const next = new URLSearchParams(params);
    Object.entries({ page: 0, ...patch }).forEach(([k, v]) => (v === '' || v === 0 || v === undefined ? next.delete(k) : next.set(k, String(v))));
    setParams(next, { replace: true });
  };

  const { data: carriers } = useCarriers(office?.id);
  const { data: members } = useMembers(office?.id || '');
  const stageOptions = useStageOptions();
  const stageLabel = useStageLabel();
  const [stageFor, setStageFor] = useState<CourierRow | null>(null);
  const carrierName = useMemo(() => Object.fromEntries((carriers || []).map((c) => [c.id, c.name])), [carriers]);
  const memberName = useMemo(() => Object.fromEntries((members || []).map((m) => [m.id, m.full_name || m.email || ''])), [members]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="المناديب"
        actions={
          <>
            <div className="flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-700">
              <button onClick={() => setF({ view: '' })} className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-bold ${view === 'list' ? 'bg-brand-600 text-white' : 'text-slate-600'}`}><List className="h-4 w-4" /> قائمة</button>
              <button onClick={() => setF({ view: 'board' })} className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-bold ${view === 'board' ? 'bg-brand-600 text-white' : 'text-slate-600'}`}><Columns3 className="h-4 w-4" /> مراحل التعيين</button>
            </div>
            {view === 'list' && office && (
              <ExportButton fileName="المناديب" rows={() => fetchAllCouriers(office.id, f)} cols={[
                { header: 'الاسم', value: (c) => c.full_name }, { header: 'الرقم القومي', value: (c) => c.national_id }, { header: 'الموبايل', value: (c) => c.primary_phone },
                { header: 'رقم تاني', value: (c) => c.alt_phone }, { header: 'المرحلة', value: (c) => stageLabel(c.stage, c.stage_id) }, { header: 'سبب المرحلة', value: (c) => c.stage_note },
                { header: 'الشركة', value: (c) => (c.current_carrier_id ? carrierName[c.current_carrier_id] : '') }, { header: 'الهب', value: (c) => c.current_hub },
                { header: 'المنطقة', value: (c) => c.assigned_area }, { header: 'المركبة', value: (c) => c.vehicle_type }, { header: 'السن', value: (c) => ageFrom(c.birth_date) },
                { header: 'مسؤول التعيين', value: (c) => (c.recruited_by ? memberName[c.recruited_by] : c.legacy_recruiter) }, { header: 'المصدر', value: (c) => c.lead_source },
                { header: 'الحملة', value: (c) => c.lead_campaign }, { header: 'تاريخ التعيين', value: (c) => c.appointment_date }, { header: 'العنوان', value: (c) => c.current_address },
              ]} />
            )}
            {canEdit && <Link to="/app/recruitment/couriers/new"><Button><Plus className="h-4 w-4" /> مندوب جديد</Button></Link>}
          </>
        }
      />

      {view === 'board' ? (
        <Board officeId={office?.id} carrierName={carrierName} onStage={canEdit ? setStageFor : undefined} />
      ) : (
        <>
          <div className="card flex flex-wrap gap-2 p-3">
            <SearchInput value={f.q} onChange={(q) => setF({ q })} placeholder="بحث بالاسم أو الموبايل أو الرقم القومي" />
            <select className="field !w-auto" value={f.stage} onChange={(e) => setF({ stage: e.target.value as CourierFilters['stage'] })} aria-label="المرحلة">
              <option value="">كل المراحل</option>
              {stageOptions.map((s) => <option key={s.id} value={s.is_core ? s.base_stage : `sid:${s.id}`}>{s.name}</option>)}
            </select>
            <select className="field !w-auto" value={f.carrier} onChange={(e) => setF({ carrier: e.target.value })} aria-label="الشركة">
              <option value="">كل الشركات</option>
              {(carriers || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="none">بدون شركة</option>
            </select>
            <select className="field !w-auto" value={f.recruiter} onChange={(e) => setF({ recruiter: e.target.value })} aria-label="مسؤول التعيين">
              <option value="">كل مسؤولي التعيين</option>
              {(members || []).filter((m) => m.role === 'hr' || m.role === 'owner' || m.role === 'operations').map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
            </select>
            <select className="field !w-auto" value={f.vehicle} onChange={(e) => setF({ vehicle: e.target.value })} aria-label="المركبة">
              <option value="">كل المركبات</option>
              {VEHICLES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <ListView officeId={office?.id} f={f} setF={setF} carrierName={carrierName} memberName={memberName} onStage={canEdit ? setStageFor : undefined} />
        </>
      )}

      <StageModal courier={stageFor} onClose={() => setStageFor(null)} />
    </div>
  );
}

function ListView({ officeId, f, setF, carrierName, memberName, onStage }: {
  officeId?: string; f: CourierFilters; setF: (p: Partial<CourierFilters>) => void;
  carrierName: Record<string, string>; memberName: Record<string, string>; onStage?: (c: CourierRow) => void;
}) {
  const nav = useNavigate();
  const { data, isLoading, isFetching } = useCouriers(officeId, f);
  const pages = Math.max(1, Math.ceil((data?.count || 0) / PAGE_SIZE));
  if (isLoading) return <Spinner />;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-500 dark:border-slate-800">
        <span>{(data?.count || 0).toLocaleString('en-US')} مندوب {isFetching && '…'}</span>
        {pages > 1 && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={f.page === 0} onClick={() => setF({ page: f.page - 1 })} aria-label="السابق"><ChevronRight className="h-4 w-4" /></Button>
            <span className="tabular">{f.page + 1} / {pages}</span>
            <Button size="sm" variant="ghost" disabled={f.page + 1 >= pages} onClick={() => setF({ page: f.page + 1 })} aria-label="التالي"><ChevronLeft className="h-4 w-4" /></Button>
          </div>
        )}
      </div>
      <Table
        head={['المندوب', 'الموبايل', 'الشركة والهب', 'المنطقة والمركبة', 'مسؤول التعيين', 'المرحلة', 'تاريخ التعيين']}
        empty={!data?.rows.length && <Empty icon={<UserSearch className="h-10 w-10" />} title="مفيش مناديب بالفلتر ده" />}
      >
        {(data?.rows || []).map((c) => (
          <tr key={c.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => nav(`/app/recruitment/couriers/${c.id}`)}>
            <td className="px-4 py-3"><p className="font-bold">{c.full_name}</p><p className="tabular text-[11px] text-slate-400">{c.national_id}{ageFrom(c.birth_date) !== null && ` · ${ageFrom(c.birth_date)} سنة`}</p></td>
            <td className="tabular px-4 py-3" dir="ltr" style={{ textAlign: 'right' }}>{c.primary_phone}</td>
            <td className="px-4 py-3">{c.current_carrier_id ? <><p className="font-semibold">{carrierName[c.current_carrier_id]}</p><p className="text-[11px] text-slate-500">{c.current_hub || ''}</p></> : <span className="text-slate-400">—</span>}</td>
            <td className="px-4 py-3"><p>{c.assigned_area || '—'}</p><p className="text-[11px] text-slate-500">{c.vehicle_type || ''}</p></td>
            <td className="px-4 py-3 text-xs">{(c.recruited_by && memberName[c.recruited_by]) || c.legacy_recruiter || '—'}</td>
            <td className="px-4 py-3">
              <button
                type="button"
                disabled={!onStage}
                onClick={(e) => { e.stopPropagation(); onStage?.(c); }}
                className="text-right disabled:cursor-default"
                title={onStage ? 'تغيير المرحلة' : undefined}
              >
                <StageBadge stage={c.stage} stageId={c.stage_id} />
                {c.stage_note && <p className="mt-1 max-w-[200px] truncate text-[11px] text-slate-500" title={c.stage_note}>{c.stage_note}</p>}
              </button>
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{fmtDate(c.appointment_date)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function Board({ officeId, carrierName, onStage }: { officeId?: string; carrierName: Record<string, string>; onStage?: (c: CourierRow) => void }) {
  const { data, isLoading } = usePipeline(officeId);
  const options = useStageOptions();
  const nav = useNavigate();
  if (isLoading) return <Spinner />;
  // عمود لكل مرحلة من مراحل التعيين (الأساسية والخاصة بالمكتب)
  const cols = options.filter((o) => PIPELINE.includes(o.base_stage));
  const colIds = new Set(cols.map((c) => c.id));
  const colOf = (c: CourierRow) => (c.stage_id && colIds.has(c.stage_id) ? c.stage_id : cols.find((x) => x.is_core && x.base_stage === c.stage)?.id);
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {cols.map((col) => {
        const s = col.base_stage;
        const items = (data || []).filter((c) => colOf(c) === col.id);
        return (
          <div key={col.id} className="card flex max-h-[70vh] w-72 shrink-0 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800" style={{ borderTop: `3px solid ${STAGE_COLOR[s]}` }}>
              <p className="text-sm font-extrabold">{col.name}</p>
              <span className="tabular rounded-full bg-slate-100 px-2 text-xs font-bold dark:bg-slate-800">{items.length}</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {items.length === 0 && <p className="py-6 text-center text-xs text-slate-400">مفيش حد</p>}
              {items.map((c) => (
                <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm dark:border-slate-700 dark:bg-white/5">
                  <button className="block w-full text-right font-bold hover:text-brand-600" onClick={() => nav(`/app/recruitment/couriers/${c.id}`)}>{c.full_name}</button>
                  <p className="tabular mt-0.5 text-xs text-slate-500" dir="ltr" style={{ textAlign: 'right' }}>{c.primary_phone}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{[c.current_carrier_id && carrierName[c.current_carrier_id], c.assigned_area, c.vehicle_type].filter(Boolean).join(' · ')}</p>
                  {c.stage_note && <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{c.stage_note}</p>}
                  {onStage && (
                    <button onClick={() => onStage(c)} className="mt-2 text-[11px] font-bold text-brand-600 hover:underline">نقل لمرحلة تانية ←</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
