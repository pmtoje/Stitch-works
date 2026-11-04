import { handleWebhook } from "@/lib/payments/service";

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const raw = await req.text();
  const sig = req.headers.get("x-paystack-signature") ?? req.headers.get("x-signature");
  try {
    const r = await handleWebhook(provider, raw, sig);
    return new Response(r.ok ? "ok" : "rejected", { status: r.status });
  } catch (e) {
    console.error("webhook error", e);
    return new Response("error", { status: 500 }); // gateway will retry
  }
}
