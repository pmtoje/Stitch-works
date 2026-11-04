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

## Pre-launch checklist

- [ ] `PAYMENT_PROVIDER=paystack`, live key, webhook verified with a real ₦100 transaction
- [ ] SMTP sending verified (password reset email arrives)
- [ ] All super admins and finance officers have 2FA enabled
- [ ] Demo data not loaded (`SEED_DEMO=false`) or removed
- [ ] Real facility address, hours, rate cards, equipment register and membership prices entered
- [ ] Policies reviewed by counsel; privacy policy reflects NDPA 2023
- [ ] Photography uploaded to all image slots; statistics set to Live or Verified
- [ ] Cron running; backups running and restore tested
