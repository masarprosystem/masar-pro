// صفحة التقديم العامة: /apply/:slug (من غير تسجيل دخول)
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Camera, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/core/supabase';
import { Button, Field, Spinner } from '@/components/ui';
import { compressImage } from '@/modules/recruitment/files';
import { VEHICLES, parseNationalId, normalizePhone, isEgyptMobile } from '@/modules/recruitment/model';

type Doc = 'id_front' | 'id_back' | 'driving_license';
const DOC_TEXT: Record<Doc, string> = { id_front: 'وش البطاقة', id_back: 'ضهر البطاقة', driving_license: 'رخصة القيادة' };

export function PublicApplyPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const { data: office, isLoading } = useQuery({
    queryKey: ['public-office', slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('public_office', { p_slug: slug });
      if (error) throw error;
      return data as { id: string; name: string; intro: string | null; accepting: boolean } | null;
    },
  });
  const [f, setF] = useState({ full_name: '', national_id: '', phone: '', alt_phone: '', area: '', address: '', vehicle: VEHICLES[0], rel_name: '', rel_relation: '', rel_phone: '', website: '', agree: false });
  const [files, setFiles] = useState<Partial<Record<Doc, Blob>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<null | 'ok' | 'dup'>(null);
  const nid = useMemo(() => parseNationalId(f.national_id), [f.national_id]);
  useEffect(() => { document.title = office?.name ? `التقديم في ${office.name}` : 'التقديم'; }, [office?.name]);

  const pick = async (t: Doc, file?: File | null) => {
    if (!file) return;
    try { setFiles((x) => ({ ...x, [t]: undefined })); const b = await compressImage(file); setFiles((x) => ({ ...x, [t]: b })); }
    catch { setError('الصورة دي مش مقروءة، جرّب صورة تانية.'); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (f.website) return; // حماية من البرامج الأوتوماتيك
    if (!nid) return setError('الرقم القومي غير صحيح');
    if (nid.age < 18) return setError('لازم يكون سنك 18 سنة أو أكتر');
    if (!isEgyptMobile(normalizePhone(f.phone))) return setError('رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01');
    if (!files.id_front || !files.id_back) return setError('صوّر وش وضهر البطاقة');
    setBusy(true);
    try {
      const folder = `${office!.id}/apply/${crypto.randomUUID()}`;
      const docs = [];
      for (const [t, blob] of Object.entries(files) as [Doc, Blob][]) {
        if (!blob) continue;
        const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
        const path = `${folder}/${t}.${ext}`;
        const { error: upErr } = await supabase.storage.from('documents').upload(path, blob, { contentType: blob.type, upsert: false });
        if (upErr) throw upErr;
        docs.push({ doc_type: t, path, size: String(blob.size), mime: blob.type });
      }
      const { data, error: rpcErr } = await supabase.rpc('public_apply', {
        p_slug: slug,
        p: {
          full_name: f.full_name, national_id: f.national_id, phone: normalizePhone(f.phone), alt_phone: normalizePhone(f.alt_phone),
          area: f.area, address: f.address, vehicle: f.vehicle, campaign: params.get('src') || '',
          relatives: f.rel_name ? [{ name: f.rel_name, relation: f.rel_relation, phone: normalizePhone(f.rel_phone) }] : [], documents: docs,
        },
      });
      if (rpcErr) throw rpcErr;
      const r = data as { ok: boolean; duplicate?: boolean; error?: string };
      if (!r.ok) setError(r.error || 'حصلت مشكلة، جرّب تاني');
      else setDone(r.duplicate ? 'dup' : 'ok');
    } catch {
      setError('حصلت مشكلة في الإرسال. اتأكد من النت وجرّب تاني.');
    } finally {
      setBusy(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div dir="rtl" className="min-h-screen bg-[#FAFAF6] px-4 py-8 dark:bg-[#0c1512]">
      <div className="mx-auto max-w-lg space-y-5">{children}
        <p className="pt-4 text-center text-[11px] text-slate-400">بيانات التقديم بتوصل للمكتب بس · Masar Pro</p>
      </div>
    </div>
  );
  if (isLoading) return shell(<Spinner />);
  if (!office) return shell(<div className="card p-8 text-center"><p className="font-bold">الرابط ده مش موجود</p><p className="mt-1 text-sm text-slate-500">اتأكد من الرابط مع المكتب.</p></div>);
  if (!office.accepting) return shell(<div className="card p-8 text-center"><p className="text-lg font-extrabold text-brand-700">{office.name}</p><p className="mt-2 text-sm text-slate-500">التقديم مقفول دلوقتي. كلّم المكتب مباشرة.</p></div>);
  if (done) return shell(
    <div className="card space-y-3 p-8 text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-brand-600" />
      <p className="text-lg font-extrabold">{done === 'ok' ? 'طلبك وصل' : 'طلبك متسجل قبل كده'}</p>
      <p className="text-sm text-slate-600 dark:text-slate-300">{office.name} هيكلمك على رقمك قريب لميعاد المقابلة.</p>
    </div>,
  );

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return shell(
    <>
      <div className="text-center">
        <p className="text-xs font-bold text-slate-500">التقديم كمندوب توصيل في</p>
        <h1 className="mt-1 text-2xl font-extrabold text-brand-700 dark:text-brand-200">{office.name}</h1>
        {office.intro && <p className="mt-2 rounded-lg bg-brand-50 p-3 text-sm font-semibold text-brand-800 dark:bg-brand-900/30 dark:text-brand-100">{office.intro}</p>}
      </div>
      <form onSubmit={submit} className="card space-y-4 p-5">
        <input type="text" name="website" value={f.website} onChange={set('website')} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
        <Field label="الاسم زي البطاقة" required htmlFor="a_name"><input id="a_name" required className="field" value={f.full_name} onChange={set('full_name')} autoComplete="name" /></Field>
        <Field label="الرقم القومي (14 رقم)" required htmlFor="a_nid" hint={nid ? `${nid.age} سنة · ${nid.governorate}` : undefined}>
          <input id="a_nid" required inputMode="numeric" maxLength={14} dir="ltr" className="field" value={f.national_id} onChange={(e) => setF({ ...f, national_id: e.target.value.replace(/\D/g, '') })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="رقم الموبايل" required htmlFor="a_ph"><input id="a_ph" required type="tel" inputMode="tel" dir="ltr" className="field" value={f.phone} onChange={set('phone')} placeholder="01xxxxxxxxx" /></Field>
          <Field label="رقم تاني" htmlFor="a_ph2"><input id="a_ph2" type="tel" inputMode="tel" dir="ltr" className="field" value={f.alt_phone} onChange={set('alt_phone')} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="المنطقة اللي عايز تشتغل فيها" required htmlFor="a_area"><input id="a_area" required className="field" value={f.area} onChange={set('area')} placeholder="مثلاً: المعادي" /></Field>
          <Field label="المركبة" required htmlFor="a_veh"><select id="a_veh" className="field" value={f.vehicle} onChange={set('vehicle')}>{VEHICLES.map((v) => <option key={v}>{v}</option>)}</select></Field>
        </div>
        <Field label="عنوانك" htmlFor="a_addr"><input id="a_addr" className="field" value={f.address} onChange={set('address')} /></Field>
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <p className="mb-2 text-xs font-bold text-slate-600 dark:text-slate-300">قريب نكلمه وقت الضرورة</p>
          <div className="grid grid-cols-3 gap-2">
            <input className="field" placeholder="الاسم" value={f.rel_name} onChange={set('rel_name')} aria-label="اسم القريب" />
            <input className="field" placeholder="صلة القرابة" value={f.rel_relation} onChange={set('rel_relation')} aria-label="صلة القرابة" />
            <input className="field" placeholder="الموبايل" dir="ltr" inputMode="tel" value={f.rel_phone} onChange={set('rel_phone')} aria-label="موبايل القريب" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(DOC_TEXT) as Doc[]).map((t) => (
            <label key={t} className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed p-3 text-center text-xs font-bold ${files[t] ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30' : 'border-slate-300 text-slate-500 dark:border-slate-700'}`}>
              {files[t] ? <CheckCircle2 className="h-6 w-6" /> : <Camera className="h-6 w-6" />}
              {DOC_TEXT[t]}{t !== 'driving_license' && <span className="text-red-500">*</span>}
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pick(t, e.target.files?.[0])} />
            </label>
          ))}
        </div>
        <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" className="mt-0.5" checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} />
          موافق إن {office.name} يحتفظ ببياناتي وصور البطاقة علشان التقديم
        </label>
        {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm font-bold text-red-700 dark:bg-red-950 dark:text-red-300" role="alert">{error}</p>}
        <Button type="submit" className="w-full !py-3" loading={busy} disabled={!f.agree}>ابعت الطلب</Button>
      </form>
    </>,
  );
}
