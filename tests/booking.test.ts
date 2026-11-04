import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelBooking, createBooking, decideBooking, expireStaleHolds, rescheduleBooking } from "@/lib/booking/service";
import { applyVerification, initiatePayment, verifyPayment } from "@/lib/payments/service";
import { makeFacility, makeUser, resetDb, tomorrow, inDays } from "./helpers";

beforeEach(resetDb);

const fullDay = (facilityId: string, equipmentIds: string[], date = tomorrow(), workstationIds: string[] = []) => ({ facilityId, durationType: "FULL_DAY" as const, date, equipmentIds, workstationIds });

async function pay(actor: Awaited<ReturnType<typeof makeUser>>["actor"], invoiceId: string, outcome: "success" | "failed" = "success") {
  const { reference } = await initiatePayment(actor, invoiceId);
  await db.mockGatewaySession.update({ where: { reference }, data: { outcome } });
  return verifyPayment(reference);
}

describe("workspace & machine booking", () => {
  it("books a single machine for a full day, pending payment with an invoice", async () => {
    const { facility, machines } = await makeFacility();
    const { actor } = await makeUser();
    const b = await createBooking(actor, fullDay(facility.id, [machines[0].id]));
    expect(b.status).toBe("PENDING_PAYMENT");
    expect(b.total).toBe(7000);
    expect(b.holdExpiresAt).not.toBeNull();
    const inv = await db.invoice.findFirstOrThrow({ where: { bookingId: b.id } });
    expect(inv.amount).toBe(7000);
    expect(await db.notification.count({ where: { userId: actor.userId, kind: "booking.pending_payment" } })).toBe(1);
  });

  it("books multiple machines and a workstation in one reservation", async () => {
    const { facility, machines, overlock, workstation } = await makeFacility();
    const { actor } = await makeUser();
    const b = await createBooking(actor, fullDay(facility.id, [machines[0].id, machines[1].id, overlock.id], tomorrow(), [workstation.id]));
    const items = await db.bookingItem.findMany({ where: { bookingId: b.id } });
    expect(items).toHaveLength(4);
    expect(b.subtotal).toBe(7000 * 2 + 9000 + 3000);
    expect(b.securityDeposit).toBe(2000);
  });

  it("books multiple consecutive days as one booking with an item per day", async () => {
    const { facility, machines } = await makeFacility();
    const { actor } = await makeUser();
    const b = await createBooking(actor, { facilityId: facility.id, durationType: "MULTI_DAY", date: tomorrow(), days: 3, equipmentIds: [machines[0].id], workstationIds: [] });
    expect(b.days).toBe(3);
    expect(b.total).toBe(18000);
    expect(await db.bookingItem.count({ where: { bookingId: b.id } })).toBe(3);
  });

  it("prevents double booking of the same machine for overlapping periods", async () => {
    const { facility, machines } = await makeFacility();
    const a = await makeUser();
    const b = await makeUser();
    await createBooking(a.actor, fullDay(facility.id, [machines[0].id]));
    await expect(createBooking(b.actor, { facilityId: facility.id, durationType: "HOURLY", date: tomorrow(), startTime: "10:00", endTime: "12:00", equipmentIds: [machines[0].id], workstationIds: [] })).rejects.toThrow(/Already reserved/);
    // A different machine is still bookable.
    await expect(createBooking(b.actor, fullDay(facility.id, [machines[1].id]))).resolves.toBeTruthy();
  });

  it("allows back-to-back hourly bookings that touch but do not overlap", async () => {
    const { facility, machines } = await makeFacility();
    const a = await makeUser();
    const h = (s: string, e: string) => ({ facilityId: facility.id, durationType: "HOURLY" as const, date: tomorrow(), startTime: s, endTime: e, equipmentIds: [machines[0].id], workstationIds: [] });
    await createBooking(a.actor, h("08:00", "10:00"));
    await expect(createBooking(a.actor, h("10:00", "12:00"))).resolves.toBeTruthy();
  });

  it("guarantees no double booking under concurrent requests", async () => {
    const { facility, machines } = await makeFacility();
    const users = await Promise.all([1, 2, 3, 4, 5].map(() => makeUser()));
    const results = await Promise.allSettled(users.map((u) => createBooking(u.actor, fullDay(facility.id, [machines[0].id, machines[1].id]))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const active = await db.bookingItem.count({ where: { equipmentId: machines[0].id, active: true } });
    expect(active).toBe(1);
  });

  it("enforces the database exclusion constraint even if application checks are bypassed", async () => {
    const { facility, machines } = await makeFacility();
    const { actor } = await makeUser();
    const b = await createBooking(actor, fullDay(facility.id, [machines[0].id]));
    const item = await db.bookingItem.findFirstOrThrow({ where: { bookingId: b.id } });
    await expect(db.bookingItem.create({ data: { bookingId: b.id, equipmentId: machines[0].id, startsAt: item.startsAt, endsAt: item.endsAt, unitPrice: 1, lineTotal: 1, description: "dup" } })).rejects.toThrow();
  });

  it("blocks machines under maintenance windows and out-of-service status", async () => {
    const { facility, machines } = await makeFacility();
    const { actor } = await makeUser();
    const d = new Date(`${tomorrow()}T10:00:00+01:00`);
    await db.maintenanceWindow.create({ data: { equipmentId: machines[0].id, startsAt: d, endsAt: new Date(d.getTime() + 3_600_000), reason: "Service" } });
    await expect(createBooking(actor, fullDay(facility.id, [machines[0].id]))).rejects.toThrow(/maintenance/);
    await db.equipment.update({ where: { id: machines[1].id }, data: { status: "UNDER_MAINTENANCE" } });
    await expect(createBooking(actor, fullDay(facility.id, [machines[1].id]))).rejects.toThrow(/under maintenance/);
  });

  it("rejects equipment from another facility", async () => {
    const f1 = await makeFacility();
    const f2 = await makeFacility();
    const { actor } = await makeUser();
    await expect(createBooking(actor, fullDay(f1.facility.id, [f2.machines[0].id]))).rejects.toThrow(/not located/);
  });

  it("confirms a booking only after verified successful payment", async () => {
    const { facility, machines } = await makeFacility();
    const { actor } = await makeUser();
    const b = await createBooking(actor, fullDay(facility.id, [machines[0].id]));
    const inv = await db.invoice.findFirstOrThrow({ where: { bookingId: b.id } });
    const r = await pay(actor, inv.id);
    expect(r.status).toBe("SUCCEEDED");
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("CONFIRMED");
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PAID");
  });

  it("leaves the booking pending after a failed payment and records nothing as paid", async () => {
    const { facility, machines } = await makeFacility();
    const { actor } = await makeUser();
    const b = await createBooking(actor, fullDay(facility.id, [machines[0].id]));
    const inv = await db.invoice.findFirstOrThrow({ where: { bookingId: b.id } });
    const r = await pay(actor, inv.id, "failed");
    expect(r.status).toBe("FAILED");
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("PENDING_PAYMENT");
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).amountPaid).toBe(0);
  });

  it("does not treat a pending (unconfirmed) payment as paid", async () => {
    const { facility, machines } = await makeFacility();
    const { actor } = await makeUser();
    const b = await createBooking(actor, fullDay(facility.id, [machines[0].id]));
    const inv = await db.invoice.findFirstOrThrow({ where: { bookingId: b.id } });
    const { reference } = await initiatePayment(actor, inv.id);
    expect((await verifyPayment(reference)).status).toBe("PENDING");
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("PENDING_PAYMENT");
  });

  it("applies a verified payment exactly once (idempotent callback + webhook)", async () => {
    const { facility, machines } = await makeFacility();
    const { actor } = await makeUser();
    const b = await createBooking(actor, fullDay(facility.id, [machines[0].id]));
    const inv = await db.invoice.findFirstOrThrow({ where: { bookingId: b.id } });
    const { reference } = await initiatePayment(actor, inv.id);
    const ok = { status: "success" as const, amount: 7000, currency: "NGN", raw: {} };
    await Promise.all([applyVerification(reference, ok), applyVerification(reference, ok), applyVerification(reference, ok)]);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).amountPaid).toBe(7000);
  });

  it("rejects a gateway success whose amount does not match", async () => {
    const { facility, machines } = await makeFacility();
    const { actor } = await makeUser();
    const b = await createBooking(actor, fullDay(facility.id, [machines[0].id]));
    const inv = await db.invoice.findFirstOrThrow({ where: { bookingId: b.id } });
    const { reference } = await initiatePayment(actor, inv.id);
    const r = await applyVerification(reference, { status: "success", amount: 100, currency: "NGN", raw: {} });
    expect(r.status).toBe("FAILED");
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).amountPaid).toBe(0);
  });

  it("reuses a recent pending payment attempt instead of creating duplicates", async () => {
    const { facility, machines } = await makeFacility();
    const { actor } = await makeUser();
    const b = await createBooking(actor, fullDay(facility.id, [machines[0].id]));
    const inv = await db.invoice.findFirstOrThrow({ where: { bookingId: b.id } });
    const a = await initiatePayment(actor, inv.id);
    const c = await initiatePayment(actor, inv.id);
    expect(a.reference).toBe(c.reference);
  });

  it("releases inventory when the payment hold expires", async () => {
    const { facility, machines } = await makeFacility();
    const a = await makeUser();
    const b = await makeUser();
    const first = await createBooking(a.actor, fullDay(facility.id, [machines[0].id]));
    await db.booking.update({ where: { id: first.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    expect(await expireStaleHolds()).toBe(1);
    expect((await db.booking.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("EXPIRED");
    await expect(createBooking(b.actor, fullDay(facility.id, [machines[0].id]))).resolves.toBeTruthy();
  });

  it("cancels a booking, releases the machine and computes refunds by policy", async () => {
    const { facility, machines } = await makeFacility();
    const { actor } = await makeUser();
    const b = await createBooking(actor, fullDay(facility.id, [machines[0].id], inDays(3)));
    const inv = await db.invoice.findFirstOrThrow({ where: { bookingId: b.id } });
    await pay(actor, inv.id);
    const r = await cancelBooking(actor, b.id, "Change of plans");
    expect(r.refundDue).toBe(7000);
    expect(await db.bookingItem.count({ where: { bookingId: b.id, active: true } })).toBe(0);
    const other = await makeUser();
    await expect(createBooking(other.actor, fullDay(facility.id, [machines[0].id], inDays(3)))).resolves.toBeTruthy();
  });

  it("reschedules a confirmed booking and re-validates availability", async () => {
    const { facility, machines } = await makeFacility();
    const { actor } = await makeUser();
    const other = await makeUser();
    const b = await createBooking(actor, fullDay(facility.id, [machines[0].id], inDays(3)));
    await pay(actor, (await db.invoice.findFirstOrThrow({ where: { bookingId: b.id } })).id);
    await createBooking(other.actor, fullDay(facility.id, [machines[0].id], inDays(5)));
    await expect(rescheduleBooking(actor, b.id, { date: inDays(5) })).rejects.toThrow(/not available/);
    const moved = await rescheduleBooking(actor, b.id, { date: inDays(4) });
    expect(moved.startsAt.toISOString().slice(0, 10)).toBe(inDays(4));
  });

  it("supports approval-required facilities", async () => {
    const { facility, machines } = await makeFacility({ requiresApproval: true });
    const { actor } = await makeUser();
    const fm = await makeUser(["FACILITY_MANAGER"], facility.id);
    const b = await createBooking(actor, fullDay(facility.id, [machines[0].id]));
    expect(b.status).toBe("PENDING_APPROVAL");
    const inv = await db.invoice.findFirstOrThrow({ where: { bookingId: b.id } });
    await expect(initiatePayment(actor, inv.id)).rejects.toThrow(/awaiting approval/);
    expect(await decideBooking(fm.actor, b.id, "APPROVE")).toBe("PENDING_PAYMENT");
  });

  it("only lets managers of the booking's facility approve it", async () => {
    const f1 = await makeFacility({ requiresApproval: true });
    const f2 = await makeFacility();
    const { actor } = await makeUser();
    const otherFm = await makeUser(["FACILITY_MANAGER"], f2.facility.id);
    const b = await createBooking(actor, fullDay(f1.facility.id, [f1.machines[0].id]));
    await expect(decideBooking(otherFm.actor, b.id, "APPROVE")).rejects.toThrow(/permission/);
  });

  it("applies the active member discount automatically", async () => {
    const { facility, machines } = await makeFacility();
    const { actor, user } = await makeUser();
    const plan = await db.membershipPlan.create({ data: { slug: "p", name: "Pro", description: "", fee: 1, validityDays: 30, benefits: [], workspaceAccess: "", machineAccess: "", bookingDiscountPct: 20 } });
    await db.membership.create({ data: { userId: user.id, planId: plan.id, status: "ACTIVE", startsAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000 * 10) } });
    const b = await createBooking(actor, fullDay(facility.id, [machines[0].id]));
    expect(b.discount).toBe(1400);
    expect(b.total).toBe(5600);
  });
});
