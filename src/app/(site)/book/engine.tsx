"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createBookingAction, loadAvailability, quoteAction } from "./actions";
import { Alert, Button, Field, Input, Select, Textarea, cx } from "@/components/ui";

type Facility = { id: string; name: string; city: string; operatingHours: Record<string, [string, string] | null>; requiresApproval: boolean; cancellationHours: number; maxConsecutiveDays: number; minBookingHours: number };
type Resource = { id: string; type: "WORKSTATION" | "EQUIPMENT"; label: string; code: string; category: string; status: string; blocks: { kind: string; from: string; to: string }[] };
type Duration = "HOURLY" | "HALF_DAY" | "FULL_DAY" | "MULTI_DAY";
type QuoteResult = Awaited<ReturnType<typeof quoteAction>>;

const DURATIONS: { v: Duration; label: string; hint: string }[] = [
  { v: "HOURLY", label: "By the hour", hint: "A few hours" },
  { v: "HALF_DAY", label: "Half day", hint: "Morning or afternoon" },
  { v: "FULL_DAY", label: "Full day", hint: "Opening to closing" },
  { v: "MULTI_DAY", label: "Multiple days", hint: "Consecutive days" },
];
const naira = (n: number) => "₦" + n.toLocaleString("en-NG");
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const weekday = (d: string) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(d + "T12:00:00Z").getUTCDay()];
const STORAGE_KEY = "sw-booking-draft";

