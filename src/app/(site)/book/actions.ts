"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dayAvailability, previewBooking, createBooking, type BookingRequest } from "@/lib/booking/service";
import { getCurrentUser } from "@/lib/auth/session";
import { publicMessage } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import { kickDispatch } from "@/lib/notifications";
import { fmtTime } from "@/lib/format";

const reqSchema = z.object({
  facilityId: z.string().min(1),
  durationType: z.enum(["HOURLY", "HALF_DAY", "FULL_DAY", "MULTI_DAY"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  halfDaySlot: z.enum(["AM", "PM"]).optional(),
  days: z.number().int().min(1).max(31).optional(),
  equipmentIds: z.array(z.string()).max(30),
  workstationIds: z.array(z.string()).max(30),
  notes: z.string().max(1000).optional(),
});

export async function loadAvailability(facilityId: string, date: string) {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("bad date");
    const a = await dayAvailability(facilityId, date);
    return {
      ok: true as const,
      hours: a.hours,
      resources: a.resources.map((r) => ({
        id: r.id,
        type: r.type,
        label: r.label,
        code: r.code,
        category: r.category,
        status: r.status,
        blocks: r.blocks.map((b) => ({ kind: b.kind, from: fmtTime(b.startsAt), to: fmtTime(b.endsAt) })),
      })),
    };
  } catch (e) {
    return { ok: false as const, error: publicMessage(e) };
  }
}

export async function quoteAction(raw: unknown) {
  try {
    const user = await getCurrentUser();
    const req = reqSchema.parse(raw) as BookingRequest;
    const p = await previewBooking(user?.id ?? null, req);
    return { ok: true as const, quote: p.quote, discountPct: p.discountPct, unavailable: p.unavailable, requiresApproval: p.requiresApproval, spans: p.spans.map((s) => ({ date: s.date, from: fmtTime(s.startsAt), to: fmtTime(s.endsAt) })) };
  } catch (e) {
    return { ok: false as const, error: e instanceof z.ZodError ? "Complete the booking details." : publicMessage(e) };
  }
}

export async function createBookingAction(raw: unknown) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Please sign in to reserve.", needsLogin: true };
  let id: string;
  try {
    await enforceRateLimit(`booking:${user.id}`, 20, 3600);
    const req = reqSchema.parse(raw) as BookingRequest;
    const b = await createBooking(user.actor, req);
    id = b.id;
    kickDispatch();
  } catch (e) {
    return { ok: false as const, error: e instanceof z.ZodError ? "Complete the booking details." : publicMessage(e) };
  }
  redirect(`/dashboard/bookings/${id}?new=1`);
}
