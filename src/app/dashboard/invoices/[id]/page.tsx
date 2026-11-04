import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { Alert, StatusBadge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Logo } from "@/components/site/logo";
import { fmtDate, fmtDateTime, humanize, naira } from "@/lib/format";
import { outstanding } from "@/lib/payments/invoices";
import { PrintButton } from "@/components/ui/print-button";
import { payInvoiceAction } from "../../actions";

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const u = await requireUser();
  const inv = await db.invoice.findUnique({ where: { id }, include: { user: true, payments: { orderBy: { createdAt: "asc" } }, refunds: true, booking: true } });
  if (!inv || (inv.userId !== u.id && !can(u.actor, "finance.view"))) notFound();
  const due = inv.booking?.status === "PENDING_PAYMENT" ? Math.max(inv.booking.amountDueNow - inv.amountPaid, 0) : outstanding(inv);
  const payable = inv.userId === u.id && due > 0 && !["VOID", "REFUNDED"].includes(inv.status) && !(inv.booking && ["PENDING_APPROVAL", "EXPIRED", "CANCELLED", "REJECTED"].includes(inv.booking.status));
  const succeeded = inv.payments.filter((p) => p.status === "SUCCEEDED");
  return (
    <div className="mx-auto max-w-3xl">
      {sp.paid ? <div className="no-print mb-4"><Alert tone="success">Payment verified — thank you. Your receipt is below.</Alert></div> : null}
      {sp.failed ? <div className="no-print mb-4"><Alert tone="error">The payment was not completed. No money was recorded. You can try again.</Alert></div> : null}
      <article className="border border-charcoal-900/10 bg-white p-6 md:p-10">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-charcoal-900/10 pb-6">
          <Logo />
          <div className="text-right">
            <p className="eyebrow">{inv.status === "PAID" ? "Receipt" : "Invoice"}</p>
            <p className="mt-1 font-mono text-lg">{inv.number}</p>
            <p className="text-sm text-stone-500">Issued {fmtDate(inv.createdAt)}{inv.dueDate ? ` · Due ${fmtDate(inv.dueDate)}` : ""}</p>
            <div className="mt-2"><StatusBadge status={inv.status} /></div>
          </div>
        </header>
        <div className="grid gap-6 py-6 sm:grid-cols-2">
          <div><p className="text-xs uppercase tracking-wider text-stone-500">Billed to</p><p className="mt-1 font-medium">{inv.user.fullName}</p><p className="text-sm text-stone-600">{inv.user.email}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-stone-500">For</p><p className="mt-1">{inv.description}</p><p className="text-sm text-stone-600">{humanize(inv.purpose)}</p></div>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-charcoal-900/10 border-y border-charcoal-900/10">
            <tr><td className="py-3">Invoice amount</td><td className="py-3 text-right tabular-nums">{naira(inv.amount)}</td></tr>
            {succeeded.map((p) => <tr key={p.id}><td className="py-3 text-stone-600">Payment {p.reference} · {fmtDateTime(p.verifiedAt ?? p.createdAt)} · {p.method ?? p.provider}</td><td className="py-3 text-right tabular-nums">−{naira(p.amount)}</td></tr>)}
            {inv.refunds.map((r) => <tr key={r.id}><td className="py-3 text-stone-600">Refund · {fmtDate(r.createdAt)} · {r.method}</td><td className="py-3 text-right tabular-nums">{naira(r.amount)}</td></tr>)}
            <tr className="font-semibold"><td className="py-3">Balance outstanding</td><td className="py-3 text-right tabular-nums">{naira(outstanding(inv))}</td></tr>
          </tbody>
        </table>
        <p className="mt-6 text-xs text-stone-500">StitchWorks Collective · Jos, Plateau State, Nigeria. Payments are verified electronically with our payment provider.</p>
      </article>
      <div className="no-print mt-6 flex flex-wrap items-center gap-3">
        {payable ? (
          <ActionForm action={payInvoiceAction}>
            <input type="hidden" name="invoiceId" value={inv.id} />
            <SubmitButton size="lg" pendingText="Opening secure checkout…">Pay {naira(due)} securely</SubmitButton>
          </ActionForm>
        ) : null}
        <PrintButton />
      </div>
    </div>
  );
}
