import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { supabase } from '@/core/supabase';
import { useOffice } from '@/core/office';
import { errorMessage } from '@/core/errors';
import { useToast } from '@/core/toast';
import { Badge, Button, Card, PageHeader, Spinner } from '@/components/ui';
import { useCarriers } from './api';
import type { Carrier } from './model';

export function CarriersPage() {
  const { office, role, writable } = useOffice();
  const canEdit = writable && (role === 'owner' || role === 'operations');
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useCarriers(office?.id);
  const [name, setName] = useState('');

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
    <div className="max-w-2xl space-y-6">
      <PageHeader title="شركات الشحن" subtitle="الشركات اللي المكتب بيعيّن لها مناديب. الشركة الموقوفة بتختفي من الاختيارات بس تاريخها بيفضل." />
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
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                {canEdit ? (
                  <input
                    className="field max-w-xs !py-1.5 font-bold"
                    defaultValue={c.name}
                    onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.name && update.mutate({ id: c.id, patch: { name: e.target.value.trim() } })}
                    aria-label="اسم الشركة"
                  />
                ) : <span className="font-bold">{c.name}</span>}
                <div className="flex items-center gap-2">
                  {c.is_active ? <Badge tone="green">شغالة</Badge> : <Badge>موقوفة</Badge>}
                  {canEdit && <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: c.id, patch: { is_active: !c.is_active } })}>{c.is_active ? 'إيقاف' : 'تفعيل'}</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
