import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { supabase } from '@/core/supabase';
import { useOffice } from '@/core/office';
import { useAuth } from '@/core/auth';
import { errorMessage } from '@/core/errors';
import { todayStr } from '@/core/format';
import { useToast } from '@/core/toast';
import { useMembers } from '@/components/MembersManager';
import { Badge, Button, Card, PageHeader, Table } from '@/components/ui';
import { STAGE_LABEL, VEHICLES, normalizePhone, parseNationalId, type CourierStage, type Relative } from './model';

// أسماء الأعمدة المحتملة لكل حقل (شيت منصة التعيينات القديمة + أسماء شائعة)
const FIELDS = {
  full_name: ['اسم المندوب', 'الاسم', 'courierName', 'name', 'Star Name'],
  national_id: ['الرقم القومي', 'nationalId', 'national id', 'national_id'],
  primary_phone: ['الموبايل الرئيسي', 'الموبايل', 'رقم الموبايل', 'primaryPhone', 'phone'],
  alt_phone: ['واتساب بديل', 'رقم تاني', 'altPhone'],
  current_address: ['العنوان الحالي', 'currentAddress'],
  original_address: ['العنوان الأصلي', 'originalAddress'],
  vehicle_type: ['نوع المركبة', 'نوع السيارة', 'vehicleType', 'Vehicle Type'],
  assigned_area: ['المنطقة', 'منطقة العمل', 'assignedArea', 'Zone'],
  recruiter: ['مسؤول HR', 'مسؤول التعيين', 'hrManager'],
  lead_source: ['مصدر المندوب', 'leadSource'],
  status: ['الحالة', 'status'],
  status_note: ['ملاحظة آخر حالة', 'statusNote'],
  appointment_date: ['تاريخ التعيين', 'appointmentDate'],
  location_link: ['رابط اللوكيشن', 'locationLink'],
  rel1: ['قريب 1 (اسم/صلة/رقم)', 'قريب 1', 'rel1'],
  rel2: ['قريب 2 (اسم/صلة/رقم)', 'قريب 2', 'rel2'],
  rel3: ['قريب 3 (اسم/صلة/رقم)', 'قريب 3', 'rel3'],
  id_card_url: ['صورة البطاقة', 'idCardUrl'],
  license_url: ['صورة الرخصة', 'licenseUrl'],
} as const;
type FieldKey = keyof typeof FIELDS;

const STATUS_MAP: Record<string, CourierStage> = {
  waiting: 'applied', pending: 'interview', 'successful interview': 'passed_interview', training: 'training',
  active: 'active', inactivate: 'inactive', inactive: 'inactive', blocked: 'blocked', left: 'left',
  'في الانتظار': 'applied', 'تحت المراجعة': 'interview', 'نجح في المقابلة': 'passed_interview', 'في التدريب': 'training',
  'نشط': 'active', 'غير نشط': 'inactive', 'محظور': 'blocked',
};
const VEHICLE_MAP: Record<string, string> = { sedan: 'ملاكي', motorbike: 'موتسيكل', van: 'فان', 'موتوسيكل': 'موتسيكل' };

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

function detect(headers: string[]) {
  const m = {} as Record<FieldKey, string>;
  (Object.keys(FIELDS) as FieldKey[]).forEach((k) => {
    const hit = headers.find((h) => FIELDS[k].some((a) => norm(a) === norm(h))) || headers.find((h) => FIELDS[k].some((a) => norm(h).includes(norm(a))));
    m[k] = hit || '';
  });
  return m;
}

function parseDate(v: string) {
  const s = (v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) {
    let d = Number(m[1]), mo = Number(m[2]);
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return todayStr();
}

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
}

