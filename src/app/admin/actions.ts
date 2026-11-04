"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EquipmentCondition, EquipmentStatus, ProductionStatus, Role, StudentApplicationStatus, TailorApplicationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { assertCan, can } from "@/lib/auth/rbac";
import { safeAction, str, optStr, int, optInt, bool, list, date, files } from "@/lib/action";
import { decideBooking, setBookingProgress, cancelBooking, createBooking } from "@/lib/booking/service";
import { recordManualPayment, recordRefund } from "@/lib/payments/service";
import { createQuotation, sendQuotation, updateOrderStatus } from "@/lib/production/orders";
import { allocate, approveEarnings, createJob, decideJobApplication, markEarningsPaid, recordInspection, updateJob } from "@/lib/production/allocation";
import { commentOnApplication, moveTailorApplication } from "@/lib/tailors/service";
import { manageMembership } from "@/lib/memberships";
import { addClassMeeting, completeEnrolment, createAssignment, gradeSubmission, issueCertificate, moveStudentApplication, recordAssessment, recordAttendance, revokeCertificate } from "@/lib/academy/service";
import { audit } from "@/lib/audit";
import { saveUpload } from "@/lib/uploads";
import { kickDispatch, notify } from "@/lib/notifications";
import { localToUtc } from "@/lib/time";
import { AppError, NotFoundError } from "@/lib/errors";

async function actor() {
  return (await requireUser()).actor;
}
const done = (path: string, message = "Saved.") => {
  revalidatePath(path);
  kickDispatch();
  return { message };
};

// ─── Bookings ───────────────────────────────────────────────────────────────
export const decideBookingAction = safeAction(async (_s: unknown, fd: FormData) => {
  const s = await decideBooking(await actor(), str(fd, "bookingId"), str(fd, "decision") as "APPROVE" | "APPROVE_PAY_ON_ARRIVAL" | "REJECT", optStr(fd, "note"));
  return done("/admin/bookings", `Booking ${s.toLowerCase().replace("_", " ")}.`);
});
export const bookingProgressAction = safeAction(async (_s: unknown, fd: FormData) => {
  await setBookingProgress(await actor(), str(fd, "bookingId"), str(fd, "status") as "CHECKED_IN" | "COMPLETED");
  return done("/admin/bookings", "Updated.");
});
export const adminCancelBookingAction = safeAction(async (_s: unknown, fd: FormData) => {
  const r = await cancelBooking(await actor(), str(fd, "bookingId"), str(fd, "reason") || "Cancelled by facility");
  return done("/admin/bookings", `Cancelled. Refund due: ₦${r.refundDue.toLocaleString()}.`);
});
export const adminCreateBookingAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  const customer = await db.user.findUnique({ where: { email: str(fd, "customerEmail").toLowerCase() } });
  if (!customer) throw new AppError("No account with that email. Ask the customer to register first.");
  const b = await createBooking(a, { facilityId: str(fd, "facilityId"), durationType: str(fd, "durationType") as never, date: str(fd, "date"), startTime: optStr(fd, "startTime"), endTime: optStr(fd, "endTime"), halfDaySlot: optStr(fd, "halfDaySlot") as never, days: optInt(fd, "days") ?? undefined, equipmentIds: list(fd, "equipmentIds"), workstationIds: list(fd, "workstationIds"), notes: optStr(fd, "notes") }, { onBehalfOfUserId: customer.id });
  kickDispatch();
  redirect(`/admin/bookings/${b.id}`);
});

// ─── Facilities, pricing, equipment ─────────────────────────────────────────
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const saveFacilityAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  const id = optStr(fd, "id");
  if (id) assertCan(a, "facility.manage", id);
  else assertCan(a, "facility.create");
  const hours: Record<string, [string, string] | null> = {};
  for (const d of DAYS) hours[d] = bool(fd, `${d}_open`) && str(fd, `${d}_from`) && str(fd, `${d}_to`) ? [str(fd, `${d}_from`), str(fd, `${d}_to`)] : null;
  const data = {
    name: str(fd, "name"), address: str(fd, "address"), city: str(fd, "city"), state: str(fd, "state"), phone: optStr(fd, "phone") ?? null, email: optStr(fd, "email") ?? null,
    operatingHours: hours, requiresApproval: bool(fd, "requiresApproval"), minBookingHours: int(fd, "minBookingHours") || 1, maxAdvanceDays: int(fd, "maxAdvanceDays") || 60,
    maxConsecutiveDays: int(fd, "maxConsecutiveDays") || 7, paymentHoldMinutes: int(fd, "paymentHoldMinutes") || 30, cancellationHours: int(fd, "cancellationHours") || 0, depositPercent: Math.min(Math.max(int(fd, "depositPercent") || 0, 0), 100), active: bool(fd, "active"),
  };
  if (!data.name || !data.city) throw new AppError("Name and city are required.");
  const f = id ? await db.facility.update({ where: { id }, data }) : await db.facility.create({ data: { ...data, slug: data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") } });
  await audit({ actorId: a.userId, action: id ? "facility.update" : "facility.create", entityType: "Facility", entityId: f.id, facilityId: f.id, data });
  if (!id) redirect(`/admin/facilities/${f.id}`);
  return done(`/admin/facilities/${f.id}`);
});

export const saveRateCardAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  const facilityId = str(fd, "facilityId");
  assertCan(a, "pricing.manage", facilityId);
  const data = { hourlyRate: int(fd, "hourlyRate"), halfDayRate: int(fd, "halfDayRate"), fullDayRate: int(fd, "fullDayRate"), multiDayRate: optInt(fd, "multiDayRate"), securityDeposit: int(fd, "securityDeposit") || 0 };
  if ([data.hourlyRate, data.halfDayRate, data.fullDayRate].some((n) => !Number.isFinite(n) || n < 0)) throw new AppError("Enter valid rates.");
  const categoryId = str(fd, "categoryId");
  await db.rateCard.upsert({ where: { facilityId_categoryId: { facilityId, categoryId } }, create: { facilityId, categoryId, ...data }, update: data });
  await audit({ actorId: a.userId, action: "pricing.rate_card", entityType: "RateCard", entityId: `${facilityId}:${categoryId}`, facilityId, data });
  return done(`/admin/facilities/${facilityId}`, "Rates saved.");
});

