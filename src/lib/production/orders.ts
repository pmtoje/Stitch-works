import type { OrganisationType, ProductionStatus } from "@prisma/client";
import { db, type Tx } from "../db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { makeReference } from "../references";
import { createInvoice, outstanding } from "../payments/invoices";
import { audit } from "../audit";
import { notify, notifyStaff } from "../notifications";
import { can, type Actor } from "../auth/rbac";
import { naira, humanize } from "../format";

export const PRODUCTION_FLOW: ProductionStatus[] = [
  "ENQUIRY_RECEIVED",
  "UNDER_REVIEW",
  "QUOTATION_PREPARED",
  "AWAITING_CUSTOMER_APPROVAL",
  "AWAITING_DEPOSIT",
  "ORDER_CONFIRMED",
  "MATERIALS_SOURCING",
  "FABRIC_CUTTING",
  "PRODUCTION_IN_PROGRESS",
  "QUALITY_CONTROL",
  "FINISHING_PACKAGING",
  "READY_FOR_DISPATCH",
  "DISPATCHED",
  "DELIVERED",
  "COMPLETED",
];

/** Statuses a manager may move to manually (quotation/payment states are driven by workflow). */
const MANUAL_STAGES: ProductionStatus[] = PRODUCTION_FLOW.slice(PRODUCTION_FLOW.indexOf("ORDER_CONFIRMED"));

export function allowedManualTransitions(from: ProductionStatus): ProductionStatus[] {
  if (from === "ENQUIRY_RECEIVED") return ["UNDER_REVIEW", "CANCELLED"];
  if (["UNDER_REVIEW", "QUOTATION_PREPARED", "AWAITING_CUSTOMER_APPROVAL", "AWAITING_DEPOSIT"].includes(from)) return ["CANCELLED"];
  const i = MANUAL_STAGES.indexOf(from);
  if (i < 0) return [];
  const next = MANUAL_STAGES.slice(i + 1, i + 3); // forward one stage, or skip one (e.g. no sourcing needed)
  const back = i > 0 && from !== "COMPLETED" ? [MANUAL_STAGES[i - 1]] : []; // correction
  return from === "COMPLETED" ? [] : [...next, ...back, ...(PRODUCTION_FLOW.indexOf(from) < PRODUCTION_FLOW.indexOf("DISPATCHED") ? (["CANCELLED"] as ProductionStatus[]) : [])];
}

export type BulkOrderInput = {
  orgName: string;
  orgType: OrganisationType;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  items: { garmentType: string; quantity: number; notes?: string }[];
  description: string;
  designsCount: number;
  sizes: string;
  fabricRequirements?: string;
  colours?: string;
  branding?: string;
  embroidery?: string;
  printing?: string;
  requiredBy?: Date | null;
  deliveryLocation: string;
  instructions?: string;
  budget?: number | null;
  fabricSource: "CUSTOMER" | "STITCHWORKS" | "UNDECIDED";
  uploadIds?: string[];
};

async function setStatus(tx: Tx, orderId: string, from: ProductionStatus | null, to: ProductionStatus, actorId: string | null, note?: string, customerVisible = true) {
  await tx.bulkOrder.update({ where: { id: orderId }, data: { status: to } });
  await tx.orderStatusEvent.create({ data: { orderId, from, to, note: note ?? null, actorId, customerVisible } });
}

export async function submitBulkOrder(customerId: string, input: BulkOrderInput) {
  if (!input.items.length) throw new AppError("Add at least one garment type.");
  if (input.items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 1_000_000)) throw new AppError("Quantities must be whole numbers greater than zero.");
  return db.$transaction(async (tx) => {
    const reference = await makeReference("PO", tx);
    let organisationId: string | null = null;
    if (input.orgType !== "INDIVIDUAL") {
      const user = await tx.user.findUnique({ where: { id: customerId } });
      if (user?.organisationId) organisationId = user.organisationId;
      else {
        const org = await tx.organisation.create({ data: { name: input.orgName, type: input.orgType, address: input.address, phone: input.phone, email: input.email } });
        organisationId = org.id;
        await tx.user.update({ where: { id: customerId }, data: { organisationId: org.id } });
        const has = await tx.userRole.findFirst({ where: { userId: customerId, role: "CORPORATE_CLIENT" } });
        if (!has) await tx.userRole.create({ data: { userId: customerId, role: "CORPORATE_CLIENT" } });
      }
    }
    // Attachments must belong to the submitter.
    const uploads = input.uploadIds?.length ? await tx.upload.findMany({ where: { id: { in: input.uploadIds }, ownerId: customerId } }) : [];
    const { items, uploadIds: _u, ...rest } = input;
    const order = await tx.bulkOrder.create({
      data: {
        ...rest,
        reference,
        customerId,
        organisationId,
        items: { create: items.map((i) => ({ garmentType: i.garmentType, quantity: i.quantity, notes: i.notes ?? null })) },
        attachments: { connect: uploads.map((u) => ({ id: u.id })) },
        statusHistory: { create: { to: "ENQUIRY_RECEIVED", actorId: customerId, note: "Production request submitted" } },
      },
    });
    const qty = items.reduce((s, i) => s + i.quantity, 0);
    await audit({ actorId: customerId, action: "bulk_order.submit", entityType: "BulkOrder", entityId: order.id, data: { reference, qty } }, tx);
    await notify({ userId: customerId, kind: "bulk_order.received", title: `Production request ${reference} received`, body: `Thank you, ${input.contactName}. Our production team will review your request for ${qty.toLocaleString()} garments and prepare a quotation. Track progress any time with reference ${reference}.`, link: `/dashboard/orders/${order.id}` }, tx);
    await notifyStaff(["PRODUCTION_MANAGER"], { kind: "bulk_order.new", title: `New production enquiry ${reference}`, body: `${input.orgName}: ${qty.toLocaleString()} units (${items.map((i) => i.garmentType).join(", ")}).`, link: `/admin/production/orders/${order.id}` }, tx);
    return order;
  });
}

