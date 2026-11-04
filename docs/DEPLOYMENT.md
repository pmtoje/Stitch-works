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

1. **Environment variables** — Project → Settings → Environment Variables. Add at least `DATABASE_URL`, `APP_URL`, `APP_ENCRYPTION_KEY`, `CRON_SECRET` and `PAYMENT_PROVIDER` (plus Paystack/SMTP keys), ticking **Production** (and **Preview** if you use preview deployments). Variables only apply to new deployments: **redeploy** after adding them. Without `DATABASE_URL` every page fails with `Environment variable not found: DATABASE_URL`.
2. **Use a pooled connection string.** Serverless functions open many short connections. On Supabase use the *Transaction pooler* URL (port `6543`) with `?pgbouncer=true&connection_limit=1` appended as `DATABASE_URL`.
3. **Run migrations against the production database** from your own machine (with the *direct* connection string, port `5432`), once now and after each schema change:
   ```bash
   DATABASE_URL="<direct connection string>" npx prisma migrate deploy
   DATABASE_URL="<direct connection string>" SEED_DEMO=false SEED_DEMO_PASSWORD='<temp>' npm run db:seed
   ```
4. **Prisma client** — `npm install` runs `prisma generate` (`postinstall`), which Vercel's dependency cache requires.
5. **File uploads** — Vercel's filesystem is read-only and not persistent, so uploads to `STORAGE_DIR` will fail there. Move storage to Supabase Storage, S3 or Vercel Blob (`putObject`/`getObject` in `src/lib/uploads.ts`) before relying on uploads.
6. **Cron** — Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically. Add a `crons` entry in `vercel.json` for `/api/cron`; the Hobby plan only allows daily runs, so on Hobby use an external scheduler for the 10-minute cadence.

## Pre-launch checklist

- [ ] `PAYMENT_PROVIDER=paystack`, live key, webhook verified with a real ₦100 transaction
- [ ] SMTP sending verified (password reset email arrives)
- [ ] All super admins and finance officers have 2FA enabled
- [ ] Demo data not loaded (`SEED_DEMO=false`) or removed
- [ ] Real facility address, hours, rate cards, equipment register and membership prices entered
- [ ] Policies reviewed by counsel; privacy policy reflects NDPA 2023
- [ ] Photography uploaded to all image slots; statistics set to Live or Verified
- [ ] Cron running; backups running and restore tested
