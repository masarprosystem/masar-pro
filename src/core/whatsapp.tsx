import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, MessageCircle } from 'lucide-react';
import { supabase } from './supabase';
import { useOffice } from './office';
import { Button, Field, Modal } from '@/components/ui';

export interface OfficeSettings { office_id: string; apply_enabled: boolean; apply_intro: string | null; wa_templates: Partial<Record<WaKey, string>> }
export type WaKey = 'general' | 'interview' | 'training' | 'payslip';

export const WA_LABEL: Record<WaKey, string> = { general: 'رسالة عادية', interview: 'دعوة لمقابلة', training: 'تذكير بالتدريب', payslip: 'كشف المرتب' };
export const WA_DEFAULTS: Record<WaKey, string> = {
  general: 'أهلاً {الاسم} 👋\nمعاك {المكتب}.',
  interview: 'أهلاً {الاسم} 👋\nمعاك {المكتب}. ميعاد المقابلة يوم {التاريخ} الساعة {الوقت}.\nياريت تيجي ومعاك البطاقة الأصل والرخصة.',
  training: 'أهلاً {الاسم} 👋\nتذكير من {المكتب}: التدريب يوم {التاريخ} الساعة {الوقت}.\nمتتأخرش، وجيب معاك البطاقة والرخصة.',
  payslip: 'أهلاً {الاسم} 👋\nكشف مرتب {الشهر} من {المكتب}:\n{التفاصيل}\nالصافي: {الصافي} ج.م',
};
export const WA_VARS: Record<WaKey, string[]> = {
  general: ['{الاسم}', '{المكتب}'],
  interview: ['{الاسم}', '{المكتب}', '{التاريخ}', '{الوقت}'],
  training: ['{الاسم}', '{المكتب}', '{التاريخ}', '{الوقت}'],
  payslip: ['{الاسم}', '{المكتب}', '{الشهر}', '{التفاصيل}', '{الصافي}'],
};

export function useOfficeSettings(officeId?: string) {
  return useQuery({
    queryKey: ['office-settings', officeId],
    enabled: Boolean(officeId),
    queryFn: async () => {
      const { data, error } = await supabase.from('office_settings').select('*').eq('office_id', officeId!).maybeSingle();
      if (error) throw error;
      const fallback: OfficeSettings = { office_id: officeId!, apply_enabled: false, apply_intro: null, wa_templates: {} };
      return (data as OfficeSettings | null) || fallback;
    },
  });
}

/** رقم مصري ← صيغة واتساب الدولية */
export function waNumber(phone: string) {
  const d = (phone || '').replace(/\D/g, '');
  if (d.startsWith('20')) return d;
  if (d.startsWith('0')) return `2${d}`;
  return d;
}

export function fillTemplate(t: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), t);
}

export function openWhatsApp(phone: string, text: string) {
  window.open(`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}

/** زرار واتساب برسائل جاهزة */
export function WhatsAppMenu({ phone, name, keys = ['general', 'interview', 'training'], extra, size = 'md' }: {
  phone: string; name: string; keys?: WaKey[]; extra?: Record<string, string>; size?: 'sm' | 'md';
}) {
  const { office } = useOffice();
  const { data: settings } = useOfficeSettings(office?.id);
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<WaKey | null>(null);
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  const [when, setWhen] = useState({ date: tomorrow, time: '11:00' });
  const template = (k: WaKey) => settings?.wa_templates?.[k] || WA_DEFAULTS[k];
  const first = name.split(' ')[0] || name;
  const send = (k: WaKey, w?: { date: string; time: string }) => {
    const dateTxt = w ? new Date(w.date + 'T12:00:00').toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
    const timeTxt = w ? new Date(`2000-01-01T${w.time}`).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' }) : '';
    openWhatsApp(phone, fillTemplate(template(k), { 'الاسم': first, 'المكتب': office?.name || '', 'التاريخ': dateTxt, 'الوقت': timeTxt, ...extra }));
    setOpen(false);
    setAsk(null);
  };
  return (
    <div className="relative">
      <Button variant="secondary" size={size} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <MessageCircle className="h-4 w-4" /> واتساب <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="قفل" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-[#16231e]">
            {keys.map((k) => (
              <button key={k} type="button" className="block w-full px-4 py-2.5 text-right text-sm font-bold hover:bg-brand-50 dark:hover:bg-white/5"
                onClick={() => (k === 'interview' || k === 'training' ? (setAsk(k), setOpen(false)) : send(k))}>
                {WA_LABEL[k]}
              </button>
            ))}
          </div>
        </>
      )}
      <Modal open={Boolean(ask)} onClose={() => setAsk(null)} title={ask ? WA_LABEL[ask] : ''}
        footer={<><Button variant="secondary" onClick={() => setAsk(null)}>إلغاء</Button><Button onClick={() => ask && send(ask, when)}><MessageCircle className="h-4 w-4" /> افتح واتساب</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="اليوم" htmlFor="wa_d"><input id="wa_d" type="date" className="field" value={when.date} onChange={(e) => setWhen({ ...when, date: e.target.value })} /></Field>
          <Field label="الساعة" htmlFor="wa_t"><input id="wa_t" type="time" className="field" value={when.time} onChange={(e) => setWhen({ ...when, time: e.target.value })} /></Field>
        </div>
        <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">{ask && fillTemplate(template(ask), { 'الاسم': first, 'المكتب': office?.name || '', 'التاريخ': when.date, 'الوقت': when.time })}</p>
      </Modal>
    </div>
  );
}
