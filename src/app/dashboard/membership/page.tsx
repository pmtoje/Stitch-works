import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Alert, PageHeader, Panel, StatusBadge, Table, Td } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { fmtDate, naira } from "@/lib/format";
import { applyMembershipAction } from "../actions";

export default async function MyMembership() {
  const u = await requireUser();
  const [memberships, plans] = await Promise.all([
    db.membership.findMany({ where: { userId: u.id }, include: { plan: true, invoices: true }, orderBy: { createdAt: "desc" } }),
    db.membershipPlan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const active = memberships.find((m) => m.status === "ACTIVE" && m.expiresAt && m.expiresAt > new Date());
  return (
    <>
      <PageHeader title="Membership" description="Member rates, priority access and production job eligibility." />
      {active ? <div className="mb-6"><Alert tone="success"><strong>{active.plan.name}</strong> membership active until {fmtDate(active.expiresAt)} · {active.plan.bookingDiscountPct}% off bookings{active.plan.productionEligible ? " · eligible for production jobs" : ""}.</Alert></div> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => (
          <div key={p.id} className="flex flex-col border border-charcoal-900/10 bg-white p-5">
            <p className="eyebrow">{p.audience.toLowerCase()}</p>
            <h2 className="mt-2 text-2xl">{p.name}</h2>
            <p className="mt-1 font-display text-3xl text-forest-700">{naira(p.fee)}<span className="font-sans text-sm text-stone-500"> / {p.validityDays} days</span></p>
            <ul className="mt-4 flex-1 space-y-1.5 text-sm text-charcoal-700">{p.benefits.map((b) => <li key={b}>— {b}</li>)}</ul>
            <ActionForm action={applyMembershipAction} className="mt-5">
              <input type="hidden" name="planId" value={p.id} />
              <SubmitButton variant={active?.planId === p.id ? "secondary" : "primary"} className="w-full">{active?.planId === p.id ? "Renew" : "Choose plan"}</SubmitButton>
            </ActionForm>
          </div>
        ))}
      </div>
      <Panel title="History" className="mt-8">
        <Table head={["Plan", "Status", "Started", "Expires", "Invoice"]} empty="No memberships yet.">
          {memberships.map((m) => (
            <tr key={m.id}>
              <Td>{m.plan.name}</Td>
              <Td><StatusBadge status={m.status} /></Td>
              <Td>{fmtDate(m.startsAt)}</Td>
              <Td>{fmtDate(m.expiresAt)}</Td>
              <Td>{m.invoices.map((i) => <Link key={i.id} href={`/dashboard/invoices/${i.id}`} className="link font-mono text-xs">{i.number}</Link>)}</Td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