export async function updateOrderStatus(actor: Actor, orderId: string, to: ProductionStatus, note?: string, customerVisible = true) {
  if (!can(actor, "production.manage")) throw new ForbiddenError();
  return db.$transaction(async (tx) => {
    const order = await tx.bulkOrder.findUnique({ where: { id: orderId }, include: { invoices: true } });
    if (!order) throw new NotFoundError();
    if (!allowedManualTransitions(order.status).includes(to)) throw new AppError(`Cannot move an order from ${humanize(order.status)} to ${humanize(to)}.`);
    if (to === "COMPLETED") {
      const due = order.invoices.filter((i) => i.status !== "VOID").reduce((s, i) => s + outstanding(i), 0);
      if (due > 0) throw new AppError(`This order has an outstanding balance of ${naira(due)}. Record the payment before completing the order.`);
    }
    await setStatus(tx, orderId, order.status, to, actor.userId, note, customerVisible);
    await audit({ actorId: actor.userId, action: "bulk_order.status", entityType: "BulkOrder", entityId: orderId, data: { from: order.status, to, note } }, tx);
    if (customerVisible) {
      await notify({ userId: order.customerId, kind: "bulk_order.status", title: `${order.reference}: ${humanize(to)}`, body: `Your production order is now at the "${humanize(to)}" stage.${note ? `\n\n${note}` : ""}`, link: `/dashboard/orders/${orderId}`, channels: ["EMAIL", "WHATSAPP"] }, tx);
    }
    if (to === "DISPATCHED") {
      const balance = order.invoices.find((i) => i.purpose === "PRODUCTION_BALANCE" && outstanding(i) > 0);
      if (balance) await notify({ userId: order.customerId, kind: "invoice.due", title: `Balance due for ${order.reference}`, body: `Your order has been dispatched. The outstanding balance of ${naira(outstanding(balance))} is now due.`, link: `/dashboard/invoices/${balance.id}` }, tx);
    }
  });
}

export type QuotationInput = {
  lines: { garmentType: string; quantity: number; unitPrice: number }[];
  materialCost: number;
  labourCost: number;
  brandingCost: number;
  logisticsCost: number;
  taxPercent: number;
  depositPercent: number;
  timelineDays: number;
  paymentTerms: string;
  validDays: number;
  notes?: string;
};

/**
 * Totals: garment lines are the selling price of the garments; material, labour and branding are an
 * internal cost breakdown shown for transparency and checked against the line total. Logistics and tax
 * are added on top.
 */
export function computeQuotation(q: Pick<QuotationInput, "lines" | "logisticsCost" | "taxPercent">) {
  const lines = q.lines.map((l) => ({ ...l, lineTotal: Math.round(l.quantity * l.unitPrice) }));
  const garments = lines.reduce((s, l) => s + l.lineTotal, 0);
  const subtotal = garments + q.logisticsCost;
  const taxAmount = Math.round((subtotal * q.taxPercent) / 100);
  return { lines, subtotal, taxAmount, total: subtotal + taxAmount };
}

