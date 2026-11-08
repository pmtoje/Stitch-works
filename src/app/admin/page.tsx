import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth/session";
import { can, facilityScope } from "@/lib/auth/rbac";
import { operationsSummary, parseRange } from "@/lib/analytics";
import { Alert, LinkButton, PageHeader, Panel, StatTile } from "@/components/ui";
import { BarList, ColumnChart, Meter } from "@/components/dash/charts";
import { RangeFilter } from "@/components/dash/filters";
import { humanize, naira } from "@/lib/format";

export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requireStaff();
  if (!can(u.actor, "reports.view")) {
    if (can(u.actor, "production.qc")) redirect("/admin/production/qc");
    if (can(u.actor, "academy.teach")) redirect("/admin/academy/teaching");
    redirect("/dashboard");
  }
  const scope = facilityScope(u.actor, "reports.view");
  const facilities = await db.facility.findMany({ where: scope === "ALL" ? {} : { id: { in: scope } }, select: { id: true, name: true } });
  const range = parseRange(sp);
  if (scope !== "ALL" && (!range.facilityId || !scope.includes(range.facilityId))) range.facilityId = scope[0] ?? "none";
  const s = await operationsSummary(range);
  const days: { key: string; label: string; value: number }[] = [];
  for (let d = new Date(range.from); d <= range.to; d = new Date(d.getTime() + 86_400_000)) {
    const k = d.toISOString().slice(0, 10);
    days.push({ key: k, label: k.slice(5), value: s.daily[k] ?? 0 });
  }
  const showFinance = can(u.actor, "finance.view");
  return (
    <>
      <PageHeader eyebrow="Management" title="Operations dashboard" description={`Live figures for ${range.fromStr} to ${range.toStr}.`} actions={<LinkButton href={`/admin/reports?from=${range.fromStr}&to=${range.toStr}`} variant="secondary">Reports & exports</LinkButton>} />
      {sp.denied ? <div className="mb-4"><Alert tone="error">You don’t have permission for that area.</Alert></div> : null}
      <RangeFilter from={range.fromStr} to={range.toStr} facility={range.facilityId} facilities={facilities} />
      {s.outOfService || s.maintenanceDue || s.pendingQc || s.enquiriesNew ? (
        <div className="mb-6 flex flex-wrap gap-2 text-sm">
          {s.outOfService ? <Link href="/admin/equipment?status=UNDER_MAINTENANCE" className="border border-red-600/30 bg-red-50 px-3 py-1.5 text-red-800">{s.outOfService} machine(s) out of service</Link> : null}
          {s.maintenanceDue ? <Link href="/admin/maintenance" className="border border-ochre-500/40 bg-ochre-300/20 px-3 py-1.5 text-ochre-700">{s.maintenanceDue} maintenance task(s) due this week</Link> : null}
          {s.pendingQc ? <Link href="/admin/production/qc" className="border border-ochre-500/40 bg-ochre-300/20 px-3 py-1.5 text-ochre-700">{s.pendingQc} submission(s) awaiting QC</Link> : null}
          {s.enquiriesNew ? <Link href="/admin/enquiries" className="border border-forest-600/30 bg-forest-50 px-3 py-1.5 text-forest-800">{s.enquiriesNew} new enquiry(ies)</Link> : null}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Workspace bookings" value={s.bookings} sub="created in period" href="/admin/bookings" />
        <StatTile label="Facility utilisation" value={`${s.utilisationPct}%`} sub="booked vs available hrs" href="/admin/calendar" />
        <StatTile label="Active tailors" value={s.activeTailors} href="/admin/tailors" />
        <StatTile label="Pending tailor apps" value={s.pendingApps} href="/admin/tailors/applications" />
        <StatTile label="Bulk orders received" value={s.ordersReceived} href="/admin/production/orders" />
        <StatTile label="Active production orders" value={s.activeOrders} sub={`${s.completedOrders} completed in period`} href="/admin/production/orders" />
        {showFinance ? <StatTile label="Revenue (verified)" value={naira(s.revenueTotal)} sub={s.refunds ? `${naira(s.refunds)} refunded` : undefined} href="/admin/finance" /> : null}
        {showFinance ? <StatTile label="Machine rental revenue" value={naira(s.machineRentalRevenue)} sub="booked value" /> : null}
        {showFinance ? <StatTile label="Workspace revenue" value={naira(s.workspaceRevenue)} sub="booked value" /> : null}
        {showFinance ? <StatTile label="Outstanding invoices" value={naira(s.outstandingInvoices)} sub={`${s.outstandingCount} open`} href="/admin/finance/invoices?status=open" /> : null}
        <StatTile label="Academy enrolments" value={s.enrolments} href="/admin/academy/applications" />
        {showFinance ? <StatTile label="Training revenue" value={naira(s.trainingRevenue)} /> : null}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {showFinance ? <Panel title="Daily verified revenue" className="xl:col-span-2"><ColumnChart data={days} label="Daily verified revenue" /></Panel> : null}
        <Panel title="Utilisation">
          <div className="space-y-5">
            <Meter label="Facility (all resources)" value={s.utilisationPct} />
            <Meter label="Machines only" value={s.machineUtilisationPct} />
            <div className="border-t border-charcoal-900/10 pt-4 text-sm">
              <p className="mb-2 font-medium">Bookings by status</p>
              <ul className="space-y-1 text-charcoal-700">{Object.entries(s.bookingsByStatus).map(([k, v]) => <li key={k} className="flex justify-between"><span>{humanize(k)}</span><span className="tabular-nums">{v}</span></li>)}</ul>
            </div>
          </div>
        </Panel>
        {showFinance ? <Panel title="Revenue by service"><BarList data={Object.entries(s.revenueByPurpose).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: humanize(k), value: v }))} /></Panel> : null}
        <Panel title="Machine utilisation by category (booked hours)"><BarList format="number" data={Object.entries(s.byCategory).sort((a, b) => b[1].hours - a[1].hours).map(([k, v]) => ({ label: k, value: Math.round(v.hours), sub: showFinance ? naira(v.revenue) : undefined }))} /></Panel>
        <Panel title="Production performance">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><span>Submissions awaiting QC</span><span className="tabular-nums">{s.pendingQc}</span></li>
            <li className="flex justify-between"><span>Piece-rate earnings awaiting approval</span><span className="tabular-nums">{naira(s.earningsPending)}</span></li>
            <li className="flex justify-between"><span>Orders completed in period</span><span className="tabular-nums">{s.completedOrders}</span></li>
            <li className="flex justify-between"><span>Equipment maintenance alerts</span><span className="tabular-nums">{s.maintenanceDue + s.outOfService}</span></li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
