# Admin onboarding guide

Management works in **/admin**. The left navigation only shows what your role can do.

| Role | Main areas |
|---|---|
| Super administrator | Everything, incl. users & roles, website content, audit log |
| Facility manager | Bookings, calendar, equipment, maintenance, facilities & pricing, materials, memberships, tailor applications (optionally limited to specific facilities) |
| Production manager | Bulk orders, quotations, jobs & allocations, earnings approval, tailor applications, teams |
| QC officer | Quality control inspections |
| Finance officer | Finance overview, invoices, offline payments, refunds, earnings payouts |
| Academy administrator | Courses, sessions, admissions, certificates |
| Instructor | Teaching: own sessions’ attendance, assignments, grading, assessments |

## First-day setup (super admin)

1. **Secure your account** — My dashboard → Profile & security → set up two-factor authentication.
2. **Users & roles** — ask each staff member to register, then Admin → Users & roles → grant roles. Scope facility managers to their facility.
3. **Facility** — Facilities & pricing → set address, operating hours, booking rules (approval required?, payment hold, free-cancellation window, upfront deposit %, max days).
4. **Rate cards** — enter hourly / half-day / full-day / multi-day rates and any security deposit for each equipment category. Categories without a rate card can’t be booked.
5. **Workstations & equipment** — add workstations; add every machine in the Equipment register with a unique asset tag. Only machines that actually exist should be listed. Set per-machine rate overrides where needed.
6. **Maintenance schedules** — on each machine page, add preventive tasks (e.g. “Oil & clean every 14 days”).
7. **Membership plans** — Memberships → edit plans, fees, validity, discount %, production-job eligibility.
8. **Academy** — Courses & sessions → create/edit courses, register instructors, create sessions with capacity and deadlines, publish.
9. **Website content** — Website content → hero text, contact details (incl. WhatsApp), upload photography for every image slot, set statistics to *Live* or enter *Verified* figures, add genuine testimonials, FAQs, policies, blog posts.

## Daily operations

**Bookings** — the approval queue (Bookings → Approval queue) if your facility requires approval. Approve (customer pays online), approve “pay on arrival” (invoice stays outstanding), or reject. On the day: *Check in* / *Mark completed*. Walk-ins: *Book for a customer*.
**Availability calendar** — day view of every resource: reserved, pending holds, maintenance.
**Downtime / damage** — on the machine page, *Block availability* (customers with overlapping bookings are notified) and record service/repair/damage with cost and downtime. Setting status to *Under maintenance* or *Out of service* immediately stops new bookings.

**Bulk production**
1. New enquiry → open it, review files → prepare a quotation (garment lines, cost breakdown, logistics, tax, deposit %, timeline, terms) → *Send to customer*.
2. Customer accepts online → deposit invoice issued. When paid (online or recorded by finance) the order becomes **Order confirmed**, a production job is opened and a balance invoice is created.
3. Update stages as work progresses (customer is notified unless marked internal). Completion requires the balance to be paid.
4. Jobs & allocations → allocate quantities to tailors, teams or external partners at a piece rate, or publish to the Production Marketplace and accept tailor applications.
5. Tailors submit completed pieces → QC officer records inspected/accepted/rework/rejected + defects → an earning is created for accepted pieces only.
6. Production manager approves earnings → finance pays and records the transfer reference.

**Tailor applications** — Submitted → Under review → Shortlisted → Assessment scheduled (date/time) → Approved (creates the tailor profile with ID, TAILOR role and facility) → Onboarding → Active. Add internal comments; rejections can include feedback.

**Academy** — Admissions: review (application fee must be paid) → Accept (tuition invoice issued; student auto-registered on payment) or Registered (scholarship/offline). Teaching: add classes, take attendance, publish assignments, grade, record assessments. Academy admin: *Complete* the programme, then *Issue certificate* (all assessments must be passed). Certificates can be revoked; verification is public at /verify.

**Finance** — only verified or finance-recorded payments count. Record cash/POS/transfer payments on the invoice page; record refunds (never more than paid). Payments cannot be edited once succeeded. Pending payments are reconciled with Paystack automatically.

**Reports** — Reports & exports: 14 reports with date, facility, status, customer/tailor and machine-category filters; download CSV or Excel. Exports are logged.

**Audit log** — every important action, append-only.
