import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/core/supabase';
import { useOffice } from '@/core/office';
import { errorMessage } from '@/core/errors';
import { useToast } from '@/core/toast';
import { Badge, Button, Card, Field, PageHeader, Spinner } from '@/components/ui';
import { useOfficeStages } from './api';
import { STAGE_COLOR, STAGE_LABEL, type CourierStage, type OfficeStage } from './model';

export function StagesPage() {
  const { office, role, writable } = useOffice();
  const canEdit = writable && (role === 'owner' || role === 'operations');
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useOfficeStages(office?.id);
  const list = data || [];
  const cores = list.filter((s) => s.is_core);
  const [f, setF] = useState({ name: '', base: 'training' as CourierStage });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['office-stages'] });
    qc.invalidateQueries({ queryKey: ['couriers'] });
    qc.invalidateQueries({ queryKey: ['couriers-pipeline'] });
  };
  const mut = useMutation({
    mutationFn: async (fn: () => PromiseLike<{ error: unknown }>) => {
      const { error } = await fn();
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast('اتحفظ.', 'success'); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const add = () => {
    const core = cores.find((c) => c.base_stage === f.base);
    const group = list.filter((s) => s.base_stage === f.base);
    const order = Math.max(core?.sort_order ?? 0, ...group.map((g) => g.sort_order)) + 1;
    mut.mutate(() => supabase.from('office_stages').insert({ office_id: office!.id, base_stage: f.base, name: f.name.trim(), sort_order: order }));
    setF({ ...f, name: '' });
  };
  const move = (s: OfficeStage, dir: -1 | 1) => {
    const i = list.findIndex((x) => x.id === s.id);
    const other = list[i + dir];
    if (!other) return;
    mut.mutate(async () => {
      const a = await supabase.from('office_stages').update({ sort_order: other.sort_order }).eq('id', s.id);
      if (a.error) return a;
      return supabase.from('office_stages').update({ sort_order: s.sort_order === other.sort_order ? s.sort_order + dir : s.sort_order }).eq('id', other.id);
    });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="مراحل التعيين"
        subtitle="سمّي المراحل بطريقة مكتبك، وضيف مراحل زي «كشف طبي» أو «استلام اليونيفورم». كل مرحلة بتتحسب في التقارير تحت نوع من الأنواع الأساسية."
      />
      {canEdit && (
        <Card title="إضافة مرحلة">
          <form onSubmit={(e) => { e.preventDefault(); if (f.name.trim()) add(); }} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
            <Field label="اسم المرحلة" htmlFor="st_name"><input id="st_name" className="field" placeholder="مثلاً: كشف طبي" value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="بتتحسب كـ" htmlFor="st_base" hint="ده اللي بيحدد التقارير والعمولة وحد المناديب النشطين">
              <select id="st_base" className="field" value={f.base} onChange={(e) => setF({ ...f, base: e.target.value as CourierStage })}>
                {cores.map((c) => <option key={c.id} value={c.base_stage}>{c.name}</option>)}
              </select>
            </Field>
            <Button type="submit" loading={mut.isPending} disabled={!f.name.trim()}><Plus className="h-4 w-4" /> إضافة</Button>
          </form>
        </Card>
      )}
      <Card className="overflow-hidden [&>div:last-child]:p-0">
        {isLoading ? <Spinner /> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {list.map((s, i) => (
              <li key={s.id} className={`flex flex-wrap items-center gap-3 px-5 py-3 ${s.is_active ? '' : 'opacity-50'}`}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: STAGE_COLOR[s.base_stage] }} />
                {canEdit ? (
                  <input
                    className="field max-w-[220px] !py-1.5 font-bold"
                    defaultValue={s.name}
                    maxLength={40}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== s.name) mut.mutate(() => supabase.from('office_stages').update({ name: v }).eq('id', s.id));
                    }}
                    aria-label="اسم المرحلة"
                  />
                ) : <span className="font-bold">{s.name}</span>}
                {s.is_core ? <Badge tone="slate">أساسية</Badge> : <Badge tone="gold">بتتحسب كـ {cores.find((c) => c.base_stage === s.base_stage)?.name || STAGE_LABEL[s.base_stage]}</Badge>}
                {canEdit && (
                  <div className="mr-auto flex items-center gap-1">
                    <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(s, -1)} aria-label="لفوق"><ArrowUp className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" disabled={i === list.length - 1} onClick={() => move(s, 1)} aria-label="لتحت"><ArrowDown className="h-4 w-4" /></Button>
                    {!s.is_core && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => mut.mutate(() => supabase.from('office_stages').update({ is_active: !s.is_active }).eq('id', s.id))}>{s.is_active ? 'إيقاف' : 'تفعيل'}</Button>
                        <Button size="sm" variant="ghost" onClick={() => confirm(`مسح مرحلة «${s.name}»؟ المناديب اللي فيها هيرجعوا لمرحلتها الأساسية.`) && mut.mutate(() => supabase.from('office_stages').delete().eq('id', s.id))} aria-label="مسح"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      </>
                    )}
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
