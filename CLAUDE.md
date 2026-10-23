# Masar Pro — Project Brief

Masar Pro (مسار برو) is a multi-tenant SaaS for **courier recruitment agencies in Egypt** (مكاتب تعيين مناديب الشحن).
Agencies recruit couriers for carriers (Bosta, Amazon, Noon, Jumia, Aramex, …), manage their monthly payouts, and run their own HR staff.
Product of **A Tech Solution**. First pilot client: Dynamic Logistics Services (currently on a Google Apps Script prototype).

## Stack
- React 18 + TypeScript + Vite, React Router 7 (declarative mode), TanStack Query, Tailwind CSS, react-hook-form + zod, Recharts.
- Supabase (Postgres, Auth, Storage, RLS, Edge Functions, pg_cron). Region: **eu-central-1 (Frankfurt)**.
- Vercel for hosting (SPA rewrites to `index.html`). Functions region `fra1`.
- `browser-image-compression` for uploads, SheetJS (`xlsx`) for Excel import/export.
- Never put the Supabase **service role key** in the frontend. Privileged actions (inviting users) go through Edge Functions.

## UI
- Arabic, RTL (`dir="rtl"`), Egyptian-friendly wording. Font: Cairo or IBM Plex Sans Arabic.
- Numbers formatted `en-US` (1,999), currency EGP (ج.م), timezone `Africa/Cairo`.
- Brand (from the logo): green `#0B5A3A`, deep green `#004830`, gold `#C99A3C`. Background off-white `#FAFAF6`.
- Logo assets live in `public/brand/` (`masar-logo.png`, `masar-icon-512.png`, `favicon-64.png`).
- Light and dark mode via CSS variables. Mobile-first: HR staff use phones in the field.

## App structure — three independent sections (أقسام)
```
src/
  core/        auth, office context, permissions, layout shell, api client, ui kit
  modules/
    recruitment/   التعيينات  — couriers pipeline, profiles, documents, carriers
    payroll/       المرتبات   — monthly carrier payouts, disbursement, custody, expenses, reports
    staff/         الموظفين   — staff profiles, attendance, commissions, staff payroll
  admin/       Super Admin (platform owner only) — offices, subscriptions, payments, usage
```
- Sidebar groups by section. A section shows only if the office subscription includes it
  (`subscriptions.modules`) **and** the user's role is allowed.
- Routes: `/app/...` for office users, `/admin/...` for platform admins (guard with `is_platform_admin()`).

## Roles (per office) — `office_role`
| Role | التعيينات | المرتبات | الموظفين | إعدادات المكتب |
|---|---|---|---|---|
| owner (صاحب المكتب) | full | full | full | full + team & seats |
| accountant (محاسب) | read | full | payroll/commissions | — |
| operations (أوبريشن) | full | read + disbursement | attendance (own team) | — |
| hr | create/edit couriers, docs, stages | — | own profile/attendance | — |

## Multi-tenancy rules (non-negotiable)
- Every business table has `office_id uuid not null references offices(id) on delete cascade` + an index starting with `office_id`.
- RLS on every table. Use the helpers from migration 001:
  `my_office_ids()`, `has_office_role(office, roles[])`, `office_is_writable(office)`, `office_has_module(office, module)`, `is_platform_admin()`.
- Writes must also require `office_is_writable(office_id)` (suspended/cancelled offices are read-only).
- In policies, wrap helpers as `(select fn())` where possible for performance.
- Attach `audit_trigger()` to tables that touch money or courier status.
- Unique keys are per office (e.g. `unique (office_id, national_id)`).

## Subscriptions & seats (already in migration 001)
- Plan `standard`: 1999 EGP/month, seats owner 1, accountant 1, operations 2, hr 5, up to 300 active couriers.
- Extra seats per office in `subscriptions.extra_seats` (`{"hr":2}`); enforced by trigger `enforce_seat_limit` → error code text `SEAT_LIMIT_REACHED`.
- Statuses: trial → active → past_due (after period end) → suspended (after grace days) / cancelled. Daily cron `refresh_subscription_statuses()`.
- Super Admin RPCs: `admin_create_office`, `admin_update_subscription`, `admin_record_payment`, `admin_offices_overview`.
- UI: show a banner when `past_due` (days of grace left) and a read-only mode when `suspended`.

