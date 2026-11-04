import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { allowedManualTransitions, getOrderForViewer } from "@/lib/production/orders";
import { db } from "@/lib/db";
import { Checkbox, DL, Field, Input, PageHeader, Panel, Select, StatusBadge, Table, Td, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ProductionTimeline } from "@/components/production/timeline";
import { fmtDate, fmtDateTime, humanize, naira } from "@/lib/format";
import { outstanding } from "@/lib/payments/invoices";
import { orderStatusAction, quotationAction, sendQuotationAction } from "../../../actions";
import { QuoteLines } from "./quote-lines";

export default async function AdminOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requirePermission("production.view");
  const o = await getOrderForViewer(u.actor, id);
  if (!o) notFound();
  const manage = can(u.actor, "production.manage");
  const transitions = allowedManualTransitions(o.status);
  const canQuote = ["ENQUIRY_RECEIVED", "UNDER_REVIEW", "QUOTATION_PREPARED", "AWAITING_CUSTOMER_APPROVAL"].includes(o.status);
  const materials = await db.materialMovement.findMany({ where: { orderId: o.id }, include: { item: true } });
  const materialCost = materials.reduce((s, m) => s + Math.round(-m.delta * m.item.unitCost), 0);
  return (
    <>
      <PageHeader eyebrow={`Production order ${o.reference}`} title={o.orgName} description={`${o.contactName} · ${o.email} · ${o.phone}`} actions={<StatusBadge status={o.status} className="text-sm" />} />
      <div className="grid gap-6 2xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Panel title="Request">
            <DL items={[["Garments", o.items.map((i) => `${i.quantity.toLocaleString()} × ${i.garmentType}`).join(" · ")], ["Description", o.description], ["Designs", o.designsCount], ["Sizes", o.sizes], ["Fabric", `${o.fabricRequirements ?? "—"} · ${humanize(o.fabricSource)}`], ["Colours", o.colours], ["Branding / embroidery / printing", [o.branding, o.embroidery, o.printing].filter(Boolean).join(" · ") || "—"], ["Required by", fmtDate(o.requiredBy)], ["Delivery", o.deliveryLocation], ["Budget", o.budget ? naira(o.budget) : "—"], ["Instructions", o.instructions], ["Address", o.address], ["Files", o.attachments.length ? o.attachments.map((a) => <a key={a.id} className="link mr-3" target="_blank" href={`/api/files/${a.id}`}>{a.originalName}</a>) : "—"]]} />
          </Panel>
          <Panel title="Quotations">
            {o.quotations.length ? (
              <div className="mb-6 space-y-4">
                {o.quotations.map((q) => (
                  <div key={q.id} className="border border-charcoal-900/10 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mono text-sm">{q.reference}</p><StatusBadge status={q.status} /></div>
                    <p className="mt-2 text-sm">{q.lines.map((l) => `${l.quantity} × ${l.garmentType} @ ${naira(l.unitPrice)}`).join(" · ")}</p>
                    <p className="mt-1 text-sm">Total <strong>{naira(q.total)}</strong> · deposit {q.depositPercent}% · {q.timelineDays} days · valid to {fmtDate(q.validUntil)} · costs: materials {naira(q.materialCost)}, labour {naira(q.labourCost)}, branding {naira(q.brandingCost)}, logistics {naira(q.logisticsCost)}, tax {naira(q.taxAmount)}</p>
                    {q.responseNote ? <p className="mt-1 text-sm text-charcoal-600">Customer: {q.responseNote}</p> : null}
                    {q.status === "DRAFT" && manage ? <ActionForm action={sendQuotationAction} className="mt-3"><input type="hidden" name="quotationId" value={q.id} /><input type="hidden" name="orderId" value={o.id} /><SubmitButton size="sm">Send to customer</SubmitButton></ActionForm> : null}
                  </div>
                ))}
              </div>
            ) : null}
            {manage && canQuote ? (
              <ActionForm action={quotationAction} className="space-y-4">
                <input type="hidden" name="orderId" value={o.id} />
                <p className="text-sm font-semibold">Prepare {o.quotations.length ? "a revised" : "a"} quotation</p>
                <QuoteLines initial={o.items.map((i) => ({ garmentType: i.garmentType, quantity: i.quantity }))} />
                <p className="text-xs text-stone-500">Cost breakdown (included in unit prices, shown to the customer for transparency):</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Field label="Materials ₦"><Input name="materialCost" defaultValue={0} /></Field>
                  <Field label="Labour ₦"><Input name="labourCost" defaultValue={0} /></Field>
                  <Field label="Branding/finishing ₦"><Input name="brandingCost" defaultValue={0} /></Field>
                  <Field label="Logistics ₦ (added)"><Input name="logisticsCost" defaultValue={0} /></Field>
                  <Field label="Tax % (added)"><Input name="taxPercent" defaultValue={0} /></Field>
                  <Field label="Deposit %"><Input name="depositPercent" defaultValue={50} /></Field>
                  <Field label="Timeline (days)"><Input name="timelineDays" defaultValue={21} /></Field>
                  <Field label="Valid for (days)"><Input name="validDays" defaultValue={14} /></Field>
                </div>
                <Field label="Payment terms"><Input name="paymentTerms" defaultValue="Deposit on acceptance; balance due on dispatch." /></Field>
                <Field label="Notes to customer"><Textarea name="notes" rows={2} /></Field>
                <SubmitButton>Save draft quotation</SubmitButton>
              </ActionForm>
            ) : null}
          </Panel>
          <Panel title="Invoices">
            <Table head={["Invoice", "Purpose", "Amount", "Outstanding", "Status"]} empty="No invoices yet — created when the customer accepts a quotation.">
              {o.invoices.map((i) => <tr key={i.id}><Td><Link className="font-mono text-forest-700" href={`/admin/finance/invoices/${i.id}`}>{i.number}</Link></Td><Td>{humanize(i.purpose)}</Td><Td>{naira(i.amount)}</Td><Td>{naira(outstanding(i))}</Td><Td><StatusBadge status={i.status} /></Td></tr>)}
            </Table>
          </Panel>
          {o.job ? <Panel title="Production job"><p className="text-sm">Job <Link className="link font-mono" href={`/admin/production/jobs/${o.job.id}`}>{o.job.reference}</Link> · {o.job.totalQuantity} units · {humanize(o.job.status)}. Materials consumed: {naira(materialCost)}.</p></Panel> : null}
        </div>
        <div className="space-y-6">
          {manage && transitions.length ? (
            <Panel title="Update stage">
              <ActionForm action={orderStatusAction} className="space-y-3">
                <input type="hidden" name="orderId" value={o.id} />
                <Field label="Move to"><Select name="to">{transitions.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select></Field>
                <Field label="Note"><Textarea name="note" rows={2} /></Field>
                <Checkbox name="internal" label="Internal only (don’t notify customer)" />
                <SubmitButton>Update</SubmitButton>
              </ActionForm>
            </Panel>
          ) : null}
          <Panel title="Timeline"><ProductionTimeline status={o.status} history={o.statusHistory} /></Panel>
          <Panel title="Status log"><ul className="space-y-1 text-xs">{o.statusHistory.map((h) => <li key={h.id}>{fmtDateTime(h.createdAt)} · {humanize(h.to)}{h.customerVisible ? "" : " (internal)"}{h.note ? ` — ${h.note}` : ""}</li>)}</ul></Panel>
        </div>
      </div>
    </>
  );
}
