export const TZ = "Africa/Lagos"; // WAT, UTC+1, no daylight saving

export function naira(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return "₦" + Math.round(amount).toLocaleString("en-NG");
}

export function fmtDate(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ, ...opts }).format(new Date(d));
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  return fmtDate(d, { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function fmtTime(d: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }).format(new Date(d));
}

export function humanize(s: string): string {
  return s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
