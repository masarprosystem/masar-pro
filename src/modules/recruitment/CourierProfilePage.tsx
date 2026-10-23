import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ExternalLink, Eye, FileUp, MapPin, Pencil, Phone, Trash2, Truck } from 'lucide-react';
import { supabase } from '@/core/supabase';
import { useOffice } from '@/core/office';
import { useAuth } from '@/core/auth';
import { errorMessage } from '@/core/errors';
import { daysUntil, fmtDate, fmtDateTime, todayStr } from '@/core/format';
import { useToast } from '@/core/toast';
import { useMembers } from '@/components/MembersManager';
import { Badge, Button, Card, Empty, Field, Modal, Spinner } from '@/components/ui';
import { useAssignments, useCarriers, useCourier, useDocuments, useStageHistory } from './api';
import { deleteCourierDocument, kb, signedUrl, uploadCourierDocument } from './files';
import {
  DOC_HAS_EXPIRY, DOC_LABEL, DOC_TYPES, GOVERNORATES, REQUIRED_DOCS, STAGE_COLOR, STAGE_LABEL, ageFrom,
  type Courier, type CourierDocument, type DocType,
} from './model';
import { StageBadge, StageModal } from './StageModal';
import { CourierPayrollCard } from '@/modules/payroll/CourierPayrollCard';

export function CourierProfilePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { office, role, writable } = useOffice();
  const canEdit = writable && role !== 'accountant';
  const { data: c, isLoading, error } = useCourier(id);
  const { data: members } = useMembers(office?.id || '');
  const [stageOpen, setStageOpen] = useState(false);
  const memberName = useMemo(() => Object.fromEntries((members || []).map((m) => [m.id, m.full_name || m.email || ''])), [members]);

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('couriers').delete().eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['couriers'] });
      toast('اتحذف المندوب.', 'success');
      nav('/app/recruitment/couriers');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (isLoading) return <Spinner />;
  if (error || !c) return <p className="font-bold text-red-600">{errorMessage(error || 'المندوب مش موجود')}</p>;
  const age = ageFrom(c.birth_date);

  return (
    <div className="space-y-5">
      <Link to="/app/recruitment/couriers" className="inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:underline"><ArrowRight className="h-4 w-4" /> كل المناديب</Link>

      <div className="card flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold text-brand-800 dark:text-brand-100">{c.full_name}</h1>
            <StageBadge stage={c.stage} />
          </div>
          <p className="text-sm text-slate-500">
            {[c.gender === 'male' ? 'ذكر' : c.gender === 'female' ? 'أنثى' : null, age !== null ? `${age} سنة` : null, c.birth_governorate ? `مواليد ${GOVERNORATES[c.birth_governorate] || c.birth_governorate}` : null].filter(Boolean).join(' · ')}
          </p>
          {c.stage_note && <p className="text-sm text-slate-600 dark:text-slate-300">آخر ملاحظة: {c.stage_note}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`tel:${c.primary_phone}`}><Button variant="secondary"><Phone className="h-4 w-4" /> اتصال</Button></a>
          <a href={`https://wa.me/2${c.primary_phone}`} target="_blank" rel="noopener noreferrer"><Button variant="secondary">واتساب</Button></a>
          {canEdit && <Button onClick={() => setStageOpen(true)}>تغيير المرحلة</Button>}
          {canEdit && <Link to={`/app/recruitment/couriers/${c.id}/edit`}><Button variant="secondary"><Pencil className="h-4 w-4" /> تعديل</Button></Link>}
          {role === 'owner' && writable && (
            <Button variant="danger" loading={del.isPending} onClick={() => confirm(`حذف ${c.full_name} نهائياً بكل مستنداته وتاريخه؟`) && del.mutate()}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <InfoCard c={c} recruiter={(c.recruited_by && memberName[c.recruited_by]) || c.legacy_recruiter || '—'} />
          <AssignmentsCard courier={c} canEdit={canEdit} />
          <DocumentsCard courier={c} canEdit={canEdit} canDelete={writable && (role === 'owner' || role === 'hr')} />
        </div>
        <div className="space-y-5">
          <TimelineCard courierId={c.id} memberName={memberName} />
          <CourierPayrollCard courierId={c.id} />
        </div>
      </div>

      <StageModal courier={stageOpen ? c : null} onClose={() => setStageOpen(false)} />
    </div>
  );
}

function InfoCard({ c, recruiter }: { c: Courier; recruiter: string }) {
  const row = (label: string, value: React.ReactNode, ltr?: boolean) => (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-2 last:border-0 dark:border-slate-800">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-left font-semibold" dir={ltr ? 'ltr' : undefined}>{value || '—'}</dd>
    </div>
  );
  return (
    <Card title="البيانات">
      <div className="grid grid-cols-1 gap-x-8 text-sm md:grid-cols-2">
        <dl>
          {row('الرقم القومي', c.national_id, true)}
          {row('الموبايل', c.primary_phone, true)}
          {row('رقم تاني', c.alt_phone, true)}
          {row('تاريخ الميلاد', fmtDate(c.birth_date))}
          {row('العنوان الحالي', c.current_address)}
          {row('العنوان الأصلي', c.original_address)}
          {c.location_link && row('اللوكيشن', <a className="inline-flex items-center gap-1 text-brand-600 hover:underline" href={c.location_link} target="_blank" rel="noopener noreferrer"><MapPin className="h-4 w-4" /> فتح الخريطة</a>)}
        </dl>
        <dl>
          {row('تاريخ التعيين', fmtDate(c.appointment_date))}
          {row('مسؤول التعيين', recruiter)}
          {row('المصدر', c.lead_source)}
          {row('منطقة العمل', c.assigned_area)}
          {row('المركبة', c.vehicle_type)}
          {row('اتسجل', fmtDateTime(c.created_at))}
        </dl>
      </div>
      {(c.relatives || []).length > 0 && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 dark:bg-white/5">
          <p className="mb-2 text-xs font-extrabold text-slate-600 dark:text-slate-300">الأقارب</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {c.relatives.map((r, i) => (
              <div key={i} className="text-sm">
                <p className="font-bold">{r.name} <span className="font-normal text-slate-500">({r.relation || '—'})</span></p>
                <a href={`tel:${r.phone}`} className="tabular text-brand-600" dir="ltr">{r.phone}</a>
              </div>
            ))}
          </div>
        </div>
      )}
      {Object.keys(c.external_links || {}).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(c.external_links).map(([k, url]) => (
            <a key={k} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
              <ExternalLink className="h-3.5 w-3.5" /> {k === 'idCardUrl' ? 'صورة البطاقة (النظام القديم)' : k === 'licenseUrl' ? 'صورة الرخصة (النظام القديم)' : k}
            </a>
          ))}
        </div>
      )}
      {c.notes && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">ملاحظات: {c.notes}</p>}
    </Card>
  );
}

