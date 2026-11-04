import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createQuotation, getOrderForViewer, respondToQuotation, sendQuotation, submitBulkOrder, updateOrderStatus } from "@/lib/production/orders";
import { allocate, applyToJob, approveEarnings, decideJobApplication, markEarningsPaid, recordInspection, submitOutput } from "@/lib/production/allocation";
import { initiatePayment, recordManualPayment, verifyPayment } from "@/lib/payments/service";
import { makeUser, resetDb } from "./helpers";
import type { Actor } from "@/lib/auth/rbac";

beforeEach(resetDb);

const orderInput = (uploadIds: string[] = []) => ({
  orgName: "Hillcrest School", orgType: "SCHOOL" as const, contactName: "Ada", email: "ada@school.ng", phone: "+2348011111111", address: "Jos",
  items: [{ garmentType: "Shirt", quantity: 500 }, { garmentType: "Shorts", quantity: 500 }], description: "School uniforms", designsCount: 2, sizes: "Age 5-16",
  deliveryLocation: "Jos", fabricSource: "STITCHWORKS" as const, uploadIds,
});

const quote = { lines: [{ garmentType: "Shirt", quantity: 500, unitPrice: 4000 }, { garmentType: "Shorts", quantity: 500, unitPrice: 3000 }], materialCost: 1_500_000, labourCost: 1_500_000, brandingCost: 500_000, logisticsCost: 50_000, taxPercent: 0, depositPercent: 50, timelineDays: 21, paymentTerms: "50/50", validDays: 14 };

async function payInvoice(actor: Actor, invoiceId: string) {
  const { reference } = await initiatePayment(actor, invoiceId);
  await db.mockGatewaySession.update({ where: { reference }, data: { outcome: "success" } });
  return verifyPayment(reference);
}

async function confirmedOrder() {
  const customer = await makeUser();
  const pm = await makeUser(["PRODUCTION_MANAGER"]);
  const order = await submitBulkOrder(customer.user.id, orderInput());
  const q = await createQuotation(pm.actor, order.id, quote);
  await sendQuotation(pm.actor, q.id);
  await respondToQuotation(customer.actor, q.id, true);
  const deposit = await db.invoice.findFirstOrThrow({ where: { bulkOrderId: order.id, purpose: "PRODUCTION_DEPOSIT" } });
  await payInvoice(customer.actor, deposit.id);
  return { customer, pm, order, q };
}

