import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LogOut, Menu, X, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/core/auth';

export interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }
export interface NavGroup { title?: string; items: NavItem[] }

export function Shell({ groups, top, bottom, banner, children }: { groups: NavGroup[]; top?: ReactNode; bottom?: ReactNode; banner?: ReactNode; children: ReactNode }) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 px-5 pb-4 pt-5 dark:border-slate-800">
        <img src="/brand/masar-logo.png" alt="Masar Pro" className="mx-auto w-full max-w-[180px] dark:rounded-lg dark:bg-paper dark:p-2" />
        {top}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {groups.map((g, i) => (
          <div key={i} className="space-y-1">
            {g.title && <p className="px-3 pb-1 pt-3 text-[11px] font-extrabold text-slate-400">{g.title}</p>}
            {g.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition ${
                    isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-brand-50 dark:text-slate-300 dark:hover:bg-white/5'
                  }`
                }
              >
                <it.icon className="h-[18px] w-[18px] shrink-0" />
                <span>{it.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="space-y-2 border-t border-slate-100 p-3 dark:border-slate-800">
        {bottom}
        <div className="flex items-center justify-between gap-2 px-2">
          <p className="truncate text-xs text-slate-500" dir="ltr">{user?.email}</p>
          <button onClick={() => signOut()} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600" title="تسجيل الخروج" aria-label="تسجيل الخروج">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0f1a16] md:block">{sidebar}</aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#0f1a16] md:hidden" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <img src="/brand/masar-icon-512.png" alt="Masar Pro" className="h-9 w-9" />
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-slate-600" aria-label="القائمة">
          <Menu className="h-6 w-6" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)}>
          <aside className="pop relative h-full w-72 max-w-[85%] bg-white dark:bg-[#0f1a16]" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} className="absolute left-3 top-3 p-2 text-slate-500" aria-label="إغلاق">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1">
        {banner}
        <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
          {children}
        </div>
      </main>
    </div>
  );
}
