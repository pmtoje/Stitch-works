# Architecture

## Layout

```
prisma/
  schema.prisma                 single shared data model (~60 tables)
  migrations/                   incl. 20261104182100_integrity: EXCLUDE constraints, CHECKs, immutability triggers
  seed.ts
src/lib/                        framework-agnostic domain services (unit/integration tested)
  auth/        service.ts (login, sessions, tokens) · rbac.ts (permission matrix) · totp.ts · password.ts · session.ts (cookies)
  booking/     windows.ts (operating hours → time spans) · pricing.ts (pure) · service.ts (create/cancel/reschedule/approve/availability)
  payments/    provider.ts (Paystack + test gateway) · service.ts (initiate/verify/webhook/manual/refund/reconcile) · invoices.ts
  production/  orders.ts (enquiry → quotation → deposit → stages) · allocation.ts (jobs, marketplace, QC, piece-rate)
  tailors/     application workflow, profile creation
  academy/     admissions, enrolment, attendance, assignments, assessments, certificates
  memberships.ts · notifications/ · uploads.ts · cms.ts · analytics.ts · reports.ts · jobs.ts · audit.ts · ratelimit.ts
src/app/
  (site)/      public website + booking engine + forms
  (auth)/      login, 2FA, register, password reset, email verification
  dashboard/   customer / corporate / tailor / student portal (role-aware navigation)
  admin/       management console (permission-filtered navigation)
  api/         files (authorised downloads), payments/webhook/[provider], reports/[type], cron
```

Server Actions call domain services; services enforce permissions themselves (defence in depth), so UI bugs cannot bypass authorisation.

## Shared core

Every business line uses the same `User`, `Facility`, `Equipment`, `Invoice`, `Payment`, `Notification` and `AuditLog` tables. A booking, a membership, Academy tuition and a production deposit are all `Invoice`s paid through one payment pipeline; `creditInvoice()` dispatches the domain effect (confirm booking, activate membership, enrol student, confirm production order).

## Key business rules and where they are enforced

| Rule | Enforcement |
|---|---|
| No overlapping reservations of a machine/workstation | App check under `SELECT … FOR UPDATE` **and** Postgres `EXCLUDE USING gist` on `(resource, tsrange)` where `active` |
| Multiple machines per booking; each booking belongs to a facility | `BookingItem` rows per resource per day; resources validated against `facilityId` |
| Maintenance blocks availability | `MaintenanceWindow` overlap check + equipment status (`UNDER_MAINTENANCE`, `OUT_OF_SERVICE`, `RETIRED`) |
| Pending payment ≠ paid | Only gateway-verified (`verifyPayment`/webhook) or finance-recorded payments credit invoices; unpaid holds expire and release inventory |
| Unique production references | Atomic `Counter` sequences (`PO-2026-00001`, `BK-`, `INV-`, `PJ-`, `TA-`, `SA-`) |
| Allocations traceable to tailor/team/partner | CHECK constraint: exactly one assignee |
| Only accepted QC quantity is payable; approvals by authorised staff | `recordInspection` (QC officer, not the submitter) → `PieceRateEarning` PENDING → PM approves → finance pays |
| QC numbers add up | CHECK `accepted + rejected + rework = inspected` |
| Unique certificate IDs | Random non-sequential `SWA-YYYY-XXXX-XXXX`, unique index, public verify page |
| Membership expiry tracked | `runMembershipLifecycle()` via cron: expiry + 14-day renewal reminders |
| Financial records can’t be altered | Succeeded payments immutable (DB trigger); refunds are separate records; invoices with payments can’t be voided |
| All admin actions logged | `audit()` in every mutating service; `AuditLog` append-only (DB trigger) |
| Prices/fees/policies configurable | Rate cards, per-machine overrides, workstation rates, plans, course fees, facility rules, policies — all in admin |
| Multi-facility | Every operational table keys on `facilityId`; facility managers can be scoped per facility |

## Roles

`CUSTOMER, CORPORATE_CLIENT, TAILOR, STUDENT, INSTRUCTOR, FACILITY_MANAGER, PRODUCTION_MANAGER, FINANCE_OFFICER, QC_OFFICER, ACADEMY_ADMIN, SUPER_ADMIN`. Users can hold several (`UserRole`), optionally scoped to a facility. The permission matrix lives in `src/lib/auth/rbac.ts`; finance has no user/CMS/system rights, QC cannot approve earnings, production managers cannot record payouts.

## Security design

- Passwords: bcrypt (12 rounds), min 10 chars with letters + digits; timing-equalised login; lockout after 5 failures (15 min).
- Sessions: random 256-bit tokens, only SHA-256 hashes stored; httpOnly, SameSite=Lax, Secure in production; 14-day absolute + 72-hour idle expiry; revoked on password reset/disable.
- 2FA: TOTP, secrets AES-256-GCM encrypted at rest; sessions unusable until the second factor passes.
- CSRF: Server Actions are POST-only with Next.js origin checking; SameSite cookies.
- XSS: React escaping, no raw HTML from users (CMS uses a safe Markdown subset), strict CSP, JSON-LD escaped.
- SQL injection: Prisma parameterised queries; raw SQL uses tagged templates only.
- IDOR: every record load checks ownership or permission and returns “not found” otherwise; files served through `/api/files/[id]` with owner/staff checks.
- Uploads: magic-byte sniffing (browser MIME ignored), per-purpose whitelists, size caps, random storage keys outside the web root, served with `nosniff` + sandbox CSP.
- Payments: never trust the browser — server verification with the gateway, amount/currency match, idempotent row-locked application, HMAC-SHA512 webhook verification, de-duplicated webhook events, no card data stored.
- Rate limiting: Postgres-backed (works across instances) on login, 2FA, registration, resets, forms, payments, bookings.
- Errors: only `AppError` messages reach users; everything else is logged and replaced with a generic message.
- Headers: CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy.
- Reports: permission-checked, facility-scoped, audit-logged, CSV/Excel formula-injection neutralised.

### Row-level security note
Authorisation is enforced in the application layer and backed by DB constraints/triggers. If you host on Supabase, keep the database **closed to the public API** (do not expose these tables through PostgREST) — the app connects with a server-side role only. If you later expose tables to Supabase client SDKs, add RLS policies mirroring `rbac.ts` first.

## Photography
`ImageSlot` renders CMS-uploaded photos; until StitchWorks uploads its own, each slot shows a labelled placeholder describing the intended shot. No stock imagery is presented as the facility.