export async function createQuotation(actor: Actor, orderId: string, input: QuotationInput) {
  if (!can(actor, "production.manage")) throw new ForbiddenError();
  if (!input.lines.length) throw new AppError("Add at least one quotation line.");
  for (const n of [input.materialCost, input.labourCost, input.brandingCost, input.logisticsCost, ...input.lines.map((l) => l.unitPrice)]) {
    if (!Number.isFinite(n) || n < 0) throw new AppError("Costs must be zero or more.");
  }
  if (input.depositPercent < 0 || input.depositPercent > 100) throw new AppError("Deposit must be between 0% and 100%.");
  return db.$transaction(async (tx) => {
    const order = await tx.bulkOrder.findUnique({ where: { id: orderId }, include: { quotations: true } });
    if (!order) throw new NotFoundError();
    if (!["ENQUIRY_RECEIVED", "UNDER_REVIEW", "QUOTATION_PREPARED", "AWAITING_CUSTOMER_APPROVAL"].includes(order.status)) throw new AppError("Quotations can only be prepared before the order is accepted.");
    const totals = computeQuotation(input);
    const version = order.quotations.reduce((m, q) => Math.max(m, q.version), 0) + 1;
    await tx.quotation.updateMany({ where: { orderId, status: "DRAFT" }, data: { status: "SUPERSEDED" } });
    const q = await tx.quotation.create({
      data: {
        reference: `${order.reference.replace("PO", "QT")}-V${version}`,
        orderId,
        version,
        materialCost: input.materialCost,
        labourCost: input.labourCost,
        brandingCost: input.brandingCost,
        logisticsCost: input.logisticsCost,
        taxPercent: input.taxPercent,
        taxAmount: totals.taxAmount,
        subtotal: totals.subtotal,
        total: totals.total,
        depositPercent: input.depositPercent,
        timelineDays: input.timelineDays,
        paymentTerms: input.paymentTerms,
        validUntil: new Date(Date.now() + input.validDays * 86_400_000),
        notes: input.notes ?? null,
        preparedById: actor.userId,
        lines: { create: totals.lines },
      },
    });
    if (order.status === "ENQUIRY_RECEIVED" || order.status === "UNDER_REVIEW") await setStatus(tx, orderId, order.status, "QUOTATION_PREPARED", actor.userId, `Quotation ${q.reference} prepared`, false);
    await audit({ actorId: actor.userId, action: "quotation.create", entityType: "Quotation", entityId: q.id, data: { total: q.total, version } }, tx);
    return q;
  });
}

export async function sendQuotation(actor: Actor, quotationId: string) {
  if (!can(actor, "production.manage")) throw new ForbiddenError();
  return db.$transaction(async (tx) => {
    const q = await tx.quotation.findUnique({ where: { id: quotationId }, include: { order: true } });
    if (!q) throw new NotFoundError();
    if (q.status !== "DRAFT") throw new AppError("Only draft quotations can be sent.");
    await tx.quotation.updateMany({ where: { orderId: q.orderId, status: "SENT" }, data: { status: "SUPERSEDED" } });
    await tx.quotation.update({ where: { id: q.id }, data: { status: "SENT", sentAt: new Date() } });
    await setStatus(tx, q.orderId, q.order.status, "AWAITING_CUSTOMER_APPROVAL", actor.userId, `Quotation ${q.reference} sent`);
    await audit({ actorId: actor.userId, action: "quotation.send", entityType: "Quotation", entityId: q.id }, tx);
    await notify({ userId: q.order.customerId, kind: "quotation.sent", title: `Your quotation for ${q.order.reference}`, body: `We have prepared quotation ${q.reference} totalling ${naira(q.total)}, with an estimated production timeline of ${q.timelineDays} days. Review and respond from your dashboard.`, link: `/dashboard/orders/${q.orderId}`, channels: ["EMAIL", "WHATSAPP"] }, tx);
  });
}