export const saveWorkstationAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  const facilityId = str(fd, "facilityId");
  assertCan(a, "facility.manage", facilityId);
  const id = optStr(fd, "id");
  const data = { code: str(fd, "code"), name: str(fd, "name"), description: optStr(fd, "description") ?? null, hourlyRate: int(fd, "hourlyRate"), halfDayRate: int(fd, "halfDayRate"), fullDayRate: int(fd, "fullDayRate"), multiDayRate: optInt(fd, "multiDayRate"), active: bool(fd, "active") };
  if (!data.code || !data.name) throw new AppError("Code and name are required.");
  const w = id ? await db.workstation.update({ where: { id }, data }) : await db.workstation.create({ data: { ...data, facilityId } });
  await audit({ actorId: a.userId, action: "workstation.save", entityType: "Workstation", entityId: w.id, facilityId, data });
  return done(`/admin/facilities/${facilityId}`);
});

export const saveCategoryAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  assertCan(a, "equipment.manage");
  const id = optStr(fd, "id");
  const name = str(fd, "name");
  if (!name) throw new AppError("Name is required.");
  const data = { name, description: optStr(fd, "description") ?? null, active: bool(fd, "active"), sortOrder: int(fd, "sortOrder") || 0 };
  const c = id ? await db.equipmentCategory.update({ where: { id }, data }) : await db.equipmentCategory.create({ data: { ...data, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") } });
  await audit({ actorId: a.userId, action: "equipment_category.save", entityType: "EquipmentCategory", entityId: c.id, data });
  return done("/admin/equipment");
});

export const saveEquipmentAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  const facilityId = str(fd, "facilityId");
  assertCan(a, "equipment.manage", facilityId);
  const id = optStr(fd, "id");
  if (id) {
    const existing = await db.equipment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError();
    assertCan(a, "equipment.manage", existing.facilityId);
  }
  const data = {
    assetTag: str(fd, "assetTag").toUpperCase(), name: str(fd, "name"), categoryId: str(fd, "categoryId"), facilityId, brand: optStr(fd, "brand") ?? null, model: optStr(fd, "model") ?? null, serialNumber: optStr(fd, "serialNumber") ?? null,
    condition: (str(fd, "condition") || "GOOD") as EquipmentCondition, status: (str(fd, "status") || "AVAILABLE") as EquipmentStatus, acquiredAt: date(fd, "acquiredAt"), acquisitionCost: optInt(fd, "acquisitionCost"),
    hourlyRate: optInt(fd, "hourlyRate"), halfDayRate: optInt(fd, "halfDayRate"), fullDayRate: optInt(fd, "fullDayRate"), multiDayRate: optInt(fd, "multiDayRate"), bookable: bool(fd, "bookable"), notes: optStr(fd, "notes") ?? null,
  };
  if (!data.assetTag || !data.name || !data.categoryId) throw new AppError("Asset tag, name and category are required.");
  const e = id ? await db.equipment.update({ where: { id }, data }) : await db.equipment.create({ data });
  await audit({ actorId: a.userId, action: id ? "equipment.update" : "equipment.create", entityType: "Equipment", entityId: e.id, facilityId, data });
  if (!id) redirect(`/admin/equipment/${e.id}`);
  return done(`/admin/equipment/${e.id}`);
});

export const deleteEquipmentAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  const e = await db.equipment.findUnique({ where: { id: str(fd, "id") }, include: { _count: { select: { bookingItems: true } } } });
  if (!e) throw new NotFoundError();
  assertCan(a, "equipment.manage", e.facilityId);
  if (e._count.bookingItems > 0) {
    // Keep history intact: retire instead of deleting.
    await db.equipment.update({ where: { id: e.id }, data: { status: "RETIRED", bookable: false } });
    await audit({ actorId: a.userId, action: "equipment.retire", entityType: "Equipment", entityId: e.id, facilityId: e.facilityId });
    return done("/admin/equipment", "Equipment has booking history, so it was retired rather than deleted.");
  }
  await db.$transaction([db.maintenanceWindow.deleteMany({ where: { equipmentId: e.id } }), db.maintenancePlan.deleteMany({ where: { equipmentId: e.id } }), db.equipmentServiceLog.deleteMany({ where: { equipmentId: e.id } }), db.equipment.delete({ where: { id: e.id } })]);
  await audit({ actorId: a.userId, action: "equipment.delete", entityType: "Equipment", entityId: e.id, facilityId: e.facilityId, data: { assetTag: e.assetTag } });
  redirect("/admin/equipment");
});

