import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file';

export type Cell = string | number | boolean | Date | null;

/** قراءة أول شيت من ملف Excel أو CSV كصفوف */
export async function readSheet(file: File): Promise<Cell[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    return new Promise((resolve, reject) => {
      Papa.parse<string[]>(file, {
        skipEmptyLines: 'greedy',
        complete: (r) => resolve(r.data as Cell[][]),
        error: (e) => reject(new Error('الملف مش مقروء: ' + e.message)),
      });
    });
  }
  if (name.endsWith('.xlsx')) {
    try {
      return (await readXlsxFile(file)) as Cell[][];
    } catch {
      throw new Error('ملف الإكسل مش مقروء. افتحه واحفظه تاني بصيغة .xlsx');
    }
  }
  if (name.endsWith('.xls')) throw new Error('الصيغة القديمة .xls مش مدعومة. افتح الملف واحفظه بصيغة .xlsx');
  throw new Error('ارفع ملف Excel (.xlsx) أو CSV');
}

export const normHeader = (s: unknown) =>
  String(s ?? '')
    .replace(/[\u064B-\u0652]/g, '') // التشكيل
    .replace(/[#*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** أول صف (من أول 15) فيه عمود من الأعمدة المطلوبة = صف العناوين */
export function findHeaderRow(rows: Cell[][], anyOf: readonly string[]) {
  const targets = anyOf.map(normHeader);
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if ((rows[i] || []).some((c) => targets.includes(normHeader(c)))) return i;
  }
  return 0;
}

/** ربط كل حقل بعمود من عناوين الشيت: تطابق كامل الأول، وبعدين احتواء */
export function detectColumns<K extends string>(headers: string[], fields: Record<K, readonly string[]>, saved?: Partial<Record<K, string>> | null) {
  const out = {} as Record<K, string>;
  const used = new Set<string>();
  const keys = Object.keys(fields) as K[];
  for (const k of keys) {
    const s = saved?.[k];
    if (s && headers.includes(s)) { out[k] = s; used.add(s); }
  }
  for (const k of keys) {
    if (out[k]) continue;
    const aliases = fields[k].map(normHeader);
    const hit = headers.find((h) => !used.has(h) && aliases.includes(normHeader(h)));
    if (hit) { out[k] = hit; used.add(hit); }
  }
  for (const k of keys) {
    if (out[k]) continue;
    const aliases = fields[k].map(normHeader).filter((a) => a.length > 3);
    const hit = headers.find((h) => !used.has(h) && aliases.some((a) => normHeader(h).includes(a)));
    out[k] = hit || '';
    if (hit) used.add(hit);
  }
  return out;
}

export function toObjects(rows: Cell[][], headerRow: number) {
  const headers = (rows[headerRow] || []).map((h, i) => String(h ?? '').trim() || `عمود ${i + 1}`);
  const data = rows
    .slice(headerRow + 1)
    .filter((r) => r && r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? null])) as Record<string, Cell>);
  return { headers, data };
}

export const cellText = (v: Cell | undefined) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
};

/** أرقام: 1,500 أو (1,500) بالسالب أو "-" = صفر */
export const cellNumber = (v: Cell | undefined) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = cellText(v).replace(/,/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (!s || s === '-') return 0;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  const n = parseFloat(s.replace(/[()\-\s]/g, ''));
  return Number.isNaN(n) ? 0 : neg ? -n : n;
};

/** تاريخ من خلية: Date أو YYYY-MM-DD أو D/M/YYYY */
export function cellDate(v: Cell | undefined, fallback: string) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = cellText(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) {
    let d = Number(m[1]), mo = Number(m[2]);
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return fallback;
}

/** كل الصفوف حتى لو أكتر من 1000 (حد Supabase في الطلب الواحد) */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, size = 1000) {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < size) break;
  }
  return out;
}