/** Customer accepts or declines a sent quotation. */
export async function respondToQuotation(actor: Actor, quotationId: string, accept: boolean, note?: string) {
  return db.$transaction(async (tx) => {
    const q = await tx.quotation.findUnique({ where: { id: quotationId }, include: { order: true } });
    if (!q || q.order.customerId !== actor.userId) throw new NotFoundError("Quotation not found.");
    if (q.status !== "SENT") throw new AppError("This quotation is no longer awaiting a response.");
    if (q.validUntil < new Date()) {
      await tx.quotation.update({ where: { id: q.id }, data: { status: "EXPIRED" } });
      throw new AppError("This quotation has expired. Please contact us for an updated quotation.");
    }
    await tx.quotation.update({ where: { id: q.id }, data: { status: accept ? "ACCEPTED" : "DECLINED", respondedAt: new Date(), responseNote: note ?? null } });
    if (!accept) {
      await setStatus(tx, q.orderId, q.order.status, "UNDER_REVIEW", actor.userId, `Customer declined quotation ${q.reference}${note ? `: ${note}` : ""}`);
      await notifyStaff(["PRODUCTION_MANAGER"], { kind: "quotation.declined", title: `Quotation ${q.reference} declined`, body: note || "No reason given.", link: `/admin/production/orders/${q.orderId}` }, tx);
      await audit({ actorId: actor.userId, action: "quotation.decline", entityType: "Quotation", entityId: q.id, data: { note } }, tx);
      return { accepted: false };
    }
    const deposit = Math.round((q.total * q.depositPercent) / 100);
    if (deposit > 0) {
      await createInvoice(tx, { userId: q.order.customerId, purpose: "PRODUCTION_DEPOSIT", bulkOrderId: q.orderId, description: `${q.depositPercent}% deposit for ${q.order.reference} (quotation ${q.reference})`, amount: deposit, dueDate: new Date(Date.now() + 7 * 86_400_000) });
      await setStatus(tx, q.orderId, q.order.status, "AWAITING_DEPOSIT", actor.userId, `Quotation ${q.reference} accepted`);
    } else {
      await setStatus(tx, q.orderId, q.order.status, "AWAITING_DEPOSIT", actor.userId, `Quotation ${q.reference} accepted`);
      await confirmOrder(tx, q.orderId, actor.userId);
    }
    await audit({ actorId: actor.userId, action: "quotation.accept", entityType: "Quotation", entityId: q.id, data: { deposit } }, tx);
    await notifyStaff(["PRODUCTION_MANAGER", "FINANCE_OFFICER"], { kind: "quotation.accepted", title: `Quotation ${q.reference} accepted`, body: `Deposit due: ${naira(deposit)}.`, link: `/admin/production/orders/${q.orderId}` }, tx);
    return { accepted: true, deposit };
  });
}

/** Deposit received → order confirmed, production job opened, balance invoiced. */
async function confirmOrder(tx: Tx, orderId: string, actorId: string | null) {
  const order = await tx.bulkOrder.findUniqueOrThrow({ where: { id: orderId }, include: { quotations: true, items: true, invoices: true, job: true } });
  if (order.status !== "AWAITING_DEPOSIT") return;
  const q = order.quotations.find((x) => x.status === "ACCEPTED");
  if (!q) return;
  await setStatus(tx, orderId, order.status, "ORDER_CONFIRMED", actorId, "Deposit received — order confirmed");
  const deposit = order.invoices.filter((i) => i.purpose === "PRODUCTION_DEPOSIT" && i.status !== "VOID").reduce((s, i) => s + i.amount, 0);
  const balance = q.total - deposit;
  if (balance > 0 && !order.invoices.some((i) => i.purpose === "PRODUCTION_BALANCE")) {
    await createInvoice(tx, { userId: order.customerId, purpose: "PRODUCTION_BALANCE", bulkOrderId: orderId, description: `Balance for ${order.reference} (quotation ${q.reference}) — due on dispatch`, amount: balance });
  }
  if (!order.job) {
    const qty = order.items.reduce((s, i) => s + i.quantity, 0);
    await tx.productionJob.create({
      data: {
        reference: await makeReference("PJ", tx),
        orderId,
        title: `${order.orgName} — ${order.items.map((i) => i.garmentType).join(", ")}`,
        garmentType: order.items.map((i) => i.garmentType).join(", "),
        description: order.description,
        totalQuantity: qty,
        defaultRate: 0,
        dueDate: order.requiredBy,
      },
    });
  }
  await notify({ userId: order.customerId, kind: "bulk_order.confirmed", title: `${order.reference} confirmed`, body: "We have received your deposit and your order is confirmed. Production planning has started.", link: `/dashboard/orders/${orderId}` }, tx);
}

export async function onProductionInvoicePaid(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (inv.purpose === "PRODUCTION_DEPOSIT" && inv.status === "PAID" && inv.bulkOrderId) await confirmOrder(tx, inv.bulkOrderId, null);
}

/** Loads an order for a viewer, enforcing ownership for non-staff (prevents IDOR). */
export async function getOrderForViewer(actor: Actor, orderId: string) {
  const order = await db.bulkOrder.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      attachments: true,
      quotations: { include: { lines: true }, orderBy: { version: "desc" } },
      invoices: { orderBy: { createdAt: "asc" } },
      statusHistory: { orderBy: { createdAt: "asc" } },
      job: true,
    },
  });
  if (!order) return null;
  const staff = can(actor, "production.view") || can(actor, "production.manage");
  if (!staff && order.customerId !== actor.userId) return null;
  if (!staff) {
    order.statusHistory = order.statusHistory.filter((e) => e.customerVisible);
    order.quotations = order.quotations.filter((q) => q.status !== "DRAFT" && q.status !== "SUPERSEDED" || q.sentAt);
  }
  return order;
}
