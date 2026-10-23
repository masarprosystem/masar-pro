import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '@/core/supabase';
import type { Assignment, Carrier, Courier, CourierDocument, CourierStage, StageHistory } from './model';

export const PAGE_SIZE = 50;

export function useCarriers(officeId?: string) {
  return useQuery({
    queryKey: ['carriers', officeId],
    enabled: Boolean(officeId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('carriers').select('*').eq('office_id', officeId!).order('sort_order').order('name');
      if (error) throw error;
      return data as Carrier[];
    },
  });
}

export interface CourierFilters {
  q: string;
  stage: CourierStage | '';
  carrier: string;
  recruiter: string;
  vehicle: string;
  page: number;
}

const LIST_COLUMNS =
  'id, full_name, national_id, primary_phone, stage, stage_note, stage_changed_at, vehicle_type, assigned_area, recruited_by, legacy_recruiter, appointment_date, current_carrier_id, current_hub, birth_date';

export type CourierRow = Pick<
  Courier,
  'id' | 'full_name' | 'national_id' | 'primary_phone' | 'stage' | 'stage_note' | 'stage_changed_at' | 'vehicle_type' | 'assigned_area' | 'recruited_by' | 'legacy_recruiter' | 'appointment_date' | 'current_carrier_id' | 'current_hub' | 'birth_date'
>;

// الحروف دي بتبوّظ فلتر البحث في PostgREST
const safe = (q: string) => q.replace(/[,()*%\\]/g, ' ').trim();

export function useCouriers(officeId: string | undefined, f: CourierFilters) {
  return useQuery({
    queryKey: ['couriers', officeId, f],
    enabled: Boolean(officeId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from('couriers').select(LIST_COLUMNS, { count: 'exact' }).eq('office_id', officeId!);
      const term = safe(f.q);
      if (term) {
        const digits = term.replace(/\D/g, '');
        q = digits.length >= 4 && digits.length === term.replace(/\s/g, '').length
          ? q.or(`primary_phone.ilike.%${digits}%,national_id.ilike.%${digits}%,alt_phone.ilike.%${digits}%`)
          : q.ilike('full_name', `%${term}%`);
      }
      if (f.stage) q = q.eq('stage', f.stage);
      if (f.carrier === 'none') q = q.is('current_carrier_id', null);
      else if (f.carrier) q = q.eq('current_carrier_id', f.carrier);
      if (f.recruiter) q = q.eq('recruited_by', f.recruiter);
      if (f.vehicle) q = q.eq('vehicle_type', f.vehicle);
      const from = f.page * PAGE_SIZE;
      const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data || []) as CourierRow[], count: count || 0 };
    },
  });
}

export function usePipeline(officeId?: string) {
  return useQuery({
    queryKey: ['couriers-pipeline', officeId],
    enabled: Boolean(officeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('couriers')
        .select(LIST_COLUMNS)
        .eq('office_id', officeId!)
        .in('stage', ['applied', 'interview', 'passed_interview', 'training'])
        .order('stage_changed_at', { ascending: false })
        .limit(600);
      if (error) throw error;
      return data as CourierRow[];
    },
  });
}

export function useCourier(id?: string) {
  return useQuery({
    queryKey: ['courier', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('couriers').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as Courier;
    },
  });
}

export function useStageHistory(courierId?: string) {
  return useQuery({
    queryKey: ['stage-history', courierId],
    enabled: Boolean(courierId),
    queryFn: async () => {
      const { data, error } = await supabase.from('courier_stage_history').select('*').eq('courier_id', courierId!).order('changed_at', { ascending: false });
      if (error) throw error;
      return data as StageHistory[];
    },
  });
}

export function useAssignments(courierId?: string) {
  return useQuery({
    queryKey: ['assignments', courierId],
    enabled: Boolean(courierId),
    queryFn: async () => {
      const { data, error } = await supabase.from('courier_assignments').select('*').eq('courier_id', courierId!).order('start_date', { ascending: false });
      if (error) throw error;
      return data as Assignment[];
    },
  });
}

export function useDocuments(courierId?: string) {
  return useQuery({
    queryKey: ['documents', courierId],
    enabled: Boolean(courierId),
    queryFn: async () => {
      const { data, error } = await supabase.from('courier_documents').select('*').eq('courier_id', courierId!).order('created_at', { ascending: false });
      if (error) throw error;
      return data as CourierDocument[];
    },
  });
}

export interface Overview {
  total: number;
  by_stage: Partial<Record<CourierStage, number>>;
  by_source: Record<string, number>;
  by_vehicle: Record<string, number>;
  by_carrier: Record<string, number>;
  by_recruiter: { member_id: string | null; legacy: string | null; total: number; active: number; trained: number; dropped_after_training: number }[];
  reached_training: number;
  reached_active: number;
  passed_interview_or_training_then_dropped: number;
  by_month: Record<string, number>;
  expiring_docs: number;
  expired_docs: number;
}

export function useOverview(officeId: string | undefined, from: string | null, to: string | null) {
  return useQuery({
    queryKey: ['recruitment-overview', officeId, from, to],
    enabled: Boolean(officeId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('recruitment_overview', { p_office: officeId, p_from: from, p_to: to });
      if (error) throw error;
      return data as Overview;
    },
  });
}

export async function changeStage(courierId: string, stage: CourierStage, note: string) {
  const { error } = await supabase.from('couriers').update({ stage, stage_note: note.trim() || null }).eq('id', courierId);
  if (error) throw error;
}
