import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, ExternalLink, Link2 } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { supabase } from '@/core/supabase';
import { useAuth } from '@/core/auth';
import { useOffice } from '@/core/office';
import { errorMessage } from '@/core/errors';
import { useToast } from '@/core/toast';
import { useOfficeSettings } from '@/core/whatsapp';
import { Badge, Button, Card, Field, PageHeader, Spinner } from '@/components/ui';

function qrSvg(text: string, size = 220) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = size / (n + 8);
  let rects = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) rects += `<rect x="${(c + 4) * cell}" y="${(r + 4) * cell}" width="${cell + 0.3}" height="${cell + 0.3}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="#fff"/><g fill="#0E2A1F">${rects}</g></svg>`;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export function ApplyLinkPage() {
  const { office, role, writable } = useOffice();
  const { reload } = useAuth();
  const isOwner = role === 'owner' && writable;
  const toast = useToast();
  const qc = useQueryClient();
  const { data: settings, isLoading } = useOfficeSettings(office?.id);
  const [slug, setSlug] = useState('');
  const [intro, setIntro] = useState('');
  const [campaign, setCampaign] = useState('');
  useEffect(() => { setSlug(office?.slug || ''); }, [office?.slug]);
  useEffect(() => { setIntro(settings?.apply_intro || ''); }, [settings?.apply_intro]);

  const base = office?.slug ? `${window.location.origin}/apply/${office.slug}` : '';
  const link = base && campaign.trim() ? `${base}?src=${encodeURIComponent(slugify(campaign) || campaign.trim())}` : base;
  const svg = useMemo(() => (link ? qrSvg(link) : ''), [link]);

  const save = useMutation({
    mutationFn: async (p: { slug?: string; enabled?: boolean; intro?: string }) => {
      if (p.slug !== undefined) {
        const { data, error } = await supabase.from('offices').update({ slug: p.slug || null }).eq('id', office!.id).select('id');
        if (error) throw error;
        if (!data?.length) throw new Error('row-level security');
      }
      if (p.enabled !== undefined || p.intro !== undefined) {
        const { error } = await supabase.from('office_settings').upsert({
          office_id: office!.id, apply_enabled: p.enabled ?? settings?.apply_enabled ?? false,
          apply_intro: (p.intro ?? settings?.apply_intro ?? '').trim() || null, wa_templates: settings?.wa_templates || {}, updated_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
    },
    onSuccess: async (_d, p) => {
      if (p.slug !== undefined) await reload();
      qc.invalidateQueries({ queryKey: ['office-settings'] });
      toast('اتحفظ.', 'success');
    },
    onError: (e) => toast(/duplicate|unique/i.test(String((e as Error).message)) ? 'الاسم ده مستخدم لمكتب تاني، جرّب اسم تاني.' : errorMessage(e), 'error'),
  });

  const copy = async (t: string) => { await navigator.clipboard.writeText(t); toast('اتنسخ الرابط.', 'success'); };
  const downloadQr = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    a.download = `qr-${office?.slug}${campaign ? '-' + slugify(campaign) : ''}.svg`;
    a.click();
  };

  if (isLoading) return <Spinner />;
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="رابط التقديم للمناديب" subtitle="المندوب يفتح الرابط من موبايله، يكتب بياناته ويصوّر بطاقته، ويدخل عندك على مرحلة «مُتقدم» على طول." />

      <Card title="الرابط" actions={settings?.apply_enabled ? <Badge tone="green">مفتوح</Badge> : <Badge>مقفول</Badge>}>
        <div className="space-y-4">
          <Field label="اسم المكتب في الرابط (حروف إنجليزي صغيرة وأرقام و -)" htmlFor="ap_slug">
            <div className="flex gap-2" dir="ltr">
              <span className="flex items-center rounded-lg bg-slate-100 px-3 text-xs text-slate-500 dark:bg-slate-800">{window.location.host}/apply/</span>
              <input id="ap_slug" className="field" value={slug} disabled={!isOwner} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="alamal" />
              {isOwner && <Button loading={save.isPending} disabled={slug === (office?.slug || '') || slug.length < 3} onClick={() => save.mutate({ slug })}>حفظ</Button>}
            </div>
          </Field>
          {isOwner && office?.slug && (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant={settings?.apply_enabled ? 'secondary' : 'primary'} loading={save.isPending} onClick={() => save.mutate({ enabled: !settings?.apply_enabled })}>
                {settings?.apply_enabled ? 'قفل التقديم' : 'فتح التقديم'}
              </Button>
              <p className="text-xs text-slate-500">لما الرابط يتقفل، اللي يفتحه هيلاقي رسالة إن التقديم مقفول.</p>
            </div>
          )}
          {isOwner && (
            <Field label="رسالة تظهر للمتقدم فوق الفورم (اختياري)" htmlFor="ap_intro">
              <div className="flex gap-2">
                <input id="ap_intro" className="field" value={intro} maxLength={200} onChange={(e) => setIntro(e.target.value)} placeholder="مثلاً: مطلوب مناديب موتسيكل للمعادي ومدينة نصر، مرتب ثابت + عمولة" />
                <Button variant="secondary" loading={save.isPending} disabled={intro === (settings?.apply_intro || '')} onClick={() => save.mutate({ intro })}>حفظ</Button>
              </div>
            </Field>
          )}
          {!office?.slug && !isOwner && <p className="text-sm text-slate-500">صاحب المكتب لسه مظبطش الرابط.</p>}
        </div>
      </Card>

      {office?.slug && (
        <Card title="شارك الرابط">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_auto]">
            <div className="space-y-3">
              <Field label="اسم الحملة (اختياري)" htmlFor="ap_cmp" hint="لكل إعلان رابط خاص، فتعرف أنهي إعلان جاب مناديب كمّلوا. مثلاً: facebook-oct">
                <input id="ap_cmp" dir="ltr" className="field" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="facebook-oct" />
              </Field>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-white/5" dir="ltr">
                <Link2 className="h-4 w-4 shrink-0 text-brand-600" />
                <span className="min-w-0 flex-1 truncate text-xs font-bold">{link}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => copy(link)}><Copy className="h-4 w-4" /> نسخ الرابط</Button>
                <a href={link} target="_blank" rel="noopener noreferrer"><Button variant="secondary"><ExternalLink className="h-4 w-4" /> افتح الفورم</Button></a>
                <Button variant="secondary" onClick={downloadQr}><Download className="h-4 w-4" /> تحميل QR</Button>
              </div>
              {!settings?.apply_enabled && <p className="text-xs font-bold text-gold-600">الرابط مقفول دلوقتي، افتحه الأول قبل ما تشاركه.</p>}
            </div>
            <div className="rounded-xl border border-slate-200 p-2 dark:border-slate-700" dangerouslySetInnerHTML={{ __html: svg }} aria-label="QR للرابط" />
          </div>
        </Card>
      )}
    </div>
  );
}
