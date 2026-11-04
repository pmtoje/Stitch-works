import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { LinkButton, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { fmtDate, naira } from "@/lib/format";

export default async function Jobs() {
  const u = await requirePermission("production.view");
  const jobs = await db.productionJob.findMany({ include: { allocations: { where: { status: { not: "CANCELLED" } }, include: { submissions: { include: { inspection: true } } } }, order: true, _count: { select: { applications: { where: { status: "PENDING" } } } } }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageHeader title="Production jobs & allocations" description="Jobs are created automatically from confirmed bulk orders, or manually. Open them to the marketplace to receive tailor applications." actions={can(u.actor, "production.manage") ? <LinkButton href="/admin/production/jobs/new">New job</LinkButton> : null} />
      <Table head={["Job", "Order", "Units", "Allocated", "Accepted", "Rate", "Due", "Applications", "Status"]} empty="No jobs.">
        {jobs.map((j) => {
          const alloc = j.allocations.reduce((s, a) => s + a.quantity, 0);
          const acc = j.allocations.flatMap((a) => a.submissions).reduce((s, x) => s + (x.inspection?.acceptedQty ?? 0), 0);
          return <tr key={j.id}><Td><Link href={`/admin/production/jobs/${j.id}`} className="text-forest-700 hover:underline">{j.title}</Link><div className="font-mono text-xs text-stone-500">{j.reference}{j.openToMarketplace ? " · marketplace" : ""}</div></Td><Td className="font-mono text-xs">{j.order?.reference ?? "—"}</Td><Td>{j.totalQuantity}</Td><Td>{alloc}</Td><Td>{acc} <span className="text-xs text-stone-500">({Math.round((acc / j.totalQuantity) * 100)}%)</span></Td><Td>{naira(j.defaultRate)}</Td><Td>{fmtDate(j.dueDate)}</Td><Td>{j._count.applications || "—"}</Td><Td><StatusBadge status={j.status} /></Td></tr>;
        })}
      </Table>
    </>
  );
}
