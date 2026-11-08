import { db } from "../db";
import { hmacHex, safeEqual } from "../crypto";
import { AppError } from "../errors";
import { appUrl } from "@/lib/app-url";

export type InitResult = { authorizationUrl: string; providerRef?: string };
export type VerifyResult = { status: "success" | "failed" | "pending" | "abandoned"; amount: number; currency: string; providerRef?: string; channel?: string; raw: unknown };

export interface PaymentProvider {
  name: string;
  initialize(p: { reference: string; amount: number; email: string; callbackUrl: string; metadata?: Record<string, unknown> }): Promise<InitResult>;
  verify(reference: string): Promise<VerifyResult>;
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean;
}


/** Paystack (https://paystack.com/docs/api). Amounts are sent in kobo. */
export const paystack: PaymentProvider = {
  name: "paystack",
  async initialize({ reference, amount, email, callbackUrl, metadata }) {
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reference, amount: amount * 100, email, currency: "NGN", callback_url: callbackUrl, metadata }),
    });
    const json = (await res.json()) as { status: boolean; message: string; data?: { authorization_url: string; access_code: string } };
    if (!res.ok || !json.status || !json.data) throw new Error(`Paystack initialize failed: ${json.message}`);
    return { authorizationUrl: json.data.authorization_url, providerRef: json.data.access_code };
  },
  async verify(reference) {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });
    const json = (await res.json()) as { status: boolean; data?: { status: string; amount: number; currency: string; id: number; channel: string } };
    if (!res.ok || !json.status || !json.data) return { status: "pending", amount: 0, currency: "NGN", raw: json };
    const s = json.data.status;
    return {
      status: s === "success" ? "success" : s === "failed" || s === "reversed" ? "failed" : s === "abandoned" ? "abandoned" : "pending",
      amount: Math.round(json.data.amount / 100),
      currency: json.data.currency,
      providerRef: String(json.data.id),
      channel: json.data.channel,
      raw: json.data,
    };
  },
  verifyWebhookSignature(rawBody, signature) {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret || !signature) return false;
    return safeEqual(hmacHex("sha512", secret, rawBody), signature);
  },
};

/**
 * Built-in test-mode gateway for development and automated tests. It never moves
 * money; the outcome is chosen on a simulator page and still verified server-side.
 */
export const mockProvider: PaymentProvider = {
  name: "mock",
  async initialize({ reference, amount }) {
    await db.mockGatewaySession.upsert({ where: { reference }, create: { reference, amount }, update: {} });
    return { authorizationUrl: `${appUrl()}/pay/mock/${encodeURIComponent(reference)}` };
  },
  async verify(reference) {
    const s = await db.mockGatewaySession.findUnique({ where: { reference } });
    if (!s || !s.outcome) return { status: "pending", amount: s?.amount ?? 0, currency: "NGN", raw: s };
    return { status: s.outcome === "success" ? "success" : "failed", amount: s.amount, currency: "NGN", providerRef: `MOCK-${reference}`, channel: "test", raw: s };
  },
  verifyWebhookSignature(rawBody, signature) {
    const secret = process.env.MOCK_WEBHOOK_SECRET ?? "mock-webhook-secret";
    return !!signature && safeEqual(hmacHex("sha512", secret, rawBody), signature);
  },
};

export function activeProvider(): PaymentProvider {
  const name = process.env.PAYMENT_PROVIDER ?? (process.env.PAYSTACK_SECRET_KEY ? "paystack" : "mock");
  if (name === "paystack") return paystack;
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_PAYMENTS !== "true") {
    throw new AppError("Online payments are not configured yet. Please contact StitchWorks to pay, or try again later.", "PAYMENTS_UNCONFIGURED", 503);
  }
  return mockProvider;
}

export function providerByName(name: string): PaymentProvider | null {
  return name === "paystack" ? paystack : name === "mock" ? mockProvider : null;
}
