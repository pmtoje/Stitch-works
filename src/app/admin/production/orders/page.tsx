import Link from "next/link";
import type { Prisma, ProductionStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { SearchBar } from "@/components/dash/search";
import { PRODUCTION_FLOW } from "@/lib/production/orders";
import { fmtDate } from "@/lib/format";

export default async function Orders({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requirePermission("production.view");
  const where: Prisma.BulkOrderWhereInput = {
    ...(sp.status ? { status: sp.status as ProductionStatus } : {}),
    ...(sp.q ? { OR: [{ reference: { contains: sp.q, mode: "insensitive" } }, { orgName: { contains: sp.q, mode: "insensitive" } }, { email: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const orders = await db.bulkOrder.findMany({ where, include: { items: true }, orderBy: { createdAt: "desc" }, take: 200 });
  const counts = await db.bulkOrder.groupBy({ by: ["status"], _count: true });
  return (
    <>
      <PageHeader title="Bulk production orders" description="Enquiries, quotations and production orders from customers and organisations." />
      <div className="mb-4 flex flex-wrap gap-1.5 text-xs">{counts.map((c) => <Link key={c.status} href={`?status=${c.status}`} className="border border-charcoal-900/10 bg-white px-2 py-1">{c.status.replace(/_/g, " ").toLowerCase()} · {c._count}</Link>)}</div>
      <SearchBar q={sp.q} status={sp.status} statuses={[...PRODUCTION_FLOW, "CANCELLED"]} placeholder="Reference, organisation, email" />
      <Table head={["Reference", "Organisation", "Garments", "Units", "Required by", "Received", "Stage"]} empty="No orders.">
        {orders.map((o) => <tr key={o.id} className="hover:bg-cream-50"><Td><Link className="font-mono text-forest-700 hover:underline" href={`/admin/production/orders/${o.id}`}>{o.reference}</Link></Td><Td>{o.orgName}<div className="text-xs text-stone-500">{o.orgType.toLowerCase()}</div></Td><Td>{o.items.map((i) => i.garmentType).join(", ")}</Td><Td>{o.items.reduce((s, i) => s + i.quantity, 0).toLocaleString()}</Td><Td>{fmtDate(o.requiredBy)}</Td><Td>{fmtDate(o.createdAt)}</Td><Td><StatusBadge status={o.status} /></Td></tr>)}
      </Table>
    </>
  );
}
