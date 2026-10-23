import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Wallet } from 'lucide-react';
import { supabase } from '@/core/supabase';
import { useOffice } from '@/core/office';
import { errorMessage } from '@/core/errors';
import { ROLE_LABEL, fmtDate, money, todayStr } from '@/core/format';
import { useToast } from '@/core/toast';
import { Badge, Button, Card, Empty, Field, PageHeader, Spinner, Stat, Table } from '@/components/ui';
import { useCustody, useExpenses, useMonth, useMonthLines } from './api';
import { EXPENSE_CATEGORIES, monthLabel } from './model';
import { MonthBar, usePayers, usePayrollPerms } from './shared';

/** حسابات كل موظف في الشهر: العُهدة واللي صرفه والمصروفات والمتبقي */
export function useStaffBalances(month: string) {
  const { office } = useOffice();
  const { payers } = usePayers();
  const { data: lines, isLoading: a } = useMonthLines(office?.id, month);
  const { data: custody, isLoading: b } = useCustody(office?.id, month);
  const { data: expenses, isLoading: c } = useExpenses(office?.id, month);
  const rows = useMemo(
    () =>
      payers.map((m) => {
        const pays = (lines || []).filter((l) => l.paid && l.paid_by === m.id);
        const methods: Record<string, { n: number; total: number }> = {};
        pays.forEach((p) => {
          const k = p.pay_method || '—';
          methods[k] = methods[k] || { n: 0, total: 0 };
          methods[k].n++;
          methods[k].total += Number(p.paid_amount);
        });
        const cust = (custody || []).find((x) => x.member_id === m.id);
        const disbursed = pays.reduce((s, p) => s + Number(p.paid_amount), 0);
        const spent = (expenses || []).filter((x) => x.paid_by === m.id).reduce((s, x) => s + Number(x.amount), 0);
        const amount = Number(cust?.amount || 0);
        return { member: m, custody: amount, custodyId: cust?.id, count: pays.length, disbursed, spent, remaining: amount - disbursed - spent, methods };
      }),
    [payers, lines, custody, expenses],
  );
  return { rows, lines: lines || [], custody: custody || [], expenses: expenses || [], isLoading: a || b || c };
}

