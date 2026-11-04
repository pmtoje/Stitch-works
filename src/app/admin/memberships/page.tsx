import type { MembershipStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { Checkbox, Field, Input, PageHeader, Panel, Select, StatusBadge, Table, Td, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { SearchBar } from "@/components/dash/search";
import { fmtDate, naira } from "@/lib/format";
import { membershipAction, membershipPlanAction } from "../actions";

export default async function MembershipsAdmin({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requirePermission("memberships.manage");
  const [plans, members] = await Promise.all([
    db.membershipPlan.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { memberships: { where: { status: "ACTIVE" } } } } } }),
    db.membership.findMany({ where: { ...(sp.status ? { status: sp.status as MembershipStatus } : {}), ...(sp.q ? { user: { OR: [{ fullName: { contains: sp.q, mode: "insensitive" } }, { email: { contains: sp.q, mode: "insensitive" } }] } } : {}) }, include: { user: true, plan: true }, orderBy: { updatedAt: "desc" }, take: 200 }),
  ]);
  return (
    <>
      <PageHeader title="Memberships" description="Plans, applications, renewals, suspensions and cancellations. Expiry and renewal reminders run automatically." />
      <SearchBar q={sp.q} status={sp.status} statuses={["PENDING_APPROVAL", "PENDING_PAYMENT", "ACTIVE", "EXPIRED", "SUSPENDED", "CANCELLED"]} placeholder="Member name or email" />
      <Table head={["Member", "Plan", "Status", "Started", "Expires", "Actions"]} empty="No memberships.">
        {members.map((m) => (
          <tr key={m.id}>
            <Td>{m.user.fullName}<div className="text-xs text-stone-500">{m.user.email}</div></Td><Td>{m.plan.name}</Td><Td><StatusBadge status={m.status} /></Td><Td>{fmtDate(m.startsAt)}</Td><Td>{fmtDate(m.expiresAt)}</Td>
            <Td>
              <ActionForm action={membershipAction} className="flex flex-wrap gap-1">
                <input type="hidden" name="membershipId" value={m.id} />
                {m.status === "PENDING_APPROVAL" ? <SubmitButton size="sm" name="op" value="APPROVE">Approve</SubmitButton> : null}
                {m.status === "ACTIVE" ? <SubmitButton size="sm" variant="secondary" name="op" value="SUSPEND">Suspend</SubmitButton> : null}
                {m.status === "SUSPENDED" ? <SubmitButton size="sm" variant="secondary" name="op" value="REINSTATE">Reinstate</SubmitButton> : null}
                {["PENDING_APPROVAL", "PENDING_PAYMENT", "ACTIVE", "SUSPENDED"].includes(m.status) ? <SubmitButton size="sm" variant="ghost" name="op" value="CANCEL">Cancel</SubmitButton> : null}
              </ActionForm>
            </Td>
          </tr>
        ))}
      </Table>
      <h2 className="mb-3 mt-10 font-sans text-lg font-semibold">Membership plans</h2>
      <div className="grid gap-4 xl:grid-cols-2">
        {[...plans, null].map((p) => (
          <Panel key={p?.id ?? "new"} title={p ? `${p.name} · ${p._count.memberships} active` : "New plan"}>
            <ActionForm action={membershipPlanAction} className="grid gap-3 sm:grid-cols-2">
              {p ? <input type="hidden" name="id" value={p.id} /> : null}
              <Field label="Name"><Input name="name" defaultValue={p?.name} required /></Field>
              <Field label="Audience"><Select name="audience" defaultValue={p?.audience ?? "TAILOR"}><option>TAILOR</option><option>BUSINESS</option><option>STUDENT</option></Select></Field>
              <Field label="Fee (₦)"><Input name="fee" defaultValue={p?.fee ?? ""} required /></Field>
              <Field label="Validity (days)"><Input name="validityDays" defaultValue={p?.validityDays ?? 30} required /></Field>
              <Field label="Booking discount %"><Input name="bookingDiscountPct" defaultValue={p?.bookingDiscountPct ?? 0} /></Field>
              <Field label="Sort order"><Input name="sortOrder" defaultValue={p?.sortOrder ?? 0} /></Field>
              <Field label="Description" className="sm:col-span-2"><Input name="description" defaultValue={p?.description} required /></Field>
              <Field label="Workspace access"><Input name="workspaceAccess" defaultValue={p?.workspaceAccess} required /></Field>
              <Field label="Machine access"><Input name="machineAccess" defaultValue={p?.machineAccess} required /></Field>
              <Field label="Benefits (one per line)" className="sm:col-span-2"><Textarea name="benefits" rows={3} defaultValue={p?.benefits.join("\n")} /></Field>
              <Field label="Renewal terms" className="sm:col-span-2"><Input name="renewalTerms" defaultValue={p?.renewalTerms ?? ""} /></Field>
              <Checkbox name="productionEligible" defaultChecked={p?.productionEligible} label="Eligible for production jobs" />
              <Checkbox name="active" defaultChecked={p?.active ?? true} label="Available for sign-up" />
              <div><SubmitButton size="sm">{p ? "Save plan" : "Create plan"}</SubmitButton>{p ? <span className="ml-3 text-sm text-stone-500">{naira(p.fee)}</span> : null}</div>
            </ActionForm>
          </Panel>
        ))}
      </div>
    </>
  );
}
