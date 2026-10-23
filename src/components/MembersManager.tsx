import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, UserPlus, Users } from 'lucide-react';
import { supabase } from '@/core/supabase';
import { createMember, setMemberPassword } from '@/core/functions';
import { errorMessage } from '@/core/errors';
import { ROLES, ROLE_LABEL, generatePassword, seatLimit } from '@/core/format';
import { useToast } from '@/core/toast';
import type { Member, OfficeRole, Plan, Subscription } from '@/core/types';
import { Badge, Button, Card, Empty, Field, Modal, Spinner, Table } from './ui';

export function useMembers(officeId: string) {
  return useQuery({
    queryKey: ['members', officeId],
    queryFn: async () => {
      const { data, error } = await supabase.from('office_members').select('*').eq('office_id', officeId).order('created_at');
      if (error) throw error;
      return data as Member[];
    },
  });
}

export function usePlan(planId?: string) {
  return useQuery({
    queryKey: ['plan', planId],
    enabled: Boolean(planId),
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*').eq('id', planId!).single();
      if (error) throw error;
      return data as Plan;
    },
  });
}

export function MembersManager({ officeId, subscription, canEdit, currentUserId, isAdmin = false }: { officeId: string; subscription: Subscription | null; canEdit: boolean; currentUserId?: string; isAdmin?: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: members, isLoading } = useMembers(officeId);
  const { data: plan } = usePlan(subscription?.plan_id);
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState<Member | null>(null);

  const usage = useMemo(
    () =>
      ROLES.map((r) => ({
        role: r,
        used: (members || []).filter((m) => m.is_active && m.role === r).length,
        limit: seatLimit(plan?.seats, subscription?.extra_seats, r),
      })),
    [members, plan, subscription],
  );

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Member> }) => {
      const { error } = await supabase.from('office_members').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', officeId] });
      toast('اتحفظ التعديل.', 'success');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {usage.map((u) => (
          <div key={u.role} className="card p-4">
            <p className="text-[11px] font-bold text-slate-500">{ROLE_LABEL[u.role]}</p>
            <p className={`tabular mt-1 text-2xl font-extrabold ${u.used >= u.limit ? 'text-gold-600' : ''}`}>
              {u.used} <span className="text-base text-slate-400">/ {u.limit}</span>
            </p>
          </div>
        ))}
      </div>

      <Card
        title="الحسابات"
        actions={
          canEdit && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <UserPlus className="h-4 w-4" /> إضافة حساب
            </Button>
          )
        }
        className="overflow-hidden [&>div:last-child]:p-0"
      >
        {isLoading ? (
          <Spinner />
        ) : (
          <Table head={['الاسم', 'الإيميل', 'الموبايل', 'الدور', 'الحالة', '']} empty={!members?.length && <Empty icon={<Users className="h-10 w-10" />} title="مفيش حسابات لسه" />}>
            {(members || []).map((m) => (
              <tr key={m.id} className={m.is_active ? '' : 'opacity-60'}>
                <td className="px-4 py-3 font-bold">{m.full_name || '—'}{m.user_id === currentUserId && <span className="mr-1 text-[11px] text-slate-400">(أنت)</span>}</td>
                <td className="px-4 py-3" dir="ltr" style={{ textAlign: 'right' }}>{m.email || '—'}</td>
                <td className="px-4 py-3" dir="ltr" style={{ textAlign: 'right' }}>{m.phone || '—'}</td>
                <td className="px-4 py-3">
                  {canEdit && m.role !== 'owner' ? (
                    <select
                      className="field !w-auto !py-1.5 text-xs"
                      value={m.role}
                      onChange={(e) => update.mutate({ id: m.id, patch: { role: e.target.value as OfficeRole } })}
                      aria-label="الدور"
                    >
                      {ROLES.filter((r) => r !== 'owner').map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>
                  ) : (
                    <Badge tone={m.role === 'owner' ? 'gold' : 'slate'}>{ROLE_LABEL[m.role]}</Badge>
                  )}
                </td>
                <td className="px-4 py-3">{m.is_active ? <Badge tone="green">نشط</Badge> : <Badge>موقوف</Badge>}</td>
                <td className="px-4 py-3">
                  {canEdit && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setResetFor(m)} title="تغيير كلمة السر">
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      {m.user_id !== currentUserId && (
                        <Button
                          size="sm"
                          variant={m.is_active ? 'danger' : 'secondary'}
                          onClick={() => {
                            if (m.is_active && !confirm(`إيقاف حساب ${m.full_name || m.email}؟ مش هيقدر يدخل السيستم، والحساب هيفضى لحد تاني.`)) return;
                            update.mutate({ id: m.id, patch: { is_active: !m.is_active } });
                          }}
                        >
                          {m.is_active ? 'إيقاف' : 'تفعيل'}
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <AddMemberModal open={adding} onClose={() => setAdding(false)} officeId={officeId} usage={isAdmin ? usage : usage.filter((u) => u.role !== 'owner')} />
      <ResetPasswordModal member={resetFor} onClose={() => setResetFor(null)} />
    </div>
  );
}

function CredentialsBox({ email, password }: { email: string; password: string }) {
  const toast = useToast();
  const text = `بيانات الدخول على Masar Pro\nالرابط: ${window.location.origin}\nالإيميل: ${email}\nكلمة السر: ${password}`;
  return (
    <div className="space-y-2 rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm dark:border-brand-800 dark:bg-brand-900/30">
      <p className="font-bold text-brand-800 dark:text-brand-200">ابعت البيانات دي للموظف (واتساب مثلاً):</p>
      <pre className="whitespace-pre-wrap font-sans text-xs" dir="auto">{text}</pre>
      <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(text).then(() => toast('اتنسخت البيانات.', 'success'))}>
        <Copy className="h-4 w-4" /> نسخ
      </Button>
    </div>
  );
}

function AddMemberModal({ open, onClose, officeId, usage, fixedRole }: { open: boolean; onClose: () => void; officeId: string; usage: { role: OfficeRole; used: number; limit: number }[]; fixedRole?: OfficeRole }) {
  const toast = useToast();
  const qc = useQueryClient();
  const firstFree = usage.find((u) => u.role !== 'owner' && u.used < u.limit)?.role || 'hr';
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', role: (fixedRole || firstFree) as OfficeRole, password: generatePassword() });
  const [done, setDone] = useState<{ email: string; password: string } | null>(null);

  const mut = useMutation({
    mutationFn: () => createMember({ office_id: officeId, ...form, email: form.email.trim().toLowerCase(), full_name: form.full_name.trim() }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['members', officeId] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      toast('اتعمل الحساب.', 'success');
      setDone({ email: form.email.trim().toLowerCase(), password: r.existing_user ? '(كلمة السر بتاعته القديمة)' : form.password });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const close = () => {
    setDone(null);
    setForm({ full_name: '', email: '', phone: '', role: (fixedRole || firstFree) as OfficeRole, password: generatePassword() });
    onClose();
  };
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = form.full_name.trim() && /\S+@\S+\.\S+/.test(form.email) && form.password.length >= 8;

  return (
    <Modal
      open={open}
      onClose={close}
      title="إضافة حساب جديد"
      footer={
        done ? (
          <Button onClick={close}>تمام</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>إلغاء</Button>
            <Button onClick={() => mut.mutate()} loading={mut.isPending} disabled={!valid}>إنشاء الحساب</Button>
          </>
        )
      }
    >
      {done ? (
        <CredentialsBox email={done.email} password={done.password} />
      ) : (
        <>
          <Field label="الاسم" required htmlFor="m_name"><input id="m_name" className="field" value={form.full_name} onChange={set('full_name')} /></Field>
          <Field label="الإيميل" required htmlFor="m_email"><input id="m_email" type="email" dir="ltr" className="field" value={form.email} onChange={set('email')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الموبايل" htmlFor="m_phone"><input id="m_phone" dir="ltr" className="field" value={form.phone} onChange={set('phone')} /></Field>
            <Field label="الدور" htmlFor="m_role">
              <select id="m_role" className="field" value={form.role} onChange={set('role')} disabled={Boolean(fixedRole)}>
                {usage.map((u) => (
                  <option key={u.role} value={u.role} disabled={u.used >= u.limit}>
                    {ROLE_LABEL[u.role]} ({u.used}/{u.limit})
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="كلمة سر مبدئية" hint="الموظف يقدر يغيّرها بعد ما يدخل من صفحة حسابي." htmlFor="m_pass">
            <div className="flex gap-2">
              <input id="m_pass" dir="ltr" className="field font-mono" value={form.password} onChange={set('password')} />
              <Button variant="secondary" onClick={() => setForm((f) => ({ ...f, password: generatePassword() }))}>توليد</Button>
            </div>
          </Field>
        </>
      )}
    </Modal>
  );
}

function ResetPasswordModal({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState(generatePassword());
  const [done, setDone] = useState(false);
  const mut = useMutation({
    mutationFn: () => setMemberPassword({ office_id: member!.office_id, user_id: member!.user_id, password }),
    onSuccess: () => setDone(true),
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const close = () => {
    setDone(false);
    setPassword(generatePassword());
    onClose();
  };
  return (
    <Modal
      open={Boolean(member)}
      onClose={close}
      title={`كلمة سر جديدة لـ ${member?.full_name || member?.email || ''}`}
      footer={done ? <Button onClick={close}>تمام</Button> : <><Button variant="secondary" onClick={close}>إلغاء</Button><Button loading={mut.isPending} disabled={password.length < 8} onClick={() => mut.mutate()}>حفظ</Button></>}
    >
      {done ? (
        <CredentialsBox email={member?.email || ''} password={password} />
      ) : (
        <Field label="كلمة السر الجديدة" htmlFor="rp">
          <div className="flex gap-2">
            <input id="rp" dir="ltr" className="field font-mono" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button variant="secondary" onClick={() => setPassword(generatePassword())}>توليد</Button>
          </div>
        </Field>
      )}
    </Modal>
  );
}

export { AddMemberModal };
