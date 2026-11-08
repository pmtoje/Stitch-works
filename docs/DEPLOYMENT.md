# Deployment

Any Node 20+ host works (Vercel, Render, Railway, Fly.io, a VPS with PM2/systemd). Uploaded files need **persistent storage** — on serverless hosts, move storage to Supabase Storage/S3 first (see `src/lib/uploads.ts`).

## Steps

1. **Database** — create a Postgres 14+ database (Supabase: Project → Database → connection string, use the pooled URL for the app and direct URL for migrations).
2. **Environment** — set the variables in `docs/ENVIRONMENT.md`. Generate secrets with `openssl rand -base64 48`.
3. **Build & migrate**
   ```bash
   npm ci
   npx prisma migrate deploy     # never `migrate reset` in production
   SEED_DEMO=false SEED_DEMO_PASSWORD='<strong temp password>' npm run db:seed   # categories, policies, FAQs, super admin
   npm run build
   npm start
   ```
4. **First login** — sign in as `SEED_ADMIN_EMAIL`, change the password, enable 2FA, then follow `docs/ADMIN_GUIDE.md`.
5. **Paystack** — set webhook + callback URLs (see ENVIRONMENT.md). Test with `sk_test_` keys before switching to live.
6. **Cron** — every 10 minutes:
   ```bash
   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron
   ```
   It expires unpaid holds, sends booking reminders, runs membership expiry/renewals, raises maintenance alerts, reconciles pending payments with the gateway and dispatches queued email/SMS/WhatsApp.
7. **Backups** — enable daily database backups (Supabase PITR or `pg_dump` to off-site storage) **and** back up `STORAGE_DIR`. Test a restore before launch.
8. **Monitoring** — watch server logs for `webhook error`, and Admin → Notification log for FAILED deliveries.

## Vercel

The build (`npm run build` → `scripts/build.mjs`) detects Vercel and, before building, **applies database migrations and the idempotent seed**. There is nothing to run from your own machine.

1. **Database.** Storage → Create Database → **Neon (Postgres)** → connect it to the project for **Production** and **Preview**. This sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (used for migrations). Vercel's Supabase integration also works (`POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING`). Without a database the build stops with instructions.
2. **File storage.** Storage → Create → **Blob** (choose *Private*) → connect it to the project. This sets `BLOB_READ_WRITE_TOKEN`. Use `BLOB_ACCESS=public` only if you created a public store. Without Blob, uploads go to `/tmp`, which works but is wiped between requests and deployments.
3. **Environment variables.** Settings → Environment Variables (Production and Preview):
   - `APP_ENCRYPTION_KEY` — ≥32 random characters (`openssl rand -base64 48`)
   - `SEED_DEMO_PASSWORD` — password for the seeded administrator (`admin@stitchworks.ng`) and demo accounts. Without it, no administrator account is created.
   - `SEED_DEMO=true` — optional: loads the sample Jos facility, machines, plans, courses and demo accounts so you can try every workflow
   - Payments: `PAYMENT_PROVIDER=paystack` + `PAYSTACK_SECRET_KEY`, **or** for a trial `PAYMENT_PROVIDER=mock` + `ALLOW_MOCK_PAYMENTS=true` (no money moves; remove before launch)
   - `CRON_SECRET`, SMTP settings as in `docs/ENVIRONMENT.md`
   - `APP_URL` is optional on Vercel — the production domain or preview branch URL is detected automatically.
4. **Redeploy.** Deployments → ⋯ → Redeploy. New variables only apply to new deployments.
5. **Sign in** at `/login` as `admin@stitchworks.ng` with `SEED_DEMO_PASSWORD`, change the password, and enable two-factor authentication. Seeding never overwrites existing accounts, so changing the variable later does not change existing passwords.
6. **Cron.** Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically. Add a `crons` entry in `vercel.json` for `/api/cron`; the Hobby plan only allows daily runs, so on Hobby use an external scheduler for the 10-minute cadence.

## Pre-launch checklist

- [ ] `PAYMENT_PROVIDER=paystack`, live key, webhook verified with a real ₦100 transaction
- [ ] SMTP sending verified (password reset email arrives)
- [ ] All super admins and finance officers have 2FA enabled
- [ ] Demo data not loaded (`SEED_DEMO=false`) or removed
- [ ] Real facility address, hours, rate cards, equipment register and membership prices entered
- [ ] Policies reviewed by counsel; privacy policy reflects NDPA 2023
- [ ] Photography uploaded to all image slots; statistics set to Live or Verified
- [ ] Cron running; backups running and restore tested