export const addMaintenanceWindowAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  const equipmentId = optStr(fd, "equipmentId");
  const workstationId = optStr(fd, "workstationId");
  const target = equipmentId ? await db.equipment.findUnique({ where: { id: equipmentId } }) : await db.workstation.findUnique({ where: { id: workstationId ?? "" } });
  if (!target) throw new NotFoundError();
  assertCan(a, "equipment.manage", target.facilityId);
  const startsAt = localToUtc(str(fd, "startDate"), str(fd, "startTime") || "00:00");
  const endsAt = localToUtc(str(fd, "endDate"), str(fd, "endTime") || "23:59");
  if (endsAt <= startsAt) throw new AppError("End must be after start.");
  const kind = str(fd, "kind") || "PLANNED";
  // Inform customers whose confirmed bookings now clash.
  const clashes = await db.bookingItem.findMany({ where: { active: true, ...(equipmentId ? { equipmentId } : { workstationId }), startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, include: { booking: true } });
  const w = await db.maintenanceWindow.create({ data: { equipmentId: equipmentId ?? null, workstationId: workstationId ?? null, startsAt, endsAt, reason: str(fd, "reason") || "Maintenance", kind, createdById: a.userId } });
  if (equipmentId && kind !== "PLANNED" && startsAt <= new Date()) await db.equipment.update({ where: { id: equipmentId }, data: { status: kind === "DAMAGE" ? "OUT_OF_SERVICE" : "UNDER_MAINTENANCE" } });
  await audit({ actorId: a.userId, action: "maintenance.block", entityType: "MaintenanceWindow", entityId: w.id, facilityId: target.facilityId, data: { startsAt, endsAt, kind, clashes: clashes.length } });
  for (const c of clashes) await notify({ userId: c.booking.customerId, kind: "booking.affected", title: `Booking ${c.booking.reference} affected by maintenance`, body: "One of the items in your booking needs maintenance during your reservation. The facility manager will contact you to swap the machine or reschedule.", link: `/dashboard/bookings/${c.bookingId}` });
  return done(equipmentId ? `/admin/equipment/${equipmentId}` : "/admin/maintenance", clashes.length ? `Blocked. ${clashes.length} existing booking item(s) overlap — customers have been notified; reassign or reschedule them.` : "Availability blocked.");
});

export const removeMaintenanceWindowAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  const w = await db.maintenanceWindow.findUnique({ where: { id: str(fd, "id") }, include: { equipment: true, workstation: true } });
  if (!w) throw new NotFoundError();
  assertCan(a, "equipment.manage", w.equipment?.facilityId ?? w.workstation?.facilityId);
  await db.maintenanceWindow.delete({ where: { id: w.id } });
  await audit({ actorId: a.userId, action: "maintenance.unblock", entityType: "MaintenanceWindow", entityId: w.id });
  return done("/admin/maintenance", "Removed.");
});

export const serviceLogAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  const e = await db.equipment.findUnique({ where: { id: str(fd, "equipmentId") } });
  if (!e) throw new NotFoundError();
  assertCan(a, "equipment.manage", e.facilityId);
  const kind = str(fd, "kind") || "SERVICE";
  const log = await db.equipmentServiceLog.create({ data: { equipmentId: e.id, kind, description: str(fd, "description"), cost: int(fd, "cost") || 0, downtimeHours: int(fd, "downtimeHours") || 0, bookingId: optStr(fd, "bookingRef") ? (await db.booking.findUnique({ where: { reference: str(fd, "bookingRef") } }))?.id ?? null : null, performedBy: optStr(fd, "performedBy") ?? null, recordedById: a.userId } });
  const status = optStr(fd, "newStatus") as EquipmentStatus | undefined;
  if (status) await db.equipment.update({ where: { id: e.id }, data: { status } });
  if (kind === "SERVICE") await db.maintenancePlan.updateMany({ where: { equipmentId: e.id, id: optStr(fd, "planId") ?? "" }, data: { lastDoneAt: new Date() } }).then(async () => {
    const plan = optStr(fd, "planId") ? await db.maintenancePlan.findUnique({ where: { id: str(fd, "planId") } }) : null;
    if (plan) await db.maintenancePlan.update({ where: { id: plan.id }, data: { lastDoneAt: new Date(), nextDueAt: new Date(Date.now() + plan.intervalDays * 86_400_000) } });
  });
  await audit({ actorId: a.userId, action: `equipment.${kind.toLowerCase()}`, entityType: "Equipment", entityId: e.id, facilityId: e.facilityId, data: { logId: log.id, status } });
  return done(`/admin/equipment/${e.id}`, "Recorded.");
});

export const maintenancePlanAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  const e = await db.equipment.findUnique({ where: { id: str(fd, "equipmentId") } });
  if (!e) throw new NotFoundError();
  assertCan(a, "equipment.manage", e.facilityId);
  const interval = int(fd, "intervalDays");
  if (!(interval > 0)) throw new AppError("Enter an interval in days.");
  await db.maintenancePlan.create({ data: { equipmentId: e.id, task: str(fd, "task"), intervalDays: interval, nextDueAt: date(fd, "nextDueAt") ?? new Date(Date.now() + interval * 86_400_000) } });
  return done(`/admin/equipment/${e.id}`, "Maintenance schedule added.");
});

