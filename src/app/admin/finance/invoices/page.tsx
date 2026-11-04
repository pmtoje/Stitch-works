import Link from "next/link";
import type { InvoiceStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { SearchBar } from "@/components/dash/search";
import { fmtDate, humanize, naira } from "@/lib/format";

export default async function Invoices({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requirePermission("finance.view");
  const where: Prisma.InvoiceWhereInput = {
    ...(sp.status === "open" ? { status: { in: ["ISSUED", "PARTIALLY_PAID"] } } : sp.status ? { status: sp.status as InvoiceStatus } : {}),
    ...(sp.q ? { OR: [{ number: { contains: sp.q, mode: "insensitive" } }, { user: { fullName: { contains: sp.q, mode: "insensitive" } } }, { description: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const invoices = await db.invoice.findMany({ where, include: { user: true }, orderBy: { createdAt: "desc" }, take: 300 });
  return (
    <>
      <PageHeader title="Invoices & payments" />
      <SearchBar q={sp.q} status={sp.status} statuses={["open", "ISSUED", "PARTIALLY_PAID", "PAID", "VOID", "REFUNDED"]} placeholder="Invoice no., customer, description" />
      <Table head={["Invoice", "Customer", "Purpose", "Issued", "Amount", "Paid", "Refunded", "Status"]} empty="No invoices.">
        {invoices.map((i) => <tr key={i.id}><Td><Link className="font-mono text-forest-700 hover:underline" href={`/admin/finance/invoices/${i.id}`}>{i.number}</Link></Td><Td>{i.user.fullName}</Td><Td>{humanize(i.purpose)}</Td><Td>{fmtDate(i.createdAt)}</Td><Td className="tabular-nums">{naira(i.amount)}</Td><Td className="tabular-nums">{naira(i.amountPaid)}</Td><Td className="tabular-nums">{i.amountRefunded ? naira(i.amountRefunded) : "—"}</Td><Td><StatusBadge status={i.status} /></Td></tr>)}
      </Table>
    </>
  );
}
