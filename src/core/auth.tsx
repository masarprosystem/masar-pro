import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { Membership, Subscription } from './types';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isPlatformAdmin: boolean;
  memberships: Membership[];
  currentOfficeId: string | null;
  setCurrentOfficeId: (id: string) => void;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);
const OFFICE_KEY = 'masar.currentOffice'; // تفضيل واجهة بس، مش بيانات

type RawMembership = Omit<Membership, 'office'> & {
  office: (Membership['office'] & { subscription: Subscription | Subscription[] | null }) | null;
};

async function loadContext(userId: string) {
  const [admin, members] = await Promise.all([
    supabase.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    supabase
      .from('office_members')
      .select('*, office:offices(*, subscription:subscriptions(*))')
      .eq('user_id', userId)
      .eq('is_active', true),
  ]);
  if (members.error) throw members.error;
  const memberships = ((members.data || []) as RawMembership[])
    .filter((m) => m.office)
    .map((m) => {
      const sub = m.office!.subscription;
      return { ...m, office: { ...m.office!, subscription: Array.isArray(sub) ? sub[0] || null : sub } } as Membership;
    });
  return { isPlatformAdmin: Boolean(admin.data), memberships };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [currentOfficeId, setCurrentOffice] = useState<string | null>(() => localStorage.getItem(OFFICE_KEY));
  const userIdRef = useRef<string | null>(null);

  const apply = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) {
      setIsPlatformAdmin(false);
      setMemberships([]);
      setLoading(false);
      return;
    }
    try {
      const ctx = await loadContext(s.user.id);
      setIsPlatformAdmin(ctx.isPlatformAdmin);
      setMemberships(ctx.memberships);
      setCurrentOffice((cur) => {
        const ids = ctx.memberships.map((m) => m.office_id);
        return cur && ids.includes(cur) ? cur : ids[0] || null;
      });
    } catch (e) {
      console.error(e);
      setMemberships([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      userIdRef.current = data.session?.user?.id || null;
      apply(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      const changedUser = (s?.user?.id || null) !== userIdRef.current;
      userIdRef.current = s?.user?.id || null;
      if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && changedUser)) {
        setLoading(true);
        // تأجيل بسيط عشان منعملش استعلامات جوه callback المصادقة نفسه
        setTimeout(() => apply(s), 0);
      } else if (s) {
        // تجديد التوكن أو رجوع للتاب: من غير ما نعيد تحميل الصفحة
        setSession(s);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [apply]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      isPlatformAdmin,
      memberships,
      currentOfficeId,
      setCurrentOfficeId: (id: string) => {
        localStorage.setItem(OFFICE_KEY, id);
        setCurrentOffice(id);
        qc.clear();
      },
      reload: async () => {
        const { data } = await supabase.auth.getSession();
        await apply(data.session);
      },
      signOut: async () => {
        await supabase.auth.signOut();
        localStorage.removeItem(OFFICE_KEY);
        qc.clear();
      },
    }),
    [session, loading, isPlatformAdmin, memberships, currentOfficeId, apply, qc],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