export const materialAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  const op = str(fd, "op");
  const facilityId = op === "create" ? str(fd, "facilityId") : (await db.materialItem.findUnique({ where: { id: str(fd, "itemId") } }))?.facilityId ?? "";
  assertCan(a, "materials.manage", facilityId);
  if (op === "create") {
    await db.materialItem.create({ data: { facilityId, sku: str(fd, "sku").toUpperCase(), name: str(fd, "name"), kind: str(fd, "kind"), unit: str(fd, "unit"), reorderLevel: Number(str(fd, "reorderLevel")) || 0, unitCost: int(fd, "unitCost") || 0 } });
  } else {
    const delta = Number(str(fd, "delta"));
    if (!Number.isFinite(delta) || delta === 0) throw new AppError("Enter a quantity.");
    const sign = op === "consume" ? -1 : 1;
    const order = optStr(fd, "orderRef") ? await db.bulkOrder.findUnique({ where: { reference: str(fd, "orderRef") } }) : null;
    if (optStr(fd, "orderRef") && !order) throw new AppError("Order reference not found.");
    await db.$transaction(async (tx) => {
      const item = await tx.materialItem.update({ where: { id: str(fd, "itemId") }, data: { quantity: { increment: sign * Math.abs(delta) } } });
      if (item.quantity < 0) throw new AppError("Not enough stock for that consumption.");
      await tx.materialMovement.create({ data: { itemId: item.id, orderId: order?.id ?? null, delta: sign * Math.abs(delta), reason: str(fd, "reason") || (sign > 0 ? "Receipt" : "Consumption"), actorId: a.userId } });
    });
  }
  await audit({ actorId: a.userId, action: `materials.${op}`, entityType: "MaterialItem", entityId: str(fd, "itemId") || str(fd, "sku"), facilityId });
  return done("/admin/materials");
});

// ─── Production ─────────────────────────────────────────────────────────────
export const orderStatusAction = safeAction(async (_s: unknown, fd: FormData) => {
  await updateOrderStatus(await actor(), str(fd, "orderId"), str(fd, "to") as ProductionStatus, optStr(fd, "note"), !bool(fd, "internal"));
  return done(`/admin/production/orders/${str(fd, "orderId")}`, "Status updated.");
});
export const quotationAction = safeAction(async (_s: unknown, fd: FormData) => {
  const garments = list(fd, "lineGarment");
  const qty = fd.getAll("lineQty").map((x) => Number(x));
  const price = fd.getAll("linePrice").map((x) => Number(String(x).replace(/,/g, "")));
  await createQuotation(await actor(), str(fd, "orderId"), {
    lines: garments.map((g, i) => ({ garmentType: g, quantity: qty[i], unitPrice: price[i] })).filter((l) => l.garmentType && l.quantity > 0),
    materialCost: int(fd, "materialCost") || 0, labourCost: int(fd, "labourCost") || 0, brandingCost: int(fd, "brandingCost") || 0, logisticsCost: int(fd, "logisticsCost") || 0,
    taxPercent: Number(str(fd, "taxPercent")) || 0, depositPercent: int(fd, "depositPercent"), timelineDays: int(fd, "timelineDays") || 14, paymentTerms: str(fd, "paymentTerms"), validDays: int(fd, "validDays") || 14, notes: optStr(fd, "notes"),
  });
  return done(`/admin/production/orders/${str(fd, "orderId")}`, "Quotation drafted. Review and send it to the customer.");
});
export const sendQuotationAction = safeAction(async (_s: unknown, fd: FormData) => {
  await sendQuotation(await actor(), str(fd, "quotationId"));
  return done(`/admin/production/orders/${str(fd, "orderId")}`, "Quotation sent to the customer.");
});
export const jobAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  const id = optStr(fd, "id");
  if (id) {
    await updateJob(a, id, { defaultRate: int(fd, "defaultRate"), openToMarketplace: bool(fd, "openToMarketplace"), facilityId: optStr(fd, "facilityId") ?? null, dueDate: date(fd, "dueDate"), status: (optStr(fd, "status") as never) ?? undefined });
    return done(`/admin/production/jobs/${id}`);
  }
  const j = await createJob(a, { title: str(fd, "title"), garmentType: str(fd, "garmentType"), description: str(fd, "description"), totalQuantity: int(fd, "totalQuantity"), defaultRate: int(fd, "defaultRate") || 0, dueDate: date(fd, "dueDate"), facilityId: optStr(fd, "facilityId") ?? null, openToMarketplace: bool(fd, "openToMarketplace") });
  kickDispatch();
  redirect(`/admin/production/jobs/${j.id}`);
});
export const allocateAction = safeAction(async (_s: unknown, fd: FormData) => {
  const kind = str(fd, "assigneeType");
  await allocate(await actor(), str(fd, "jobId"), { tailorId: kind === "tailor" ? str(fd, "tailorId") : undefined, teamId: kind === "team" ? str(fd, "teamId") : undefined, partnerName: kind === "partner" ? str(fd, "partnerName") : undefined, quantity: int(fd, "quantity"), rate: int(fd, "rate"), dueDate: date(fd, "dueDate") });
  return done(`/admin/production/jobs/${str(fd, "jobId")}`, "Allocated.");
});
export const jobApplicationAction = safeAction(async (_s: unknown, fd: FormData) => {
  await decideJobApplication(await actor(), str(fd, "applicationId"), str(fd, "decision") === "accept", optInt(fd, "quantity") ?? undefined, optInt(fd, "rate") ?? undefined);
  return done(`/admin/production/jobs/${str(fd, "jobId")}`);
});
export const inspectionAction = safeAction(async (_s: unknown, fd: FormData) => {
  await recordInspection(await actor(), str(fd, "submissionId"), { inspectedQty: int(fd, "inspectedQty"), acceptedQty: int(fd, "acceptedQty"), rejectedQty: int(fd, "rejectedQty") || 0, reworkQty: int(fd, "reworkQty") || 0, defects: str(fd, "defects").split(",").map((s) => s.trim()).filter(Boolean), reworkNotes: optStr(fd, "reworkNotes") });
  return done("/admin/production/qc", "Inspection recorded.");
});
export const approveEarningsAction = safeAction(async (_s: unknown, fd: FormData) => {
  const n = await approveEarnings(await actor(), list(fd, "earningIds"));
  return done("/admin/production/earnings", `${n} earning(s) approved.`);
});
export const payEarningsAction = safeAction(async (_s: unknown, fd: FormData) => {
  const n = await markEarningsPaid(await actor(), list(fd, "earningIds"), str(fd, "payoutRef"));
  return done("/admin/production/earnings", `${n} earning(s) marked paid.`);
});
export const teamAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  assertCan(a, "production.manage");
  const op = str(fd, "op");
  if (op === "create") await db.tailorTeam.create({ data: { name: str(fd, "name") } });
  if (op === "add") await db.teamMember.create({ data: { teamId: str(fd, "teamId"), tailorId: str(fd, "tailorId") } }).catch(() => { throw new AppError("Already a member."); });
  if (op === "remove") await db.teamMember.delete({ where: { teamId_tailorId: { teamId: str(fd, "teamId"), tailorId: str(fd, "tailorId") } } });
  await audit({ actorId: a.userId, action: `team.${op}`, entityType: "TailorTeam", entityId: str(fd, "teamId") || str(fd, "name") });
  return done("/admin/tailors");
});
export const tailorVerificationAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  assertCan(a, "tailors.review");
  await db.tailor.update({ where: { id: str(fd, "tailorId") }, data: { verification: str(fd, "verification") as never, facilityId: optStr(fd, "facilityId") ?? undefined } });
  await audit({ actorId: a.userId, action: "tailor.verification", entityType: "Tailor", entityId: str(fd, "tailorId"), data: { verification: str(fd, "verification") } });
  return done("/admin/tailors");
});

