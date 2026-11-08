import type { BookingDuration, BookingStatus, Prisma } from "@prisma/client";
import { db, type Tx } from "../db";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { buildSpans, type OperatingHours, type Span, type WindowRequest } from "./windows";
import { quoteBooking, type PricedResource, type Rates } from "./pricing";
import { makeReference } from "../references";
import { createInvoice, outstanding } from "../payments/invoices";
import { audit } from "../audit";
import { notify, notifyStaff } from "../notifications";
import { can, type Actor } from "../auth/rbac";
import { fmtDateTime, naira } from "../format";

/** Statuses whose items hold inventory. */
export const ACTIVE_STATUSES: BookingStatus[] = ["PENDING_PAYMENT", "PENDING_APPROVAL", "CONFIRMED", "CHECKED_IN"];
const BLOCKING_EQUIPMENT_STATUS = ["UNDER_MAINTENANCE", "OUT_OF_SERVICE", "RETIRED"] as const;

export type BookingRequest = WindowRequest & {
  facilityId: string;
  equipmentIds: string[];
  workstationIds: string[];
  notes?: string;
};

/** Releases inventory held by unpaid bookings whose payment window has lapsed. */
export async function expireStaleHolds(tx: Tx | typeof db = db, now = new Date()) {
  const stale = await tx.booking.findMany({
    where: { status: "PENDING_PAYMENT", holdExpiresAt: { lt: now } },
    select: { id: true, customerId: true, reference: true },
  });
  if (!stale.length) return 0;
  const ids = stale.map((b) => b.id);
  await tx.bookingItem.updateMany({ where: { bookingId: { in: ids } }, data: { active: false } });
  await tx.booking.updateMany({ where: { id: { in: ids }, status: "PENDING_PAYMENT" }, data: { status: "EXPIRED" } });
  await tx.invoice.updateMany({ where: { bookingId: { in: ids }, amountPaid: 0, status: "ISSUED" }, data: { status: "VOID" } });
  for (const b of stale) {
    await notify({ userId: b.customerId, kind: "booking.expired", title: `Booking ${b.reference} expired`, body: "Payment was not completed in time, so the reserved equipment has been released. You can make a new booking at any time.", link: "/book", channels: ["EMAIL"] }, tx);
  }
  return stale.length;
}

async function memberDiscountPct(tx: Tx | typeof db, userId: string): Promise<number> {
  const m = await tx.membership.findMany({
    where: { userId, status: "ACTIVE", expiresAt: { gt: new Date() } },
    include: { plan: { select: { bookingDiscountPct: true } } },
  });
  return m.reduce((max, x) => Math.max(max, x.plan.bookingDiscountPct), 0);
}

type LoadedResources = {
  facility: NonNullable<Awaited<ReturnType<typeof loadFacility>>>;
  priced: (PricedResource & { equipmentId?: string; workstationId?: string })[];
};

async function loadFacility(tx: Tx | typeof db, facilityId: string) {
  return tx.facility.findFirst({ where: { id: facilityId, active: true } });
}

