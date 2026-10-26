import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { errorMessage } from '@/core/errors';
import { useToast } from '@/core/toast';
import { downloadXlsx, type XCol } from '@/core/xlsx';
import { Button } from './ui';

/** زرار "تصدير Excel": الصفوف ممكن تيجي من الصفحة أو تتجاب كلها وقت الضغط */
export function ExportButton<T>({ fileName, cols, rows, label = 'Excel', size = 'md' }: {
  fileName: string;
  cols: XCol<T>[];
  rows: T[] | (() => Promise<T[]>);
  label?: string;
  size?: 'sm' | 'md';
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    try {
      setBusy(true);
      const data = typeof rows === 'function' ? await rows() : rows;
      if (!data.length) return toast('مفيش بيانات للتصدير.', 'error');
      downloadXlsx(fileName, cols, data);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="secondary" size={size} loading={busy} onClick={run} title="تصدير Excel">
      <FileSpreadsheet className="h-4 w-4" /> {label}
    </Button>
  );
}
