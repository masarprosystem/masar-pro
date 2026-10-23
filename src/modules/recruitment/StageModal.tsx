import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '@/core/errors';
import { useToast } from '@/core/toast';
import { Badge, Button, Field, Modal } from '@/components/ui';
import { changeStage } from './api';
import { NOTE_REQUIRED, STAGES, STAGE_COLOR, STAGE_LABEL, STAGE_TONE, type CourierStage } from './model';

export function StageBadge({ stage }: { stage: CourierStage }) {
  return <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>;
}

const QUICK_NOTES: Partial<Record<CourierStage, string[]>> = {
  left: ['رفض ينزل بعد التدريب', 'ساب الشغل من نفسه', 'لقى شغل تاني', 'مش بيرد على التليفون'],
  inactive: ['مش منتظم في الشغل', 'إجازة طويلة', 'مشكلة في المركبة'],
  blocked: ['عجز ومرفضش يسدد', 'مشكلة مع شركة الشحن', 'ورق مزوّر'],
  passed_interview: ['جاهز للتدريب'],
  training: ['نزل التدريب'],
};

export function StageModal({ courier, onClose }: { courier: { id: string; full_name: string; stage: CourierStage } | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [stage, setStage] = useState<CourierStage>('applied');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (courier) {
      setStage(courier.stage);
      setNote('');
    }
  }, [courier]);

  const mut = useMutation({
    mutationFn: () => changeStage(courier!.id, stage, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['couriers'] });
      qc.invalidateQueries({ queryKey: ['couriers-pipeline'] });
      qc.invalidateQueries({ queryKey: ['courier', courier!.id] });
      qc.invalidateQueries({ queryKey: ['stage-history', courier!.id] });
      qc.invalidateQueries({ queryKey: ['recruitment-overview'] });
      toast(`${courier!.full_name}: ${STAGE_LABEL[stage]}`, 'success');
      onClose();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const needNote = NOTE_REQUIRED.includes(stage);
  const same = courier?.stage === stage;

  return (
    <Modal
      open={Boolean(courier)}
      onClose={onClose}
      title="تغيير مرحلة المندوب"
      footer={<><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button loading={mut.isPending} disabled={same || (needNote && !note.trim())} onClick={() => mut.mutate()}>حفظ</Button></>}
    >
      <div className="flex items-center justify-between">
        <p className="font-bold">{courier?.full_name}</p>
        {courier && <StageBadge stage={courier.stage} />}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {STAGES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStage(s)}
            className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-right text-sm font-bold transition ${
              stage === s ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 hover:border-brand-300 dark:border-slate-700'
            }`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STAGE_COLOR[s] }} />
            {STAGE_LABEL[s]}
            {courier?.stage === s && <span className="mr-auto text-[10px] text-slate-400">الحالية</span>}
          </button>
        ))}
      </div>
      <Field label="السبب / ملاحظة" required={needNote} htmlFor="stage_note">
        <textarea id="stage_note" rows={2} className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: نجح في المقابلة لكن رفض ينزل بعد التدريب" />
      </Field>
      {QUICK_NOTES[stage] && (
        <div className="flex flex-wrap gap-1.5">
          {QUICK_NOTES[stage]!.map((n) => (
            <button key={n} type="button" onClick={() => setNote(n)} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-brand-50 dark:bg-slate-800 dark:text-slate-300">
              {n}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
