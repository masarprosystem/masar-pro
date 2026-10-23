import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { supabase } from '@/core/supabase';
import { useOffice } from '@/core/office';
import { errorMessage } from '@/core/errors';
import { money } from '@/core/format';
import { useToast } from '@/core/toast';
import { cellNumber, cellText, detectColumns, findHeaderRow, readSheet, toObjects, type Cell } from '@/core/sheets';
import { Badge, Button, Field, Modal } from '@/components/ui';
import { useCarriers } from '@/modules/recruitment/api';
import { DETAIL_FIELDS, MAIN_FIELDS, PAY_FIELDS, PAY_FIELD_LABEL, REQUIRED_FIELDS, cleanCarrierName, lineKey, monthLabel, type PayField } from './model';

const NUM_FIELDS: PayField[] = ['work_days', 'deliveries', 'rto', 'pickups', 'total_fixed', 'total_variable', 'total_deductions', 'total_bonus', 'total_salary', 'advances_sheet', 'deficit', 'lost'];

export function UploadModal({ open, onClose, month, existingCarrierIds }: { open: boolean; onClose: () => void; month: string; existingCarrierIds: string[] }) {
  const { office } = useOffice();
  const toast = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: carriers } = useCarriers(office?.id);
  const [carrierId, setCarrierId] = useState('');
  const [m, setM] = useState(month);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, Cell>[]>([]);
  const [map, setMap] = useState<Record<PayField, string> | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (open) {
      setM(month);
      setFile(null);
      setMap(null);
      setRows([]);
      setCarrierId((c) => c || carriers?.find((x) => x.is_active)?.id || '');
    }
  }, [open, month, carriers]);

  const carrier = carriers?.find((c) => c.id === carrierId);

  const read = async (f: File) => {
    setFile(f);
    try {
      const all = await readSheet(f);
      const hr = findHeaderRow(all, [...PAY_FIELDS.carrier_name, ...PAY_FIELDS.total_salary]);
      const { headers: hs, data } = toObjects(all, hr);
      setHeaders(hs);
      setRows(data);
      setMap(detectColumns(hs, PAY_FIELDS, (carrier?.payroll_mapping as Partial<Record<PayField, string>>) || null));
    } catch (e) {
      toast(errorMessage(e), 'error');
      setFile(null);
    }
  };

  const lines = useMemo(() => {
    if (!map) return [];
    const seen: Record<string, number> = {};
    return rows
      .map((r) => {
        const name = cellText(map.carrier_name ? r[map.carrier_name] : '').replace(/\s+/g, ' ');
        if (!name) return null;
        const star = cellText(map.star_id ? r[map.star_id] : '');
        let key = lineKey(star, name);
        seen[key] = (seen[key] || 0) + 1;
        if (seen[key] > 1) key = `${key}#${seen[key]}`;
        const out: Record<string, unknown> = {
          line_key: key,
          star_id: star,
          carrier_name: name,
          hub: cellText(map.hub ? r[map.hub] : '') || null,
          zone: cellText(map.zone ? r[map.zone] : '') || null,
          vehicle: cellText(map.vehicle ? r[map.vehicle] : '') || null,
        };
        NUM_FIELDS.forEach((k) => (out[k] = map[k] ? cellNumber(r[map[k]]) : 0));
        out.details = Object.fromEntries(DETAIL_FIELDS.filter((k) => map[k]).map((k) => [k, cellNumber(r[map[k]])]));
        return out;
      })
      .filter(Boolean) as Record<string, unknown>[];
  }, [rows, map]);

  const total = lines.reduce((s, l) => s + Number(l.total_salary || 0), 0);
  const zeroSalary = lines.filter((l) => !Number(l.total_salary)).length;
  const missingRequired = map ? REQUIRED_FIELDS.filter((k) => !map[k]) : [];
  const replacing = existingCarrierIds.includes(carrierId) && m === month;

  const mut = useMutation({
    mutationFn: async () => {
      const mapping = Object.fromEntries(Object.entries(map || {}).filter(([, v]) => v));
      const { data, error } = await supabase.rpc('payroll_import', {
        p_office: office!.id, p_carrier: carrierId, p_month: m, p_file: file?.name || null, p_lines: lines, p_mapping: mapping,
      });
      if (error) throw error;
      return data as { run_id: string; total: number; linked: number; kept_paid: number; removed: number };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      qc.invalidateQueries({ queryKey: ['payroll-lines', r.run_id] });
      qc.invalidateQueries({ queryKey: ['payroll-month-lines'] });
      qc.invalidateQueries({ queryKey: ['carriers'] });
      toast(`اترفع ${r.total} مندوب. ${r.linked} مربوطين بملفاتهم${r.kept_paid ? `، و${r.kept_paid} سجل صرف قديم اتحفظ` : ''}.`, 'success');
      onClose();
      nav(`/app/payroll/runs/${r.run_id}?m=${m}`);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="رفع شيت مرتبات"
      footer={<><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button loading={mut.isPending} disabled={!carrierId || !lines.length || missingRequired.length > 0} onClick={() => mut.mutate()}>رفع {lines.length || ''} مندوب</Button></>}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="شركة الشحن" required htmlFor="u_car">
          <select id="u_car" className="field" value={carrierId} onChange={(e) => setCarrierId(e.target.value)}>
            {(carriers || []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="شهر المرتبات" required htmlFor="u_month">
          <input id="u_month" type="month" dir="ltr" className="field" value={m} onChange={(e) => setM(e.target.value)} />
        </Field>
      </div>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-5 text-sm font-bold text-slate-600 hover:border-brand-500 dark:border-slate-700 dark:text-slate-300">
        {file ? <><FileSpreadsheet className="h-5 w-5 text-brand-600" /> {file.name}</> : <><Upload className="h-5 w-5" /> اختار ملف المرتبات (Excel أو CSV)</>}
        <input type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ''; }} />
      </label>
      {carrier?.payroll_mapping && !file && <p className="text-xs text-slate-500">ترتيب أعمدة {carrier.name} محفوظ من آخر مرة، هيتطبق لوحده.</p>}

      {map && (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge tone="green">{lines.length} مندوب</Badge>
            <Badge tone="gold">إجمالي المرتبات {money(total)}</Badge>
            {zeroSalary > 0 && <Badge tone="amber">{zeroSalary} من غير مرتب</Badge>}
            {missingRequired.map((k) => <Badge key={k} tone="red">ناقص: {PAY_FIELD_LABEL[k]}</Badge>)}
          </div>
          {replacing && <p className="rounded-lg bg-amber-50 p-2.5 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">شيت {carrier?.name} لشهر {monthLabel(m)} مرفوع قبل كده: الأرقام هتتحدث، وسجلات الصرف اللي اتعملت هتفضل زي ما هي.</p>}
          {lines[0] && <p className="text-xs text-slate-500">أول سطر: <b>{cleanCarrierName(String(lines[0].carrier_name))}</b> — {String(lines[0].hub || '')} — مرتب {money(Number(lines[0].total_salary))}</p>}
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-extrabold text-slate-600 dark:text-slate-300">ربط الأعمدة</p>
              <button type="button" className="text-xs font-bold text-brand-600" onClick={() => setShowAll((x) => !x)}>{showAll ? 'إخفاء التفاصيل' : 'عرض كل الأعمدة'}</button>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {[...MAIN_FIELDS, ...(showAll ? DETAIL_FIELDS : [])].filter((k) => showAll || REQUIRED_FIELDS.includes(k) || ['star_id', 'hub', 'deliveries', 'advances_sheet', 'deficit', 'lost'].includes(k)).map((k) => (
                <div key={k} className="flex items-center justify-between gap-2 text-xs">
                  <span>{PAY_FIELD_LABEL[k]}{REQUIRED_FIELDS.includes(k) && <span className="text-red-500"> *</span>}</span>
                  <select className="field !w-48 !py-1 text-xs" value={map[k]} onChange={(e) => setMap({ ...map, [k]: e.target.value })} aria-label={PAY_FIELD_LABEL[k]}>
                    <option value="">— مش موجود —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">الترتيب ده بيتحفظ لشركة {carrier?.name}، والمرة الجاية مش هتحتاج تظبطه.</p>
          </div>
        </>
      )}
    </Modal>
  );
}
