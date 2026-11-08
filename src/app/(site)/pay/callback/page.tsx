import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPayment } from "@/lib/payments/service";
import { kickDispatch } from "@/lib/notifications";
import { Alert, LinkButton } from "@/components/ui";
import { publicMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";

// The browser is redirected here after checkout. We never trust the redirect itself:
// the payment is verified with the gateway on the server before anything is recorded.
export default async function PaymentCallback({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const reference = sp.reference ?? sp.trxref ?? "";
  let status: string;
  let invoiceId: string | null = null;
  try {
    const r = await verifyPayment(reference);
    status = r.status;
    invoiceId = r.payment.invoiceId;
    kickDispatch();
  } catch (e) {
    return <div className="container max-w-xl py-24"><Alert tone="error">{publicMessage(e)}</Alert></div>;
  }
  if (invoiceId && status === "SUCCEEDED") {
    const inv = await db.invoice.findUnique({ where: { id: invoiceId } });
    if (inv?.bookingId) redirect(`/dashboard/bookings/${inv.bookingId}`);
    redirect(`/dashboard/invoices/${invoiceId}?paid=1`);
  }
  if (invoiceId && status === "FAILED") redirect(`/dashboard/invoices/${invoiceId}?failed=1`);
  return (
    <div className="container max-w-xl py-24">
      <h1 className="text-3xl">Confirming your payment…</h1>
      <p className="mt-3 text-charcoal-600">Your bank hasn’t confirmed the payment yet. This page will update once it does — you can also check your invoice in a few minutes. You will not be charged twice.</p>
      <div className="mt-6 flex gap-3"><LinkButton href={`/pay/callback?reference=${encodeURIComponent(reference)}`}>Check again</LinkButton>{invoiceId ? <LinkButton variant="secondary" href={`/dashboard/invoices/${invoiceId}`}>View invoice</LinkButton> : null}</div>
    </div>
  );
}
