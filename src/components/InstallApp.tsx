import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** زرار "تسطيب التطبيق" (أندرويد وكروم) أو شرح للآيفون */
export function InstallApp() {
  const [evt, setEvt] = useState<PromptEvent | null>(null);
  const [tip, setTip] = useState(false);
  const standalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone);
  const ios = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e as PromptEvent); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  if (standalone || (!evt && !ios)) return null;
  return (
    <div className="px-3 pb-2">
      <button
        type="button"
        onClick={async () => {
          if (evt) { await evt.prompt(); await evt.userChoice; setEvt(null); } else setTip((t) => !t);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-200"
      >
        <Smartphone className="h-4 w-4" /> تسطيب السيستم كتطبيق
      </button>
      {tip && <p className="mt-2 text-[11px] leading-5 text-slate-500">من سفاري: دوس زرار المشاركة ⬆️ تحت، وبعدين «إضافة إلى الشاشة الرئيسية».</p>}
    </div>
  );
}
