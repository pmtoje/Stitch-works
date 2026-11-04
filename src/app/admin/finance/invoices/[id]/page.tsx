import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { DL, Field, Input, PageHeader, Panel, Select, StatusBadge, Table, Td } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { fmtDateTime, humanize, naira } from "@/lib/format";
import { outstanding } from "@/lib/payments/invoices";
import { manualPaymentAction, refundAction, voidInvoiceAction } from "../../../actions";

export default async function AdminInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requirePermission("finance.view");
  const inv = await db.invoice.findUnique({ where: { id }, include: { user: true, payments: { orderBy: { createdAt: "asc" } }, refunds: true, booking: true, bulkOrder: true, membership: { include: { plan: true } } } });
  if (!inv) notFound();
  const record = can(u.actor, "finance.record");
  const recorders = await db.user.findMany({ where: { id: { in: [...inv.payments.map((p) => p.recordedById), ...inv.refunds.map((r) => r.recordedById)].filter(Boolean) as string[] } }, select: { id: true, fullName: true } });
  return (
    <>
      <PageHeader eyebrow="Invoice" title={inv.number} description={inv.description} actions={<StatusBadge status={inv.status} className="text-sm" />} />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Panel title="Summary">
            <DL items={[["Customer", `${inv.user.fullName} · ${inv.user.email}`], ["Purpose", humanize(inv.purpose)], ["Amount", naira(inv.amount)], ["Paid", naira(inv.amountPaid)], ["Refunded", naira(inv.amountRefunded)], ["Outstanding", naira(outstanding(inv))], ["Linked", inv.booking ? <Link key="b" className="link" href={`/admin/bookings/${inv.booking.id}`}>Booking {inv.booking.reference} ({humanize(inv.booking.status)})</Link> : inv.bulkOrder ? <Link key="o" className="link" href={`/admin/production/orders/${inv.bulkOrder.id}`}>Order {inv.bulkOrder.reference}</Link> : inv.membership ? `Membership: ${inv.membership.plan.name}` : "—"]]} />
          </Panel>
          <Panel title="Payment attempts">
            <Table head={["Date", "Reference", "Provider", "Method", "Amount", "Status", "Recorded by"]} empty="No payment attempts.">
              {inv.payments.map((p) => <tr key={p.id}><Td>{fmtDateTime(p.createdAt)}</Td><Td className="font-mono text-xs">{p.reference}</Td><Td>{p.provider}</Td><Td>{p.method ?? "—"}</Td><Td>{naira(p.amount)}</Td><Td><StatusBadge status={p.status} /></Td><Td>{recorders.find((r) => r.id === p.recordedById)?.fullName ?? (p.verifiedAt ? "Gateway verified" : "—")}</Td></tr>)}
            </Table>
          </Panel>
          <Panel title="Refunds">
            <Table head={["Date", "Amount", "Method", "Reason", "By"]} empty="No refunds.">{inv.refunds.map((r) => <tr key={r.id}><Td>{fmtDateTime(r.createdAt)}</Td><Td>{naira(r.amount)}</Td><Td>{r.method}</Td><Td>{r.reason}</Td><Td>{recorders.find((x) => x.id === r.recordedById)?.fullName}</Td></tr>)}</Table>
          </Panel>
        </div>
        {record ? (
          <div className="space-y-6">
            {outstanding(inv) > 0 && inv.status !== "VOID" ? (
              <Panel title="Record offline payment">
                <ActionForm action={manualPaymentAction} className="space-y-3" confirm="Record this payment? Financial records cannot be edited afterwards.">
                  <input type="hidden" name="invoiceId" value={inv.id} />
                  <Field label="Amount (₦)"><Input name="amount" defaultValue={outstanding(inv)} required /></Field>
                  <Field label="Method"><Select name="method"><option>cash</option><option>bank_transfer</option><option>pos</option><option>cheque</option></Select></Field>
                  <Field label="Note / bank reference"><Input name="note" /></Field>
                  <SubmitButton>Record payment</SubmitButton>
                </ActionForm>
              </Panel>
            ) : null}
            {inv.amountPaid - inv.amountRefunded > 0 ? (
              <Panel title="Record refund">
                <ActionForm action={refundAction} className="space-y-3" confirm="Record this refund?">
                  <input type="hidden" name="invoiceId" value={inv.id} />
                  <Field label={`Amount (max ${naira(inv.amountPaid - inv.amountRefunded)})`}><Input name="amount" required /></Field>
                  <Field label="Method"><Select name="method"><option>bank_transfer</option><option>gateway_refund</option><option>cash</option></Select></Field>
                  <Field label="Reason"><Input name="reason" required /></Field>
                  <SubmitButton variant="secondary">Record refund</SubmitButton>
                </ActionForm>
              </Panel>
            ) : null}
            {inv.amountPaid === 0 && inv.status !== "VOID" ? (
              <Panel title="Void invoice"><ActionForm action={voidInvoiceAction} className="space-y-3" confirm="Void this invoice?"><input type="hidden" name="invoiceId" value={inv.id} /><Field label="Reason"><Input name="reason" required /></Field><SubmitButton variant="danger" size="sm">Void</SubmitButton></ActionForm></Panel>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