async function loadResources(tx: Tx | typeof db, req: Pick<BookingRequest, "facilityId" | "equipmentIds" | "workstationIds">): Promise<LoadedResources> {
  const facility = await loadFacility(tx, req.facilityId);
  if (!facility) throw new NotFoundError("Facility not found.");
  const equipmentIds = [...new Set(req.equipmentIds)];
  const workstationIds = [...new Set(req.workstationIds)];
  if (!equipmentIds.length && !workstationIds.length) throw new AppError("Select at least one workstation or machine.");
  if (equipmentIds.length + workstationIds.length > 30) throw new AppError("A single booking can include at most 30 items.");

  const equipment = await tx.equipment.findMany({ where: { id: { in: equipmentIds } }, include: { category: true } });
  const workstations = await tx.workstation.findMany({ where: { id: { in: workstationIds } } });
  if (equipment.length !== equipmentIds.length || workstations.length !== workstationIds.length) throw new AppError("One or more selected items no longer exist.");

  const rateCards = await tx.rateCard.findMany({ where: { facilityId: facility.id } });
  const priced: LoadedResources["priced"] = [];
  for (const e of equipment) {
    if (e.facilityId !== facility.id) throw new AppError(`${e.name} is not located at ${facility.name}.`);
    if (!e.bookable || !e.category.active) throw new AppError(`${e.name} is not available for booking.`);
    if ((BLOCKING_EQUIPMENT_STATUS as readonly string[]).includes(e.status)) throw new ConflictError(`${e.name} (${e.assetTag}) is currently ${e.status.replace(/_/g, " ").toLowerCase()} and cannot be booked.`);
    const card = rateCards.find((r) => r.categoryId === e.categoryId);
    const rates: Rates | null =
      e.hourlyRate != null && e.halfDayRate != null && e.fullDayRate != null
        ? { hourlyRate: e.hourlyRate, halfDayRate: e.halfDayRate, fullDayRate: e.fullDayRate, multiDayRate: e.multiDayRate }
        : card
          ? { hourlyRate: card.hourlyRate, halfDayRate: card.halfDayRate, fullDayRate: card.fullDayRate, multiDayRate: card.multiDayRate }
          : null;
    if (!rates) throw new AppError(`${e.name} has no rental rate configured yet. Please contact the facility.`);
    priced.push({ key: e.id, equipmentId: e.id, label: `${e.name} (${e.assetTag})`, rates, securityDeposit: card?.securityDeposit ?? 0 });
  }
  for (const w of workstations) {
    if (w.facilityId !== facility.id) throw new AppError(`${w.name} is not located at ${facility.name}.`);
    if (!w.active) throw new AppError(`${w.name} is not available for booking.`);
    priced.push({ key: w.id, workstationId: w.id, label: `${w.name} (${w.code})`, rates: { hourlyRate: w.hourlyRate, halfDayRate: w.halfDayRate, fullDayRate: w.fullDayRate, multiDayRate: w.multiDayRate }, securityDeposit: 0 });
  }
  return { facility, priced };
}

function rulesOf(f: { operatingHours: unknown; minBookingHours: number; maxAdvanceDays: number; maxConsecutiveDays: number }) {
  return { operatingHours: f.operatingHours as OperatingHours, minBookingHours: f.minBookingHours, maxAdvanceDays: f.maxAdvanceDays, maxConsecutiveDays: f.maxConsecutiveDays };
}

/** Returns conflicts for the given resources and spans (bookings and maintenance). */
export async function findConflicts(
  tx: Tx | typeof db,
  resources: { equipmentIds: string[]; workstationIds: string[] },
  spans: Span[],
  excludeBookingId?: string,
) {
  const or = spans.map((s) => ({ startsAt: { lt: s.endsAt }, endsAt: { gt: s.startsAt } }));
  const resourceFilter: Prisma.BookingItemWhereInput[] = [];
  if (resources.equipmentIds.length) resourceFilter.push({ equipmentId: { in: resources.equipmentIds } });
  if (resources.workstationIds.length) resourceFilter.push({ workstationId: { in: resources.workstationIds } });
  const bookingClashes = await tx.bookingItem.findMany({
    where: { active: true, OR: resourceFilter, AND: [{ OR: or }], ...(excludeBookingId ? { bookingId: { not: excludeBookingId } } : {}) },
    select: { equipmentId: true, workstationId: true, startsAt: true, endsAt: true },
  });
  const mFilter: Prisma.MaintenanceWindowWhereInput[] = [];
  if (resources.equipmentIds.length) mFilter.push({ equipmentId: { in: resources.equipmentIds } });
  if (resources.workstationIds.length) mFilter.push({ workstationId: { in: resources.workstationIds } });
  const maintenance = await tx.maintenanceWindow.findMany({
    where: { OR: mFilter, AND: [{ OR: or }] },
    select: { equipmentId: true, workstationId: true, startsAt: true, endsAt: true, reason: true },
  });
  return { bookingClashes, maintenance };
}

