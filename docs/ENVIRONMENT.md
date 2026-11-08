# Environment variables

See `.env.example` for a template.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL 14+ connection string. The `btree_gist` extension must be allowed (it is on Supabase, Neon, RDS). |
| `APP_URL` | ✅ (optional on Vercel) | Public base URL. Used for payment callbacks, email links, sitemap, metadata. Auto-detected on Vercel. |
| `APP_ENCRYPTION_KEY` | ✅ | ≥32 chars. Encrypts TOTP secrets. Rotating it invalidates existing 2FA enrolments. |
| `CRON_SECRET` | ✅ | Bearer token protecting `/api/cron`. |
| `STORAGE_DIR` | — | Directory for uploads (default `./storage`). Must be persistent and backed up. |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_ACCESS` | — | Vercel Blob storage for uploads (token set automatically when a Blob store is connected; access `private` by default). |
| `PAYMENT_PROVIDER` | ✅ | `paystack` in production. `mock` = built-in test mode. |
| `PAYSTACK_SECRET_KEY` | ✅ prod | Paystack secret key; also verifies webhook signatures. |
| `ALLOW_MOCK_PAYMENTS` | — | `true` to allow test mode when `NODE_ENV=production` (staging only). |
| `SMTP_HOST/PORT/SECURE/USER/PASS`, `EMAIL_FROM` | ✅ prod | Transactional email. Without it, emails are logged as SKIPPED in Admin → Notification log. |
| `TERMII_API_KEY`, `TERMII_SENDER_ID` | — | SMS notifications. |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE` | — | WhatsApp Business Cloud API (template messages). |
| `NEXT_PUBLIC_GA_ID` | — | Google Analytics 4 measurement ID. |
| `GOOGLE_SITE_VERIFICATION` | — | Search Console HTML-tag verification token. |
| `SEED_DEMO`, `SEED_ADMIN_EMAIL`, `SEED_DEMO_PASSWORD` | — | Seeding behaviour. |

# External integrations & credentials needed before launch

| # | Integration | What to obtain | Where it goes |
|---|---|---|---|
| 1 | **PostgreSQL** (Supabase recommended) | Production database + daily backups / PITR | `DATABASE_URL` |
| 2 | **Paystack** | Business account (CAC docs), live secret key; set webhook URL `https://<domain>/api/payments/webhook/paystack` and callback `https://<domain>/pay/callback` | `PAYSTACK_SECRET_KEY`, `PAYMENT_PROVIDER=paystack` |
| 3 | **Email provider** (Postmark, SES, Zoho, Google Workspace SMTP…) | SMTP credentials, SPF/DKIM/DMARC on the sending domain | `SMTP_*`, `EMAIL_FROM` |
| 4 | **Termii** (optional) | API key and approved sender ID | `TERMII_*` |
| 5 | **WhatsApp Business Platform** (optional) | Meta business verification, phone number ID, permanent token, an approved template with one body variable | `WHATSAPP_*` |
| 6 | **Domain + TLS** | DNS for the site and email | hosting |
| 7 | **Persistent file storage** | Vercel Blob (built in), or a persistent disk volume | `BLOB_READ_WRITE_TOKEN` or `STORAGE_DIR` |
| 8 | **Scheduler** | Something that calls `/api/cron` every 10 minutes | `CRON_SECRET` |
| 9 | **Google Analytics / Search Console** (optional) | GA4 ID, verification token; submit `/sitemap.xml` | `NEXT_PUBLIC_GA_ID`, `GOOGLE_SITE_VERIFICATION` |
| 10 | **Business content** | Real photography, verified statistics, contact details, prices, policies (legal review), facility address | Admin → Website content / Facilities |

Flutterwave can be added by implementing the `PaymentProvider` interface in `src/lib/payments/provider.ts` (initialize, verify, verifyWebhookSignature).
