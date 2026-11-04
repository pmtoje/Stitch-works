import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { LinkButton, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { fmtDate } from "@/lib/format";

export default async function MyOrders() {
  const u = await requireUser();
  const orders = await db.bulkOrder.findMany({ where: { customerId: u.id }, orderBy: { createdAt: "desc" }, include: { items: true } });
  return (
    <>
      <PageHeader title="Production orders" description="Track quotations, deposits and every production stage." actions={<LinkButton href="/bulk-production#request">New production request</LinkButton>} />
      <Table head={["Reference", "Organisation", "Garments", "Units", "Submitted", "Stage"]} empty="You haven’t submitted a production request yet.">
        {orders.map((o) => (
          <tr key={o.id}>
            <Td><Link href={`/dashboard/orders/${o.id}`} className="font-mono text-forest-700 hover:underline">{o.reference}</Link></Td>
            <Td>{o.orgName}</Td>
            <Td>{o.items.map((i) => i.garmentType).join(", ")}</Td>
            <Td className="tabular-nums">{o.items.reduce((s, i) => s + i.quantity, 0).toLocaleString()}</Td>
            <Td>{fmtDate(o.createdAt)}</Td>
            <Td><StatusBadge status={o.status} /></Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
