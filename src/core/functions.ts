import { supabase } from './supabase';
import type { OfficeRole } from './types';

interface FnResult<T> { ok: boolean; error?: string; data?: T }

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<FnResult<T>>('manage-members', { body });
  if (error) {
    // لو الفانكشن رجعت رسالة خطأ في الـ body
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = (await ctx.json()) as FnResult<T>;
        if (j?.error) throw new Error(j.error);
      } catch (e) {
        if (e instanceof Error && e.message) throw e;
      }
    }
    throw new Error(error.message || 'تعذر الاتصال بالسيرفر');
  }
  if (!data?.ok) throw new Error(data?.error || 'حصل خطأ');
  return data.data as T;
}

export const createMember = (p: {
  office_id: string;
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role: OfficeRole;
}) => call<{ member_id: string; existing_user: boolean }>({ action: 'create_member', ...p });

export const setMemberPassword = (p: { office_id: string; user_id: string; password: string }) =>
  call<{ done: true }>({ action: 'set_password', ...p });
