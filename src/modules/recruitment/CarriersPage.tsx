import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { supabase } from '@/core/supabase';
import { useOffice } from '@/core/office';
import { errorMessage } from '@/core/errors';
import { useToast } from '@/core/toast';
import { Badge, Button, Card, Field, PageHeader, Spinner } from '@/components/ui';
import { useCarriers } from './api';
import { hasRequirements } from './eligibility';
import { DOC_LABEL, DOC_TYPES, VEHICLES, type Carrier } from './model';

export interface CarrierBilling { carrier_id: string; office_id: string; model: 'none' | 'per_shipment' | 'per_courier' | 'percent'; rate: number; covers_salaries: boolean; notes: string | null }
export const BILLING_LABEL: Record<CarrierBilling['model'], string> = {
  none: 'من غير عمولة',
  per_shipment: 'عمولة على كل شحنة',
  per_courier: 'عمولة على كل مندوب في الشهر',
  percent: 'نسبة من مرتبات المناديب',
};

export function useCarrierBilling(officeId?: string, enabled = true) {
  return useQuery({
    queryKey: ['carrier-billing', officeId],
    enabled: Boolean(officeId) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('carrier_billing').select('*').eq('office_id', officeId!);
      if (error) throw error;
      return data as CarrierBilling[];
    },
  });
}

export function CarriersPage() {
  const { office, role, writable, can } = useOffice();
  const canEdit = writable && (role === 'owner' || role === 'operations');
  const canBilling = (role === 'owner' || role === 'accountant') && can('payroll');
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useCarriers(office?.id);
  const { data: billing } = useCarrierBilling(office?.id, canBilling);
  const [name, setName] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['carriers', office?.id] });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('carriers').insert({ office_id: office!.id, name: name.trim(), sort_order: (data?.length || 0) + 1 });
      if (error) throw error;
    },
    onSuccess: () => { setName(''); refresh(); toast('اتضافت الشركة.', 'success'); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Carrier> }) => {
      const { error } = await supabase.from('carriers').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast('اتحفظ.', 'success'); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="شركات الشحن" subtitle="الشركات اللي المكتب بيعيّن لها مناديب، وشروط ومستندات كل شركة. الشركة الموقوفة بتختفي من الاختيارات بس تاريخها بيفضل." />
      {canEdit && (
        <Card>
          <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(); }} className="flex gap-2">
            <input className="field" placeholder="اسم الشركة، مثلاً: Talabat" value={name} onChange={(e) => setName(e.target.value)} aria-label="اسم الشركة" />
            <Button type="submit" loading={add.isPending} disabled={!name.trim()}><Plus className="h-4 w-4" /> إضافة</Button>
          </form>
        </Card>
      )}
      <Card className="overflow-hidden [&>div:last-child]:p-0">
        {isLoading ? <Spinner /> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data || []).map((c) => (
              <li key={c.id}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  {canEdit ? (
                    <input className="field max-w-xs !py-1.5 font-bold" defaultValue={c.name}
                      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.name && update.mutate({ id: c.id, patch: { name: e.target.value.trim() } })} aria-label="اسم الشركة" />
                  ) : <span className="font-bold">{c.name}</span>}
                  <div className="flex items-center gap-2">
                    {hasRequirements(c) && <Badge tone="blue">ليها شروط</Badge>}
                    {c.is_active ? <Badge tone="green">شغالة</Badge> : <Badge>موقوفة</Badge>}
                    {canEdit && <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: c.id, patch: { is_active: !c.is_active } })}>{c.is_active ? 'إيقاف' : 'تفعيل'}</Button>}
                    <Button size="sm" variant="secondary" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>
                      الشروط{canBilling ? ' والتسعير' : ''} {open === c.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                {open === c.id && (
                  <div className="space-y-5 bg-slate-50 px-5 py-4 dark:bg-white/5">
                    <Requirements carrier={c} canEdit={canEdit} onSave={(patch) => update.mutate({ id: c.id, patch })} saving={update.isPending} />
                    {canBilling && <Billing carrier={c} billing={billing?.find((b) => b.carrier_id === c.id)} canEdit={writable} />}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Requirements({ carrier, canEdit, onSave, saving }: { carrier: Carrier; canEdit: boolean; onSave: (p: Partial<Carrier>) => void; saving: boolean }) {
  const [f, setF] = useState({ min: '', max: '', vehicles: [] as string[], docs: [] as string[] });
  useEffect(() => setF({ min: carrier.min_age ? String(carrier.min_age) : '', max: carrier.max_age ? String(carrier.max_age) : '', vehicles: carrier.allowed_vehicles || [], docs: carrier.required_docs || [] }), [carrier]);
  const toggle = (k: 'vehicles' | 'docs', v: string) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));
  const chip = (on: boolean) => `rounded-lg border px-2.5 py-1 text-xs font-bold ${on ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200' : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-transparent'}`;
  return (
    <fieldset disabled={!canEdit} className="space-y-3">
      <p className="text-xs font-extrabold text-brand-800 dark:text-brand-200">شروط {carrier.name}</p>
      <div className="grid grid-cols-2 gap-3 md:w-80">
        <Field label="أقل سن" htmlFor={`min_${carrier.id}`}><input id={`min_${carrier.id}`} type="number" min="16" max="80" dir="ltr" className="field" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} placeholder="—" /></Field>
        <Field label="أكبر سن" htmlFor={`max_${carrier.id}`}><input id={`max_${carrier.id}`} type="number" min="16" max="80" dir="ltr" className="field" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} placeholder="—" /></Field>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">المركبات المقبولة <span className="font-normal text-slate-500">(ولا واحدة = أي مركبة)</span></p>
        <div className="flex flex-wrap gap-1.5">{VEHICLES.map((v) => <button key={v} type="button" className={chip(f.vehicles.includes(v))} onClick={() => toggle('vehicles', v)}>{v}</button>)}</div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">المستندات المطلوبة</p>
        <div className="flex flex-wrap gap-1.5">{DOC_TYPES.filter((d) => d !== 'other').map((d) => <button key={d} type="button" className={chip(f.docs.includes(d))} onClick={() => toggle('docs', d)}>{DOC_LABEL[d]}</button>)}</div>
      </div>
      {canEdit && (
        <Button size="sm" loading={saving} onClick={() => onSave({ min_age: f.min ? Number(f.min) : null, max_age: f.max ? Number(f.max) : null, allowed_vehicles: f.vehicles, required_docs: f.docs })}>حفظ الشروط</Button>
      )}
    </fieldset>
  );
}

