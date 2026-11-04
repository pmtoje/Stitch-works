import { describe, expect, it } from "vitest";
import { priceFor, quoteBooking } from "@/lib/booking/pricing";
import { buildSpans } from "@/lib/booking/windows";
import { addDays, todayLocal } from "@/lib/time";
import { computeQuotation } from "@/lib/production/orders";
import { pieceRateAmount, validateInspection } from "@/lib/production/allocation";
import { gradeFor } from "@/lib/academy/service";

const rates = { hourlyRate: 1000, halfDayRate: 4000, fullDayRate: 7000, multiDayRate: 6000 };
const rules = { operatingHours: { mon: ["08:00", "18:00"], tue: ["08:00", "18:00"], wed: ["08:00", "18:00"], thu: ["08:00", "18:00"], fri: ["08:00", "18:00"], sat: ["09:00", "15:00"], sun: null } as never, minBookingHours: 2, maxAdvanceDays: 60, maxConsecutiveDays: 7 };

describe("pricing engine", () => {
  it("prices each duration type", () => {
    expect(priceFor(rates, "HOURLY", 3).total).toBe(3000);
    expect(priceFor(rates, "HALF_DAY").total).toBe(4000);
    expect(priceFor(rates, "FULL_DAY").total).toBe(7000);
    expect(priceFor(rates, "MULTI_DAY", 0, 3).total).toBe(18000);
  });
  it("never charges more than a full day for hourly bookings", () => {
    expect(priceFor(rates, "HOURLY", 9).total).toBe(7000);
  });
  it("falls back to the full-day rate when no multi-day rate is configured", () => {
    expect(priceFor({ ...rates, multiDayRate: null }, "MULTI_DAY", 0, 2).total).toBe(14000);
  });
  it("totals multiple machines with member discount and security deposit", () => {
    const q = quoteBooking({ durationType: "FULL_DAY", resources: [{ key: "a", label: "A", rates, securityDeposit: 0 }, { key: "b", label: "B", rates, securityDeposit: 5000 }], memberDiscountPct: 10 });
    expect(q.subtotal).toBe(14000);
    expect(q.discount).toBe(1400);
    expect(q.securityDeposit).toBe(5000);
    expect(q.total).toBe(17600);
    expect(q.amountDueNow).toBe(17600);
  });
  it("applies a facility deposit percentage plus full security deposit upfront", () => {
    const q = quoteBooking({ durationType: "FULL_DAY", resources: [{ key: "a", label: "A", rates, securityDeposit: 1000 }], depositPercent: 50 });
    expect(q.amountDueNow).toBe(3500 + 1000);
  });
  it("rejects an empty selection", () => {
    expect(() => quoteBooking({ durationType: "FULL_DAY", resources: [] })).toThrow();
  });
});

describe("booking windows", () => {
  const nextWeekday = () => { let d = addDays(todayLocal(), 1); while (["sat", "sun"].includes(["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(d + "T12:00:00Z").getUTCDay()])) d = addDays(d, 1); return d; };
  const nextSunday = () => { let d = addDays(todayLocal(), 1); while (new Date(d + "T12:00:00Z").getUTCDay() !== 0) d = addDays(d, 1); return d; };
  it("builds a full-day span from operating hours (WAT → UTC)", () => {
    const d = nextWeekday();
    const { spans } = buildSpans({ durationType: "FULL_DAY", date: d }, rules);
    expect(spans[0].startsAt.toISOString()).toBe(`${d}T07:00:00.000Z`);
    expect(spans[0].endsAt.toISOString()).toBe(`${d}T17:00:00.000Z`);
  });
  it("splits half days at the midpoint", () => {
    const d = nextWeekday();
    const am = buildSpans({ durationType: "HALF_DAY", date: d, halfDaySlot: "AM" }, rules).spans[0];
    const pm = buildSpans({ durationType: "HALF_DAY", date: d, halfDaySlot: "PM" }, rules).spans[0];
    expect(am.endsAt.getTime()).toBe(pm.startsAt.getTime());
  });
  it("enforces minimum hours, operating hours and half-hour alignment", () => {
    const d = nextWeekday();
    expect(() => buildSpans({ durationType: "HOURLY", date: d, startTime: "09:00", endTime: "10:00" }, rules)).toThrow(/minimum/);
    expect(() => buildSpans({ durationType: "HOURLY", date: d, startTime: "07:00", endTime: "10:00" }, rules)).toThrow(/operating hours/);
    expect(() => buildSpans({ durationType: "HOURLY", date: d, startTime: "09:15", endTime: "12:00" }, rules)).toThrow(/half-hour/);
  });
  it("rejects closed days, past dates, too-far dates and too many consecutive days", () => {
    expect(() => buildSpans({ durationType: "FULL_DAY", date: nextSunday() }, rules)).toThrow(/closed/);
    expect(() => buildSpans({ durationType: "FULL_DAY", date: addDays(todayLocal(), -1) }, rules)).toThrow(/past/);
    expect(() => buildSpans({ durationType: "FULL_DAY", date: addDays(todayLocal(), 90) }, rules)).toThrow(/advance/);
    expect(() => buildSpans({ durationType: "MULTI_DAY", date: nextWeekday(), days: 9 }, rules)).toThrow(/at most/);
  });
});

describe("production & academy rules", () => {
  it("computes quotation totals with logistics and tax", () => {
    const q = computeQuotation({ lines: [{ garmentType: "Shirt", quantity: 100, unitPrice: 5000 }], logisticsCost: 20000, taxPercent: 7.5 });
    expect(q.subtotal).toBe(520000);
    expect(q.taxAmount).toBe(39000);
    expect(q.total).toBe(559000);
  });
  it("pays piece rates only on accepted quantity", () => {
    expect(pieceRateAmount(480, 350)).toBe(168000);
  });
  it("validates QC arithmetic and defect recording", () => {
    expect(() => validateInspection(10, { inspectedQty: 10, acceptedQty: 8, rejectedQty: 1, reworkQty: 0, defects: ["x"] })).toThrow(/equal/);
    expect(() => validateInspection(10, { inspectedQty: 9, acceptedQty: 9, rejectedQty: 0, reworkQty: 0, defects: [] })).toThrow(/All 10/);
    expect(() => validateInspection(10, { inspectedQty: 10, acceptedQty: 8, rejectedQty: 2, reworkQty: 0, defects: [] })).toThrow(/defects/);
    expect(() => validateInspection(10, { inspectedQty: 10, acceptedQty: 10, rejectedQty: 0, reworkQty: 0, defects: [] })).not.toThrow();
  });
  it("grades certificates", () => {
    expect(gradeFor(90)).toBe("Distinction");
    expect(gradeFor(72)).toBe("Merit");
    expect(gradeFor(55)).toBe("Pass");
    expect(gradeFor(40)).toBeNull();
  });
});
