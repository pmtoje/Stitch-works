import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { DL, Field, PageHeader, Panel, StatusBadge, Table, Td, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { fmtDateTime, fmtTime, fmtDate, humanize, naira } from "@/lib/format";
import { adminCancelBookingAction, bookingProgressAction, decideBookingAction } from "../../actions";

export default async function AdminBooking({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requirePermission("booking.manage");
  const b = await db.booking.findUnique({ where: { id }, include: { customer: true, facility: true, invoices: { include: { payments: true } }, items: { include: { equipment: true, workstation: true }, orderBy: { startsAt: "asc" } } } });
  if (!b || !can(u.actor, "booking.manage", b.facilityId)) notFound();
  const logs = await db.auditLog.findMany({ where: { entityType: "Booking", entityId: b.id }, orderBy: { createdAt: "asc" }, include: { actor: true } });
  return (
    <>
      <PageHeader eyebrow={`Booking ${b.reference}`} title={b.customer.fullName} description={`${b.facility.name} · ${fmtDateTime(b.startsAt)} → ${fmtDateTime(b.endsAt)}`} actions={<StatusBadge status={b.status} className="text-sm" />} />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel title="Items">
            <Table head={["Item", "Date", "Time", "Line total"]}>
              {b.items.map((i) => <tr key={i.id}><Td>{i.equipment?.name ?? i.workstation?.name}<div className="font-mono text-xs text-stone-500">{i.equipment?.assetTag ?? i.workstation?.code}</div></Td><Td>{fmtDate(i.startsAt)}</Td><Td>{fmtTime(i.startsAt)}–{fmtTime(i.endsAt)}</Td><Td>{naira(i.lineTotal)}</Td></tr>)}
            </Table>
          </Panel>
          <Panel title="History">
            <ul className="space-y-2 text-sm">{logs.map((l) => <li key={l.id}><span className="text-stone-500">{fmtDateTime(l.createdAt)}</span> · {l.action} · {l.actor?.fullName ?? "system"}</li>)}</ul>
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Summary">
            <DL items={[["Customer", <><span key="n">{b.customer.fullName}</span><br key="b" /><span key="e" className="text-xs text-stone-500">{b.customer.email} · {b.customer.phone ?? "no phone"}</span></>], ["Type", humanize(b.durationType)], ["Subtotal", naira(b.subtotal)], ["Discount", naira(b.discount)], ["Security deposit", naira(b.securityDeposit)], ["Total", naira(b.total)], ["Due upfront", naira(b.amountDueNow)], ["Paid", naira(b.invoices.reduce((s, i) => s + i.amountPaid, 0))], ["Invoice", b.invoices.map((i) => <Link key={i.id} className="link font-mono" href={`/admin/finance/invoices/${i.id}`}>{i.number}</Link>)], ["Customer note", b.notes], ["Cancel reason", b.cancelReason]]} />
          </Panel>
          {b.status === "PENDING_APPROVAL" ? (
            <Panel title="Decision">
              <ActionForm action={decideBookingAction} className="space-y-3">
                <input type="hidden" name="bookingId" value={b.id} />
                <Field label="Note to customer (optional)"><Textarea name="note" rows={2} /></Field>
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="decision" value="APPROVE">Approve · request payment</SubmitButton>
                  <SubmitButton name="decision" value="APPROVE_PAY_ON_ARRIVAL" variant="secondary">Approve · pay on arrival</SubmitButton>
                  <SubmitButton name="decision" value="REJECT" variant="danger">Reject</SubmitButton>
                </div>
              </ActionForm>
            </Panel>
          ) : null}
          {["CONFIRMED", "CHECKED_IN"].includes(b.status) ? (
            <Panel title="On the day">
              <ActionForm action={bookingProgressAction} className="flex gap-2">
                <input type="hidden" name="bookingId" value={b.id} />
                {b.status === "CONFIRMED" ? <SubmitButton name="status" value="CHECKED_IN">Check in</SubmitButton> : null}
                <SubmitButton name="status" value="COMPLETED" variant="secondary">Mark completed</SubmitButton>
              </ActionForm>
              <p className="mt-3 text-xs text-stone-500">Record equipment damage from the machine’s page in the equipment register (with this booking reference).</p>
            </Panel>
          ) : null}
          {["PENDING_PAYMENT", "PENDING_APPROVAL", "CONFIRMED", "CHECKED_IN"].includes(b.status) ? (
            <Panel title="Cancel">
              <ActionForm action={adminCancelBookingAction} className="space-y-3" confirm="Cancel this booking? Any amount paid will be flagged to finance for refund.">
                <input type="hidden" name="bookingId" value={b.id} />
                <Field label="Reason"><Textarea name="reason" rows={2} required /></Field>
                <SubmitButton variant="danger">Cancel booking</SubmitButton>
              </ActionForm>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}