/** Price preview without reserving anything (used by the booking UI). */
export async function previewBooking(userId: string | null, req: BookingRequest, now = new Date()) {
  const { facility, priced } = await loadResources(db, req);
  const { spans, hours, days } = buildSpans(req, rulesOf(facility), now);
  const discountPct = userId ? await memberDiscountPct(db, userId) : 0;
  const quote = quoteBooking({ durationType: req.durationType, hours, days, resources: priced, memberDiscountPct: discountPct, depositPercent: facility.depositPercent });
  const equipmentIds = priced.filter((p) => p.equipmentId).map((p) => p.equipmentId!);
  const workstationIds = priced.filter((p) => p.workstationId).map((p) => p.workstationId!);
  const conflicts = await findConflicts(db, { equipmentIds, workstationIds }, spans);
  const unavailable = new Set([...conflicts.bookingClashes, ...conflicts.maintenance].map((c) => c.equipmentId ?? c.workstationId!));
  return { quote, spans, discountPct, unavailable: [...unavailable], requiresApproval: facility.requiresApproval };
}

function describeConflict(priced: LoadedResources["priced"], ids: string[]) {
  return priced.filter((p) => ids.includes(p.key)).map((p) => p.label).join(", ");
}

/**
 * Creates a reservation. All validation is repeated server-side inside a
 * transaction; equipment rows are locked, and the database EXCLUDE constraint is
 * the final guard against double booking under concurrency.
 */
export async function createBooking(actor: Actor, req: BookingRequest, opts: { now?: Date; onBehalfOfUserId?: string } = {}) {
  const now = opts.now ?? new Date();
  let customerId = actor.userId;
  if (opts.onBehalfOfUserId && opts.onBehalfOfUserId !== actor.userId) {
    if (!can(actor, "booking.manage", req.facilityId)) throw new ForbiddenError();
    customerId = opts.onBehalfOfUserId;
  }
  try {
    const booking = await db.$transaction(
      async (tx) => {
        await expireStaleHolds(tx, now);
        const { facility, priced } = await loadResources(tx, req);
        const { spans, hours, days } = buildSpans(req, rulesOf(facility), now);
        const equipmentIds = priced.filter((p) => p.equipmentId).map((p) => p.equipmentId!);
        const workstationIds = priced.filter((p) => p.workstationId).map((p) => p.workstationId!);

        // Serialise concurrent bookings of the same machines.
        if (equipmentIds.length) await tx.$queryRaw`SELECT id FROM "Equipment" WHERE id = ANY(${equipmentIds}) FOR UPDATE`;
        if (workstationIds.length) await tx.$queryRaw`SELECT id FROM "Workstation" WHERE id = ANY(${workstationIds}) FOR UPDATE`;

        const { bookingClashes, maintenance } = await findConflicts(tx, { equipmentIds, workstationIds }, spans);
        if (maintenance.length) throw new ConflictError(`Unavailable due to scheduled maintenance: ${describeConflict(priced, maintenance.map((m) => m.equipmentId ?? m.workstationId!))}.`);
        if (bookingClashes.length) throw new ConflictError(`Already reserved for the selected time: ${describeConflict(priced, bookingClashes.map((m) => m.equipmentId ?? m.workstationId!))}. Please choose other items or another time.`);

        const quote = quoteBooking({
          durationType: req.durationType,
          hours,
          days,
          resources: priced,
          memberDiscountPct: await memberDiscountPct(tx, customerId),
          depositPercent: facility.depositPercent,
        });

        const status: BookingStatus = facility.requiresApproval ? "PENDING_APPROVAL" : quote.amountDueNow > 0 ? "PENDING_PAYMENT" : "CONFIRMED";
        const reference = await makeReference("BK", tx);
        const booking = await tx.booking.create({
          data: {
            reference,
            customerId,
            facilityId: facility.id,
            status,
            durationType: req.durationType as BookingDuration,
            startsAt: spans[0].startsAt,
            endsAt: spans[spans.length - 1].endsAt,
            days: spans.length,
            subtotal: quote.subtotal,
            discount: quote.discount,
            securityDeposit: quote.securityDeposit,
            total: quote.total,
            amountDueNow: quote.amountDueNow,
            holdExpiresAt: status === "PENDING_PAYMENT" ? new Date(now.getTime() + facility.paymentHoldMinutes * 60_000) : null,
            notes: req.notes?.slice(0, 1000) || null,
            items: {
              create: priced.flatMap((p) => {
                const line = quote.lines.find((l) => l.key === p.key)!;
                return spans.map((s, i) => ({
                  equipmentId: p.equipmentId ?? null,
                  workstationId: p.workstationId ?? null,
                  startsAt: s.startsAt,
                  endsAt: s.endsAt,
                  unitPrice: line.unitPrice,
                  // Attribute the full line total to the first span so sums stay exact.
                  lineTotal: i === 0 ? line.lineTotal : 0,
                  description: line.description,
                }));
              }),
            },
          },
        });
        await createInvoice(tx, {
          userId: customerId,
          purpose: "BOOKING",
          bookingId: booking.id,
          description: `Workspace booking ${reference} at ${facility.name}`,
          amount: quote.total,
          dueDate: spans[0].startsAt,
        });
        await audit({ actorId: actor.userId, action: "booking.create", entityType: "Booking", entityId: booking.id, facilityId: facility.id, data: { reference, status, total: quote.total, onBehalfOf: customerId !== actor.userId ? customerId : undefined } }, tx);

        const when = fmtDateTime(spans[0].startsAt);
        if (status === "CONFIRMED") {
          await notify({ userId: customerId, kind: "booking.confirmed", title: `Booking ${reference} confirmed`, body: `Your reservation at ${facility.name} starting ${when} is confirmed.`, link: `/dashboard/bookings/${booking.id}` }, tx);
        } else if (status === "PENDING_APPROVAL") {
          await notify({ userId: customerId, kind: "booking.received", title: `Booking ${reference} received`, body: `Your request for ${when} is awaiting approval by the facility manager. We will notify you once it is reviewed.`, link: `/dashboard/bookings/${booking.id}`, channels: ["EMAIL"] }, tx);
          await notifyStaff(["FACILITY_MANAGER"], { kind: "booking.approval_needed", title: `Booking ${reference} needs approval`, body: `${priced.length} item(s) for ${when}.`, link: `/admin/bookings/${booking.id}` }, tx);
        } else {
          await notify({ userId: customerId, kind: "booking.pending_payment", title: `Complete payment for ${reference}`, body: `Your items are held for ${facility.paymentHoldMinutes} minutes. Pay ${naira(quote.amountDueNow)} to confirm.`, link: `/dashboard/bookings/${booking.id}`, channels: ["EMAIL"] }, tx);
        }
        return booking;
      },
      { isolationLevel: "ReadCommitted", timeout: 20_000 },
    );
    return booking;
  } catch (e) {
    throw translateDbError(e);
  }
}

