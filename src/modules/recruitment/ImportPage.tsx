import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { supabase } from '@/core/supabase';
import { useOffice } from '@/core/office';
import { useAuth } from '@/core/auth';
import { errorMessage } from '@/core/errors';
import { todayStr } from '@/core/format';
import { useToast } from '@/core/toast';
import { cellDate, cellText, detectColumns, fetchAll, findHeaderRow, normHeader, readSheet, toObjects, type Cell } from '@/core/sheets';
import { useMembers } from '@/components/MembersManager';
import { Badge, Button, Card, PageHeader, Table } from '@/components/ui';
import { useCarriers, useOfficeStages } from './api';
import { LEAD_SOURCES, STAGES, STAGE_LABEL, VEHICLES, normalizePhone, parseNationalId, type CourierStage, type Relative } from './model';

// أسماء الأعمدة المحتملة لكل حقل (الـ Template + شيت منصة التعيينات القديمة)
const FIELDS = {
  full_name: ['اسم المندوب', 'الاسم', 'courierName', 'name'],
  national_id: ['الرقم القومي', 'nationalId', 'national id'],
  primary_phone: ['الموبايل الرئيسي', 'الموبايل', 'رقم الموبايل', 'primaryPhone', 'phone'],
  alt_phone: ['رقم تاني', 'واتساب بديل', 'altPhone'],
  appointment_date: ['تاريخ التعيين', 'appointmentDate'],
  status: ['المرحلة', 'الحالة', 'status'],
  status_note: ['سبب المرحلة / ملاحظة', 'ملاحظة آخر حالة', 'statusNote'],
  recruiter: ['مسؤول التعيين', 'مسؤول HR', 'hrManager'],
  lead_source: ['مصدر المندوب', 'leadSource'],
  vehicle_type: ['نوع المركبة', 'نوع السيارة', 'vehicleType'],
  assigned_area: ['منطقة العمل', 'المنطقة', 'assignedArea'],
  carrier: ['شركة الشحن', 'الشركة', 'Carrier'],
  hub: ['الهب', 'Hub'],
  zone: ['الزون', 'Zone'],
  current_address: ['العنوان الحالي', 'currentAddress'],
  original_address: ['العنوان الأصلي', 'originalAddress'],
  location_link: ['رابط اللوكيشن', 'locationLink'],
  rel1: ['قريب 1 (اسم/صلة/رقم)', 'rel1'],
  rel2: ['قريب 2 (اسم/صلة/رقم)', 'rel2'],
  rel3: ['قريب 3 (اسم/صلة/رقم)', 'rel3'],
  rel1_name: ['قريب 1 - الاسم'], rel1_relation: ['قريب 1 - صلة القرابة'], rel1_phone: ['قريب 1 - الموبايل'],
  rel2_name: ['قريب 2 - الاسم'], rel2_relation: ['قريب 2 - صلة القرابة'], rel2_phone: ['قريب 2 - الموبايل'],
  rel3_name: ['قريب 3 - الاسم'], rel3_relation: ['قريب 3 - صلة القرابة'], rel3_phone: ['قريب 3 - الموبايل'],
  notes: ['ملاحظات', 'notes'],
  id_card_url: ['صورة البطاقة', 'idCardUrl'],
  license_url: ['صورة الرخصة', 'licenseUrl'],
} as const;
type FieldKey = keyof typeof FIELDS;
const SHOWN: FieldKey[] = ['full_name', 'national_id', 'primary_phone', 'alt_phone', 'appointment_date', 'status', 'status_note', 'recruiter', 'lead_source', 'vehicle_type', 'assigned_area', 'carrier', 'hub', 'zone', 'current_address', 'original_address', 'location_link', 'notes'];

const STATUS_MAP: Record<string, CourierStage> = {
  waiting: 'applied', pending: 'interview', 'successful interview': 'passed_interview', training: 'training',
  active: 'active', inactivate: 'inactive', inactive: 'inactive', blocked: 'blocked', left: 'left',
  'في الانتظار': 'applied', 'تحت المراجعة': 'interview', 'في التدريب': 'training',
  ...Object.fromEntries(STAGES.map((s) => [normHeader(STAGE_LABEL[s]), s])),
};
const VEHICLE_MAP: Record<string, string> = { sedan: 'ملاكي', motorbike: 'موتسيكل', van: 'فان', 'موتوسيكل': 'موتسيكل' };