function Billing({ carrier, billing, canEdit }: { carrier: Carrier; billing?: CarrierBilling; canEdit: boolean }) {
  const { office } = useOffice();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ model: 'none' as CarrierBilling['model'], rate: '', covers: true });
  useEffect(() => setF({ model: billing?.model || 'none', rate: billing ? String(billing.rate) : '', covers: billing?.covers_salaries ?? true }), [billing]);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('carrier_billing').upsert({ carrier_id: carrier.id, office_id: office!.id, model: f.model, rate: Number(f.rate) || 0, covers_salaries: f.covers, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['carrier-billing'] }); toast('اتحفظ التسعير.', 'success'); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const unit = f.model === 'percent' ? '%' : 'ج.م';
  return (
    <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
      <p className="text-xs font-extrabold text-brand-800 dark:text-brand-200">حساب المكتب مع {carrier.name} <span className="font-normal text-slate-500">(بيظهر لصاحب المكتب والمحاسب بس)</span></p>
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" checked={f.covers} disabled={!canEdit} onChange={(e) => setF({ ...f, covers: e.target.checked })} />
        الشركة بتحوّل مرتبات المناديب للمكتب (والمكتب بيصرفها)
      </label>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_160px_auto] md:items-end">
        <Field label="عمولة المكتب" htmlFor={`bm_${carrier.id}`}>
          <select id={`bm_${carrier.id}`} className="field" value={f.model} disabled={!canEdit} onChange={(e) => setF({ ...f, model: e.target.value as CarrierBilling['model'] })}>
            {(Object.keys(BILLING_LABEL) as CarrierBilling['model'][]).map((k) => <option key={k} value={k}>{BILLING_LABEL[k]}</option>)}
          </select>
        </Field>
        {f.model !== 'none' && (
          <Field label={`القيمة (${unit})`} htmlFor={`br_${carrier.id}`}><input id={`br_${carrier.id}`} type="number" min="0" step="0.01" dir="ltr" className="field" disabled={!canEdit} value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></Field>
        )}
        {canEdit && <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>حفظ التسعير</Button>}
      </div>
      <p className="text-[11px] text-slate-500">لو الشركة بتحاسبك بمبلغ مختلف في شهر معين، تقدر تكتبه في صفحة «ربحية المكتب» ويتحسب بدل التسعير ده.</p>
    </div>
  );
}