export function translateDbError(e: unknown): unknown {
  const msg = String((e as { message?: string })?.message ?? "");
  const code = (e as { code?: string; meta?: { code?: string } })?.code;
  if (msg.includes("23P01") || msg.includes("no_overlap") || code === "P2004") {
    return new ConflictError("Another booking was just made for one of these items at the same time. Please refresh availability and try again.");
  }
  return e;
}

async function loadBookingFor(actor: Actor, bookingId: string, tx: Tx | typeof db = db) {
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { facility: true, invoices: true, items: true } });
  if (!booking) throw new NotFoundError("Booking not found.");
  const isOwner = booking.customerId === actor.userId;
  const isManager = can(actor, "booking.manage", booking.facilityId);
  if (!isOwner && !isManager) throw new NotFoundError("Booking not found."); // do not reveal existence (IDOR)
  return { booking, isOwner, isManager };
}

/** Customer or manager cancellation, applying the facility's cancellation policy. */
export async function cancelBooking(actor: Actor, bookingId: string, reason: string, now = new Date()) {
  return db.$transaction(async (tx) => {
    const { booking, isManager } = await loadBookingFor(actor, bookingId, tx);
    if (!["PENDING_PAYMENT", "PENDING_APPROVAL", "CONFIRMED"].includes(booking.status)) throw new AppError(`A ${booking.status.toLowerCase().replace(/_/g, " ")} booking cannot be cancelled.`);
    if (!isManager && booking.startsAt <= now) throw new AppError("This booking has already started and can no longer be cancelled online. Please contact the facility.");

    const paid = booking.invoices.reduce((s, i) => s + i.amountPaid - i.amountRefunded, 0);
    const hoursBefore = (booking.startsAt.getTime() - now.getTime()) / 3_600_000;
    const freeWindow = hoursBefore >= booking.facility.cancellationHours;
    // Policy: full refund inside free window; otherwise only the security deposit is refundable.
    const refundDue = paid === 0 ? 0 : freeWindow || isManager ? paid : Math.min(paid, booking.securityDeposit);

    await tx.bookingItem.updateMany({ where: { bookingId }, data: { active: false } });
    await tx.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED", cancelledAt: now, cancelReason: reason.slice(0, 500) } });
    for (const inv of booking.invoices) if (inv.amountPaid === 0 && inv.status === "ISSUED") await tx.invoice.update({ where: { id: inv.id }, data: { status: "VOID" } });
    await audit({ actorId: actor.userId, action: "booking.cancel", entityType: "Booking", entityId: bookingId, facilityId: booking.facilityId, data: { reason, refundDue, by: isManager ? "manager" : "customer" } }, tx);
    await notify({ userId: booking.customerId, kind: "booking.cancelled", title: `Booking ${booking.reference} cancelled`, body: refundDue > 0 ? `Your booking has been cancelled. A refund of ${naira(refundDue)} will be processed by our finance team.` : "Your booking has been cancelled." + (paid > 0 ? " Under our cancellation policy this late cancellation is not eligible for a refund of rental charges." : ""), link: `/dashboard/bookings/${bookingId}` }, tx);
    if (refundDue > 0) await notifyStaff(["FINANCE_OFFICER"], { kind: "refund.due", title: `Refund due: ${booking.reference}`, body: `${naira(refundDue)} to be refunded for cancelled booking ${booking.reference}.`, link: `/admin/finance/invoices` }, tx);
    return { refundDue };
  });
}

