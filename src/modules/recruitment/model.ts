import type { Tone } from '@/core/format';

export type CourierStage = 'applied' | 'interview' | 'passed_interview' | 'training' | 'active' | 'inactive' | 'blocked' | 'left';

export interface Relative { name: string; relation: string; phone: string }

export interface Courier {
  id: string;
  office_id: string;
  full_name: string;
  national_id: string;
  birth_date: string | null;
  gender: 'male' | 'female' | null;
  birth_governorate: string | null;
  primary_phone: string;
  alt_phone: string | null;
  current_address: string | null;
  original_address: string | null;
  location_link: string | null;
  vehicle_type: string | null;
  assigned_area: string | null;
  lead_source: string | null;
  stage: CourierStage;
  stage_note: string | null;
  stage_changed_at: string;
  recruited_by: string | null;
  legacy_recruiter: string | null;
  appointment_date: string;
  relatives: Relative[];
  external_links: Record<string, string>;
  current_carrier_id: string | null;
  current_hub: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Carrier { id: string; office_id: string; name: string; is_active: boolean; sort_order: number; payroll_mapping?: Record<string, string> | null }

export interface StageHistory {
  id: number;
  courier_id: string;
  from_stage: CourierStage | null;
  to_stage: CourierStage;
  note: string | null;
  changed_by: string | null;
  changed_at: string;
}

export interface Assignment {
  id: string;
  courier_id: string;
  carrier_id: string;
  hub: string | null;
  zone: string | null;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  notes: string | null;
}

export type DocType = 'id_front' | 'id_back' | 'driving_license' | 'vehicle_license' | 'criminal_record' | 'personal_photo' | 'other';

export interface CourierDocument {
  id: string;
  courier_id: string;
  doc_type: DocType;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
}

export const STAGES: CourierStage[] = ['applied', 'interview', 'passed_interview', 'training', 'active', 'inactive', 'blocked', 'left'];
export const PIPELINE: CourierStage[] = ['applied', 'interview', 'passed_interview', 'training'];

export const STAGE_LABEL: Record<CourierStage, string> = {
  applied: 'مُتقدم',
  interview: 'مقابلة',
  passed_interview: 'نجح في المقابلة',
  training: 'تدريب',
  active: 'نشط',
  inactive: 'غير نشط',
  blocked: 'محظور',
  left: 'ساب الشغل',
};
export const STAGE_TONE: Record<CourierStage, Tone> = {
  applied: 'slate',
  interview: 'blue',
  passed_interview: 'gold',
  training: 'amber',
  active: 'green',
  inactive: 'slate',
  blocked: 'red',
  left: 'red',
};
export const STAGE_COLOR: Record<CourierStage, string> = {
  applied: '#94a3b8',
  interview: '#3b82f6',
  passed_interview: '#c99a3c',
  training: '#f59e0b',
  active: '#0b5a3a',
  inactive: '#64748b',
  blocked: '#dc2626',
  left: '#f87171',
};
export const NOTE_REQUIRED: CourierStage[] = ['inactive', 'blocked'];

export const LEAD_SOURCES = ['إعلان فيسبوك', 'ترشيح من مندوب', 'تسديد ميداني', 'مقر الشركة مباشر', 'واتساب', 'أخرى'];
export const VEHICLES = ['موتسيكل', 'ملاكي', 'فان', 'دبابة', 'تروسيكل', 'عجلة', 'بدون مركبة'];

export const DOC_TYPES: DocType[] = ['id_front', 'id_back', 'driving_license', 'vehicle_license', 'criminal_record', 'personal_photo', 'other'];
export const DOC_LABEL: Record<DocType, string> = {
  id_front: 'البطاقة (وش)',
  id_back: 'البطاقة (ضهر)',
  driving_license: 'رخصة القيادة',
  vehicle_license: 'رخصة المركبة',
  criminal_record: 'فيش وتشبيه',
  personal_photo: 'صورة شخصية',
  other: 'مستند تاني',
};
export const DOC_HAS_EXPIRY: DocType[] = ['driving_license', 'vehicle_license', 'criminal_record'];
export const REQUIRED_DOCS: DocType[] = ['id_front', 'id_back', 'driving_license'];

export const GOVERNORATES: Record<string, string> = {
  '01': 'القاهرة', '02': 'الإسكندرية', '03': 'بورسعيد', '04': 'السويس', '11': 'دمياط', '12': 'الدقهلية',
  '13': 'الشرقية', '14': 'القليوبية', '15': 'كفر الشيخ', '16': 'الغربية', '17': 'المنوفية', '18': 'البحيرة',
  '19': 'الإسماعيلية', '21': 'الجيزة', '22': 'بني سويف', '23': 'الفيوم', '24': 'المنيا', '25': 'أسيوط',
  '26': 'سوهاج', '27': 'قنا', '28': 'أسوان', '29': 'الأقصر', '31': 'البحر الأحمر', '32': 'الوادي الجديد',
  '33': 'مطروح', '34': 'شمال سيناء', '35': 'جنوب سيناء', '88': 'مواليد الخارج',
};

/** قراءة الرقم القومي المصري: تاريخ الميلاد والسن والنوع والمحافظة */
export function parseNationalId(nid: string) {
  const v = nid.trim();
  if (!/^[23]\d{13}$/.test(v)) return null;
  const year = (v[0] === '2' ? 1900 : 2000) + Number(v.slice(1, 3));
  const month = Number(v.slice(3, 5));
  const day = Number(v.slice(5, 7));
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  const now = new Date();
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age--;
  const gov = v.slice(7, 9);
  return {
    birthDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    age,
    gender: Number(v[12]) % 2 === 1 ? 'male' : 'female',
    governorate: GOVERNORATES[gov] || `كود ${gov}`,
  } as const;
}

export const ageFrom = (birth: string | null) => {
  if (!birth) return null;
  const [y, m, d] = birth.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
};

/** تنضيف رقم الموبايل: أرقام بس، ويرجّع الصفر اللي جوجل شيت بيشيله */
export function normalizePhone(p: string | null | undefined) {
  let s = String(p || '').replace(/[^\d+]/g, '');
  if (s.startsWith('+20')) s = '0' + s.slice(3);
  else if (s.startsWith('0020')) s = '0' + s.slice(4);
  else if (/^1[0125]\d{8}$/.test(s)) s = '0' + s;
  return s;
}
export const isEgyptMobile = (p: string) => /^01[0125]\d{8}$/.test(p);
