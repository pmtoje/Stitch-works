import type { Payment } from "@prisma/client";
import { db, type Tx } from "../db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { friendlyCode } from "../crypto";
import { activeProvider, providerByName, type VerifyResult } from "./provider";
import { outstanding } from "./invoices";
import { audit } from "../audit";
import { notify } from "../notifications";
import { can, type Actor } from "../auth/rbac";
import { naira } from "../format";
import { onBookingPaid } from "../booking/service";
import { onMembershipPaid } from "../memberships";
import { onAcademyInvoicePaid } from "../academy/service";
import { onProductionInvoicePaid } from "../production/orders";

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

/** Amount the customer should pay now for this invoice. */
async function payableNow(tx: Tx | typeof db, invoiceId: string) {
  const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { booking: true } });
  if (!inv) throw new NotFoundError("Invoice not found.");
  let due = outstanding(inv);
  // For a booking awaiting payment, only the policy deposit is required up-front.
  if (inv.booking && inv.booking.status === "PENDING_PAYMENT") due = Math.max(inv.booking.amountDueNow - inv.amountPaid, 0);
  return { inv, due };
}

/** Starts an online payment for an invoice owned by the actor. */
export async function initiatePayment(actor: Actor, invoiceId: string) {
  const { inv, due } = await payableNow(db, invoiceId);
  if (inv.userId !== actor.userId) throw new NotFoundError("Invoice not found.");
  if (inv.status === "VOID" || inv.status === "REFUNDED") throw new AppError("This invoice is no longer payable.");
  if (inv.booking && ["EXPIRED", "CANCELLED", "REJECTED"].includes(inv.booking.status)) throw new AppError("This booking is no longer active. Please make a new booking.");
  if (inv.booking && inv.booking.status === "PENDING_APPROVAL") throw new AppError("This booking is awaiting approval. You will be able to pay once it is approved.");
  if (due <= 0) throw new AppError("This invoice has already been paid.");

  const provider = activeProvider();
  // Duplicate-payment prevention: reuse a recent pending attempt instead of opening another.
  const recent = await db.payment.findFirst({
    where: { invoiceId, status: "PENDING", provider: provider.name, amount: due, createdAt: { gt: new Date(Date.now() - 30 * 60_000) } },
    orderBy: { createdAt: "desc" },
  });
  if (recent && (recent.rawResponse as { authorizationUrl?: string } | null)?.authorizationUrl) {
    return { reference: recent.reference, authorizationUrl: (recent.rawResponse as { authorizationUrl: string }).authorizationUrl };
  }
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId } });
  const reference = `SWP-${Date.now().toString(36).toUpperCase()}-${friendlyCode(6)}`;
  const payment = await db.payment.create({ data: { reference, invoiceId, userId: actor.userId, provider: provider.name, amount: due } });
  const init = await provider.initialize({
    reference,
    amount: due,
    email: user.email,
    callbackUrl: `${appUrl()}/pay/callback`,
    metadata: { invoice: inv.number, purpose: inv.purpose },
  });
  await db.payment.update({ where: { id: payment.id }, data: { providerRef: init.providerRef, rawResponse: { authorizationUrl: init.authorizationUrl } } });
  await audit({ actorId: actor.userId, action: "payment.initiate", entityType: "Payment", entityId: payment.id, data: { reference, amount: due, invoice: inv.number } });
  return { reference, authorizationUrl: init.authorizationUrl };
}

/**
 * Applies a verified gateway result to a payment. Idempotent: safe to call from
 * both the browser callback and the webhook, any number of times.
 */