/** Moves a confirmed booking to a new date/time keeping the same items and duration. */
export async function rescheduleBooking(actor: Actor, bookingId: string, req: Pick<WindowRequest, "date" | "startTime" | "endTime" | "halfDaySlot">, now = new Date()) {
  try {
    return await db.$transaction(async (tx) => {
      const { booking, isManager } = await loadBookingFor(actor, bookingId, tx);
      if (!["CONFIRMED", "PENDING_APPROVAL"].includes(booking.status)) throw new AppError("Only confirmed or pending-approval bookings can be rescheduled.");
      const hoursBefore = (booking.startsAt.getTime() - now.getTime()) / 3_600_000;
      if (!isManager && hoursBefore < booking.facility.cancellationHours) throw new AppError(`Bookings can be rescheduled online up to ${booking.facility.cancellationHours} hours before the start time.`);

      const resources = {
        equipmentIds: [...new Set(booking.items.filter((i) => i.equipmentId).map((i) => i.equipmentId!))],
        workstationIds: [...new Set(booking.items.filter((i) => i.workstationId).map((i) => i.workstationId!))],
      };
      const { spans, hours } = buildSpans({ durationType: booking.durationType, days: booking.days, ...req }, rulesOf(booking.facility), now);
      if (booking.durationType === "HOURLY") {
        const oldHours = (booking.endsAt.getTime() - booking.startsAt.getTime()) / 3_600_000;
        if (Math.abs(oldHours - hours) > 0.01) throw new AppError(`Keep the same length (${oldHours} hours) when rescheduling, or cancel and make a new booking.`);
      }
      if (resources.equipmentIds.length) await tx.$queryRaw`SELECT id FROM "Equipment" WHERE id = ANY(${resources.equipmentIds}) FOR UPDATE`;
      const eq = await tx.equipment.findMany({ where: { id: { in: resources.equipmentIds } } });
      const blocked = eq.find((e) => (BLOCKING_EQUIPMENT_STATUS as readonly string[]).includes(e.status));
      if (blocked) throw new ConflictError(`${blocked.name} is currently unavailable.`);
      const { bookingClashes, maintenance } = await findConflicts(tx, resources, spans, bookingId);
      if (bookingClashes.length || maintenance.length) throw new ConflictError("Some of your items are not available at the new time. Please choose another time.");

      // Rewrite items: deactivate, retime, reactivate (the EXCLUDE constraint validates the result).
      const oldItems = booking.items;
      await tx.bookingItem.deleteMany({ where: { bookingId } });
      const groups = new Map<string, (typeof oldItems)[number]>();
      for (const it of oldItems) groups.set(it.equipmentId ?? it.workstationId!, groups.get(it.equipmentId ?? it.workstationId!) ?? it);
      for (const it of groups.values()) {
        const lineTotal = oldItems.filter((o) => (o.equipmentId ?? o.workstationId) === (it.equipmentId ?? it.workstationId)).reduce((s, o) => s + o.lineTotal, 0);
        await tx.bookingItem.createMany({
          data: spans.map((s, i) => ({ bookingId, equipmentId: it.equipmentId, workstationId: it.workstationId, startsAt: s.startsAt, endsAt: s.endsAt, unitPrice: it.unitPrice, lineTotal: i === 0 ? lineTotal : 0, description: it.description })),
        });
      }
      const updated = await tx.booking.update({ where: { id: bookingId }, data: { startsAt: spans[0].startsAt, endsAt: spans[spans.length - 1].endsAt, remindedAt: null } });
      await audit({ actorId: actor.userId, action: "booking.reschedule", entityType: "Booking", entityId: bookingId, facilityId: booking.facilityId, data: { from: booking.startsAt, to: spans[0].startsAt } }, tx);
      await notify({ userId: booking.customerId, kind: "booking.rescheduled", title: `Booking ${booking.reference} rescheduled`, body: `Your booking now starts ${fmtDateTime(spans[0].startsAt)}.`, link: `/dashboard/bookings/${bookingId}` }, tx);
      return updated;
    });
  } catch (e) {
    throw translateDbError(e);
  }
}