export function CustodyPage() {
  const { office } = useOffice();
  const [month, setMonth] = useMonth();
  const perms = usePayrollPerms();
  const toast = useToast();
  const qc = useQueryClient();
  const { rows, isLoading } = useStaffBalances(month);
  const sum = (k: 'custody' | 'disbursed' | 'spent' | 'remaining') => rows.reduce((s, r) => s + r[k], 0);

  const save = useMutation({
    mutationFn: async ({ memberId, amount }: { memberId: string; amount: number }) => {
      const { error } = await supabase.from('custody').upsert({ office_id: office!.id, month, member_id: memberId, amount }, { onConflict: 'office_id,month,member_id' });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['custody'] }); toast('اتحفظت العُهدة.', 'success'); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="العُهد" subtitle="العُهدة بتتسجل لكل موظف في كل شهر. المتبقي = العُهدة − اللي اتصرف على المناديب − المصروفات اللي طلّعها." actions={<MonthBar month={month} onChange={setMonth} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="brand" label={`عُهد ${monthLabel(month)}`} value={money(sum('custody'))} />
        <Stat label="اتصرف على المناديب" value={money(sum('disbursed'))} />
        <Stat label="مصروفات" value={money(sum('spent'))} />
        <Stat label="المتبقي معاهم" value={<span className={sum('remaining') < 0 ? 'text-red-600' : 'text-brand-600'}>{money(sum('remaining'))}</span>} />
      </div>
      {isLoading ? <Spinner /> : !rows.length ? <div className="card"><Empty icon={<Wallet className="h-10 w-10" />} title="مفيش موظفين بيصرفوا. ضيف محاسب أو أوبريشن من صفحة الفريق." /></div> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map((r) => (
            <div key={r.member.id} className="card space-y-3 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-extrabold text-brand-800 dark:text-brand-100">{r.member.full_name || r.member.email}</p>
                  <p className="text-xs text-slate-500">{ROLE_LABEL[r.member.role]}{!r.member.is_active && ' · موقوف'}</p>
                </div>
                <Badge tone={r.remaining < 0 ? 'red' : r.custody ? 'green' : 'slate'}>{r.custody ? `متبقي ${money(r.remaining)}` : 'من غير عُهدة'}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-slate-50 p-2 dark:bg-white/5"><p className="text-slate-500">صرف لـ</p><p className="tabular font-bold">{r.count} مندوب</p></div>
                <div className="rounded-lg bg-slate-50 p-2 dark:bg-white/5"><p className="text-slate-500">إجمالي الصرف</p><p className="tabular font-bold">{money(r.disbursed)}</p></div>
                <div className="rounded-lg bg-slate-50 p-2 dark:bg-white/5"><p className="text-slate-500">مصروفات</p><p className="tabular font-bold">{money(r.spent)}</p></div>
              </div>
              <Field label={`العُهدة لشهر ${monthLabel(month)}`} htmlFor={`c_${r.member.id}`}>
                <input
                  id={`c_${r.member.id}`}
                  key={`${month}-${r.custody}`}
                  type="number"
                  min="0"
                  dir="ltr"
                  className="field"
                  defaultValue={r.custody || ''}
                  placeholder="0"
                  disabled={!perms.canCustody}
                  onBlur={(e) => {
                    const v = Number(e.target.value) || 0;
                    if (v !== r.custody) save.mutate({ memberId: r.member.id, amount: v });
                  }}
                />
              </Field>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(r.methods).map(([m, x]) => <span key={m} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold dark:bg-slate-800">{m}: {x.n} · {money(x.total)}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExpensesPage() {
  const { office } = useOffice();
  const [month, setMonth] = useMonth();
  const perms = usePayrollPerms();
  const toast = useToast();
  const qc = useQueryClient();
  const { activePayers, name } = usePayers();
  const { data, isLoading } = useExpenses(office?.id, month);
  const [f, setF] = useState({ description: '', amount: '', category: EXPENSE_CATEGORIES[0], spent_at: todayStr(), paid_by: '', notes: '' });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('expenses').insert({
        office_id: office!.id, month, description: f.description.trim(), amount: Number(f.amount), category: f.category,
        spent_at: f.spent_at, paid_by: f.paid_by || null, notes: f.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      setF((x) => ({ ...x, description: '', amount: '', notes: '' }));
      toast('اتضاف المصروف.', 'success');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); toast('اتحذف المصروف.', 'success'); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const total = (data || []).reduce((s, x) => s + Number(x.amount), 0);
  const byCat = (data || []).reduce<Record<string, number>>((a, x) => ({ ...a, [x.category]: (a[x.category] || 0) + Number(x.amount) }), {});

  return (
    <div className="space-y-6">
      <PageHeader title="المصروفات" actions={<MonthBar month={month} onChange={setMonth} />} />
      {perms.canAddExpense && (
        <Card title="إضافة مصروف">
          <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }} className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="md:col-span-2"><Field label="الوصف" required htmlFor="e_desc"><input id="e_desc" required className="field" placeholder="مثلاً: إعلانات فيسبوك" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field></div>
            <Field label="المبلغ (ج.م)" required htmlFor="e_amt"><input id="e_amt" required type="number" min="1" dir="ltr" className="field" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label="الفئة" htmlFor="e_cat"><select id="e_cat" className="field" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="التاريخ" htmlFor="e_date"><input id="e_date" type="date" className="field" value={f.spent_at} onChange={(e) => setF({ ...f, spent_at: e.target.value })} /></Field>
            <Field label="طلع من عُهدة مين" htmlFor="e_by"><select id="e_by" className="field" value={f.paid_by} onChange={(e) => setF({ ...f, paid_by: e.target.value })}><option value="">—</option>{activePayers.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}</select></Field>
            <Field label="ملاحظات" htmlFor="e_notes"><input id="e_notes" className="field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
            <div className="flex items-end"><Button type="submit" loading={add.isPending} disabled={!f.description.trim() || !(Number(f.amount) > 0)} className="w-full"><Plus className="h-4 w-4" /> إضافة</Button></div>
          </form>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="brand" label={`مصروفات ${monthLabel(month)}`} value={money(total)} sub={`${(data || []).length} مصروف`} />
        {Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, v]) => <Stat key={c} label={c} value={money(v)} />)}
      </div>
      <div className="card overflow-hidden">
        {isLoading ? <Spinner /> : (
          <Table head={['الوصف', 'الفئة', 'المبلغ', 'التاريخ', 'من عُهدة', 'ملاحظات', '']} empty={!data?.length && <Empty title={`مفيش مصروفات لشهر ${monthLabel(month)}`} />}>
            {(data || []).map((x) => (
              <tr key={x.id}>
                <td className="px-4 py-3 font-semibold">{x.description}</td>
                <td className="px-4 py-3 text-xs">{x.category}</td>
                <td className="tabular px-4 py-3 font-bold">{money(x.amount)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs">{fmtDate(x.spent_at)}</td>
                <td className="px-4 py-3 text-xs">{x.paid_by ? name[x.paid_by] : '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{x.notes || '—'}</td>
                <td className="px-4 py-3">{perms.canDeleteExpense && <Button size="sm" variant="ghost" onClick={() => confirm('حذف المصروف؟') && del.mutate(x.id)} title="حذف"><Trash2 className="h-4 w-4 text-red-500" /></Button>}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}
