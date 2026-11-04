import { db } from "./db";
import type { Prisma } from "@prisma/client";

export type Range = { from: Date; to: Date; facilityId?: string | null };

export function parseRange(sp: Record<string, string | undefined>): Range & { fromStr: string; toStr: string } {
  const now = new Date();
  const toStr = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : now.toISOString().slice(0, 10);
  const def = new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  const fromStr = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : def;
  return { from: new Date(fromStr + "T00:00:00+01:00"), to: new Date(toStr + "T23:59:59+01:00"), fromStr, toStr, facilityId: sp.facility || null };
}

const sumPaid = async (where: Prisma.PaymentWhereInput) => (await db.payment.aggregate({ where: { status: "SUCCEEDED", ...where }, _sum: { amount: true } }))._sum.amount ?? 0;

/** All management KPIs, computed live from the database for the range. */
export async function operationsSummary(r: Range) {
  const fac = r.facilityId ? { facilityId: r.facilityId } : {};
  const paidIn = { verifiedAt: { gte: r.from, lte: r.to } };
  const [bookings, bookingsByStatus, equipmentCount, workstationCount, items, revenueByPurpose, refunds, activeTailors, pendingApps, ordersReceived, activeOrders, completedOrders, outstanding, enrolments, maintenanceDue, outOfService, pendingQc, earningsPending, enquiriesNew] = await Promise.all([
    db.booking.count({ where: { ...fac, createdAt: { gte: r.from, lte: r.to } } }),
    db.booking.groupBy({ by: ["status"], where: { ...fac, startsAt: { gte: r.from, lte: r.to } }, _count: true }),
    db.equipment.count({ where: { ...fac, bookable: true, status: { not: "RETIRED" } } }),
    db.workstation.count({ where: { ...fac, active: true } }),
    db.bookingItem.findMany({ where: { active: true, startsAt: { gte: r.from, lte: r.to }, booking: { ...fac, status: { in: ["CONFIRMED", "CHECKED_IN", "COMPLETED"] } } }, select: { startsAt: true, endsAt: true, equipmentId: true, workstationId: true, lineTotal: true, equipment: { select: { categoryId: true, category: { select: { name: true } } } } } }),
    db.payment.findMany({ where: { status: "SUCCEEDED", ...paidIn }, select: { amount: true, verifiedAt: true, invoice: { select: { purpose: true, booking: { select: { facilityId: true } } } } } }),
    db.refund.aggregate({ where: { createdAt: { gte: r.from, lte: r.to } }, _sum: { amount: true } }),
    db.tailor.count({ where: { verification: "VERIFIED", ...(r.facilityId ? { facilityId: r.facilityId } : {}) } }),
    db.tailorApplication.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "ASSESSMENT_SCHEDULED"] } } }),
    db.bulkOrder.count({ where: { createdAt: { gte: r.from, lte: r.to } } }),
    db.bulkOrder.count({ where: { status: { in: ["ORDER_CONFIRMED", "MATERIALS_SOURCING", "FABRIC_CUTTING", "PRODUCTION_IN_PROGRESS", "QUALITY_CONTROL", "FINISHING_PACKAGING", "READY_FOR_DISPATCH", "DISPATCHED"] } } }),
    db.bulkOrder.count({ where: { status: "COMPLETED", updatedAt: { gte: r.from, lte: r.to } } }),
    db.invoice.findMany({ where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] } }, select: { amount: true, amountPaid: true } }),
    db.enrolment.count({ where: { createdAt: { gte: r.from, lte: r.to } } }),
    db.maintenancePlan.count({ where: { nextDueAt: { lte: new Date(Date.now() + 7 * 86_400_000) } } }),
    db.equipment.count({ where: { ...fac, status: { in: ["UNDER_MAINTENANCE", "OUT_OF_SERVICE"] } } }),
    db.productionSubmission.count({ where: { status: "PENDING_QC" } }),
    db.pieceRateEarning.aggregate({ where: { status: "PENDING_APPROVAL" }, _sum: { amount: true } }),
    db.enquiry.count({ where: { status: "NEW" } }),
  ]);

  const rev = revenueByPurpose.filter((p) => !r.facilityId || !p.invoice.booking || p.invoice.booking.facilityId === r.facilityId);
  const byPurpose: Record<string, number> = {};
  for (const p of rev) byPurpose[p.invoice.purpose] = (byPurpose[p.invoice.purpose] ?? 0) + p.amount;

  // Utilisation = booked resource-hours / available resource-hours (approximating 10 operating hours/day).
  const days = Math.max(1, Math.round((r.to.getTime() - r.from.getTime()) / 86_400_000));
  const bookedHours = items.reduce((s, i) => s + (i.endsAt.getTime() - i.startsAt.getTime()) / 3_600_000, 0);
  const capacityHours = (equipmentCount + workstationCount) * days * 10;
  const machineHours = items.filter((i) => i.equipmentId).reduce((s, i) => s + (i.endsAt.getTime() - i.startsAt.getTime()) / 3_600_000, 0);
  const byCategory: Record<string, { hours: number; revenue: number }> = {};
  for (const i of items) {
    const k = i.equipment?.category.name ?? "Workstations";
    byCategory[k] ??= { hours: 0, revenue: 0 };
    byCategory[k].hours += (i.endsAt.getTime() - i.startsAt.getTime()) / 3_600_000;
    byCategory[k].revenue += i.lineTotal;
  }
  const daily: Record<string, number> = {};
  for (const p of rev) {
    const d = p.verifiedAt!.toISOString().slice(0, 10);
    daily[d] = (daily[d] ?? 0) + p.amount;
  }
  const machineRentalRevenue = items.filter((i) => i.equipmentId).reduce((s, i) => s + i.lineTotal, 0);
  const workspaceRevenue = items.filter((i) => i.workstationId).reduce((s, i) => s + i.lineTotal, 0);

  return {
    bookings,
    bookingsByStatus: Object.fromEntries(bookingsByStatus.map((b) => [b.status, b._count])),
    utilisationPct: capacityHours ? Math.round((bookedHours / capacityHours) * 1000) / 10 : 0,
    machineUtilisationPct: equipmentCount ? Math.round((machineHours / (equipmentCount * days * 10)) * 1000) / 10 : 0,
    machineRentalRevenue,
    workspaceRevenue,
    revenueTotal: rev.reduce((s, p) => s + p.amount, 0),
    revenueByPurpose: byPurpose,
    refunds: refunds._sum.amount ?? 0,
    byCategory,
    daily,
    activeTailors,
    pendingApps,
    ordersReceived,
    activeOrders,
    completedOrders,
    outstandingInvoices: outstanding.reduce((s, i) => s + i.amount - i.amountPaid, 0),
    outstandingCount: outstanding.length,
    enrolments,
    trainingRevenue: (byPurpose.TUITION ?? 0) + (byPurpose.APPLICATION_FEE ?? 0),
    maintenanceDue,
    outOfService,
    pendingQc,
    earningsPending: earningsPending._sum.amount ?? 0,
    enquiriesNew,
  };
}

export { sumPaid };