// ─── Tailor applications & memberships ─────────────────────────────────────
export const tailorAppStatusAction = safeAction(async (_s: unknown, fd: FormData) => {
  const at = str(fd, "assessmentDate") ? localToUtc(str(fd, "assessmentDate"), str(fd, "assessmentTime") || "10:00") : undefined;
  await moveTailorApplication(await actor(), str(fd, "applicationId"), str(fd, "to") as TailorApplicationStatus, { note: optStr(fd, "note"), assessmentAt: at, facilityId: optStr(fd, "facilityId") });
  return done(`/admin/tailors/applications/${str(fd, "applicationId")}`, "Application updated and applicant notified.");
});
export const tailorAppCommentAction = safeAction(async (_s: unknown, fd: FormData) => {
  await commentOnApplication(await actor(), str(fd, "applicationId"), str(fd, "body"));
  return done(`/admin/tailors/applications/${str(fd, "applicationId")}`, "Comment added.");
});
export const membershipAction = safeAction(async (_s: unknown, fd: FormData) => {
  await manageMembership(await actor(), str(fd, "membershipId"), str(fd, "op") as never, optStr(fd, "note"));
  return done("/admin/memberships");
});
export const membershipPlanAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  assertCan(a, "memberships.manage");
  const id = optStr(fd, "id");
  const data = { name: str(fd, "name"), description: str(fd, "description"), fee: int(fd, "fee"), validityDays: int(fd, "validityDays"), benefits: str(fd, "benefits").split("\n").map((s) => s.trim()).filter(Boolean), workspaceAccess: str(fd, "workspaceAccess"), machineAccess: str(fd, "machineAccess"), bookingDiscountPct: int(fd, "bookingDiscountPct") || 0, productionEligible: bool(fd, "productionEligible"), renewalTerms: optStr(fd, "renewalTerms") ?? null, audience: str(fd, "audience") || "TAILOR", active: bool(fd, "active"), sortOrder: int(fd, "sortOrder") || 0 };
  if (!data.name || !(data.fee >= 0) || !(data.validityDays > 0)) throw new AppError("Name, fee and validity are required.");
  const p = id ? await db.membershipPlan.update({ where: { id }, data }) : await db.membershipPlan.create({ data: { ...data, slug: data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") } });
  await audit({ actorId: a.userId, action: "membership_plan.save", entityType: "MembershipPlan", entityId: p.id, data });
  return done("/admin/memberships", "Plan saved.");
});

// ─── Academy ────────────────────────────────────────────────────────────────
export const courseAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  assertCan(a, "academy.manage");
  const id = optStr(fd, "id");
  const img = files(fd, "image")[0];
  const up = img ? await saveUpload(img, { ownerId: a.userId, purpose: "CMS", visibility: "PUBLIC" }) : null;
  const outline = str(fd, "outline").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [title, rest] = l.split(":"); return { title: title.trim(), topics: (rest ?? "").split(",").map((t) => t.trim()).filter(Boolean) }; });
  const data = {
    title: str(fd, "title"), summary: str(fd, "summary"), description: str(fd, "description"), level: str(fd, "level"), durationWeeks: int(fd, "durationWeeks"), objectives: str(fd, "objectives").split("\n").map((s) => s.trim()).filter(Boolean),
    requirements: str(fd, "requirements").split("\n").map((s) => s.trim()).filter(Boolean), outline, format: str(fd, "format"), fee: int(fd, "fee"), applicationFee: int(fd, "applicationFee") || 0, certification: str(fd, "certification"),
    instructorId: optStr(fd, "instructorId") ?? null, published: bool(fd, "published"), sortOrder: int(fd, "sortOrder") || 0, ...(up ? { imageUploadId: up.id } : {}),
  };
  if (!data.title || !(data.durationWeeks > 0) || !(data.fee >= 0)) throw new AppError("Title, duration and fee are required.");
  const c = id ? await db.course.update({ where: { id }, data }) : await db.course.create({ data: { ...data, slug: str(fd, "slug") || data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "") } });
  await audit({ actorId: a.userId, action: id ? "course.update" : "course.create", entityType: "Course", entityId: c.id, data: { title: c.title, published: c.published } });
  if (!id) redirect(`/admin/academy/courses/${c.id}`);
  return done(`/admin/academy/courses/${c.id}`);
});
export const sessionAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  assertCan(a, "academy.manage");
  const id = optStr(fd, "id");
  const data = { courseId: str(fd, "courseId"), facilityId: str(fd, "facilityId"), name: str(fd, "name"), startsOn: date(fd, "startsOn")!, endsOn: date(fd, "endsOn")!, schedule: str(fd, "schedule"), applicationDeadline: date(fd, "applicationDeadline")!, capacity: int(fd, "capacity"), feeOverride: optInt(fd, "feeOverride"), instructorId: optStr(fd, "instructorId") ?? null, open: bool(fd, "open") };
  if (!data.startsOn || !data.endsOn || !data.applicationDeadline || !(data.capacity > 0)) throw new AppError("Dates and capacity are required.");
  const s = id ? await db.courseSession.update({ where: { id }, data }) : await db.courseSession.create({ data });
  await audit({ actorId: a.userId, action: "course_session.save", entityType: "CourseSession", entityId: s.id, data });
  return done(`/admin/academy/courses/${data.courseId}`, "Session saved.");
});
export const resourceAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  assertCan(a, "academy.manage");
  const f = files(fd, "file")[0];
  const up = f ? await saveUpload(f, { ownerId: a.userId, purpose: "COURSE" }) : null;
  if (!up && !optStr(fd, "url")) throw new AppError("Upload a file or enter a link.");
  await db.learningResource.create({ data: { courseId: str(fd, "courseId"), title: str(fd, "title"), kind: up ? (up.mimeType.startsWith("video") ? "VIDEO" : "DOCUMENT") : "LINK", url: optStr(fd, "url") ?? null, uploadId: up?.id ?? null } });
  return done(`/admin/academy/courses/${str(fd, "courseId")}`, "Resource added.");
});
export const instructorAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  assertCan(a, "academy.manage");
  const u = await db.user.findUnique({ where: { email: str(fd, "email").toLowerCase() } });
  if (!u) throw new AppError("The instructor must register an account first.");
  await db.instructor.upsert({ where: { userId: u.id }, create: { userId: u.id, title: optStr(fd, "title") ?? null, specialisms: str(fd, "specialisms").split(",").map((s) => s.trim()).filter(Boolean) }, update: { active: true, title: optStr(fd, "title") ?? null } });
  if (!(await db.userRole.findFirst({ where: { userId: u.id, role: "INSTRUCTOR" } }))) await db.userRole.create({ data: { userId: u.id, role: "INSTRUCTOR" } });
  await audit({ actorId: a.userId, action: "instructor.register", entityType: "User", entityId: u.id });
  return done("/admin/academy/courses", "Instructor registered.");
});
export const studentAppStatusAction = safeAction(async (_s: unknown, fd: FormData) => {
  await moveStudentApplication(await actor(), str(fd, "applicationId"), str(fd, "to") as StudentApplicationStatus, optStr(fd, "note"));
  return done(`/admin/academy/applications/${str(fd, "applicationId")}`, "Application updated and applicant notified.");
});
export const classMeetingAction = safeAction(async (_s: unknown, fd: FormData) => {
  await addClassMeeting(await actor(), str(fd, "sessionId"), date(fd, "date")!, str(fd, "topic"));
  return done(`/admin/academy/teaching/${str(fd, "sessionId")}`, "Class added.");
});
export const attendanceAction = safeAction(async (_s: unknown, fd: FormData) => {
  const records = list(fd, "enrolmentId").map((id) => ({ enrolmentId: id, status: (str(fd, `status_${id}`) || "PRESENT") as "PRESENT" }));
  await recordAttendance(await actor(), str(fd, "meetingId"), records);
  return done(`/admin/academy/teaching/${str(fd, "sessionId")}`, "Attendance saved.");
});
export const assignmentAction = safeAction(async (_s: unknown, fd: FormData) => {
  await createAssignment(await actor(), str(fd, "sessionId"), { title: str(fd, "title"), brief: str(fd, "brief"), dueAt: date(fd, "dueAt")!, maxScore: int(fd, "maxScore") || 100 });
  return done(`/admin/academy/teaching/${str(fd, "sessionId")}`, "Assignment published.");
});
export const gradeAction = safeAction(async (_s: unknown, fd: FormData) => {
  await gradeSubmission(await actor(), str(fd, "submissionId"), int(fd, "score"), optStr(fd, "feedback"));
  return done(`/admin/academy/teaching/${str(fd, "sessionId")}`, "Graded.");
});
export const assessmentAction = safeAction(async (_s: unknown, fd: FormData) => {
  await recordAssessment(await actor(), str(fd, "enrolmentId"), { title: str(fd, "title"), score: Number(str(fd, "score")), maxScore: Number(str(fd, "maxScore")) || 100, remarks: optStr(fd, "remarks") });
  return done(`/admin/academy/teaching/${str(fd, "sessionId")}`, "Assessment recorded.");
});
export const completeEnrolmentAction = safeAction(async (_s: unknown, fd: FormData) => {
  await completeEnrolment(await actor(), str(fd, "enrolmentId"));
  return done(`/admin/academy/teaching/${str(fd, "sessionId")}`, "Programme completed.");
});
export const issueCertificateAction = safeAction(async (_s: unknown, fd: FormData) => {
  const c = await issueCertificate(await actor(), str(fd, "enrolmentId"));
  return done(`/admin/academy/teaching/${str(fd, "sessionId")}`, `Certificate ${c.code} issued.`);
});
export const revokeCertificateAction = safeAction(async (_s: unknown, fd: FormData) => {
  await revokeCertificate(await actor(), str(fd, "certificateId"), str(fd, "reason") || "Revoked");
  return done("/admin/academy/certificates", "Certificate revoked.");
});

