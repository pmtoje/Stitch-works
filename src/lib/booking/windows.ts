// Turns a booking request into concrete time spans using the facility's operating hours.
import type { BookingDuration } from "@prisma/client";
import { addDays, localToUtc, minutesOf, todayLocal, weekdayOf } from "../time";
import { AppError } from "../errors";

export type OperatingHours = Record<string, [string, string] | null>;

export type WindowRequest = {
  durationType: BookingDuration;
  date: string; // YYYY-MM-DD (facility local)
  startTime?: string; // HOURLY
  endTime?: string; // HOURLY
  halfDaySlot?: "AM" | "PM";
  days?: number; // MULTI_DAY
};

export type FacilityRules = {
  operatingHours: OperatingHours;
  minBookingHours: number;
  maxAdvanceDays: number;
  maxConsecutiveDays: number;
};

export type Span = { startsAt: Date; endsAt: Date; date: string };

const DAY_NAMES: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

function hoursFor(rules: FacilityRules, date: string): [string, string] {
  const wd = weekdayOf(date);
  const h = rules.operatingHours[wd];
  if (!h) throw new AppError(`The facility is closed on ${DAY_NAMES[wd]}s (${date}). Please choose another date.`, "CLOSED");
  return h;
}

const midpoint = (open: string, close: string) => {
  const m = Math.round((minutesOf(open) + minutesOf(close)) / 2 / 30) * 30;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export function buildSpans(req: WindowRequest, rules: FacilityRules, now = new Date()): { spans: Span[]; hours: number; days: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.date)) throw new AppError("Choose a valid booking date.");
  const today = todayLocal(now);
  if (req.date < today) throw new AppError("Bookings cannot be made for past dates.");
  if (req.date > addDays(today, rules.maxAdvanceDays)) throw new AppError(`Bookings can be made up to ${rules.maxAdvanceDays} days in advance.`);

  const spans: Span[] = [];
  let hours = 0;
  let days = 1;

  if (req.durationType === "HOURLY") {
    const [open, close] = hoursFor(rules, req.date);
    if (!req.startTime || !req.endTime) throw new AppError("Choose a start and end time.");
    const s = minutesOf(req.startTime);
    const e = minutesOf(req.endTime);
    if (s % 30 || e % 30) throw new AppError("Times must be on the hour or half-hour.");
    if (s < minutesOf(open) || e > minutesOf(close)) throw new AppError(`Choose times within operating hours (${open}–${close}).`);
    if (e <= s) throw new AppError("End time must be after start time.");
    hours = (e - s) / 60;
    if (hours < rules.minBookingHours) throw new AppError(`The minimum booking is ${rules.minBookingHours} hour${rules.minBookingHours === 1 ? "" : "s"}.`);
    spans.push({ date: req.date, startsAt: localToUtc(req.date, req.startTime), endsAt: localToUtc(req.date, req.endTime) });
  } else if (req.durationType === "HALF_DAY") {
    const [open, close] = hoursFor(rules, req.date);
    const mid = midpoint(open, close);
    const [a, b] = req.halfDaySlot === "PM" ? [mid, close] : [open, mid];
    spans.push({ date: req.date, startsAt: localToUtc(req.date, a), endsAt: localToUtc(req.date, b) });
  } else if (req.durationType === "FULL_DAY") {
    const [open, close] = hoursFor(rules, req.date);
    spans.push({ date: req.date, startsAt: localToUtc(req.date, open), endsAt: localToUtc(req.date, close) });
  } else {
    days = Math.floor(req.days ?? 0);
    if (days < 2) throw new AppError("Multi-day bookings cover at least 2 consecutive days.");
    if (days > rules.maxConsecutiveDays) throw new AppError(`Bookings can cover at most ${rules.maxConsecutiveDays} consecutive days.`);
    if (addDays(req.date, days - 1) > addDays(today, rules.maxAdvanceDays)) throw new AppError(`Bookings can be made up to ${rules.maxAdvanceDays} days in advance.`);
    for (let i = 0; i < days; i++) {
      const d = addDays(req.date, i);
      const [open, close] = hoursFor(rules, d);
      spans.push({ date: d, startsAt: localToUtc(d, open), endsAt: localToUtc(d, close) });
    }
  }

  if (spans[0].startsAt <= now) throw new AppError("That start time has already passed. Choose a later time.");
  return { spans, hours, days };
}
