import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { facilityScope } from "@/lib/auth/rbac";
import { dayAvailability } from "@/lib/booking/service";
import { Button, Input, PageHeader, Select, cx } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { addDays, todayLocal, minutesOf } from "@/lib/time";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requirePermission("booking.manage");
  const scope = facilityScope(u.actor, "booking.manage");
  const facilities = await db.facility.findMany({ where: scope === "ALL" ? {} : { id: { in: scope } } });
  const facility = facilities.find((f) => f.id === sp.facility) ?? facilities[0];
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayLocal();
  if (!facility) return <p>No facilities.</p>;
  const a = await dayAvailability(facility.id, date);
  const [open, close] = a.hours ?? ["08:00", "18:00"];
  const span = minutesOf(close) - minutesOf(open);
  const pct = (d: Date) => Math.min(Math.max(((minutesOf(fmtTime(d)) - minutesOf(open)) / span) * 100, 0), 100);
  const hours = Array.from({ length: Math.floor(span / 60) + 1 }, (_, i) => minutesOf(open) / 60 + i);
  const free = a.resources.filter((r) => !r.blocks.length && r.status === "AVAILABLE").length;
  return (
    <>
      <PageHeader title="Availability calendar" description={`${facility.name} · ${a.hours ? `${open}–${close}` : "closed"} · ${free}/${a.resources.length} resources completely free`} />
      <form className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={`?facility=${facility.id}&date=${addDays(date, -1)}`} className="border border-charcoal-900/15 px-3 py-2">←</Link>
        <Input type="date" name="date" defaultValue={date} className="max-w-[180px] py-2" />
        <Link href={`?facility=${facility.id}&date=${addDays(date, 1)}`} className="border border-charcoal-900/15 px-3 py-2">→</Link>
        {facilities.length > 1 ? <Select name="facility" defaultValue={facility.id} className="max-w-xs py-2">{facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select> : <input type="hidden" name="facility" value={facility.id} />}
        <Button size="sm" variant="secondary" className="h-[42px]">Go</Button>
        <span className="ml-auto flex flex-wrap gap-3 text-xs"><span className="flex items-center gap-1"><i className="inline-block h-3 w-4 bg-forest-600" />Reserved</span><span className="flex items-center gap-1"><i className="inline-block h-3 w-4 bg-ochre-400" />Pending</span><span className="flex items-center gap-1"><i className="inline-block h-3 w-4 bg-stone-400" />Maintenance / unavailable</span></span>
      </form>
      {!a.hours ? <p className="text-charcoal-600">The facility is closed on this day.</p> : (
        <div className="overflow-x-auto border border-charcoal-900/10 bg-white">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[220px_1fr] border-b border-charcoal-900/10 bg-cream-100/60 text-[11px] text-stone-500">
              <div className="px-3 py-2">Resource</div>
              <div className="relative h-8">{hours.map((h) => <span key={h} className="absolute top-2 -translate-x-1/2" style={{ left: `${((h * 60 - minutesOf(open)) / span) * 100}%` }}>{String(h).padStart(2, "0")}:00</span>)}</div>
            </div>
            {a.resources.map((r) => (
              <div key={r.id} className="grid grid-cols-[220px_1fr] border-b border-charcoal-900/5 last:border-0">
                <div className="px-3 py-2 text-sm"><span className="block truncate">{r.label}</span><span className="font-mono text-[10px] text-stone-500">{r.code} · {r.category}</span></div>
                <div className={cx("relative my-2 mr-3 h-6", r.status !== "AVAILABLE" && "bg-stone-300")}>
                  {hours.map((h) => <span key={h} className="absolute inset-y-0 border-l border-charcoal-900/5" style={{ left: `${((h * 60 - minutesOf(open)) / span) * 100}%` }} />)}
                  {r.blocks.map((b, i) => <div key={i} title={`${b.kind.toLowerCase()} ${fmtTime(b.startsAt)}–${fmtTime(b.endsAt)}`} className={cx("absolute inset-y-0 rounded-[2px]", b.kind === "RESERVED" ? "bg-forest-600" : b.kind === "PENDING" ? "bg-ochre-400" : "bg-stone-400")} style={{ left: `${pct(b.startsAt)}%`, width: `${pct(b.endsAt) - pct(b.startsAt)}%` }} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