// ─── Finance ───────────────────────────────────────────────────────────────
export const manualPaymentAction = safeAction(async (_s: unknown, fd: FormData) => {
  await recordManualPayment(await actor(), str(fd, "invoiceId"), { amount: int(fd, "amount"), method: str(fd, "method"), note: optStr(fd, "note") });
  return done(`/admin/finance/invoices/${str(fd, "invoiceId")}`, "Payment recorded.");
});
export const refundAction = safeAction(async (_s: unknown, fd: FormData) => {
  await recordRefund(await actor(), str(fd, "invoiceId"), { amount: int(fd, "amount"), method: str(fd, "method"), reason: str(fd, "reason") });
  return done(`/admin/finance/invoices/${str(fd, "invoiceId")}`, "Refund recorded.");
});
export const voidInvoiceAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  assertCan(a, "finance.record");
  const inv = await db.invoice.findUnique({ where: { id: str(fd, "invoiceId") } });
  if (!inv) throw new NotFoundError();
  if (inv.amountPaid > 0) throw new AppError("Invoices with payments cannot be voided. Record a refund instead.");
  await db.invoice.update({ where: { id: inv.id }, data: { status: "VOID" } });
  await audit({ actorId: a.userId, action: "invoice.void", entityType: "Invoice", entityId: inv.id, data: { reason: str(fd, "reason") } });
  return done(`/admin/finance/invoices/${inv.id}`, "Invoice voided.");
});