export function BookingEngine({ facilities, signedIn, minDate, maxDate }: { facilities: Facility[]; signedIn: boolean; minDate: string; maxDate: string }) {
  const [facilityId, setFacilityId] = useState(facilities[0].id);
  const [date, setDate] = useState(() => {
    const d = new Date(minDate + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [duration, setDuration] = useState<Duration>("FULL_DAY");
  const [startTime, setStart] = useState("09:00");
  const [endTime, setEnd] = useState("13:00");
  const [slot, setSlot] = useState<"AM" | "PM">("AM");
  const [days, setDays] = useState(2);
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [resources, setResources] = useState<Resource[] | null>(null);
  const [hours, setHours] = useState<[string, string] | null>(null);
  const [availError, setAvailError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");
  const [loading, startLoading] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const facility = facilities.find((f) => f.id === facilityId)!;

  // Restore a draft saved before sign-in.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.facilityId) setFacilityId(d.facilityId);
      if (d.date >= minDate) setDate(d.date);
      if (d.durationType) setDuration(d.durationType);
      if (d.startTime) setStart(d.startTime);
      if (d.endTime) setEnd(d.endTime);
      if (d.halfDaySlot) setSlot(d.halfDaySlot);
      if (d.days) setDays(d.days);
      if (Array.isArray(d.selected)) setSelected(d.selected);
    } catch {}
  }, [minDate]);

  useEffect(() => {
    startLoading(async () => {
      const r = await loadAvailability(facilityId, date);
      if (r.ok) {
        setResources(r.resources as Resource[]);
        setHours(r.hours as [string, string] | null);
        setAvailError(null);
      } else {
        setResources([]);
        setAvailError(r.error);
      }
    });
  }, [facilityId, date]);

  const request = useMemo(() => {
    const res = resources ?? [];
    return {
      facilityId,
      durationType: duration,
      date,
      ...(duration === "HOURLY" ? { startTime, endTime } : {}),
      ...(duration === "HALF_DAY" ? { halfDaySlot: slot } : {}),
      ...(duration === "MULTI_DAY" ? { days } : {}),
      equipmentIds: selected.filter((id) => res.find((r) => r.id === id)?.type === "EQUIPMENT"),
      workstationIds: selected.filter((id) => res.find((r) => r.id === id)?.type === "WORKSTATION"),
      notes: notes || undefined,
    };
  }, [facilityId, duration, date, startTime, endTime, slot, days, selected, notes, resources]);

  useEffect(() => {
    if (!selected.length) {
      setQuote(null);
      return;
    }
    const t = setTimeout(async () => setQuote(await quoteAction(request)), 250);
    return () => clearTimeout(t);
  }, [request, selected.length]);

  // Window for the selected day, for indicative availability.
  const slotWindow = useMemo<[string, string] | null>(() => {
    if (!hours) return null;
    const [o, c] = hours;
    if (duration === "HOURLY") return [startTime, endTime];
    if (duration === "HALF_DAY") {
      const m = Math.round((mins(o) + mins(c)) / 60) * 30;
      const mid = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      return slot === "AM" ? [o, mid] : [mid, c];
    }
    return [o, c];
  }, [hours, duration, startTime, endTime, slot]);

  const busy = (r: Resource) => {
    if (["UNDER_MAINTENANCE", "OUT_OF_SERVICE"].includes(r.status)) return "MAINTENANCE";
    if (!slotWindow) return null;
    const hit = r.blocks.find((b) => mins(b.from) < mins(slotWindow[1]) && mins(slotWindow[0]) < mins(b.to));
    return hit?.kind ?? null;
  };
  const unavailableIds = new Set(quote && quote.ok ? quote.unavailable : []);
  const categories = ["All", ...Array.from(new Set((resources ?? []).map((r) => r.category)))];
  const shown = (resources ?? []).filter((r) => filter === "All" || r.category === filter);
  const grouped = shown.reduce<Record<string, Resource[]>>((acc, r) => ((acc[r.category] ??= []).push(r), acc), {});
  const timeOptions = hours ? Array.from({ length: (mins(hours[1]) - mins(hours[0])) / 30 + 1 }, (_, i) => { const m = mins(hours[0]) + i * 30; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }) : [];
  const closed = !facility.operatingHours[weekday(date)];

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const submit = () => {
    setSubmitError(null);
    if (!signedIn) {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...request, selected }));
      } catch {}
      (location.href = `/login?next=${encodeURIComponent("/book")}`);
      return;
    }
    startSubmit(async () => {
      const r = await createBookingAction(request);
      if (r && !r.ok) setSubmitError(r.error);
      else
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {}
    });
  };

  const scale = hours ? [mins(hours[0]), mins(hours[1])] : [480, 1080];
  const pct = (t: string) => ((mins(t) - scale[0]) / (scale[1] - scale[0])) * 100;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-8">
        {/* Step 1 */}
        <section aria-labelledby="s1" className="border border-charcoal-900/10 bg-white p-5 md:p-6">
          <h2 id="s1" className="flex items-baseline gap-3 font-sans text-lg font-semibold"><span className="font-mono text-xs text-ochre-600">01</span> When do you need the facility?</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Facility">
              <Select value={facilityId} onChange={(e) => { setFacilityId(e.target.value); setSelected([]); }}>
                {facilities.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.city}</option>)}
              </Select>
            </Field>
            <Field label={duration === "MULTI_DAY" ? "First day" : "Date"} hint={hours ? `Open ${hours[0]}–${hours[1]}` : closed ? "Closed on this day" : undefined}>
              <Input type="date" value={date} min={minDate} max={maxDate} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </Field>
          </div>
          <fieldset className="mt-5">
            <legend className="mb-2 text-sm font-medium">Duration</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DURATIONS.map((d) => (
                <label key={d.v} className={cx("cursor-pointer border px-3 py-3 text-sm transition-colors", duration === d.v ? "border-forest-700 bg-forest-50" : "border-charcoal-900/15 hover:border-charcoal-900/40")}>
                  <input type="radio" name="duration" className="sr-only" checked={duration === d.v} onChange={() => setDuration(d.v)} />
                  <span className="block font-medium text-charcoal-900">{d.label}</span>
                  <span className="block text-xs text-stone-500">{d.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {duration === "HOURLY" ? (
              <>
                <Field label="Start time"><Select value={startTime} onChange={(e) => setStart(e.target.value)}>{timeOptions.slice(0, -1).map((t) => <option key={t}>{t}</option>)}</Select></Field>
                <Field label="End time"><Select value={endTime} onChange={(e) => setEnd(e.target.value)}>{timeOptions.slice(1).map((t) => <option key={t}>{t}</option>)}</Select></Field>
              </>
            ) : null}
            {duration === "HALF_DAY" ? (
              <Field label="Session"><Select value={slot} onChange={(e) => setSlot(e.target.value as "AM" | "PM")}><option value="AM">Morning</option><option value="PM">Afternoon</option></Select></Field>
            ) : null}
            {duration === "MULTI_DAY" ? (
              <Field label="Number of days" hint={`Up to ${facility.maxConsecutiveDays} consecutive operating days`}>
                <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>{Array.from({ length: facility.maxConsecutiveDays - 1 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n} days</option>)}</Select>
              </Field>
            ) : null}
          </div>
        </section>

        {/* Step 2 */}
        <section aria-labelledby="s2" className="border border-charcoal-900/10 bg-white p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="s2" className="flex items-baseline gap-3 font-sans text-lg font-semibold"><span className="font-mono text-xs text-ochre-600">02</span> Choose workstations &amp; machines</h2>
            <div className="flex flex-wrap gap-3 text-xs text-stone-600">
              <Legend c="bg-forest-600/80" l="Reserved" /><Legend c="bg-ochre-400" l="Pending" /><Legend c="bg-stone-400 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(0,0,0,.25)_3px,rgba(0,0,0,.25)_5px)]" l="Maintenance" /><Legend c="border border-forest-700 bg-forest-50" l="Your time" />
            </div>
          </div>
          {availError ? <div className="mt-4"><Alert tone="warn">{availError}</Alert></div> : null}
          {closed ? <div className="mt-4"><Alert tone="warn">The facility is closed on this day. Choose another date.</Alert></div> : null}
          <div className="-mx-1 mt-5 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => setFilter(c)} className={cx("shrink-0 border px-3 py-1.5 text-sm", filter === c ? "border-charcoal-900 bg-charcoal-900 text-cream-50" : "border-charcoal-900/15 hover:border-charcoal-900/40")}>{c}</button>
            ))}
          </div>
          <div className={cx("mt-5 space-y-6 transition-opacity", loading && "opacity-50")} aria-busy={loading}>
            {resources === null ? <p className="text-sm text-stone-500">Loading availability…</p> : null}
            {Object.entries(grouped).map(([cat, list]) => (
              <div key={cat}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">{cat} · {list.filter((r) => !busy(r)).length}/{list.length} free</p>
                <ul className="divide-y divide-charcoal-900/5 border border-charcoal-900/10">
                  {list.map((r) => {
                    const b = busy(r) ?? (unavailableIds.has(r.id) ? "RESERVED" : null);
                    const isSel = selected.includes(r.id);
                    const disabled = !!b && !isSel;
                    return (
                      <li key={r.id} className={cx("grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:grid-cols-[auto_200px_1fr]", isSel && "bg-forest-50/60")}>
                        <input id={`r-${r.id}`} type="checkbox" checked={isSel} disabled={disabled} onChange={() => toggle(r.id)} className="h-4 w-4 accent-forest-700 disabled:opacity-40" />
                        <label htmlFor={`r-${r.id}`} className={cx("min-w-0", disabled ? "text-stone-400" : "cursor-pointer")}>
                          <span className="block truncate text-sm font-medium">{r.label}</span>
                          <span className="block font-mono text-[11px] text-stone-500">{r.code}{b ? ` · ${b === "MAINTENANCE" ? "maintenance" : b === "PENDING" ? "pending hold" : "booked"}` : ""}</span>
                        </label>
                        <div className="relative col-span-2 h-5 bg-cream-100 sm:col-span-1" aria-hidden>
                          {slotWindow && hours ? <div className="absolute inset-y-0 border-x border-forest-700 bg-forest-100/70" style={{ left: `${pct(slotWindow[0])}%`, width: `${pct(slotWindow[1]) - pct(slotWindow[0])}%` }} /> : null}
                          {r.blocks.map((bl, i) => (
                            <div key={i} title={`${bl.kind.toLowerCase()} ${bl.from}–${bl.to}`} className={cx("absolute inset-y-1", bl.kind === "RESERVED" ? "bg-forest-600/80" : bl.kind === "PENDING" ? "bg-ochre-400" : "bg-stone-400 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(0,0,0,.25)_3px,rgba(0,0,0,.25)_5px)]")} style={{ left: `${Math.max(pct(bl.from), 0)}%`, width: `${Math.min(pct(bl.to), 100) - Math.max(pct(bl.from), 0)}%` }} />
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          {hours ? <div className="mt-2 flex justify-between font-mono text-[10px] text-stone-500 sm:ml-[236px]"><span>{hours[0]}</span><span>{hours[1]}</span></div> : null}
        </section>
      </div>

      {/* Summary */}
      <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <div className="border border-charcoal-900/10 bg-white">
          <div className="border-b border-charcoal-900/10 bg-charcoal-900 px-5 py-4 text-cream-50">
            <p className="eyebrow-light">Your reservation</p>
            <p className="mt-1 font-display text-2xl">{selected.length} item{selected.length === 1 ? "" : "s"} selected</p>
          </div>
          <div className="space-y-4 p-5">
            {quote && quote.ok ? (
              <>
                <ul className="space-y-1 text-xs text-stone-600">
                  {quote.spans.map((s) => <li key={s.date} className="font-mono">{s.date} · {s.from}–{s.to}</li>)}
                </ul>
                <ul className="divide-y divide-charcoal-900/5 text-sm">
                  {quote.quote.lines.map((l) => (
                    <li key={l.key} className="flex justify-between gap-3 py-2"><span className="text-charcoal-700">{l.description}</span><span className="shrink-0 tabular-nums">{naira(l.lineTotal)}</span></li>
                  ))}
                </ul>
                <dl className="space-y-1.5 border-t border-charcoal-900/10 pt-3 text-sm">
                  <Row k="Subtotal" v={naira(quote.quote.subtotal)} />
                  {quote.quote.discount ? <Row k={`Member discount (${quote.discountPct}%)`} v={`−${naira(quote.quote.discount)}`} /> : null}
                  {quote.quote.securityDeposit ? <Row k="Refundable security deposit" v={naira(quote.quote.securityDeposit)} /> : null}
                  <Row k="Total" v={naira(quote.quote.total)} strong />
                  {quote.quote.amountDueNow !== quote.quote.total ? <Row k="Due now (deposit)" v={naira(quote.quote.amountDueNow)} /> : null}
                </dl>
                {quote.unavailable.length ? <Alert tone="error">Some selected items are not available for this time. Remove them or change the time.</Alert> : null}
                {quote.requiresApproval ? <Alert tone="info">This facility reviews bookings before payment. You’ll be notified once approved.</Alert> : null}
              </>
            ) : quote && !quote.ok ? (
              <Alert tone="warn">{quote.error}</Alert>
            ) : (
              <p className="text-sm text-stone-500">Select one or more workstations or machines to see your price.</p>
            )}
            <Field label="Notes for the facility (optional)"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. I’ll bring my own thread" /></Field>
            {submitError ? <Alert tone="error">{submitError}</Alert> : null}
            <Button type="button" className="w-full" size="lg" disabled={!selected.length || submitting || !quote?.ok || (quote.ok && quote.unavailable.length > 0)} onClick={submit}>
              {submitting ? "Reserving…" : signedIn ? (facility.requiresApproval ? "Request booking" : "Reserve & continue to payment") : "Sign in to reserve"}
            </Button>
            <p className="text-xs text-stone-500">Free cancellation up to {facility.cancellationHours} hours before your start time. <Link href="/policies/booking" className="underline">Booking policy</Link></p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Legend({ c, l }: { c: string; l: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cx("inline-block h-2.5 w-4", c)} />{l}</span>;
}
function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className={cx("flex justify-between", strong && "border-t border-charcoal-900/10 pt-2 text-base font-semibold")}><dt>{k}</dt><dd className="tabular-nums">{v}</dd></div>;
}
