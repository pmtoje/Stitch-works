import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getOrderForViewer } from "@/lib/production/orders";
import { DL, Field, PageHeader, Panel, StatusBadge, Table, Td, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ProductionTimeline } from "@/components/production/timeline";
import { fmtDate, humanize, naira } from "@/lib/format";
import { outstanding } from "@/lib/payments/invoices";
import { payInvoiceAction, respondQuotationAction } from "../../actions";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser();
  const o = await getOrderForViewer(u.actor, id);
  if (!o || o.customerId !== u.id) notFound();
  const quote = o.quotations.find((q) => q.status === "SENT" || q.status === "ACCEPTED");
  return (
    <>
      <PageHeader eyebrow={`Production order ${o.reference}`} title={o.orgName} description={`${o.items.reduce((s, i) => s + i.quantity, 0).toLocaleString()} units · submitted ${fmtDate(o.createdAt)}`} actions={<StatusBadge status={o.status} className="text-sm" />} />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {quote ? (
            <Panel title={`Quotation ${quote.reference}`} actions={<StatusBadge status={quote.status} />}>
              <Table head={["Garment", "Qty", "Unit price", "Total"]}>
                {quote.lines.map((l) => <tr key={l.id}><Td>{l.garmentType}</Td><Td>{l.quantity.toLocaleString()}</Td><Td>{naira(l.unitPrice)}</Td><Td>{naira(l.lineTotal)}</Td></tr>)}
              </Table>
              <div className="mt-5 grid gap-6 md:grid-cols-2">
                <DL items={[["Materials (incl.)", naira(quote.materialCost)], ["Labour (incl.)", naira(quote.labourCost)], ["Branding & finishing (incl.)", naira(quote.brandingCost)], ["Logistics", naira(quote.logisticsCost)], [`Tax (${quote.taxPercent}%)`, naira(quote.taxAmount)], ["Total", <strong key="t">{naira(quote.total)}</strong>]]} />
                <DL items={[["Timeline", `${quote.timelineDays} days from deposit`], ["Deposit", `${quote.depositPercent}% · ${naira(Math.round((quote.total * quote.depositPercent) / 100))}`], ["Payment terms", quote.paymentTerms], ["Valid until", fmtDate(quote.validUntil)]]} />
              </div>
              {quote.notes ? <p className="mt-4 text-sm text-charcoal-600">{quote.notes}</p> : null}
              {quote.status === "SENT" ? (
                <ActionForm action={respondQuotationAction} className="mt-6 space-y-3 border-t border-charcoal-900/10 pt-5">
                  <input type="hidden" name="quotationId" value={quote.id} />
                  <Field label="Comments (optional)"><Textarea name="note" rows={2} placeholder="e.g. please adjust the delivery date" /></Field>
                  <div className="flex flex-wrap gap-3">
                    <SubmitButton name="decision" value="accept">Accept quotation</SubmitButton>
                    <SubmitButton name="decision" value="decline" variant="secondary">Decline / request changes</SubmitButton>
                  </div>
                </ActionForm>
              ) : null}
            </Panel>
          ) : (
            <Panel title="Quotation"><p className="text-sm text-charcoal-600">Our production team is reviewing your request. You’ll be notified as soon as your quotation is ready.</p></Panel>
          )}
          {o.invoices.length ? (
            <Panel title="Invoices">
              <Table head={["Invoice", "For", "Amount", "Outstanding", "", ""]}>
                {o.invoices.map((i) => (
                  <tr key={i.id}>
                    <Td><Link className="font-mono text-forest-700" href={`/dashboard/invoices/${i.id}`}>{i.number}</Link></Td>
                    <Td>{humanize(i.purpose)}</Td>
                    <Td>{naira(i.amount)}</Td>
                    <Td>{naira(outstanding(i))}</Td>
                    <Td><StatusBadge status={i.status} /></Td>
                    <Td>{outstanding(i) > 0 && i.status !== "VOID" ? <ActionForm action={payInvoiceAction}><input type="hidden" name="invoiceId" value={i.id} /><SubmitButton size="sm">Pay</SubmitButton></ActionForm> : null}</Td>
                  </tr>
                ))}
              </Table>
            </Panel>
          ) : null}
          <Panel title="Your request">
            <DL items={[["Garments", o.items.map((i) => `${i.quantity.toLocaleString()} × ${i.garmentType}`).join(", ")], ["Description", o.description], ["Designs", o.designsCount], ["Sizes", o.sizes], ["Fabric", `${o.fabricRequirements ?? "—"} (${humanize(o.fabricSource)})`], ["Colours", o.colours], ["Branding", [o.branding, o.embroidery && `Embroidery: ${o.embroidery}`, o.printing && `Printing: ${o.printing}`].filter(Boolean).join(" · ") || "—"], ["Required by", fmtDate(o.requiredBy)], ["Deliver to", o.deliveryLocation], ["Budget", o.budget ? naira(o.budget) : "—"], ["Files", o.attachments.length ? o.attachments.map((a) => <a key={a.id} href={`/api/files/${a.id}`} className="link mr-3 text-sm" target="_blank">{a.originalName}</a>) : "—"]]} />
          </Panel>
        </div>
        <Panel title="Progress"><ProductionTimeline status={o.status} history={o.statusHistory} /></Panel>
      </div>
    </>
  );
}
