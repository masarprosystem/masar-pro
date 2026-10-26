import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/core/auth';
import { useOffice, type Area } from '@/core/office';
import { supabaseConfigured } from '@/core/supabase';
import { Spinner } from '@/components/ui';
import { AppLayout } from '@/layouts/AppLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { LoginPage, NoAccessPage, ProfilePage, SetupMissingPage } from '@/pages/AuthPages';
import { HomePage, OfficeSettingsPage, SubscriptionPage, TeamPage } from '@/pages/app/OfficePages';
// الصفحات الكبيرة بتتحمل وقت ما تتفتح بس، عشان أول فتح للموقع يبقى أسرع
const StagesPage = lazy(() => import('@/modules/recruitment/StagesPage').then((m) => ({ default: m.StagesPage })));
const ApplyLinkPage = lazy(() => import('@/modules/recruitment/ApplyLinkPage').then((m) => ({ default: m.ApplyLinkPage })));
const ProfitPage = lazy(() => import('@/modules/payroll/ProfitPage').then((m) => ({ default: m.ProfitPage })));
const PublicApplyPage = lazy(() => import('@/pages/PublicApplyPage').then((m) => ({ default: m.PublicApplyPage })));
const Landing = lazy(() => import('@/pages/Landing').then((m) => ({ default: m.Landing })));
const AdminOfficesPage = lazy(() => import('@/pages/admin/AdminOfficesPage').then((m) => ({ default: m.AdminOfficesPage })));
const AdminOfficeDetailPage = lazy(() => import('@/pages/admin/AdminOfficeDetailPage').then((m) => ({ default: m.AdminOfficeDetailPage })));
const RecruitmentDashboard = lazy(() => import('@/modules/recruitment/RecruitmentDashboard').then((m) => ({ default: m.RecruitmentDashboard })));
const CouriersPage = lazy(() => import('@/modules/recruitment/CouriersPage').then((m) => ({ default: m.CouriersPage })));
const CourierFormPage = lazy(() => import('@/modules/recruitment/CourierFormPage').then((m) => ({ default: m.CourierFormPage })));
const CourierProfilePage = lazy(() => import('@/modules/recruitment/CourierProfilePage').then((m) => ({ default: m.CourierProfilePage })));
const CarriersPage = lazy(() => import('@/modules/recruitment/CarriersPage').then((m) => ({ default: m.CarriersPage })));
const PayrollHome = lazy(() => import('@/modules/payroll/PayrollHome').then((m) => ({ default: m.PayrollHome })));
const RunPage = lazy(() => import('@/modules/payroll/RunPage').then((m) => ({ default: m.RunPage })));
const CustodyPage = lazy(() => import('@/modules/payroll/MoneyPages').then((m) => ({ default: m.CustodyPage })));
const ExpensesPage = lazy(() => import('@/modules/payroll/MoneyPages').then((m) => ({ default: m.ExpensesPage })));
const ReportPage = lazy(() => import('@/modules/payroll/ReportPage').then((m) => ({ default: m.ReportPage })));
const StaffHome = lazy(() => import('@/modules/staff/StaffHome').then((m) => ({ default: m.StaffHome })));
const AttendancePage = lazy(() => import('@/modules/staff/AttendancePage').then((m) => ({ default: m.AttendancePage })));
const StaffPayrollPage = lazy(() => import('@/modules/staff/StaffPayrollPage').then((m) => ({ default: m.StaffPayrollPage })));
const StaffSettingsPage = lazy(() => import('@/modules/staff/StaffSettingsPage').then((m) => ({ default: m.StaffSettingsPage })));
const MemberPage = lazy(() => import('@/modules/staff/MemberPage').then((m) => ({ default: m.MemberPage })));
const ImportPage = lazy(() => import('@/modules/recruitment/ImportPage').then((m) => ({ default: m.ImportPage })));
import type { OfficeRole } from '@/core/types';

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
  if (!isPlatformAdmin) return <Navigate to="/go" replace />;
  return <>{children}</>;
}

function Guard({ area, children }: { area: Area; children: ReactNode }) {
  const { can } = useOffice();
  return can(area) ? <>{children}</> : <Navigate to="/app" replace />;
}

function RoleGuard({ deny, children }: { deny: OfficeRole[]; children: ReactNode }) {
  const { role, writable } = useOffice();
  return role && !deny.includes(role) && writable ? <>{children}</> : <Navigate to="/app/recruitment" replace />;
}

function Allow({ roles, children, back = '/app/staff' }: { roles: OfficeRole[]; children: ReactNode; back?: string }) {
  const { role } = useOffice();
  return role && roles.includes(role) ? <>{children}</> : <Navigate to={back} replace />;
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
    <Suspense fallback={<Spinner />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Landing />} />
      <Route path="/apply/:slug" element={<PublicApplyPage />} />
      <Route path="/go" element={<RequireAuth><HomeRedirect /></RequireAuth>} />

      <Route path="/app" element={<RequireAuth><RequireOffice><AppLayout /></RequireOffice></RequireAuth>}>
        <Route index element={<HomePage />} />
        <Route path="recruitment" element={<Guard area="recruitment"><Outlet /></Guard>}>
          <Route index element={<RecruitmentDashboard />} />
          <Route path="couriers" element={<CouriersPage />} />
          <Route path="couriers/new" element={<RoleGuard deny={['accountant']}><CourierFormPage /></RoleGuard>} />
          <Route path="couriers/:id" element={<CourierProfilePage />} />
          <Route path="couriers/:id/edit" element={<RoleGuard deny={['accountant']}><CourierFormPage /></RoleGuard>} />
          <Route path="carriers" element={<CarriersPage />} />
          <Route path="import" element={<RoleGuard deny={['accountant']}><ImportPage /></RoleGuard>} />
          <Route path="stages" element={<Allow roles={['owner', 'operations']} back="/app/recruitment"><StagesPage /></Allow>} />
          <Route path="apply" element={<Allow roles={['owner', 'operations', 'hr']} back="/app/recruitment"><ApplyLinkPage /></Allow>} />
        </Route>
        <Route path="payroll" element={<Guard area="payroll"><Outlet /></Guard>}>
          <Route index element={<PayrollHome />} />
          <Route path="runs/:id" element={<RunPage />} />
          <Route path="custody" element={<CustodyPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="report" element={<ReportPage />} />
          <Route path="profit" element={<Allow roles={['owner', 'accountant']} back="/app/payroll"><ProfitPage /></Allow>} />
        </Route>
        <Route path="staff" element={<Guard area="staff"><Outlet /></Guard>}>
          <Route index element={<StaffHome />} />
          <Route path="attendance" element={<Allow roles={['owner', 'accountant', 'operations']}><AttendancePage /></Allow>} />
          <Route path="payroll" element={<Allow roles={['owner', 'accountant']}><StaffPayrollPage /></Allow>} />
          <Route path="settings" element={<Allow roles={['owner', 'accountant']}><StaffSettingsPage /></Allow>} />
          <Route path="members/:id" element={<MemberPage />} />
        </Route>
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
    </Suspense>
  );
}