describe("bulk production workflow", () => {
  it("submits an enquiry with multiple files, a unique reference and notifications", async () => {
    const customer = await makeUser();
    const pmUser = await makeUser(["PRODUCTION_MANAGER"]);
    const uploads = await Promise.all([1, 2, 3].map((i) => db.upload.create({ data: { ownerId: customer.user.id, storageKey: `k${i}-${Date.now()}`, originalName: `f${i}.pdf`, mimeType: "application/pdf", size: 10, purpose: "BULK_ORDER" } })));
    const foreign = await db.upload.create({ data: { ownerId: pmUser.user.id, storageKey: `foreign-${Date.now()}`, originalName: "x.pdf", mimeType: "application/pdf", size: 1, purpose: "BULK_ORDER" } });
    const a = await submitBulkOrder(customer.user.id, orderInput([...uploads.map((u) => u.id), foreign.id]));
    const b = await submitBulkOrder(customer.user.id, orderInput());
    expect(a.reference).not.toBe(b.reference);
    expect(a.reference).toMatch(/^PO-\d{4}-\d{5}$/);
    const withFiles = await db.bulkOrder.findUniqueOrThrow({ where: { id: a.id }, include: { attachments: true } });
    expect(withFiles.attachments.map((x) => x.id).sort()).toEqual(uploads.map((u) => u.id).sort()); // foreign file not attached
    expect(await db.notification.count({ where: { userId: pmUser.user.id, kind: "bulk_order.new" } })).toBe(2);
  });

  it("runs quotation → acceptance → deposit invoice → payment → confirmed order with job and balance invoice", async () => {
    const { order, q } = await confirmedOrder();
    expect(q.total).toBe(500 * 4000 + 500 * 3000 + 50_000);
    const o = await db.bulkOrder.findUniqueOrThrow({ where: { id: order.id }, include: { invoices: true, job: true } });
    expect(o.status).toBe("ORDER_CONFIRMED");
    expect(o.job?.totalQuantity).toBe(1000);
    const dep = o.invoices.find((i) => i.purpose === "PRODUCTION_DEPOSIT")!;
    const bal = o.invoices.find((i) => i.purpose === "PRODUCTION_BALANCE")!;
    expect(dep.amount + bal.amount).toBe(q.total);
    expect(dep.status).toBe("PAID");
  });

  it("only lets the order owner respond to the quotation", async () => {
    const customer = await makeUser();
    const stranger = await makeUser();
    const pm = await makeUser(["PRODUCTION_MANAGER"]);
    const order = await submitBulkOrder(customer.user.id, orderInput());
    const q = await createQuotation(pm.actor, order.id, quote);
    await sendQuotation(pm.actor, q.id);
    await expect(respondToQuotation(stranger.actor, q.id, true)).rejects.toThrow(/not found/i);
    expect(await getOrderForViewer(stranger.actor, order.id)).toBeNull();
  });

  it("enforces status transitions and requires the balance before completion", async () => {
    const { pm, customer, order } = await confirmedOrder();
    await expect(updateOrderStatus(pm.actor, order.id, "DELIVERED")).rejects.toThrow(/Cannot move/);
    for (const s of ["MATERIALS_SOURCING", "FABRIC_CUTTING", "PRODUCTION_IN_PROGRESS", "QUALITY_CONTROL", "FINISHING_PACKAGING", "READY_FOR_DISPATCH", "DISPATCHED", "DELIVERED"] as const) {
      await updateOrderStatus(pm.actor, order.id, s);
    }
    await expect(updateOrderStatus(pm.actor, order.id, "COMPLETED")).rejects.toThrow(/outstanding balance/);
    const bal = await db.invoice.findFirstOrThrow({ where: { bulkOrderId: order.id, purpose: "PRODUCTION_BALANCE" } });
    await payInvoice(customer.actor, bal.id);
    await updateOrderStatus(pm.actor, order.id, "COMPLETED");
    const history = await db.orderStatusEvent.count({ where: { orderId: order.id } });
    expect(history).toBeGreaterThan(10);
  });

  it("does not let customers or QC officers change production stages", async () => {
    const { customer, order } = await confirmedOrder();
    const qc = await makeUser(["QC_OFFICER"]);
    await expect(updateOrderStatus(customer.actor, order.id, "MATERIALS_SOURCING")).rejects.toThrow(/permission/);
    await expect(updateOrderStatus(qc.actor, order.id, "MATERIALS_SOURCING")).rejects.toThrow(/permission/);
  });
});

