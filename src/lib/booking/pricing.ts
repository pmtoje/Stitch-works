// Pure pricing engine — no I/O, fully unit-tested.
import type { BookingDuration } from "@prisma/client";

export type Rates = { hourlyRate: number; halfDayRate: number; fullDayRate: number; multiDayRate: number | null };

export type PricedResource = { key: string; label: string; rates: Rates; securityDeposit: number };

export type PricingInput = {
  durationType: BookingDuration;
  hours?: number; // HOURLY
  days?: number; // MULTI_DAY
  resources: PricedResource[];
  memberDiscountPct?: number;
  depositPercent?: number; // facility policy; 0 = pay in full
};

export type PriceLine = { key: string; label: string; unitPrice: number; lineTotal: number; description: string };

export type Quote = {
  lines: PriceLine[];
  subtotal: number;
  discount: number;
  securityDeposit: number;
  total: number;
  amountDueNow: number;
};

export function priceFor(rates: Rates, durationType: BookingDuration, hours = 0, days = 1): { unit: number; total: number; description: string } {
  switch (durationType) {
    case "HOURLY": {
      if (hours <= 0) throw new Error("Hourly bookings need a positive number of hours");
      // Never charge more than a full day for an hourly booking.
      const total = Math.min(Math.round(rates.hourlyRate * hours), rates.fullDayRate);
      return { unit: rates.hourlyRate, total, description: `${hours} hr${hours === 1 ? "" : "s"} @ hourly rate` };
    }
    case "HALF_DAY":
      return { unit: rates.halfDayRate, total: rates.halfDayRate, description: "Half day" };
    case "FULL_DAY":
      return { unit: rates.fullDayRate, total: rates.fullDayRate, description: "Full day" };
    case "MULTI_DAY": {
      if (days < 1) throw new Error("Multi-day bookings need at least one day");
      const perDay = days >= 2 && rates.multiDayRate != null ? rates.multiDayRate : rates.fullDayRate;
      return { unit: perDay, total: perDay * days, description: `${days} day${days === 1 ? "" : "s"} @ ${days >= 2 && rates.multiDayRate != null ? "multi-day" : "full-day"} rate` };
    }
  }
}

export function quoteBooking(input: PricingInput): Quote {
  if (input.resources.length === 0) throw new Error("Select at least one workstation or machine");
  const lines = input.resources.map((r) => {
    const p = priceFor(r.rates, input.durationType, input.hours, input.days);
    return { key: r.key, label: r.label, unitPrice: p.unit, lineTotal: p.total, description: `${r.label} — ${p.description}` };
  });
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const pct = Math.min(Math.max(input.memberDiscountPct ?? 0, 0), 100);
  const discount = Math.floor((subtotal * pct) / 100);
  const securityDeposit = input.resources.reduce((s, r) => s + (r.securityDeposit || 0), 0);
  const net = subtotal - discount;
  const total = net + securityDeposit;
  const dep = Math.min(Math.max(input.depositPercent ?? 0, 0), 100);
  const amountDueNow = dep > 0 && dep < 100 ? Math.ceil((net * dep) / 100) + securityDeposit : total;
  return { lines, subtotal, discount, securityDeposit, total, amountDueNow };
}
