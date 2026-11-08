# StitchWorks Collective — Digital Platform

One integrated application for a garment-production ecosystem: **StitchWorks Production** (workspace & machine rental, bulk manufacturing), **StitchWorks Marketplace** (tailor network, production jobs, piece-rate earnings) and **StitchWorks Academy** (courses, admissions, attendance, assessments, verifiable certificates) — sharing one set of users, facilities, equipment, invoices, payments, notifications and audit logs.

Built for the first Common Facility Centre in Jos, with multi-facility support from day one.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router, Server Components, Server Actions), React 19, TypeScript (strict) |
| UI | Tailwind CSS design system, Fraunces (display) + Inter Tight (body), self-hosted fonts |
| Data | PostgreSQL via Prisma 6 (works with Supabase Postgres) |
| Auth | Built-in: bcrypt passwords, DB sessions (httpOnly cookies), TOTP 2FA, email verification, lockout, RBAC |
| Payments | Paystack (server-verified + signed webhooks); built-in test-mode gateway |
| Notifications | Outbox table → Email (SMTP), SMS (Termii), WhatsApp Cloud API |
| Tests | Vitest against a real Postgres test database (74 tests) |

## Quick start (local)

```bash
cp .env.example .env            # set DATABASE_URL, APP_ENCRYPTION_KEY, PAYMENT_PROVIDER=mock
npm install
npx prisma migrate deploy       # creates schema + integrity constraints
SEED_DEMO=true SEED_DEMO_PASSWORD='choose-one' npm run db:seed
npm run dev                     # http://localhost:3000
```

Demo accounts (with `SEED_DEMO=true`): `admin@stitchworks.ng`, `facility@`, `production@`, `finance@`, `qc@`, `academy@`, `instructor@stitchworks.ng`, and `customer@`, `tailor@`, `student@example.com` — all using `SEED_DEMO_PASSWORD`.

In test mode, checkout opens a simulator page (“Simulate successful payment / failure”). The result is still verified on the server exactly like a real gateway.

## Tests

```bash
createdb stitchworks_test       # name must contain "test" — the suite refuses to run otherwise
npm test                        # applies migrations to TEST_DATABASE_URL, truncates between tests
npm run typecheck
```

Coverage highlights: single/multiple machine bookings, full-day and multi-day bookings, overlap conflicts, **5 concurrent requests for the same machines → exactly one succeeds**, the DB exclusion constraint, maintenance & out-of-service blocking, cancellation/refund policy, rescheduling, hold expiry, payment success/failure/pending, idempotent verification, amount mismatch, duplicate-payment prevention, webhook signatures; bulk order → quotation → acceptance → deposit → confirmation → allocation → QC → earnings approval → payout with separation of duties; tailor application workflow; memberships & expiry; full Academy journey to certificate verification, capacity, instructor scoping; RBAC matrix, IDOR, privilege escalation, lockout, session expiry, 2FA gating, reset-token reuse, immutable payments & audit log, file-type sniffing, CSV injection, rate limiting.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — modules, data model, business rules, security design
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production deployment, cron, backups
- [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) — every environment variable + **external integrations & credentials required before launch**
- [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) — onboarding for management roles
- [docs/USER_GUIDES.md](docs/USER_GUIDES.md) — customers, corporate clients, tailors, students