## Documents & images (keep storage cheap)
- Compress in the browser **before** upload: max 1600px longest side, WebP, quality ~0.7, target ≤ 300 KB.
- PDFs allowed up to 2 MB. Bucket `documents` is private (limit 2 MB, webp/jpeg/png/pdf).
- Path: `{office_id}/couriers/{courier_id}/{doc_type}-{timestamp}.webp` (first folder must be the office id — storage policies depend on it).
- Show files through short-lived signed URLs. Store only the path in the DB.

## Domain rules carried over from the prototype
- Courier stages: `applied`, `interview`, `passed_interview` (Successful Interview), `training`, `active`, `inactive` (InActivate), `blocked`, `left`.
  Every stage change is logged with note + changed_by (courier_stage_history). Reason required for inactive/blocked.
- A courier can work for several carriers over time: `courier_assignments(courier, carrier, hub, zone, vehicle, start_date, end_date)`.
- Carriers are a per-office list, seeded with: Bosta, Amazon, Noon, Jumia, Aramex, J&T, Mylerz.
- Payroll net = `total_salary − (advances + deficit + lost)`. Bosta export columns: Star Name, Contractor, Hub, Zone, Vehicle Type, #Working,
  #Deliveries, #RTO Stops, #Pickup Stops, Total Fixed, Total Package Variable, Total Pickups Variable, Total Variable, Fake Exceptions Deductions,
  Ops Deductions, Fleet Deductions, Total Deductions, Ops Bonus, Fleet Bonus, Total Bonus, Total Salary, السلف, العجز, الشحنات اللوست.
  Each carrier gets a saved **column-mapping template** per office; re-importing a month must keep existing disbursement records.
- Carrier names (English) don't match recruitment names (Arabic): link payroll lines to couriers manually once, then remember the link.
- Custody (عُهدة) is per staff member per month; remaining = custody − disbursed − expenses paid by that person.
- Staff commission: per recruited courier, **qualifies only when** the courier stays active N days or appears in a first payroll (configurable per office) — avoids paying for couriers who drop out after training.
- Courier performance: monthly deliveries/salary trend; flag a decline when the last-3-months average drops > 20% vs the previous 3.

## Build phases (do them in order, each ends deployable)
1. **Core**: auth (email/password + invite links), office context, app shell + sidebar sections, team page with seat usage, subscription banners, Super Admin (offices list, create office + invite owner, edit subscription, record payment, audit view).
2. **Recruitment**: couriers list/kanban by stage, profile timeline, relatives, documents with compression, carriers & assignments, CSV import from the Apps Script sheet.
3. **Payroll**: import with column mapping, monthly runs per carrier, payment modal (advances/method/paid by), custody, expenses, final report + print/PDF, courier performance history.
4. **Staff**: staff profiles, attendance check-in/out (optional geolocation), commission rules + ledger, monthly staff payroll (fixed + commissions − absence).

## Conventions
- SQL migrations in `supabase/migrations/NNN_name.sql`, idempotent, applied in order (001 foundation, 002 setup, 003 member email, 004 recruitment).
- Image compression is implemented in `src/modules/recruitment/files.ts` (canvas → WebP/JPEG), no external worker/CDN.
- Generate DB types (`supabase gen types typescript`) into `src/core/db.types.ts` after each migration.
- Data access per module in `modules/<x>/api.ts` using TanStack Query hooks; paginate lists (50 rows), never `select *` on big tables.
- Arabic error messages for known DB errors (`SEAT_LIMIT_REACHED`, `LAST_OWNER`, `NOT_ALLOWED`).
- No business data in localStorage.
