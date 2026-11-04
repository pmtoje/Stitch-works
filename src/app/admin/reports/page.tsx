import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can, facilityScope } from "@/lib/auth/rbac";
import { parseRange } from "@/lib/analytics";
import { REPORTS } from "@/lib/reports";
import { Button, Input, PageHeader, Select, Table, Td, buttonClass } from "@/components/ui";

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requirePermission("reports.view");
  const r = parseRange(sp);
  const available = Object.entries(REPORTS).filter(([, d]) => can(u.actor, d.perm));
  const type = available.find(([k]) => k === sp.type)?.[0] ?? available[0]?.[0];
  const def = type ? REPORTS[type] : null;
  const scope = def ? facilityScope(u.actor, def.perm) : "ALL";
  const [facilities, categories] = await Promise.all([db.facility.findMany({ where: scope === "ALL" ? {} : { id: { in: scope } } }), db.equipmentCategory.findMany()]);
  const facilityId = scope === "ALL" ? sp.facility || undefined : sp.facility && scope.includes(sp.facility) ? sp.facility : scope[0];
  const rows = def ? await def.run({ from: r.from, to: r.to, facilityId, status: sp.status || undefined, q: sp.q || undefined, categoryId: sp.category || undefined }) : [];
  const qs = new URLSearchParams({ from: r.fromStr, to: r.toStr, ...(facilityId ? { facility: facilityId } : {}), ...(sp.status ? { status: sp.status } : {}), ...(sp.q ? { q: sp.q } : {}), ...(sp.category ? { category: sp.category } : {}) }).toString();
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  return (
    <>
      <PageHeader title="Reports & exports" description="Every report is generated live from the database and can be downloaded as CSV or Excel. Exports are audit-logged." />
      <form method="get" className="mb-6 grid gap-3 border border-charcoal-900/10 bg-white p-4 md:grid-cols-4 xl:grid-cols-8 xl:items-end">
        <label className="text-xs text-stone-500 md:col-span-2">Report<Select name="type" defaultValue={type} className="mt-1 py-1.5">{available.map(([k, d]) => <option key={k} value={k}>{d.title}</option>)}</Select></label>
        <label className="text-xs text-stone-500">From<Input type="date" name="from" defaultValue={r.fromStr} className="mt-1 py-1.5" /></label>
        <label className="text-xs text-stone-500">To<Input type="date" name="to" defaultValue={r.toStr} className="mt-1 py-1.5" /></label>
        {def?.filters.includes("facility") ? <label className="text-xs text-stone-500">Facility<Select name="facility" defaultValue={facilityId ?? ""} className="mt-1 py-1.5">{scope === "ALL" ? <option value="">All</option> : null}{facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></label> : null}
        {def?.filters.includes("category") ? <label className="text-xs text-stone-500">Machine category<Select name="category" defaultValue={sp.category ?? ""} className="mt-1 py-1.5"><option value="">All</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label> : null}
        {def?.filters.includes("status") ? <label className="text-xs text-stone-500">Status<Input name="status" defaultValue={sp.status ?? ""} placeholder="e.g. CONFIRMED" className="mt-1 py-1.5" /></label> : null}
        {def?.filters.includes("q") ? <label className="text-xs text-stone-500">Customer / tailor<Input name="q" defaultValue={sp.q ?? ""} className="mt-1 py-1.5" /></label> : null}
        <Button size="sm" variant="secondary">Run report</Button>
      </form>
      {def ? (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm"><strong>{def.title}</strong> · {rows.length} row(s)</p>
            <div className="flex gap-2"><a className={buttonClass("secondary", "sm")} href={`/api/reports/${type}?${qs}&format=csv`}>Download CSV</a><a className={buttonClass("primary", "sm")} href={`/api/reports/${type}?${qs}&format=xlsx`}>Download Excel</a></div>
          </div>
          <Table head={cols} empty="No rows for these filters.">
            {rows.slice(0, 100).map((row, i) => <tr key={i}>{cols.map((c) => <Td key={c} className="whitespace-nowrap">{String(row[c] ?? "")}</Td>)}</tr>)}
          </Table>
          {rows.length > 100 ? <p className="mt-2 text-xs text-stone-500">Showing first 100 rows — download for the full report.</p> : null}
        </>
      ) : null}
    </>
  );
}