function parseRelative(v: string): Relative | null {
  const s = (v || '').trim();
  if (!s || s === '-') return null;
  const m = s.match(/^(.*?)\s*\((.*?)\)\s*-\s*(.*)$/);
  if (m) return { name: m[1].trim(), relation: m[2].trim(), phone: normalizePhone(m[3]) };
  return { name: s, relation: '', phone: '' };
}

interface Prepared {
  line: number;
  name: string;
  status: 'ready' | 'duplicate' | 'invalid';
  reason?: string;
  row?: Record<string, unknown>;
  carrierId?: string | null;
  hub?: string;
  zone?: string;
  warn?: string;
}

export function ImportPage() {
  const { office } = useOffice();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: members } = useMembers(office?.id || '');
  const { data: carriers } = useCarriers(office?.id);
  const { data: officeStages } = useOfficeStages(office?.id);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [raw, setRaw] = useState<Record<string, Cell>[]>([]);
  const [map, setMap] = useState<Record<FieldKey, string> | null>(null);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ ok: number; failed: { name: string; error: string }[] } | null>(null);

  const read = async (file: File) => {
    setResult(null);
    setFileName(file.name);
    try {
      const rows = await readSheet(file);
      const hr = findHeaderRow(rows, [...FIELDS.full_name, ...FIELDS.national_id]);
      const { headers: hs, data } = toObjects(rows, hr);
      setHeaders(hs);
      setRaw(data);
      setMap(detectColumns(hs, FIELDS));
      const ids = await fetchAll<{ national_id: string }>((from, to) =>
        supabase.from('couriers').select('national_id').eq('office_id', office!.id).range(from, to),
      );
      setExisting(new Set(ids.map((d) => d.national_id)));
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const prepared = useMemo<Prepared[]>(() => {
    if (!map) return [];
    const g = (r: Record<string, Cell>, k: FieldKey) => (map[k] ? cellText(r[map[k]]) : '');
    const seen = new Set<string>();
    const memberByName = (n: string) => {
      const x = normHeader(n);
      if (!x) return null;
      return (members || []).find((m) => normHeader(m.full_name || '') === x) || (members || []).find((m) => normHeader(m.full_name || '').includes(x)) || null;
    };
    const carrierByName = (n: string) => {
      const x = normHeader(n);
      return x ? (carriers || []).find((c) => normHeader(c.name) === x) || null : null;
    };
    return raw.map((r, i) => {
      const name = g(r, 'full_name').replace(/\s+/g, ' ');
      const nidRaw = g(r, 'national_id').replace(/\D/g, '');
      const line = i + 2;
      if (!name) return { line, name: '—', status: 'invalid', reason: 'من غير اسم' };
      if (!parseNationalId(nidRaw)) return { line, name, status: 'invalid', reason: `رقم قومي غير صحيح (${nidRaw || 'فاضي'})` };
      if (existing.has(nidRaw)) return { line, name, status: 'duplicate', reason: 'متسجل قبل كده' };
      if (seen.has(nidRaw)) return { line, name, status: 'duplicate', reason: 'متكرر في الملف' };
      seen.add(nidRaw);
      const phone = normalizePhone(g(r, 'primary_phone'));
      if (!phone) return { line, name, status: 'invalid', reason: 'من غير موبايل' };
      const statusText = normHeader(g(r, 'status'));
      const officeStage = (officeStages || []).find((s) => s.is_active && normHeader(s.name) === statusText);
      const stage = officeStage?.base_stage || STATUS_MAP[statusText] || 'applied';
      let note = g(r, 'status_note');
      if ((stage === 'inactive' || stage === 'blocked') && !note) note = 'نقل من شيت';
      const recName = g(r, 'recruiter');
      const rec = memberByName(recName);
      const vehRaw = g(r, 'vehicle_type');
      const vehicle = VEHICLE_MAP[normHeader(vehRaw)] || (VEHICLES.find((v) => vehRaw.includes(v)) ?? (vehRaw || null));
      const links: Record<string, string> = {};
      if (/^https?:\/\//.test(g(r, 'id_card_url'))) links.idCardUrl = g(r, 'id_card_url');
      if (/^https?:\/\//.test(g(r, 'license_url'))) links.licenseUrl = g(r, 'license_url');
      const loc = g(r, 'location_link');
      const relatives = ([1, 2, 3] as const)
        .map((n) => {
          const nm = g(r, `rel${n}_name` as FieldKey);
          if (nm) return { name: nm, relation: g(r, `rel${n}_relation` as FieldKey), phone: normalizePhone(g(r, `rel${n}_phone` as FieldKey)) };
          return parseRelative(g(r, `rel${n}` as FieldKey));
        })
        .filter(Boolean);
      const carrierName = g(r, 'carrier');
      const carrier = carrierByName(carrierName);
      return {
        line, name, status: 'ready',
        carrierId: carrier?.id || null,
        hub: g(r, 'hub'),
        zone: g(r, 'zone'),
        warn: carrierName && !carrier ? `الشركة "${carrierName}" مش في قايمة شركات الشحن، هيترفع من غير شركة` : undefined,
        row: {
          office_id: office!.id,
          full_name: name,
          national_id: nidRaw,
          primary_phone: phone,
          alt_phone: normalizePhone(g(r, 'alt_phone')) || null,
          current_address: g(r, 'current_address') || null,
          original_address: g(r, 'original_address') || null,
          vehicle_type: vehicle,
          assigned_area: g(r, 'assigned_area') || null,
          lead_source: g(r, 'lead_source') || null,
          stage,
          stage_id: officeStage && !officeStage.is_core ? officeStage.id : null,
          stage_note: note || null,
          recruited_by: rec?.id || null,
          legacy_recruiter: rec ? null : recName || null,
          appointment_date: cellDate(map.appointment_date ? r[map.appointment_date] : null, todayStr()),
          location_link: /^https?:\/\//.test(loc) ? loc : null,
          relatives,
          external_links: links,
          notes: g(r, 'notes') || null,
          created_by: user?.id,
        },
      };
    });
  }, [raw, map, members, carriers, officeStages, existing, office, user]);

  const ready = prepared.filter((p) => p.status === 'ready');
  const skipped = prepared.filter((p) => p.status !== 'ready');
  const warnings = ready.filter((p) => p.warn);
  const stageCounts = ready.reduce<Record<string, number>>((a, p) => {
    const s = STAGE_LABEL[p.row!.stage as CourierStage];
    a[s] = (a[s] || 0) + 1;
    return a;
  }, {});

  const run = async () => {
    if (!ready.length || !confirm(`رفع ${ready.length} مندوب للمكتب؟`)) return;
    const failed: { name: string; error: string }[] = [];
    let ok = 0;
    setProgress({ done: 0, total: ready.length });
    const assignments: Record<string, unknown>[] = [];
    const queueAssignment = (p: Prepared, id: string) => {
      if (p.carrierId)
        assignments.push({ office_id: office!.id, courier_id: id, carrier_id: p.carrierId, hub: p.hub || null, zone: p.zone || null, start_date: p.row!.appointment_date });
    };
    for (let i = 0; i < ready.length; i += 100) {
      const chunk = ready.slice(i, i + 100);
      const { data, error } = await supabase.from('couriers').insert(chunk.map((p) => p.row!)).select('id, national_id');
      if (!error && data) {
        ok += data.length;
        const byNid = Object.fromEntries(data.map((d) => [d.national_id, d.id]));
        chunk.forEach((p) => {
          const id = byNid[p.row!.national_id as string];
          if (id) queueAssignment(p, id);
        });
      } else {
        // لو الدفعة فشلت، ندخلهم واحد واحد عشان نعرف مين المشكلة
        for (const p of chunk) {
          const r = await supabase.from('couriers').insert(p.row!).select('id').single();
          if (r.error) failed.push({ name: p.name, error: errorMessage(r.error) });
          else {
            ok++;
            queueAssignment(p, r.data.id);
          }
        }
      }
      setProgress({ done: Math.min(i + 100, ready.length), total: ready.length });
    }
    for (let i = 0; i < assignments.length; i += 200) {
      const { error } = await supabase.from('courier_assignments').insert(assignments.slice(i, i + 200));
      if (error) toast('المناديب اترفعوا بس في شركات متسجلتش: ' + errorMessage(error), 'error');
    }
    setProgress(null);
    setResult({ ok, failed });
    setRaw([]);
    setMap(null);
    qc.invalidateQueries({ queryKey: ['couriers'] });
    qc.invalidateQueries({ queryKey: ['recruitment-overview'] });
    toast(`اترفع ${ok} مندوب.`, failed.length ? 'info' : 'success');
  };

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="رفع مناديب من شيت" subtitle="سجّل مناديب كتير مرة واحدة من ملف Excel أو CSV." />

      <Card title="1. جهّز الملف">
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <p>نزّل الـ Template واملاه: كل مندوب في سطر. الأعمدة اللي عليها <b>*</b> إجبارية والباقي اختياري. المرحلة والمركبة والمصدر وشركة الشحن ليهم قوايم اختيار جاهزة جوه الملف.</p>
          <a href="/templates/masar-couriers-template.xlsx" download className="inline-block">
            <Button variant="gold" type="button"><Download className="h-4 w-4" /> تحميل Template المناديب</Button>
          </a>
          <p className="text-xs text-slate-500">
            أو ارفع شيت <b>Couriers</b> من منصة التعيينات القديمة زي ما هو (File ← Download ← Microsoft Excel أو CSV). الأعمدة بتتعرف لوحدها،
            والمناديب المسجلين قبل كده بنفس الرقم القومي مش هيتكرروا.
          </p>
        </div>
        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
          <Upload className="h-4 w-4" /> رفع الملف (Excel أو CSV)
          <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ''; }} />
        </label>
        {fileName && <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500"><FileSpreadsheet className="h-4 w-4" /> {fileName} — {raw.length} صف</p>}
      </Card>

      {map && (
        <Card title="2. الأعمدة اللي اتعرفت">
          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            {SHOWN.map((k) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <span className="text-slate-600 dark:text-slate-300">{FIELDS[k][0]}{(k === 'full_name' || k === 'national_id' || k === 'primary_phone') && <span className="text-red-500"> *</span>}</span>
                <select className="field !w-56 !py-1.5 text-xs" value={map[k]} onChange={(e) => setMap({ ...map, [k]: e.target.value })} aria-label={FIELDS[k][0]}>
                  <option value="">— مش موجود —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">الأقارب بيتقروا سواء كانوا في عمود واحد لكل قريب (زي الشيت القديم) أو 3 أعمدة لكل قريب (زي الـ Template).</p>
        </Card>
      )}

      {map && (
        <Card title="3. المراجعة والرفع">
          <div className="flex flex-wrap gap-2">
            <Badge tone="green">{ready.length} جاهز</Badge>
            <Badge tone="amber">{prepared.filter((p) => p.status === 'duplicate').length} متكرر</Badge>
            <Badge tone="red">{prepared.filter((p) => p.status === 'invalid').length} فيه مشكلة</Badge>
            {Object.entries(stageCounts).map(([s, n]) => <Badge key={s}>{s}: {n}</Badge>)}
            {ready.some((p) => p.carrierId) && <Badge tone="blue">{ready.filter((p) => p.carrierId).length} ليهم شركة شحن</Badge>}
          </div>
          {(skipped.length > 0 || warnings.length > 0) && (
            <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <Table head={['السطر', 'الاسم', 'الملاحظة']}>
                {[...skipped, ...warnings].slice(0, 300).map((p) => (
                  <tr key={p.line}>
                    <td className="tabular px-4 py-2 text-xs">{p.line}</td>
                    <td className="px-4 py-2 text-xs font-semibold">{p.name}</td>
                    <td className={`px-4 py-2 text-xs ${p.status === 'ready' ? 'text-gold-600' : 'text-slate-500'}`}>{p.reason || p.warn}</td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={run} loading={Boolean(progress)} disabled={!ready.length}>رفع {ready.length} مندوب</Button>
            {progress && <span className="tabular text-sm text-slate-500">{progress.done} / {progress.total}</span>}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            مسؤول التعيين بيتربط بالحساب اللي اسمه مطابق في الفريق، ولو مش موجود اسمه بيتحفظ كنص. المصادر المتاحة: {LEAD_SOURCES.join('، ')}.
          </p>
        </Card>
      )}

      {result && (
        <Card title="النتيجة">
          <p className="flex items-center gap-2 font-bold text-brand-700 dark:text-brand-200"><CheckCircle2 className="h-5 w-5" /> اترفع {result.ok} مندوب.</p>
          {result.failed.length > 0 && (
            <div className="mt-3 space-y-1 text-sm">
              <p className="font-bold text-red-600">{result.failed.length} مترفعوش:</p>
              {result.failed.map((f, i) => <p key={i} className="text-xs"><b>{f.name}</b>: {f.error}</p>)}
            </div>
          )}
          <Link to="/app/recruitment/couriers" className="mt-3 inline-block text-sm font-bold text-brand-600 hover:underline">عرض المناديب ←</Link>
        </Card>
      )}
    </div>
  );
}
