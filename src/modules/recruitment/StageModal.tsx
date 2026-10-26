import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '@/core/errors';
import { useOffice } from '@/core/office';
import { useToast } from '@/core/toast';
import { Badge, Button, Field, Modal } from '@/components/ui';
import { changeStage, useOfficeStages } from './api';
import { NOTE_REQUIRED, STAGES, STAGE_COLOR, STAGE_LABEL, STAGE_TONE, type CourierStage, type OfficeStage } from './model';

/** اسم المرحلة زي ما المكتب سمّاها */
export function useStageLabel() {
  const { office } = useOffice();
  const { data: stages } = useOfficeStages(office?.id);
  return useMemo(() => {
    const byId = Object.fromEntries((stages || []).map((s) => [s.id, s.name]));
    const core = Object.fromEntries((stages || []).filter((s) => s.is_core).map((s) => [s.base_stage, s.name]));
    return (stage: CourierStage, stageId?: string | null) => (stageId && byId[stageId]) || core[stage] || STAGE_LABEL[stage];
  }, [stages]);
}

/** المراحل المتاحة بالترتيب: لو مفيش مراحل للمكتب، المراحل الأساسية */
export function useStageOptions(): OfficeStage[] {
  const { office } = useOffice();
  const { data } = useOfficeStages(office?.id);
  return useMemo(() => {
    const list = (data || []).filter((s) => s.is_active);
    if (list.length) return list;
    return STAGES.map((s, i) => ({ id: `core:${s}`, office_id: office?.id || '', base_stage: s, name: STAGE_LABEL[s], is_core: true, sort_order: i * 10, is_active: true }));
  }, [data, office]);
}

export function StageBadge({ stage, stageId }: { stage: CourierStage; stageId?: string | null }) {
  const label = useStageLabel();
  return <Badge tone={STAGE_TONE[stage]}>{label(stage, stageId)}</Badge>;
}

const QUICK_NOTES: Partial<Record<CourierStage, string[]>> = {
  left: ['رفض ينزل بعد التدريب', 'ساب الشغل من نفسه', 'لقى شغل تاني', 'مش بيرد على التليفون'],
  inactive: ['مش منتظم في الشغل', 'إجازة طويلة', 'مشكلة في المركبة'],
  blocked: ['عجز ومرفضش يسدد', 'مشكلة مع شركة الشحن', 'ورق مزوّر'],
  passed_interview: ['جاهز للتدريب'],
  training: ['نزل التدريب'],
};

type CourierLike = { id: string; full_name: string; stage: CourierStage; stage_id?: string | null };

export function StageModal({ courier, onClose }: { courier: CourierLike | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const options = useStageOptions();
  const currentKey = (c: CourierLike) => c.stage_id || options.find((o) => o.is_core && o.base_stage === c.stage)?.id || '';
  const [key, setKey] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (courier) {
      setKey(currentKey(courier));
      setNote('');
    }
  }, [courier]); // eslint-disable-line react-hooks/exhaustive-deps

  const picked = options.find((o) => o.id === key);
  const mut = useMutation({
    mutationFn: () => changeStage(courier!.id, picked!.base_stage, note, picked!.is_core ? null : picked!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['couriers'] });
      qc.invalidateQueries({ queryKey: ['couriers-pipeline'] });
      qc.invalidateQueries({ queryKey: ['courier', courier!.id] });
      qc.invalidateQueries({ queryKey: ['stage-history', courier!.id] });
      qc.invalidateQueries({ queryKey: ['recruitment-overview'] });
      toast(`${courier!.full_name}: ${picked!.name}`, 'success');
      onClose();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const needNote = picked ? NOTE_REQUIRED.includes(picked.base_stage) : false;
  const same = courier ? currentKey(courier) === key : true;

  return (
    <Modal
      open={Boolean(courier)}
      onClose={onClose}
      title="تغيير مرحلة المندوب"
      footer={<><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button loading={mut.isPending} disabled={!picked || same || (needNote && !note.trim())} onClick={() => mut.mutate()}>حفظ</Button></>}
    >
      <div className="flex items-center justify-between">
        <p className="font-bold">{courier?.full_name}</p>
        {courier && <StageBadge stage={courier.stage} stageId={courier.stage_id} />}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setKey(s.id)}
            className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-right text-sm font-bold transition ${
              key === s.id ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 hover:border-brand-300 dark:border-slate-700'
            }`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STAGE_COLOR[s.base_stage] }} />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            {courier && currentKey(courier) === s.id && <span className="text-[10px] text-slate-400">الحالية</span>}
          </button>
        ))}
      </div>
      <Field label="السبب / ملاحظة" required={needNote} htmlFor="stage_note">
        <textarea id="stage_note" rows={2} className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: نجح في المقابلة لكن رفض ينزل بعد التدريب" />
      </Field>
      {picked && QUICK_NOTES[picked.base_stage] && (
        <div className="flex flex-wrap gap-1.5">
          {QUICK_NOTES[picked.base_stage]!.map((n) => (
            <button key={n} type="button" onClick={() => setNote(n)} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-brand-50 dark:bg-slate-800 dark:text-slate-300">
              {n}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