// ─── Enquiries ─────────────────────────────────────────────────────────────
export const enquiryAdminAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  assertCan(a, "enquiries.manage");
  const e = await db.enquiry.update({ where: { id: str(fd, "id") }, data: { status: str(fd, "status"), response: optStr(fd, "response") ?? undefined, handledById: a.userId } });
  if (optStr(fd, "response") && bool(fd, "send")) await notify({ email: e.email, kind: "enquiry.reply", title: `Re: your enquiry ${e.reference}`, body: str(fd, "response"), channels: ["EMAIL"] });
  await audit({ actorId: a.userId, action: "enquiry.update", entityType: "Enquiry", entityId: e.id, data: { status: e.status } });
  return done("/admin/enquiries", "Enquiry updated.");
});

// ─── CMS ───────────────────────────────────────────────────────────────────
async function cmsActor() {
  const a = await actor();
  assertCan(a, "cms.manage");
  return a;
}
export const contentAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await cmsActor();
  const key = str(fd, "key");
  let value: unknown;
  if (key === "stats") {
    value = list(fd, "statKey").map((k) => ({ key: k, label: str(fd, `label_${k}`), mode: str(fd, `mode_${k}`), value: optInt(fd, `value_${k}`), suffix: optStr(fd, `suffix_${k}`) }));
  } else {
    const fields = list(fd, "fields");
    value = Object.fromEntries(fields.map((f) => [f, str(fd, f)]));
  }
  await db.siteContent.upsert({ where: { key }, create: { key, value: value as never, updatedById: a.userId }, update: { value: value as never, updatedById: a.userId } });
  await audit({ actorId: a.userId, action: "cms.content", entityType: "SiteContent", entityId: key });
  revalidatePath("/", "layout");
  return { message: "Content published." };
});
export const imageSlotAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await cmsActor();
  const slot = str(fd, "slot");
  const f = files(fd, "image")[0];
  const current = ((await db.siteContent.findUnique({ where: { key: "images" } }))?.value ?? {}) as Record<string, string | null>;
  if (bool(fd, "clear")) current[slot] = null;
  else {
    if (!f) throw new AppError("Choose an image.");
    const up = await saveUpload(f, { ownerId: a.userId, purpose: "CMS", visibility: "PUBLIC" });
    current[slot] = up.id;
  }
  await db.siteContent.upsert({ where: { key: "images" }, create: { key: "images", value: current, updatedById: a.userId }, update: { value: current, updatedById: a.userId } });
  await audit({ actorId: a.userId, action: "cms.image", entityType: "SiteContent", entityId: `images.${slot}` });
  revalidatePath("/", "layout");
  return { message: "Image updated." };
});
export const testimonialAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await cmsActor();
  const id = optStr(fd, "id");
  if (bool(fd, "delete") && id) await db.testimonial.delete({ where: { id } });
  else {
    const data = { quote: str(fd, "quote"), author: str(fd, "author"), role: optStr(fd, "role") ?? null, published: bool(fd, "published"), sortOrder: int(fd, "sortOrder") || 0 };
    if (!data.quote || !data.author) throw new AppError("Quote and author are required.");
    if (id) await db.testimonial.update({ where: { id }, data });
    else await db.testimonial.create({ data });
  }
  await audit({ actorId: a.userId, action: "cms.testimonial", entityType: "Testimonial", entityId: id ?? "new" });
  revalidatePath("/", "layout");
  return { message: "Saved." };
});
export const faqAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await cmsActor();
  const id = optStr(fd, "id");
  if (bool(fd, "delete") && id) await db.faq.delete({ where: { id } });
  else {
    const data = { category: str(fd, "category"), question: str(fd, "question"), answer: str(fd, "answer"), published: bool(fd, "published"), sortOrder: int(fd, "sortOrder") || 0 };
    if (id) await db.faq.update({ where: { id }, data });
    else await db.faq.create({ data });
  }
  await audit({ actorId: a.userId, action: "cms.faq", entityType: "Faq", entityId: id ?? "new" });
  revalidatePath("/", "layout");
  return { message: "Saved." };
});
export const blogAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await cmsActor();
  const id = optStr(fd, "id");
  const published = bool(fd, "published");
  const data = { title: str(fd, "title"), slug: str(fd, "slug").toLowerCase().replace(/[^a-z0-9-]+/g, "-"), excerpt: str(fd, "excerpt"), body: str(fd, "body"), category: str(fd, "category"), authorName: str(fd, "authorName") || "StitchWorks Collective", published };
  if (!data.title || !data.slug) throw new AppError("Title and slug are required.");
  const existing = id ? await db.blogPost.findUnique({ where: { id } }) : null;
  const p = id ? await db.blogPost.update({ where: { id }, data: { ...data, publishedAt: published ? existing?.publishedAt ?? new Date() : null } }) : await db.blogPost.create({ data: { ...data, publishedAt: published ? new Date() : null } });
  await audit({ actorId: a.userId, action: "cms.blog", entityType: "BlogPost", entityId: p.id });
  revalidatePath("/blog");
  return { message: "Post saved." };
});
export const announcementAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await cmsActor();
  const id = optStr(fd, "id");
  if (id) await db.announcement.update({ where: { id }, data: { active: bool(fd, "active") } });
  else await db.announcement.create({ data: { message: str(fd, "message"), link: optStr(fd, "link") ?? null, endsAt: date(fd, "endsAt") } });
  await audit({ actorId: a.userId, action: "cms.announcement", entityType: "Announcement", entityId: id ?? "new" });
  revalidatePath("/", "layout");
  return { message: "Saved." };
});
export const policyAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await cmsActor();
  const slug = str(fd, "slug");
  await db.policy.upsert({ where: { slug }, create: { slug, title: str(fd, "title"), body: str(fd, "body") }, update: { title: str(fd, "title"), body: str(fd, "body") } });
  await audit({ actorId: a.userId, action: "cms.policy", entityType: "Policy", entityId: slug });
  revalidatePath(`/policies/${slug}`);
  return { message: "Policy published." };
});