export function ImportPage() {
  const { office } = useOffice();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: members } = useMembers(office?.id || '');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [raw, setRaw] = useState<Record<string, string>[]>([]);
  const [map, setMap] = useState<Record<FieldKey, string> | null>(null);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ ok: number; failed: { name: string; error: string }[] } | null>(null);

  const read = (file: File) => {
    setResult(null);
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (res) => {
        const hs = (res.meta.fields || []).filter(Boolean);
        setHeaders(hs);
        setRaw(res.data);
        setMap(detect(hs));
        // الأرقام القومية المسجلة قبل كده في المكتب
        const ids = new Set<string>();
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from('couriers').select('national_id').eq('office_id', office!.id).range(from, from + 999);
          if (error) { toast(errorMessage(error), 'error'); break; }
          data.forEach((d) => ids.add(d.national_id));
          if (data.length < 1000) break;
        }
        setExisting(ids);
      },
      error: (e) => toast('الملف مش مقروء: ' + e.message, 'error'),
    });
  };

  const prepared = useMemo<Prepared[]>(() => {
    if (!map) return [];
    const g = (r: Record<string, string>, k: FieldKey) => (map[k] ? String(r[map[k]] ?? '').trim() : '');
    const seen = new Set<string>();
    const memberByName = (n: string) => {
      const x = norm(n);
      if (!x) return null;
      return (members || []).find((m) => norm(m.full_name || '') === x) || (members || []).find((m) => norm(m.full_name || '').includes(x)) || null;
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
      const stage = STATUS_MAP[norm(g(r, 'status'))] || 'applied';
      let note = g(r, 'status_note');
      if ((stage === 'inactive' || stage === 'blocked') && !note) note = 'نقل من النظام القديم';
      const recName = g(r, 'recruiter');
      const rec = memberByName(recName);
      const vehRaw = g(r, 'vehicle_type');
      const vehicle = VEHICLE_MAP[norm(vehRaw)] || (VEHICLES.find((v) => vehRaw.includes(v)) ?? (vehRaw || null));
      const links: Record<string, string> = {};
      if (/^https?:\/\//.test(g(r, 'id_card_url'))) links.idCardUrl = g(r, 'id_card_url');
      if (/^https?:\/\//.test(g(r, 'license_url'))) links.licenseUrl = g(r, 'license_url');
      const loc = g(r, 'location_link');
      return {
        line, name, status: 'ready',
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
          stage_note: note || null,
          recruited_by: rec?.id || null,
          legacy_recruiter: rec ? null : recName || null,
          appointment_date: parseDate(g(r, 'appointment_date')),
          location_link: /^https?:\/\//.test(loc) ? loc : null,
          relatives: [g(r, 'rel1'), g(r, 'rel2'), g(r, 'rel3')].map(parseRelative).filter(Boolean),
          external_links: links,
          notes: 'اتنقل من النظام القديم',
          created_by: user?.id,
        },
      };
    });
  }, [raw, map, members, existing, office, user]);

  const ready = prepared.filter((p) => p.status === 'ready');
  const skipped = prepared.filter((p) => p.status !== 'ready');
  const stageCounts = ready.reduce<Record<string, number>>((a, p) => {
    const s = STAGE_LABEL[(p.row!.stage as CourierStage)];
    a[s] = (a[s] || 0) + 1;
    return a;
  }, {});

  const run = async () => {
    if (!ready.length) return;
    if (!confirm(`نقل ${ready.length} مندوب للمكتب؟`)) return;
    const failed: { name: string; error: string }[] = [];
    let ok = 0;
    setProgress({ done: 0, total: ready.length });
    for (let i = 0; i < ready.length; i += 100) {
      const chunk = ready.slice(i, i + 100);
      const { error } = await supabase.from('couriers').insert(chunk.map((p) => p.row!));
      if (!error) ok += chunk.length;
      else {
        // لو الدفعة فشلت، ندخلهم واحد واحد عشان نعرف مين المشكلة
        for (const p of chunk) {
          const r = await supabase.from('couriers').insert(p.row!);
          if (r.error) failed.push({ name: p.name, error: errorMessage(r.error) });
          else ok++;
        }
      }
      setProgress({ done: Math.min(i + 100, ready.length), total: ready.length });
    }
    setProgress(null);
    setResult({ ok, failed });
    setRaw([]);
    setMap(null);
    qc.invalidateQueries({ queryKey: ['couriers'] });
    qc.invalidateQueries({ queryKey: ['recruitment-overview'] });
    toast(`اتنقل ${ok} مندوب.`, failed.length ? 'info' : 'success');
  };

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="نقل المناديب من شيت قديم" subtitle="من منصة التعيينات القديمة (Google Sheet) أو أي شيت فيه نفس الأعمدة." />

      <Card title="1. صدّر الشيت كـ CSV">
        <ol className="list-decimal space-y-1 pr-5 text-sm text-slate-600 dark:text-slate-300">
          <li>افتح الـ Google Sheet، وادخل على شيت <b>Couriers</b>.</li>
          <li>File ← Download ← <b>Comma Separated Values (.csv)</b>.</li>
          <li>ارفع الملف هنا. الأعمدة بتتعرف لوحدها، والمناديب المسجلين قبل كده (بنفس الرقم القومي) مش هيتكرروا.</li>
        </ol>
        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
          <Upload className="h-4 w-4" /> اختيار ملف CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ''; }} />
        </label>
        {fileName && <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500"><FileSpreadsheet className="h-4 w-4" /> {fileName} — {raw.length} صف</p>}
      </Card>

      {map && (
        <Card title="2. الأعمدة اللي اتعرفت">
          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            {(Object.keys(FIELDS) as FieldKey[]).map((k) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <span className="text-slate-600 dark:text-slate-300">{FIELDS[k][0]}</span>
                <select className="field !w-56 !py-1.5 text-xs" value={map[k]} onChange={(e) => setMap({ ...map, [k]: e.target.value })} aria-label={FIELDS[k][0]}>
                  <option value="">— مش موجود —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
        </Card>
      )}

      {map && (
        <Card title="3. المراجعة والنقل">
          <div className="flex flex-wrap gap-2">
            <Badge tone="green">{ready.length} جاهز للنقل</Badge>
            <Badge tone="amber">{prepared.filter((p) => p.status === 'duplicate').length} متكرر</Badge>
            <Badge tone="red">{prepared.filter((p) => p.status === 'invalid').length} فيه مشكلة</Badge>
            {Object.entries(stageCounts).map(([s, n]) => <Badge key={s}>{s}: {n}</Badge>)}
          </div>
          {skipped.length > 0 && (
            <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <Table head={['السطر', 'الاسم', 'السبب']}>
                {skipped.slice(0, 200).map((p) => (
                  <tr key={p.line}><td className="tabular px-4 py-2 text-xs">{p.line}</td><td className="px-4 py-2 text-xs font-semibold">{p.name}</td><td className="px-4 py-2 text-xs text-slate-500">{p.reason}</td></tr>
                ))}
              </Table>
            </div>
          )}
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={run} loading={Boolean(progress)} disabled={!ready.length}>نقل {ready.length} مندوب</Button>
            {progress && <span className="tabular text-sm text-slate-500">{progress.done} / {progress.total}</span>}
          </div>
          <p className="mt-2 text-xs text-slate-500">مسؤول الـ HR بيتربط بالحساب اللي اسمه مطابق في الفريق. لو مش موجود، اسمه بيتحفظ كنص ويظهر في التقارير.</p>
        </Card>
      )}

      {result && (
        <Card title="النتيجة">
          <p className="flex items-center gap-2 font-bold text-brand-700 dark:text-brand-200"><CheckCircle2 className="h-5 w-5" /> اتنقل {result.ok} مندوب.</p>
          {result.failed.length > 0 && (
            <div className="mt-3 space-y-1 text-sm">
              <p className="font-bold text-red-600">{result.failed.length} متنقلوش:</p>
              {result.failed.map((f, i) => <p key={i} className="text-xs"><b>{f.name}</b>: {f.error}</p>)}
            </div>
          )}
          <Link to="/app/recruitment/couriers" className="mt-3 inline-block text-sm font-bold text-brand-600 hover:underline">عرض المناديب ←</Link>
        </Card>
      )}
    </div>
  );
}
