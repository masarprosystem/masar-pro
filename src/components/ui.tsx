import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2, X } from 'lucide-react';
import type { Tone } from '@/core/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/5',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5',
  danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50 dark:border-red-900 dark:bg-transparent dark:hover:bg-red-950',
  gold: 'bg-gold-500 text-white hover:bg-gold-600',
};

export function Button({
  variant = 'primary',
  loading,
  size = 'md',
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: 'sm' | 'md' }) {
  const sizes = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm';
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-bold transition disabled:cursor-not-allowed ${sizes} ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, required, children, htmlFor }: { label: string; hint?: string; required?: boolean; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

const BADGE: Record<Tone, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900',
  green: 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-900/40 dark:text-brand-200 dark:border-brand-800',
  amber: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
  red: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900',
  slate: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  gold: 'bg-gold-50 text-gold-700 border-gold-100 dark:bg-gold-700/20 dark:text-gold-300 dark:border-gold-700',
};
export function Badge({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${BADGE[tone]}`}>{children}</span>;
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
          {title && <h3 className="text-sm font-extrabold text-brand-800 dark:text-brand-200">{title}</h3>}
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'brand' }) {
  return tone === 'brand' ? (
    <div className="rounded-xl bg-brand-600 p-4 text-white">
      <p className="text-[11px] font-bold text-brand-100">{label}</p>
      <p className="tabular mt-1 text-3xl font-extrabold">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] font-semibold text-brand-100">{sub}</p>}
    </div>
  ) : (
    <div className="card p-4">
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className="tabular mt-1 text-2xl font-extrabold">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{sub}</p>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-900/50 p-4 md:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={title} className={`pop card my-6 w-full shadow-2xl ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h3 className="font-extrabold text-brand-800 dark:text-brand-200">{title}</h3>
          <button onClick={onClose} aria-label="إغلاق" className="text-slate-400 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">{footer}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label = 'جاري التحميل...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-sm font-semibold text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" /> {label}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 p-10 text-center text-slate-500">
      {icon && <div className="text-slate-300 dark:text-slate-600">{icon}</div>}
      <p className="text-sm font-bold">{title}</p>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-extrabold text-brand-800 dark:text-brand-100">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-right text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-white/5 dark:text-slate-300">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}
