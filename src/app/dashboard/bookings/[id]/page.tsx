import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { Alert, DL, Field, Input, PageHeader, Panel, Select, StatusBadge, Table, Td, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { fmtDate, fmtDateTime, fmtTime, humanize, naira } from "@/lib/format";
import { utcToLocal } from "@/lib/time";
import { cancelBookingAction, payInvoiceAction, rescheduleBookingAction } from "../../actions";

export default async function BookingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const u = await requireUser();
  const b = await db.booking.findUnique({ where: { id }, include: { facility: true, invoices: { include: { payments: true } }, items: { include: { equipment: { include: { category: true } }, workstation: true }, orderBy: { startsAt: "asc" } } } });
  if (!b || (b.customerId !== u.id && !can(u.actor, "booking.manage", b.facilityId))) notFound();
  const inv = b.invoices[0];
  const paid = b.invoices.reduce((s, i) => s + i.amountPaid, 0);
  const now = new Date();
  const cancellable = ["PENDING_PAYMENT", "PENDING_APPROVAL", "CONFIRMED"].includes(b.status) && b.startsAt > now;
  const reschedulable = ["CONFIRMED", "PENDING_APPROVAL"].includes(b.status) && b.startsAt.getTime() - now.getTime() > b.facility.cancellationHours * 3_600_000;
  const resources = new Map<string, (typeof b.items)[number]>();
  for (const it of b.items) resources.set(it.equipmentId ?? it.workstationId!, it);
  const spans = [...new Map(b.items.map((i) => [i.startsAt.toISOString(), i])).values()];
  const start = utcToLocal(b.startsAt);
  return (
    <>
      <PageHeader eyebrow={`Booking ${b.reference}`} title={`${fmtDate(b.startsAt, { weekday: "long", day: "numeric", month: "long" })}`} description={`${b.facility.name} · ${humanize(b.durationType)}${b.days > 1 ? ` · ${b.days} days` : ""}`} actions={<StatusBadge status={b.status} className="text-sm" />} />
      <div className="mb-6 space-y-3">
        {sp.new && b.status === "PENDING_PAYMENT" ? <Alert tone="success">Your items are reserved. Complete payment by {fmtTime(b.holdExpiresAt!)} to confirm the booking.</Alert> : null}
        {sp.new && b.status === "PENDING_APPROVAL" ? <Alert tone="success">Booking request sent. The facility manager will review it and you’ll be notified.</Alert> : null}
        {sp.new && b.status === "CONFIRMED" ? <Alert tone="success">Booking confirmed.</Alert> : null}
        {b.status === "PENDING_PAYMENT" && b.holdExpiresAt ? <Alert tone="warn">Held until {fmtDateTime(b.holdExpiresAt)}. If payment isn’t completed by then the items are released.</Alert> : null}
        {b.status === "EXPIRED" ? <Alert tone="error">This reservation expired because payment wasn’t completed in time. <Link href="/book" className="link">Book again</Link></Alert> : null}
        {b.adminNote ? <Alert tone="info">Note from the facility: {b.adminNote}</Alert> : null}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel title="Reserved items">
            <Table head={["Item", "Category", "Price"]}>
              {[...resources.values()].map((it) => (
                <tr key={it.id}>
                  <Td>{it.equipment?.name ?? it.workstation?.name}<div className="font-mono text-xs text-stone-500">{it.equipment?.assetTag ?? it.workstation?.code}</div></Td>
                  <Td>{it.equipment?.category.name ?? "Workstation"}</Td>
                  <Td className="tabular-nums">{naira(b.items.filter((x) => (x.equipmentId ?? x.workstationId) === (it.equipmentId ?? it.workstationId)).reduce((s, x) => s + x.lineTotal, 0))}</Td>
                </tr>
              ))}
            </Table>
            <ul className="mt-4 flex flex-wrap gap-2 text-xs">
              {spans.map((s) => <li key={s.id} className="border border-charcoal-900/10 bg-cream-50 px-2 py-1 font-mono">{fmtDate(s.startsAt)} · {fmtTime(s.startsAt)}–{fmtTime(s.endsAt)}</li>)}
            </ul>
            {b.notes ? <p className="mt-4 text-sm text-charcoal-600">Your note: {b.notes}</p> : null}
          </Panel>
          {cancellable || reschedulable ? (
            <div className="grid gap-6 md:grid-cols-2">
              {reschedulable ? (
                <Panel title="Reschedule">
                  <ActionForm action={rescheduleBookingAction} className="space-y-3">
                    <input type="hidden" name="bookingId" value={b.id} />
                    <Field label="New date"><Input type="date" name="date" defaultValue={start.date} required /></Field>
                    {b.durationType === "HOURLY" ? (
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Start"><Input type="time" step={1800} name="startTime" defaultValue={start.time} required /></Field>
                        <Field label="End"><Input type="time" step={1800} name="endTime" defaultValue={utcToLocal(b.endsAt).time} required /></Field>
                      </div>
                    ) : null}
                    {b.durationType === "HALF_DAY" ? <Field label="Session"><Select name="halfDaySlot" defaultValue={Number(start.time.slice(0, 2)) < 12 ? "AM" : "PM"}><option value="AM">Morning</option><option value="PM">Afternoon</option></Select></Field> : null}
                    <p className="text-xs text-stone-500">Same items and length; availability is re-checked.</p>
                    <SubmitButton variant="secondary">Reschedule</SubmitButton>
                  </ActionForm>
                </Panel>
              ) : null}
              {cancellable ? (
                <Panel title="Cancel booking">
                  <ActionForm action={cancelBookingAction} className="space-y-3" confirm="Cancel this booking?">
                    <input type="hidden" name="bookingId" value={b.id} />
                    <p className="text-sm text-charcoal-600">{b.startsAt.getTime() - now.getTime() >= b.facility.cancellationHours * 3_600_000 ? "You’re within the free cancellation window — any payment will be refunded in full." : `Less than ${b.facility.cancellationHours} hours to go: only the security deposit is refundable.`}</p>
                    <Field label="Reason (optional)"><Textarea name="reason" rows={2} /></Field>
                    <SubmitButton variant="danger">Cancel booking</SubmitButton>
                  </ActionForm>
                </Panel>
              ) : null}
            </div>
          ) : null}
        </div>
        <Panel title="Payment">
          <DL items={[["Subtotal", naira(b.subtotal)], ...(b.discount ? [["Member discount", `−${naira(b.discount)}`] as [string, string]] : []), ...(b.securityDeposit ? [["Security deposit (refundable)", naira(b.securityDeposit)] as [string, string]] : []), ["Total", <strong key="t">{naira(b.total)}</strong>], ["Paid", naira(paid)], ["Due now", naira(Math.max(b.status === "PENDING_PAYMENT" ? b.amountDueNow - paid : b.total - paid, 0))]]} />
          {inv ? <p className="mt-4 text-sm">Invoice <Link className="link font-mono" href={`/dashboard/invoices/${inv.id}`}>{inv.number}</Link> · <StatusBadge status={inv.status} /></p> : null}
          {b.status === "PENDING_PAYMENT" && inv && b.customerId === u.id ? (
            <ActionForm action={payInvoiceAction} className="mt-5">
              <input type="hidden" name="invoiceId" value={inv.id} />
              <SubmitButton size="lg" className="w-full" pendingText="Opening secure checkout…">Pay {naira(Math.max(b.amountDueNow - paid, 0))} securely</SubmitButton>
              <p className="mt-2 text-xs text-stone-500">Card, bank transfer or USSD via our licensed payment partner. We never see or store your card details.</p>
            </ActionForm>
          ) : null}
        </Panel>
      </div>
    </>
  );
}