export async function applyVerification(reference: string, result: VerifyResult) {
  return db.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Payment[]>`SELECT * FROM "Payment" WHERE reference = ${reference} FOR UPDATE`;
    if (!locked) throw new NotFoundError("Payment not found.");
    if (locked.status === "SUCCEEDED") return { status: "SUCCEEDED" as const, alreadyApplied: true };

    if (result.status === "pending") return { status: "PENDING" as const, alreadyApplied: false };
    if (result.status !== "success") {
      await tx.payment.update({ where: { id: locked.id }, data: { status: result.status === "abandoned" ? "ABANDONED" : "FAILED", rawResponse: result.raw as never } });
      await audit({ action: "payment.failed", entityType: "Payment", entityId: locked.id, data: { reference, status: result.status } }, tx);
      await notify({ userId: locked.userId, kind: "payment.failed", title: "Payment not completed", body: `Your payment ${reference} was not successful. No money has been recorded against your invoice. You can try again from your dashboard.`, link: "/dashboard/invoices", channels: ["EMAIL"] }, tx);
      return { status: "FAILED" as const, alreadyApplied: false };
    }
    // Never trust amounts from the browser: the gateway-reported amount must match.
    if (result.currency !== "NGN" || result.amount !== locked.amount) {
      await tx.payment.update({ where: { id: locked.id }, data: { status: "FAILED", rawResponse: { mismatch: true, gateway: result.raw } as never } });
      await audit({ action: "payment.amount_mismatch", entityType: "Payment", entityId: locked.id, data: { expected: locked.amount, got: result.amount, currency: result.currency } }, tx);
      return { status: "FAILED" as const, alreadyApplied: false, mismatch: true };
    }
    await tx.payment.update({ where: { id: locked.id }, data: { status: "SUCCEEDED", verifiedAt: new Date(), method: result.channel, providerRef: result.providerRef ?? locked.providerRef, rawResponse: result.raw as never } });
    await creditInvoice(tx, locked.invoiceId, locked.amount, locked.userId, reference);
    await audit({ action: "payment.succeeded", entityType: "Payment", entityId: locked.id, data: { reference, amount: locked.amount } }, tx);
    return { status: "SUCCEEDED" as const, alreadyApplied: false };
  });
}

async function creditInvoice(tx: Tx, invoiceId: string, amount: number, userId: string, reference: string) {
  await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const amountPaid = inv.amountPaid + amount;
  const status = amountPaid >= inv.amount ? "PAID" : "PARTIALLY_PAID";
  await tx.invoice.update({ where: { id: invoiceId }, data: { amountPaid, status } });
  await notify({ userId, kind: "payment.received", title: `Payment received — ${naira(amount)}`, body: `Thank you. We have received ${naira(amount)} for invoice ${inv.number} (ref ${reference}).${amountPaid > inv.amount ? " This exceeds the invoice amount; our finance team will contact you about the difference." : ""}`, link: `/dashboard/invoices/${invoiceId}`, channels: ["EMAIL"] }, tx);
  if (inv.bookingId) await onBookingPaid(tx, inv.bookingId);
  if (inv.membershipId) await onMembershipPaid(tx, inv.membershipId);
  if (inv.enrolmentId || inv.studentApplicationId) await onAcademyInvoicePaid(tx, inv.id);
  if (inv.bulkOrderId) await onProductionInvoicePaid(tx, inv.id);
}

/** Server-side verification (browser callback). */
export async function verifyPayment(reference: string) {
  const payment = await db.payment.findUnique({ where: { reference } });
  if (!payment) throw new NotFoundError("Payment not found.");
  if (payment.status === "SUCCEEDED") return { status: "SUCCEEDED" as const, payment };
  const provider = providerByName(payment.provider);
  if (!provider) throw new AppError("Unknown payment provider.");
  const result = await provider.verify(reference);
  const r = await applyVerification(reference, result);
  return { status: r.status, payment };
}