// ─── Users & roles ─────────────────────────────────────────────────────────
export const roleAction = safeAction(async (_s: unknown, fd: FormData) => {
  const a = await actor();
  assertCan(a, "users.manage");
  const userId = str(fd, "userId");
  const op = str(fd, "op");
  if (op === "grant") {
    const role = str(fd, "role") as Role;
    const facilityId = optStr(fd, "facilityId") ?? null;
    const exists = await db.userRole.findFirst({ where: { userId, role, facilityId } });
    if (!exists) await db.userRole.create({ data: { userId, role, facilityId } });
    await audit({ actorId: a.userId, action: "role.grant", entityType: "User", entityId: userId, data: { role, facilityId } });
  } else if (op === "revoke") {
    const r = await db.userRole.findUnique({ where: { id: str(fd, "roleId") } });
    if (r?.role === "SUPER_ADMIN" && r.userId === a.userId) throw new AppError("You cannot remove your own super-admin role.");
    if (r?.role === "SUPER_ADMIN" && (await db.userRole.count({ where: { role: "SUPER_ADMIN" } })) <= 1) throw new AppError("At least one super administrator must remain.");
    await db.userRole.delete({ where: { id: str(fd, "roleId") } });
    await audit({ actorId: a.userId, action: "role.revoke", entityType: "User", entityId: userId, data: { role: r?.role } });
  } else if (op === "disable" || op === "enable") {
    if (userId === a.userId) throw new AppError("You cannot disable your own account.");
    await db.user.update({ where: { id: userId }, data: { disabledAt: op === "disable" ? new Date() : null } });
    if (op === "disable") await db.session.deleteMany({ where: { userId } });
    await audit({ actorId: a.userId, action: `user.${op}`, entityType: "User", entityId: userId });
  }
  return done(`/admin/users/${userId}`, "Updated.");
});

export async function canAny(perm: Parameters<typeof can>[1]) {
  return can((await requireUser()).actor, perm);
}