/** Manager decision on a booking that requires approval. */
export async function decideBooking(actor: Actor, bookingId: string, decision: "APPROVE" | "APPROVE_PAY_ON_ARRIVAL" | "REJECT", note?: string, now = new Date()) {
  return db.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { facility: true, invoices: true } });
    if (!booking) throw new NotFoundError();
    if (!can(actor, "booking.manage", booking.facilityId)) throw new ForbiddenError();
    if (booking.status !== "PENDING_APPROVAL") throw new AppError("Only bookings awaiting approval can be approved or rejected.");
    let status: BookingStatus;
    if (decision === "REJECT") {
      status = "REJECTED";
      await tx.bookingItem.updateMany({ where: { bookingId }, data: { active: false } });
      await tx.invoice.updateMany({ where: { bookingId, amountPaid: 0 }, data: { status: "VOID" } });
    } else if (decision === "APPROVE_PAY_ON_ARRIVAL" || booking.amountDueNow === 0) {
      status = "CONFIRMED"; // invoice remains outstanding; NOT treated as paid
    } else {
      status = "PENDING_PAYMENT";
    }
    await tx.booking.update({
      where: { id: bookingId },
      data: { status, adminNote: note ?? null, holdExpiresAt: status === "PENDING_PAYMENT" ? new Date(now.getTime() + Math.max(booking.facility.paymentHoldMinutes, 24 * 60) * 60_000) : null },
    });
    await audit({ actorId: actor.userId, action: `booking.${decision.toLowerCase()}`, entityType: "Booking", entityId: bookingId, facilityId: booking.facilityId, data: { note } }, tx);
    const msgs: Record<string, string> = {
      REJECTED: `Unfortunately your booking request was not approved.${note ? ` Note from the facility: ${note}` : ""}`,
      CONFIRMED: `Your booking starting ${fmtDateTime(booking.startsAt)} is confirmed.${outstanding({ amount: booking.total, amountPaid: booking.invoices.reduce((s, i) => s + i.amountPaid, 0) }) > 0 ? " Payment is due on arrival." : ""}`,
      PENDING_PAYMENT: `Your booking was approved. Please pay ${naira(booking.amountDueNow)} within 24 hours to confirm it.`,
    };
    await notify({ userId: booking.customerId, kind: `booking.${status.toLowerCase()}`, title: `Booking ${booking.reference}: ${status === "REJECTED" ? "not approved" : "approved"}`, body: msgs[status], link: `/dashboard/bookings/${bookingId}` }, tx);
    return status;
  });
}

export async function setBookingProgress(actor: Actor, bookingId: string, status: "CHECKED_IN" | "COMPLETED") {
  return db.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!b) throw new NotFoundError();
    if (!can(actor, "booking.manage", b.facilityId)) throw new ForbiddenError();
    const allowed = status === "CHECKED_IN" ? ["CONFIRMED"] : ["CONFIRMED", "CHECKED_IN"];
    if (!allowed.includes(b.status)) throw new AppError(`Cannot mark a ${b.status.toLowerCase()} booking as ${status.toLowerCase().replace("_", " ")}.`);
    await tx.booking.update({ where: { id: bookingId }, data: { status } });
    // Completed bookings stop blocking future time only after their end; keep items active for history but they no longer overlap the future.
    await audit({ actorId: actor.userId, action: `booking.${status.toLowerCase()}`, entityType: "Booking", entityId: bookingId, facilityId: b.facilityId }, tx);
  });
}