/** Webhook entry point: signature-checked, de-duplicated, re-verified with the gateway. */
export async function handleWebhook(providerName: string, rawBody: string, signature: string | null) {
  const provider = providerByName(providerName);
  if (!provider || !provider.verifyWebhookSignature(rawBody, signature)) return { ok: false, status: 401 };
  let event: { event?: string; data?: { reference?: string; id?: number | string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400 };
  }
  const reference = event.data?.reference;
  const eventId = `${event.event}:${event.data?.id ?? reference}`;
  try {
    await db.webhookEvent.create({ data: { provider: providerName, eventId, type: event.event ?? "unknown", payload: event as never } });
  } catch {
    return { ok: true, status: 200, duplicate: true }; // already processed
  }
  if (event.event === "charge.success" && reference) {
    const exists = await db.payment.findUnique({ where: { reference } });
    if (exists) {
      const result = await provider.verify(reference);
      await applyVerification(reference, result);
    }
  }
  await db.webhookEvent.update({ where: { provider_eventId: { provider: providerName, eventId } }, data: { processedAt: new Date() } });
  return { ok: true, status: 200 };
}

/** Finance records an offline payment (cash, POS, bank transfer) against an invoice. */
export async function recordManualPayment(actor: Actor, invoiceId: string, input: { amount: number; method: string; note?: string }) {
  if (!can(actor, "finance.record")) throw new ForbiddenError();
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new AppError("Enter a valid amount.");
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundError();
    if (inv.status === "VOID") throw new AppError("Cannot record a payment on a void invoice.");
    const reference = `MAN-${Date.now().toString(36).toUpperCase()}-${friendlyCode(4)}`;
    const p = await tx.payment.create({
      data: { reference, invoiceId, userId: inv.userId, provider: "manual", method: input.method, amount: input.amount, status: "SUCCEEDED", verifiedAt: new Date(), recordedById: actor.userId, rawResponse: { note: input.note ?? null } },
    });
    await creditInvoice(tx, invoiceId, input.amount, inv.userId, reference);
    await audit({ actorId: actor.userId, action: "payment.manual_record", entityType: "Payment", entityId: p.id, data: { invoice: inv.number, amount: input.amount, method: input.method, note: input.note } }, tx);
    return p;
  });
}

export async function recordRefund(actor: Actor, invoiceId: string, input: { amount: number; method: string; reason: string }) {
  if (!can(actor, "finance.record")) throw new ForbiddenError();
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
    const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundError();
    if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > inv.amountPaid - inv.amountRefunded) throw new AppError(`Refund must be between ₦1 and ${naira(inv.amountPaid - inv.amountRefunded)}.`);
    const refund = await tx.refund.create({ data: { invoiceId, amount: input.amount, method: input.method, reason: input.reason, recordedById: actor.userId } });
    const amountRefunded = inv.amountRefunded + input.amount;
    await tx.invoice.update({ where: { id: invoiceId }, data: { amountRefunded, status: amountRefunded >= inv.amountPaid ? "REFUNDED" : inv.status } });
    await audit({ actorId: actor.userId, action: "refund.record", entityType: "Invoice", entityId: invoiceId, data: input }, tx);
    await notify({ userId: inv.userId, kind: "refund.recorded", title: `Refund of ${naira(input.amount)} processed`, body: `A refund for invoice ${inv.number} has been processed via ${input.method}.`, link: `/dashboard/invoices/${invoiceId}`, channels: ["EMAIL"] }, tx);
    return refund;
  });
}

/** Reconciliation helper: re-verifies stale pending payments with the gateway. */
export async function reconcilePending(olderThanMinutes = 10) {
  const pending = await db.payment.findMany({ where: { status: "PENDING", provider: { not: "manual" }, createdAt: { lt: new Date(Date.now() - olderThanMinutes * 60_000) } }, take: 100 });
  let updated = 0;
  for (const p of pending) {
    const provider = providerByName(p.provider);
    if (!provider) continue;
    const r = await provider.verify(p.reference).catch(() => null);
    if (!r) continue;
    if (r.status === "pending" && p.createdAt < new Date(Date.now() - 24 * 3_600_000)) {
      await db.payment.update({ where: { id: p.id }, data: { status: "ABANDONED" } });
      updated++;
    } else if (r.status !== "pending") {
      await applyVerification(p.reference, r).catch(() => null);
      updated++;
    }
  }
  return updated;
}
