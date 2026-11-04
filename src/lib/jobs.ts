import { db } from "./db";
import { notify, notifyStaff } from "./notifications";
import { fmtDateTime } from "./format";

/** Reminds customers ~24h before a confirmed booking. */
export async function sendBookingReminders(now = new Date()) {
  const due = await db.booking.findMany({ where: { status: "CONFIRMED", remindedAt: null, startsAt: { gt: now, lte: new Date(now.getTime() + 24 * 3_600_000) } }, include: { facility: true } });
  for (const b of due) {
    await db.$transaction(async (tx) => {
      await tx.booking.update({ where: { id: b.id }, data: { remindedAt: now } });
      await notify({ userId: b.customerId, kind: "booking.reminder", title: `Reminder: booking ${b.reference}`, body: `Your reservation at ${b.facility.name} starts ${fmtDateTime(b.startsAt)}.`, link: `/dashboard/bookings/${b.id}`, channels: ["EMAIL", "SMS", "WHATSAPP"] }, tx);
    });
  }
  return due.length;
}

/** Alerts facility managers about preventive maintenance due within 3 days (once per day). */
export async function sendMaintenanceAlerts(now = new Date()) {
  const due = await db.maintenancePlan.findMany({ where: { nextDueAt: { lte: new Date(now.getTime() + 3 * 86_400_000) } }, include: { equipment: true } });
  if (!due.length) return 0;
  const key = `maint-alert-${now.toISOString().slice(0, 10)}`;
  const sent = await db.counter.findUnique({ where: { key } });
  if (sent) return 0;
  await db.counter.create({ data: { key, value: due.length } });
  await notifyStaff(["FACILITY_MANAGER"], { kind: "maintenance.due", title: `${due.length} maintenance task(s) due`, body: due.map((d) => `${d.equipment.assetTag}: ${d.task}`).join("\n"), link: "/admin/maintenance" });
  return due.length;
}
