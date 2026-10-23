import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/core/supabase';
import { useOffice } from '@/core/office';
import { useAuth } from '@/core/auth';
import { errorMessage } from '@/core/errors';
import { todayStr } from '@/core/format';
import { useToast } from '@/core/toast';
import { useMembers } from '@/components/MembersManager';
import { Button, Card, Field, PageHeader, Spinner } from '@/components/ui';
import { useCarriers, useCourier } from './api';
import { LEAD_SOURCES, STAGES, STAGE_LABEL, VEHICLES, isEgyptMobile, normalizePhone, parseNationalId, type CourierStage, type Relative } from './model';

const emptyRel = (): Relative => ({ name: '', relation: '', phone: '' });

export function CourierFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { office, membership } = useOffice();
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: existing, isLoading } = useCourier(id);
  const { data: members } = useMembers(office?.id || '');
  const { data: carriers } = useCarriers(office?.id);

  const [f, setF] = useState({
    full_name: '', national_id: '', primary_phone: '', alt_phone: '', current_address: '', original_address: '',
    location_link: '', vehicle_type: VEHICLES[0], assigned_area: '', lead_source: LEAD_SOURCES[0],
    stage: 'applied' as CourierStage, stage_note: '', recruited_by: '', appointment_date: todayStr(), notes: '',
    carrier_id: '', hub: '', zone: '',
  });
  const [rels, setRels] = useState<Relative[]>([emptyRel(), emptyRel(), emptyRel()]);

  useEffect(() => {
    if (!editing && membership && !f.recruited_by) setF((x) => ({ ...x, recruited_by: membership.id }));
  }, [membership]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!existing) return;
    setF((x) => ({
      ...x,
      full_name: existing.full_name, national_id: existing.national_id, primary_phone: existing.primary_phone,
      alt_phone: existing.alt_phone || '', current_address: existing.current_address || '', original_address: existing.original_address || '',
      location_link: existing.location_link || '', vehicle_type: existing.vehicle_type || '', assigned_area: existing.assigned_area || '',
      lead_source: existing.lead_source || '', stage: existing.stage, stage_note: existing.stage_note || '',
      recruited_by: existing.recruited_by || '', appointment_date: existing.appointment_date, notes: existing.notes || '',
    }));
    const r = [...(existing.relatives || [])];
    while (r.length < 3) r.push(emptyRel());
    setRels(r);
  }, [existing]);

  const nid = useMemo(() => parseNationalId(f.national_id), [f.national_id]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const mut = useMutation({
    mutationFn: async () => {
      const phone = normalizePhone(f.primary_phone);
      if (!nid) throw new Error('الرقم القومي لازم يكون 14 رقم صحيح');
      if (!isEgyptMobile(phone)) throw new Error('رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 010 / 011 / 012 / 015');
      const filledRels = rels.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), relation: r.relation.trim(), phone: normalizePhone(r.phone) }));
      if (filledRels.length < 2) throw new Error('لازم تكتب بيانات قريبين على الأقل');
      const row = {
        full_name: f.full_name.trim(),
        national_id: f.national_id.trim(),
        primary_phone: phone,
        alt_phone: normalizePhone(f.alt_phone) || null,
        current_address: f.current_address.trim() || null,
        original_address: f.original_address.trim() || null,
        location_link: f.location_link.trim() || null,
        vehicle_type: f.vehicle_type || null,
        assigned_area: f.assigned_area.trim() || null,
        lead_source: f.lead_source || null,
        recruited_by: f.recruited_by || null,
        appointment_date: f.appointment_date,
        relatives: filledRels,
        notes: f.notes.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from('couriers').update(row).eq('id', id!);
        if (error) throw error;
        return id!;
      }
      const { data, error } = await supabase
        .from('couriers')
        .insert({ ...row, office_id: office!.id, stage: f.stage, stage_note: f.stage_note.trim() || null, created_by: user?.id })
        .select('id')
        .single();
      if (error) throw error;
      if (f.carrier_id) {
        const a = await supabase.from('courier_assignments').insert({
          office_id: office!.id, courier_id: data.id, carrier_id: f.carrier_id, hub: f.hub.trim() || null, zone: f.zone.trim() || null, start_date: f.appointment_date, created_by: user?.id,
        });
        if (a.error) toast('المندوب اتسجل بس الشركة متسجلتش: ' + errorMessage(a.error), 'error');
      }
      return data.id as string;
    },
    onSuccess: (cid) => {
      qc.invalidateQueries({ queryKey: ['couriers'] });
      qc.invalidateQueries({ queryKey: ['couriers-pipeline'] });
      qc.invalidateQueries({ queryKey: ['courier', cid] });
      qc.invalidateQueries({ queryKey: ['recruitment-overview'] });
      toast(editing ? 'اتحفظت التعديلات.' : 'اتسجل المندوب. تقدر ترفع مستنداته دلوقتي.', 'success');
      nav(`/app/recruitment/couriers/${cid}`);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (editing && isLoading) return <Spinner />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mut.mutate();
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-5xl space-y-5">
      <PageHeader title={editing ? `تعديل: ${existing?.full_name || ''}` : 'تسجيل مندوب جديد'} />

      <Card title="بيانات التعيين">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="تاريخ التعيين" required htmlFor="f_date"><input id="f_date" type="date" required className="field" value={f.appointment_date} onChange={set('appointment_date')} /></Field>
          <Field label="مسؤول التعيين" htmlFor="f_rec" hint="بتتحسب له العمولة على المندوب ده">
            <select id="f_rec" className="field" value={f.recruited_by} onChange={set('recruited_by')}>
              <option value="">—</option>
              {(members || []).filter((m) => m.is_active).map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
            </select>
          </Field>
          <Field label="مصدر المندوب" htmlFor="f_src">
            <select id="f_src" className="field" value={f.lead_source} onChange={set('lead_source')}>
              {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          {!editing && (
            <Field label="المرحلة" htmlFor="f_stage">
              <select id="f_stage" className="field font-bold" value={f.stage} onChange={set('stage')}>
                {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
              </select>
            </Field>
          )}
          <Field label="منطقة العمل" htmlFor="f_area"><input id="f_area" className="field" placeholder="مثال: المعادي" value={f.assigned_area} onChange={set('assigned_area')} /></Field>
          <Field label="نوع المركبة" htmlFor="f_veh">
            <select id="f_veh" className="field" value={f.vehicle_type} onChange={set('vehicle_type')}>
              {VEHICLES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          {!editing && (f.stage === 'inactive' || f.stage === 'blocked') && (
            <Field label="السبب" required htmlFor="f_snote"><input id="f_snote" required className="field" value={f.stage_note} onChange={set('stage_note')} /></Field>
          )}
        </div>
      </Card>

      {!editing && (
        <Card title="نازل لأنهي شركة؟ (اختياري)">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="شركة الشحن" htmlFor="f_car">
              <select id="f_car" className="field" value={f.carrier_id} onChange={set('carrier_id')}>
                <option value="">لسه متحددتش</option>
                {(carriers || []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="الهب" htmlFor="f_hub"><input id="f_hub" className="field" placeholder="مثال: Maadi Hub" value={f.hub} onChange={set('hub')} disabled={!f.carrier_id} /></Field>
            <Field label="الزون" htmlFor="f_zone"><input id="f_zone" className="field" value={f.zone} onChange={set('zone')} disabled={!f.carrier_id} /></Field>
          </div>
        </Card>
      )}

      <Card title="البيانات الشخصية">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <Field label="الاسم رباعي" required htmlFor="f_name"><input id="f_name" required className="field" value={f.full_name} onChange={set('full_name')} /></Field>
          </div>
          <Field label="الرقم القومي" required htmlFor="f_nid"
            hint={nid ? `${nid.gender === 'male' ? 'ذكر' : 'أنثى'} · ${nid.age} سنة · مواليد ${nid.governorate}` : f.national_id.length === 14 ? 'الرقم ده مش صحيح' : undefined}>
            <input id="f_nid" required inputMode="numeric" maxLength={14} dir="ltr" className={`field font-mono ${f.national_id.length === 14 && !nid ? '!border-red-400' : ''}`} value={f.national_id} onChange={(e) => setF((x) => ({ ...x, national_id: e.target.value.replace(/\D/g, '') }))} />
          </Field>
          <Field label="الموبايل / الواتساب" required htmlFor="f_phone"><input id="f_phone" required type="tel" dir="ltr" className="field" placeholder="01012345678" value={f.primary_phone} onChange={set('primary_phone')} /></Field>
          <Field label="رقم تاني / طوارئ" htmlFor="f_alt"><input id="f_alt" type="tel" dir="ltr" className="field" value={f.alt_phone} onChange={set('alt_phone')} /></Field>
          <Field label="رابط اللوكيشن" htmlFor="f_loc"><input id="f_loc" type="url" dir="ltr" className="field" placeholder="https://maps.google.com/..." value={f.location_link} onChange={set('location_link')} /></Field>
          <div className="md:col-span-2">
            <Field label="العنوان الحالي" htmlFor="f_addr"><input id="f_addr" className="field" value={f.current_address} onChange={set('current_address')} /></Field>
          </div>
          <Field label="العنوان الأصلي / المحافظة" htmlFor="f_orig"><input id="f_orig" className="field" value={f.original_address} onChange={set('original_address')} /></Field>
        </div>
        {nid && nid.age < 18 && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700 dark:bg-red-950 dark:text-red-300">تنبيه: السن أقل من 18 سنة.</p>}
      </Card>

      <Card title="أقارب الدرجة الأولى (اتنين على الأقل)">
        <div className="space-y-3">
          {rels.map((r, i) => (
            <div key={i} className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 dark:bg-white/5 md:grid-cols-3">
              <input className="field" placeholder={`اسم القريب ${i + 1}`} value={r.name} onChange={(e) => setRels((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} aria-label={`اسم القريب ${i + 1}`} />
              <input className="field" placeholder="صلة القرابة: أب / أخ / زوجة..." value={r.relation} onChange={(e) => setRels((x) => x.map((y, j) => (j === i ? { ...y, relation: e.target.value } : y)))} aria-label="صلة القرابة" />
              <input className="field" type="tel" dir="ltr" placeholder="01xxxxxxxxx" value={r.phone} onChange={(e) => setRels((x) => x.map((y, j) => (j === i ? { ...y, phone: e.target.value } : y)))} aria-label="موبايل القريب" />
            </div>
          ))}
        </div>
      </Card>

      <Card title="ملاحظات">
        <textarea rows={2} className="field" value={f.notes} onChange={set('notes')} aria-label="ملاحظات" />
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => nav(-1)}>رجوع</Button>
        <Button type="submit" loading={mut.isPending}>{editing ? 'حفظ التعديلات' : 'تسجيل المندوب'}</Button>
      </div>
    </form>
  );
}
