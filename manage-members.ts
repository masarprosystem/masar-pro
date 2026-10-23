// Masar Pro — Edge Function: manage-members
// إنشاء حسابات الموظفين وتغيير كلمة السر (محتاجة صلاحية service role، فمينفعش تتعمل من المتصفح)
//
// actions:
//   create_member  { office_id, email, password, full_name, phone?, role }
//   set_password   { office_id, user_id, password }
//
// المسموح: الـ Super Admin على أي مكتب، أو صاحب المكتب على مكتبه (لو الاشتراك مش موقوف)

import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ROLES = ['owner', 'accountant', 'operations', 'hr'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (error: string) => json({ ok: false, error });

function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try {
    return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || '';
  } catch {
    return '';
  }
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function mapDbError(msg: string): string {
  if (/SEAT_LIMIT_REACHED/.test(msg)) return 'وصلت للحد الأقصى من الحسابات للدور ده. زوّد الحسابات من الاشتراك.';
  if (/LAST_OWNER/.test(msg)) return 'لازم يفضل صاحب مكتب واحد على الأقل.';
  if (/duplicate key/.test(msg)) return 'الحساب ده موجود في المكتب بالفعل.';
  return msg.replace(/^[A-Z_]+:\s*/, '');
}

async function findUserByEmail(email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const u = data.users.find((x) => (x.email || '').toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function canManage(callerId: string, officeId: string) {
  const { data: pa } = await admin.from('platform_admins').select('user_id').eq('user_id', callerId).maybeSingle();
  if (pa) return { ok: true, isAdmin: true };
  const { data: m } = await admin
    .from('office_members')
    .select('role')
    .eq('office_id', officeId)
    .eq('user_id', callerId)
    .eq('is_active', true)
    .maybeSingle();
  if (!m || m.role !== 'owner') return { ok: false, isAdmin: false };
  const { data: s } = await admin.from('subscriptions').select('status').eq('office_id', officeId).maybeSingle();
  return { ok: Boolean(s && ['trial', 'active', 'past_due'].includes(s.status)), isAdmin: false };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('Method not allowed');

  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return fail('لازم تسجل دخول الأول');
    const { data: auth, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !auth?.user) return fail('الجلسة انتهت، سجل دخول تاني');
    const caller = auth.user;

    const body = await req.json().catch(() => ({}));
    const officeId = String(body.office_id || '');
    if (!officeId) return fail('المكتب مش محدد');

    const perm = await canManage(caller.id, officeId);
    if (!perm.ok) return fail('مش مسموح لك تعمل الإجراء ده، أو اشتراك المكتب موقوف.');

    if (body.action === 'create_member') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const fullName = String(body.full_name || '').trim();
      const phone = String(body.phone || '').trim() || null;
      const role = String(body.role || '');
      if (!/^\S+@\S+\.\S+$/.test(email)) return fail('الإيميل غير صحيح');
      if (!fullName) return fail('اكتب اسم الموظف');
      if (!ROLES.includes(role)) return fail('الدور غير صحيح');
      if (role === 'owner' && !perm.isAdmin) return fail('صاحب المكتب بيتضاف من فريق Masar Pro بس');

      let userId: string;
      let createdNew = false;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (created.error) {
        const existing = /already|registered|exists/i.test(created.error.message) ? await findUserByEmail(email) : null;
        if (!existing) {
          if (/password/i.test(created.error.message)) return fail('كلمة السر ضعيفة. لازم 8 حروف على الأقل.');
          return fail(created.error.message);
        }
        userId = existing.id;
      } else {
        userId = created.data.user!.id;
        createdNew = true;
      }

      const ins = await admin
        .from('office_members')
        .insert({ office_id: officeId, user_id: userId, role, full_name: fullName, phone, email })
        .select('id')
        .single();
      if (ins.error) {
        if (createdNew) await admin.auth.admin.deleteUser(userId); // متسيبش حساب يتيم
        return fail(mapDbError(ins.error.message));
      }
      return json({ ok: true, data: { member_id: ins.data.id, existing_user: !createdNew } });
    }

    if (body.action === 'set_password') {
      const userId = String(body.user_id || '');
      const password = String(body.password || '');
      if (password.length < 8) return fail('كلمة السر لازم 8 حروف على الأقل');
      const { data: target } = await admin
        .from('office_members')
        .select('role')
        .eq('office_id', officeId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!target) return fail('الحساب ده مش في المكتب');
      if (target.role === 'owner' && !perm.isAdmin && userId !== caller.id) return fail('مش مسموح');
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return fail(error.message);
      return json({ ok: true, data: { done: true } });
    }

    return fail('إجراء غير معروف');
  } catch (e) {
    console.error(e);
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقع');
  }
});
