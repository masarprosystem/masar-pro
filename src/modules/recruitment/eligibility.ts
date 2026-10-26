import { todayStr } from '@/core/format';
import { DOC_LABEL, ageFrom, type Carrier, type CourierDocument, type DocType } from './model';

/** المندوب ده يصلح للشركة دي؟ وليه لأ */
export function checkEligibility(c: { birth_date: string | null; vehicle_type: string | null }, docs: CourierDocument[], carrier: Carrier) {
  const reasons: string[] = [];
  const age = ageFrom(c.birth_date);
  if (carrier.min_age && age !== null && age < carrier.min_age) reasons.push(`السن ${age} وأقل حاجة ${carrier.min_age}`);
  if (carrier.max_age && age !== null && age > carrier.max_age) reasons.push(`السن ${age} وأقصى حاجة ${carrier.max_age}`);
  if ((carrier.allowed_vehicles || []).length && !(carrier.allowed_vehicles || []).includes(c.vehicle_type || '')) {
    reasons.push(`المركبة (${c.vehicle_type || 'مش محددة'}) مش من المقبولين: ${carrier.allowed_vehicles.join('، ')}`);
  }
  const today = todayStr();
  const missing = (carrier.required_docs || []).filter(
    (t) => !docs.some((d) => d.doc_type === t && (!d.expires_at || d.expires_at >= today)),
  ) as DocType[];
  if (missing.length) reasons.push(`ناقص: ${missing.map((t) => DOC_LABEL[t] || t).join('، ')}`);
  return { ok: reasons.length === 0, reasons, missing };
}

export const hasRequirements = (k: Carrier) => Boolean(k.min_age || k.max_age || (k.allowed_vehicles || []).length || (k.required_docs || []).length);