describe("allocation, QC and piece-rate earnings", () => {
  async function setup() {
    const { pm, order } = await confirmedOrder();
    const job = await db.productionJob.findUniqueOrThrow({ where: { orderId: order.id } });
    const t = await makeUser(["TAILOR"]);
    const tailor = await db.tailor.create({ data: { code: `SW-T-${Math.random().toString().slice(2, 6)}`, userId: t.user.id, yearsExperience: 5, specialisations: [], machineSkills: [] } });
    return { pm, job, t, tailor };
  }

  it("allocates to a tailor, records QC and pays only accepted pieces after approval", async () => {
    const { pm, job, t, tailor } = await setup();
    const qc = await makeUser(["QC_OFFICER"]);
    const fin = await makeUser(["FINANCE_OFFICER"]);
    const a = await allocate(pm.actor, job.id, { tailorId: tailor.id, quantity: 500, rate: 350 });
    const sub = await submitOutput(t.actor, a.id, 200);
    await recordInspection(qc.actor, sub.id, { inspectedQty: 200, acceptedQty: 180, reworkQty: 15, rejectedQty: 5, defects: ["loose threads"], reworkNotes: "Trim threads" });
    const e = await db.pieceRateEarning.findFirstOrThrow({ where: { allocationId: a.id } });
    expect(e.quantity).toBe(180);
    expect(e.amount).toBe(180 * 350);
    expect(e.status).toBe("PENDING_APPROVAL");
    // Separation of duties: QC cannot approve, PM cannot pay, finance cannot approve.
    await expect(approveEarnings(qc.actor, [e.id])).rejects.toThrow(/permission/);
    await expect(approveEarnings(fin.actor, [e.id])).rejects.toThrow(/permission/);
    await expect(markEarningsPaid(pm.actor, [e.id], "TRF-1")).rejects.toThrow(/permission/);
    expect(await approveEarnings(pm.actor, [e.id])).toBe(1);
    expect(await markEarningsPaid(fin.actor, [e.id], "TRF-1")).toBe(1);
    expect((await db.pieceRateEarning.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("PAID");
    expect(await db.auditLog.count({ where: { entityId: e.id } })).toBe(2);
  });

  it("prevents over-allocation and over-submission", async () => {
    const { pm, job, t, tailor } = await setup();
    await expect(allocate(pm.actor, job.id, { tailorId: tailor.id, quantity: 1001, rate: 100 })).rejects.toThrow(/remain/);
    const a = await allocate(pm.actor, job.id, { tailorId: tailor.id, quantity: 100, rate: 100 });
    await submitOutput(t.actor, a.id, 60);
    await expect(submitOutput(t.actor, a.id, 41)).rejects.toThrow(/at most 40/);
  });

  it("allocations are traceable to teams and external partners, with exactly one assignee", async () => {
    const { pm, job, tailor } = await setup();
    const team = await db.tailorTeam.create({ data: { name: "Line A", members: { create: { tailorId: tailor.id } } } });
    await expect(allocate(pm.actor, job.id, { tailorId: tailor.id, teamId: team.id, quantity: 10, rate: 1 })).rejects.toThrow(/exactly one/);
    const ta = await allocate(pm.actor, job.id, { teamId: team.id, quantity: 300, rate: 300 });
    const pa = await allocate(pm.actor, job.id, { partnerName: "Kaduna Garments Ltd", quantity: 200, rate: 280 });
    expect(ta.teamId).toBe(team.id);
    expect(pa.partnerName).toBe("Kaduna Garments Ltd");
  });

  it("does not let other tailors submit on someone else's allocation or QC their own work", async () => {
    const { pm, job, t, tailor } = await setup();
    const other = await makeUser(["TAILOR", "QC_OFFICER"]);
    const a = await allocate(pm.actor, job.id, { tailorId: tailor.id, quantity: 10, rate: 100 });
    await expect(submitOutput(other.actor, a.id, 5)).rejects.toThrow(/not found/i);
    const tq = await makeUser(["TAILOR", "QC_OFFICER"]);
    const tailor2 = await db.tailor.create({ data: { code: "SW-T-9999", userId: tq.user.id, yearsExperience: 1, specialisations: [], machineSkills: [] } });
    const a2 = await allocate(pm.actor, job.id, { tailorId: tailor2.id, quantity: 10, rate: 100 });
    const s = await submitOutput(tq.actor, a2.id, 10);
    await expect(recordInspection(tq.actor, s.id, { inspectedQty: 10, acceptedQty: 10, rejectedQty: 0, reworkQty: 0, defects: [] })).rejects.toThrow(/own/);
    void t;
  });

  it("marketplace: requires production-eligible membership to apply, then allocates on acceptance", async () => {
    const { pm, job, t, tailor } = await setup();
    await db.productionJob.update({ where: { id: job.id }, data: { openToMarketplace: true, defaultRate: 250 } });
    await expect(applyToJob(t.actor, job.id, 50)).rejects.toThrow(/membership/);
    const plan = await db.membershipPlan.create({ data: { slug: "pro", name: "Pro", description: "", fee: 1, validityDays: 30, benefits: [], workspaceAccess: "", machineAccess: "", productionEligible: true } });
    await db.membership.create({ data: { userId: t.user.id, planId: plan.id, status: "ACTIVE", startsAt: new Date(), expiresAt: new Date(Date.now() + 864e5) } });
    const app = await applyToJob(t.actor, job.id, 50);
    await decideJobApplication(pm.actor, app.id, true);
    const alloc = await db.productionAllocation.findFirstOrThrow({ where: { jobId: job.id, tailorId: tailor.id } });
    expect(alloc.quantity).toBe(50);
    expect(alloc.rate).toBe(250);
  });

  it("records offline deposits by finance and confirms the order", async () => {
    const customer = await makeUser();
    const pm = await makeUser(["PRODUCTION_MANAGER"]);
    const fin = await makeUser(["FINANCE_OFFICER"]);
    const order = await submitBulkOrder(customer.user.id, orderInput());
    const q = await createQuotation(pm.actor, order.id, quote);
    await sendQuotation(pm.actor, q.id);
    await respondToQuotation(customer.actor, q.id, true);
    const dep = await db.invoice.findFirstOrThrow({ where: { bulkOrderId: order.id, purpose: "PRODUCTION_DEPOSIT" } });
    await expect(recordManualPayment(pm.actor, dep.id, { amount: dep.amount, method: "bank_transfer" })).rejects.toThrow(/permission/);
    await recordManualPayment(fin.actor, dep.id, { amount: dep.amount, method: "bank_transfer" });
    expect((await db.bulkOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("ORDER_CONFIRMED");
  });
});