/** Called when a booking invoice becomes (partially) paid. */
export async function onBookingPaid(tx: Tx, bookingId: string) {
  const b = await tx.booking.findUnique({ where: { id: bookingId }, include: { invoices: true, facility: true } });
  if (!b) return;
  const paid = b.invoices.reduce((s, i) => s + i.amountPaid, 0);
  if (b.status === "PENDING_PAYMENT" && paid >= b.amountDueNow) {
    await tx.booking.update({ where: { id: bookingId }, data: { status: "CONFIRMED", holdExpiresAt: null } });
    await notify({ userId: b.customerId, kind: "booking.confirmed", title: `Booking ${b.reference} confirmed`, body: `Payment received. Your reservation at ${b.facility.name} starting ${fmtDateTime(b.startsAt)} is confirmed.`, link: `/dashboard/bookings/${b.id}` }, tx);
  } else if (b.status === "EXPIRED" || b.status === "CANCELLED") {
    // Payment arrived after the hold lapsed: flag for refund rather than silently re-confirming.
    await notifyStaff(["FINANCE_OFFICER", "FACILITY_MANAGER"], { kind: "booking.late_payment", title: `Late payment on ${b.reference}`, body: `A payment was received for a ${b.status.toLowerCase()} booking. Re-book manually or refund.`, link: `/admin/bookings/${b.id}` }, tx);
  }
}

/** Availability grid for the calendar: one row per resource with its blocks for the day. */
export async function dayAvailability(facilityId: string, date: string) {
  const { localToUtc, addDays } = await import("../time");
  const from = localToUtc(date, "00:00");
  const to = localToUtc(addDays(date, 1), "00:00");
  await expireStaleHolds();
  const facility = await db.facility.findUnique({ where: { id: facilityId } });
  if (!facility) throw new NotFoundError();
  const [equipment, workstations, items, maintenance] = await Promise.all([
    db.equipment.findMany({ where: { facilityId, bookable: true, status: { not: "RETIRED" } }, include: { category: true }, orderBy: [{ category: { sortOrder: "asc" } }, { assetTag: "asc" }] }),
    db.workstation.findMany({ where: { facilityId, active: true }, orderBy: { code: "asc" } }),
    db.bookingItem.findMany({ where: { active: true, startsAt: { lt: to }, endsAt: { gt: from }, booking: { facilityId } }, include: { booking: { select: { status: true } } } }),
    db.maintenanceWindow.findMany({ where: { startsAt: { lt: to }, endsAt: { gt: from }, OR: [{ equipment: { facilityId } }, { workstation: { facilityId } }] } }),
  ]);
  const blocksFor = (id: string) => [
    ...items.filter((i) => (i.equipmentId ?? i.workstationId) === id).map((i) => ({ kind: i.booking.status === "CONFIRMED" || i.booking.status === "CHECKED_IN" ? "RESERVED" : "PENDING", startsAt: i.startsAt, endsAt: i.endsAt })),
    ...maintenance.filter((m) => (m.equipmentId ?? m.workstationId) === id).map((m) => ({ kind: "MAINTENANCE", startsAt: m.startsAt, endsAt: m.endsAt })),
  ];
  return {
    facility,
    hours: (facility.operatingHours as OperatingHours)[(await import("../time")).weekdayOf(date)],
    resources: [
      ...workstations.map((w) => ({ id: w.id, type: "WORKSTATION" as const, label: w.name, code: w.code, category: "Workstations", categoryId: "workstation", status: "AVAILABLE", blocks: blocksFor(w.id), rates: w })),
      ...equipment.map((e) => ({ id: e.id, type: "EQUIPMENT" as const, label: e.name, code: e.assetTag, category: e.category.name, categoryId: e.categoryId, status: e.status, blocks: blocksFor(e.id), rates: e })),
    ],
  };
}
