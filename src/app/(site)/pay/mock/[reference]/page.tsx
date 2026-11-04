import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Alert, Button } from "@/components/ui";
import { naira } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Test-mode checkout. Only reachable when PAYMENT_PROVIDER=mock. */
export default async function MockCheckout({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const u = await requireUser();
  const payment = await db.payment.findUnique({ where: { reference }, include: { invoice: true } });
  if (!payment || payment.provider !== "mock" || payment.userId !== u.id) notFound();
  async function decide(fd: FormData) {
    "use server";
    const outcome = fd.get("outcome") === "success" ? "success" : "failed";
    const me = await requireUser();
    const p = await db.payment.findUnique({ where: { reference } });
    if (!p || p.userId !== me.id || p.provider !== "mock") return;
    await db.mockGatewaySession.update({ where: { reference }, data: { outcome } });
    redirect(`/pay/callback?reference=${encodeURIComponent(reference)}`);
  }
  return (
    <div className="container max-w-lg py-20">
      <div className="border border-charcoal-900/10 bg-white p-8">
        <p className="eyebrow">Test-mode checkout</p>
        <h1 className="mt-2 text-3xl">{naira(payment.amount)}</h1>
        <p className="mt-1 text-sm text-stone-600">{payment.invoice.description}</p>
        <p className="mt-1 font-mono text-xs text-stone-500">{reference}</p>
        <div className="mt-6"><Alert tone="warn">No real money moves in test mode. Configure Paystack keys to accept live payments.</Alert></div>
        <form action={decide} className="mt-6 flex gap-3">
          <Button name="outcome" value="success">Simulate successful payment</Button>
          <Button name="outcome" value="failed" variant="secondary">Simulate failure</Button>
        </form>
      </div>
    </div>
  );
}