function TimelineCard({ courierId, memberName }: { courierId: string; memberName: Record<string, string> }) {
  const { data, isLoading } = useStageHistory(courierId);
  const { office } = useOffice();
  const { data: members } = useMembers(office?.id || '');
  const byUser = useMemo(() => Object.fromEntries((members || []).map((m) => [m.user_id, memberName[m.id]])), [members, memberName]);
  return (
    <Card title="رحلة المندوب">
      {isLoading ? <Spinner /> : (
        <ol className="relative space-y-4 border-r-2 border-slate-200 pr-4 dark:border-slate-700">
          {(data || []).map((h) => (
            <li key={h.id} className="relative">
              <span className="absolute -right-[23px] top-1 h-3 w-3 rounded-full ring-4 ring-white dark:ring-[#121d19]" style={{ background: STAGE_COLOR[h.to_stage] }} />
              <p className="text-sm font-bold">{STAGE_LABEL[h.to_stage]}</p>
              <p className="text-[11px] text-slate-500">{fmtDateTime(h.changed_at)}{h.changed_by && byUser[h.changed_by] ? ` · ${byUser[h.changed_by]}` : ''}</p>
              {h.note && <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{h.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function AssignmentsCard({ courier, canEdit }: { courier: Courier; canEdit: boolean }) {
  const { office } = useOffice();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: carriers } = useCarriers(office?.id);
  const { data, isLoading } = useAssignments(courier.id);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ carrier_id: '', hub: '', zone: '', start_date: todayStr(), notes: '' });
  const name = (id: string) => carriers?.find((c) => c.id === id)?.name || '—';

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['assignments', courier.id] });
    qc.invalidateQueries({ queryKey: ['courier', courier.id] });
    qc.invalidateQueries({ queryKey: ['couriers'] });
  };
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('courier_assignments').insert({
        office_id: courier.office_id, courier_id: courier.id, carrier_id: f.carrier_id, hub: f.hub.trim() || null,
        zone: f.zone.trim() || null, start_date: f.start_date, notes: f.notes.trim() || null, created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      setOpen(false);
      toast('اتسجلت الشركة.', 'success');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const end = useMutation({
    mutationFn: async (aid: string) => {
      const { error } = await supabase.from('courier_assignments').update({ is_current: false, end_date: todayStr() }).eq('id', aid);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast('اتقفل التعاقد.', 'success');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <Card
      title="شركات الشحن"
      actions={canEdit && <Button size="sm" onClick={() => { setF({ carrier_id: carriers?.find((c) => c.is_active)?.id || '', hub: '', zone: '', start_date: todayStr(), notes: '' }); setOpen(true); }}><Truck className="h-4 w-4" /> نزّله لشركة</Button>}
    >
      {isLoading ? <Spinner /> : !data?.length ? (
        <Empty title="لسه مش نازل لأي شركة" />
      ) : (
        <div className="space-y-2">
          {data.map((a) => (
            <div key={a.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm ${a.is_current ? 'border-brand-300 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
              <div>
                <p className="font-bold">{name(a.carrier_id)} {a.is_current && <Badge tone="green">حالي</Badge>}</p>
                <p className="text-xs text-slate-500">{[a.hub, a.zone].filter(Boolean).join(' · ') || '—'} · من {fmtDate(a.start_date)}{a.end_date ? ` لحد ${fmtDate(a.end_date)}` : ''}</p>
                {a.notes && <p className="text-xs text-slate-500">{a.notes}</p>}
              </div>
              {canEdit && a.is_current && <Button size="sm" variant="ghost" loading={end.isPending} onClick={() => confirm('قفل التعاقد ده؟') && end.mutate(a.id)}>قفل التعاقد</Button>}
            </div>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="نزّل المندوب لشركة" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button><Button loading={add.isPending} disabled={!f.carrier_id} onClick={() => add.mutate()}>حفظ</Button></>}>
        <Field label="شركة الشحن" required htmlFor="a_car">
          <select id="a_car" className="field" value={f.carrier_id} onChange={(e) => setF({ ...f, carrier_id: e.target.value })}>
            {(carriers || []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الهب" htmlFor="a_hub"><input id="a_hub" className="field" value={f.hub} onChange={(e) => setF({ ...f, hub: e.target.value })} /></Field>
          <Field label="الزون" htmlFor="a_zone"><input id="a_zone" className="field" value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value })} /></Field>
        </div>
        <Field label="تاريخ البداية" htmlFor="a_start"><input id="a_start" type="date" className="field" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
        <Field label="ملاحظات" htmlFor="a_notes"><input id="a_notes" className="field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <p className="text-xs text-slate-500">لو المندوب نازل لشركة دلوقتي، التعاقد القديم هيتقفل لوحده ويفضل في التاريخ.</p>
      </Modal>
    </Card>
  );
}

function DocumentsCard({ courier, canEdit, canDelete }: { courier: Courier; canEdit: boolean; canDelete: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useDocuments(courier.id);
  const [type, setType] = useState<DocType>('id_front');
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);

  const missing = REQUIRED_DOCS.filter((t) => !(data || []).some((d) => d.doc_type === t));

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      let saved = 0, original = 0;
      for (const file of Array.from(files)) {
        const r = await uploadCourierDocument({ officeId: courier.office_id, courierId: courier.id, docType: type, file, expiresAt: DOC_HAS_EXPIRY.includes(type) ? expires || null : null });
        saved += r.size;
        original += r.originalSize;
      }
      qc.invalidateQueries({ queryKey: ['documents', courier.id] });
      qc.invalidateQueries({ queryKey: ['recruitment-overview'] });
      toast(`اترفع ${DOC_LABEL[type]} (${kb(original)} ← ${kb(saved)})`, 'success');
      setExpires('');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const open = async (d: CourierDocument) => {
    const w = window.open('', '_blank');
    try {
      const url = await signedUrl(d.storage_path);
      if (w) w.location.href = url;
      else window.location.href = url;
    } catch (e) {
      w?.close();
      toast(errorMessage(e), 'error');
    }
  };

  const remove = useMutation({
    mutationFn: (d: CourierDocument) => deleteCourierDocument(d.id, d.storage_path),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', courier.id] });
      toast('اتحذف المستند.', 'success');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <Card title="المستندات">
      {missing.length > 0 && (
        <p className="mb-3 rounded-lg bg-amber-50 p-2.5 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">ناقص: {missing.map((t) => DOC_LABEL[t]).join('، ')}</p>
      )}
      {canEdit && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border-2 border-dashed border-slate-300 p-3 dark:border-slate-700">
          <Field label="نوع المستند" htmlFor="d_type">
            <select id="d_type" className="field" value={type} onChange={(e) => setType(e.target.value as DocType)}>
              {DOC_TYPES.map((t) => <option key={t} value={t}>{DOC_LABEL[t]}</option>)}
            </select>
          </Field>
          {DOC_HAS_EXPIRY.includes(type) && (
            <Field label="تاريخ الانتهاء" htmlFor="d_exp"><input id="d_exp" type="date" className="field" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
          )}
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
            <FileUp className="h-4 w-4" /> {busy ? 'جاري الضغط والرفع...' : 'اختيار صورة / تصوير'}
            <input type="file" accept="image/*,application/pdf" multiple className="hidden" disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          </label>
          <p className="w-full text-[11px] text-slate-500">الصور بتتضغط لوحدها قبل الرفع (عادةً أقل من 300 KB).</p>
        </div>
      )}
      {isLoading ? <Spinner /> : !data?.length ? <Empty title="مفيش مستندات مرفوعة" /> : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {data.map((d) => {
            const left = d.expires_at ? daysUntil(d.expires_at) : null;
            return (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
                <div>
                  <p className="font-bold">{DOC_LABEL[d.doc_type]}</p>
                  <p className="text-[11px] text-slate-500">
                    {kb(d.size_bytes)} · {fmtDate(d.created_at)}
                    {left !== null && <span className={left < 0 ? ' font-bold text-red-600' : left <= 30 ? ' font-bold text-gold-600' : ''}> · {left < 0 ? 'منتهي' : `ينتهي بعد ${left} يوم`}</span>}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => open(d)} title="عرض"><Eye className="h-4 w-4" /></Button>
                  {canDelete && <Button size="sm" variant="ghost" onClick={() => confirm('حذف المستند؟') && remove.mutate(d)} title="حذف"><Trash2 className="h-4 w-4 text-red-500" /></Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
