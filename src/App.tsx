import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/core/auth';
import { useOffice, type Area } from '@/core/office';
import { supabaseConfigured } from '@/core/supabase';
import { Spinner } from '@/components/ui';
import { AppLayout } from '@/layouts/AppLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { LoginPage, NoAccessPage, ProfilePage, SetupMissingPage } from '@/pages/AuthPages';
import { ComingSoon, HomePage, OfficeSettingsPage, SubscriptionPage, TeamPage } from '@/pages/app/OfficePages';
import { AdminOfficesPage } from '@/pages/admin/AdminOfficesPage';
import { AdminOfficeDetailPage } from '@/pages/admin/AdminOfficeDetailPage';

function FullSpinner() {
  return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <FullSpinner />;
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return <>{children}</>;
}

function RequireOffice({ children }: { children: ReactNode }) {
  const { memberships, isPlatformAdmin } = useAuth();
  if (!memberships.length) return isPlatformAdmin ? <Navigate to="/admin" replace /> : <NoAccessPage />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { isPlatformAdmin } = useAuth();
  if (!isPlatformAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Guard({ area, children }: { area: Area; children: ReactNode }) {
  const { can } = useOffice();
  return can(area) ? <>{children}</> : <Navigate to="/app" replace />;
}

function HomeRedirect() {
  const { memberships, isPlatformAdmin } = useAuth();
  if (memberships.length) return <Navigate to="/app" replace />;
  if (isPlatformAdmin) return <Navigate to="/admin" replace />;
  return <NoAccessPage />;
}

export default function App() {
  if (!supabaseConfigured) return <SetupMissingPage />;
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><HomeRedirect /></RequireAuth>} />

      <Route path="/app" element={<RequireAuth><RequireOffice><AppLayout /></RequireOffice></RequireAuth>}>
        <Route index element={<HomePage />} />
        <Route path="recruitment/*" element={<Guard area="recruitment"><ComingSoon module="recruitment" /></Guard>} />
        <Route path="payroll/*" element={<Guard area="payroll"><ComingSoon module="payroll" /></Guard>} />
        <Route path="staff/*" element={<Guard area="staff"><ComingSoon module="staff" /></Guard>} />
        <Route path="team" element={<Guard area="team"><TeamPage /></Guard>} />
        <Route path="subscription" element={<Guard area="subscription"><SubscriptionPage /></Guard>} />
        <Route path="settings" element={<Guard area="settings"><OfficeSettingsPage /></Guard>} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="/admin" element={<RequireAuth><RequireAdmin><AdminLayout /></RequireAdmin></RequireAuth>}>
        <Route index element={<AdminOfficesPage />} />
        <Route path="offices/:id" element={<AdminOfficeDetailPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
