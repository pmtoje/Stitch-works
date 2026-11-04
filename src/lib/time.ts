// Facility-local time helpers. Nigeria observes WAT (UTC+01:00) all year.
const OFFSET_MIN = 60;

/** "2026-11-05" + "09:30" (Lagos local) → UTC Date */
export function localToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if (!y || !m || !d || hh == null || mm == null || Number.isNaN(hh) || Number.isNaN(mm)) throw new Error("Invalid date/time");
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - OFFSET_MIN * 60_000);
}

/** UTC Date → { date: "YYYY-MM-DD", time: "HH:MM", weekday: "mon" } in Lagos local time */
export function utcToLocal(dt: Date) {
  const l = new Date(dt.getTime() + OFFSET_MIN * 60_000);
  const date = l.toISOString().slice(0, 10);
  const time = l.toISOString().slice(11, 16);
  const weekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][l.getUTCDay()];
  return { date, time, weekday };
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function todayLocal(now = new Date()): string {
  return utcToLocal(now).date;
}

export function weekdayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}
