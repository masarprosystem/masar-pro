import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/core/supabase';
import { useAuth } from '@/core/auth';
import { useOffice } from '@/core/office';
import { errorMessage } from '@/core/errors';
import { ROLE_LABEL } from '@/core/format';
import { useToast } from '@/core/toast';
import { Button, Card, Field, PageHeader } from '@/components/ui';

function BrandScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6 dark:bg-[#0d1512]">
      <div className="w-full max-w-sm space-y-6 text-center">
        <img src="/brand/masar-logo.png" alt="Masar Pro — نظام إدارة وتعيين مناديب التوصيل" className="mx-auto w-64 dark:rounded-xl dark:bg-paper dark:p-3" />
        <div className="speed-lines mx-auto w-32 text-gold-500" />
        {children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/go" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) setError(errorMessage(error));
    setBusy(false);
  };

  return (
    <BrandScreen>
      <form onSubmit={submit} className="card space-y-4 p-6 text-right">
        <h1 className="text-center text-lg font-extrabold text-brand-700 dark:text-brand-200">تسجيل الدخول</h1>
        <Field label="الإيميل" htmlFor="email">
          <input id="email" type="email" required dir="ltr" autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="كلمة السر" htmlFor="password">
          <input id="password" type="password" required dir="ltr" autoComplete="current-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="text-sm font-bold text-red-600">{error}</p>}
        <Button type="submit" loading={busy} className="w-full">دخول</Button>
      </form>
      <p className="text-xs text-slate-500">نسيت كلمة السر؟ كلم صاحب المكتب يعمل لك كلمة سر جديدة.</p>
      <a href="/" className="inline-block text-xs font-bold text-brand-600 hover:underline">الرجوع للصفحة الرئيسية</a>
    </BrandScreen>
  );
}

export function NoAccessPage() {
  const { signOut, user } = useAuth();
  return (
    <BrandScreen>
      <div className="card space-y-3 p-6">
        <p className="font-bold">الحساب ده ({user?.email}) مش مربوط بأي مكتب شغال.</p>
        <p className="text-sm text-slate-500">لو المفروض يكون عندك صلاحية، كلم صاحب المكتب.</p>
        <Button variant="secondary" onClick={() => signOut()} className="w-full">تسجيل الخروج</Button>
      </div>
    </BrandScreen>
  );
}

export function SetupMissingPage() {
  return (
    <BrandScreen>
      <div className="card space-y-2 p-6 text-right text-sm">
        <p className="font-extrabold text-red-600">إعدادات Supabase ناقصة</p>
        <p>ضيف المتغيرات دي في Vercel ← Settings ← Environment Variables وبعدين اعمل Redeploy:</p>
        <pre className="rounded bg-slate-100 p-3 text-left text-xs dark:bg-slate-800" dir="ltr">VITE_SUPABASE_URL{'\n'}VITE_SUPABASE_ANON_KEY</pre>
      </div>
    </BrandScreen>
  );
}

export function ProfilePage() {
  const { user } = useAuth();
  const { membership } = useOffice();
  const toast = useToast();
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const mut = useMutation({
    mutationFn: async () => {
      if (pass.length < 8) throw new Error('كلمة السر لازم 8 حروف على الأقل');
      if (pass !== confirm) throw new Error('كلمتين السر مش زي بعض');
      const { error } = await supabase.auth.updateUser({ password: pass });
      if (error) throw error;
    },
    onSuccess: () => {
      setPass('');
      setConfirm('');
      toast('اتغيرت كلمة السر.', 'success');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title="حسابي" />
      <Card title="بياناتي">
        <dl className="grid grid-cols-3 gap-y-3 text-sm">
          <dt className="text-slate-500">الاسم</dt><dd className="col-span-2 font-bold">{membership?.full_name || '—'}</dd>
          <dt className="text-slate-500">الإيميل</dt><dd className="col-span-2 font-bold" dir="ltr" style={{ textAlign: 'right' }}>{user?.email}</dd>
          {membership && (<><dt className="text-slate-500">الدور</dt><dd className="col-span-2 font-bold">{ROLE_LABEL[membership.role]} — {membership.office.name}</dd></>)}
        </dl>
      </Card>
      <Card title="تغيير كلمة السر">
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-4">
          <Field label="كلمة السر الجديدة" htmlFor="np"><input id="np" type="password" dir="ltr" autoComplete="new-password" className="field" value={pass} onChange={(e) => setPass(e.target.value)} /></Field>
          <Field label="تأكيد كلمة السر" htmlFor="cp"><input id="cp" type="password" dir="ltr" autoComplete="new-password" className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          <Button type="submit" loading={mut.isPending}>حفظ</Button>
        </form>
      </Card>
    </div>
  );
}
