import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { hasRole, isStaff } from "@/lib/auth/rbac";
import { Alert, LinkButton, PageHeader, Panel, StatTile, StatusBadge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { fmtDateTime, naira } from "@/lib/format";
import { activeMembership } from "@/lib/memberships";
import { resendVerificationAction } from "./actions";

export default async function DashboardHome({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const now = new Date();
  const [upcoming, orders, invoices, membership, tailor, apps, notes] = await Promise.all([
    db.booking.findMany({ where: { customerId: u.id, endsAt: { gt: now }, status: { in: ["CONFIRMED", "PENDING_PAYMENT", "PENDING_APPROVAL", "CHECKED_IN"] } }, orderBy: { startsAt: "asc" }, take: 5, include: { facility: true, _count: { select: { items: true } } } }),
    db.bulkOrder.findMany({ where: { customerId: u.id, status: { notIn: ["COMPLETED", "CANCELLED", "DECLINED"] } }, orderBy: { updatedAt: "desc" }, take: 5 }),
    db.invoice.findMany({ where: { userId: u.id, status: { in: ["ISSUED", "PARTIALLY_PAID"] } } }),
    activeMembership(u.id),
    db.tailor.findUnique({ where: { userId: u.id }, include: { earnings: true, allocations: { where: { status: { in: ["ASSIGNED", "IN_PROGRESS", "SUBMITTED"] } } } } }),
    db.studentApplication.findMany({ where: { userId: u.id }, include: { session: { include: { course: true } } }, orderBy: { createdAt: "desc" }, take: 3 }),
    db.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const owed = invoices.reduce((s, i) => s + i.amount - i.amountPaid, 0);
  return (
    <>
      <PageHeader eyebrow="My StitchWorks" title={`Welcome, ${u.fullName.split(" ")[0]}.`} description="Everything you do with StitchWorks — bookings, production, membership, tailoring work and training — in one place." actions={<><LinkButton href="/book">Book a workspace</LinkButton><LinkButton href="/bulk-production#request" variant="secondary">New production request</LinkButton></>} />
      <div className="space-y-4">
        {sp.denied ? <Alert tone="error">You don’t have access to that area.</Alert> : null}
        {sp.welcome ? <Alert tone="success">Your account is ready. We’ve sent a link to verify your email address.</Alert> : null}
        {!u.emailVerifiedAt ? (
          <Alert tone="warn">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Please verify your email address so we can send booking and payment confirmations.</span>
              <ActionForm action={resendVerificationAction}><SubmitButton size="sm" variant="secondary">Resend link</SubmitButton></ActionForm>
            </div>
          </Alert>
        ) : null}
        {isStaff(u.actor) ? <Alert tone="info">You have management access. <Link href="/admin" className="link">Open the management console →</Link></Alert> : null}
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Upcoming bookings" value={upcoming.length} href="/dashboard/bookings" />
        <StatTile label="Active production orders" value={orders.length} href="/dashboard/orders" />
        <StatTile label="Outstanding balance" value={naira(owed)} sub={`${invoices.length} open invoice(s)`} href="/dashboard/invoices" />
        <StatTile label="Membership" value={membership ? membership.plan.name : "None"} sub={membership ? `Until ${fmtDateTime(membership.expiresAt).slice(0, 11)}` : "View plans"} href="/dashboard/membership" />
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Panel title="Upcoming bookings" actions={<Link href="/dashboard/bookings" className="text-sm text-forest-700">All bookings →</Link>}>
          {upcoming.length ? (
            <ul className="divide-y divide-charcoal-900/5">
              {upcoming.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <Link href={`/dashboard/bookings/${b.id}`} className="min-w-0">
                    <p className="font-mono text-xs text-stone-500">{b.reference}</p>
                    <p className="truncate font-medium">{fmtDateTime(b.startsAt)} · {b.facility.name}</p>
                  </Link>
                  <StatusBadge status={b.status} />
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-stone-500">No upcoming bookings. <Link href="/book" className="link">Reserve equipment</Link></p>}
        </Panel>
        <Panel title="Production orders" actions={<Link href="/dashboard/orders" className="text-sm text-forest-700">Track orders →</Link>}>
          {orders.length ? (
            <ul className="divide-y divide-charcoal-900/5">
              {orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-3">
                  <Link href={`/dashboard/orders/${o.id}`}><p className="font-mono text-xs text-stone-500">{o.reference}</p><p className="font-medium">{o.orgName}</p></Link>
                  <StatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-stone-500">No active production orders.</p>}
        </Panel>
        {tailor || hasRole(u.actor, "TAILOR") ? (
          <Panel title={`Tailor · ${tailor?.code ?? ""}`} actions={<Link href="/dashboard/tailor/jobs" className="text-sm text-forest-700">Jobs →</Link>}>
            <div className="grid grid-cols-3 gap-3">
              <StatTile label="Active allocations" value={tailor?.allocations.length ?? 0} />
              <StatTile label="Awaiting approval" value={naira(tailor?.earnings.filter((e) => e.status === "PENDING_APPROVAL").reduce((s, e) => s + e.amount, 0) ?? 0)} />
              <StatTile label="Approved, unpaid" value={naira(tailor?.earnings.filter((e) => e.status === "APPROVED").reduce((s, e) => s + e.amount, 0) ?? 0)} />
            </div>
          </Panel>
        ) : null}
        {apps.length ? (
          <Panel title="Academy" actions={<Link href="/dashboard/academy" className="text-sm text-forest-700">Student portal →</Link>}>
            <ul className="divide-y divide-charcoal-900/5">
              {apps.map((a) => <li key={a.id} className="flex items-center justify-between py-3"><span>{a.session.course.title}</span><StatusBadge status={a.status} /></li>)}
            </ul>
          </Panel>
        ) : null}
        <Panel title="Recent notifications" actions={<Link href="/dashboard/notifications" className="text-sm text-forest-700">All →</Link>}>
          {notes.length ? <ul className="space-y-3">{notes.map((n) => <li key={n.id}><p className="text-sm font-medium">{n.title}</p><p className="text-xs text-stone-500">{fmtDateTime(n.createdAt)}</p></li>)}</ul> : <p className="text-sm text-stone-500">Nothing yet.</p>}
        </Panel>
      </div>
    </>
  );
}
