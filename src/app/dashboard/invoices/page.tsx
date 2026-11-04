import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { fmtDate, fmtDateTime, humanize, naira } from "@/lib/format";

export default async function MyInvoices() {
  const u = await requireUser();
  const [invoices, payments] = await Promise.all([
    db.invoice.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.payment.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 50, include: { invoice: true } }),
  ]);
  return (
    <>
      <PageHeader title="Invoices & payments" description="Pay outstanding invoices, download receipts and track every payment." />
      <Table head={["Invoice", "For", "Issued", "Amount", "Paid", "Status"]} empty="No invoices yet.">
        {invoices.map((i) => (
          <tr key={i.id}>
            <Td><Link href={`/dashboard/invoices/${i.id}`} className="font-mono text-forest-700 hover:underline">{i.number}</Link></Td>
            <Td className="max-w-[300px]">{i.description}<div className="text-xs text-stone-500">{humanize(i.purpose)}</div></Td>
            <Td>{fmtDate(i.createdAt)}</Td>
            <Td className="tabular-nums">{naira(i.amount)}</Td>
            <Td className="tabular-nums">{naira(i.amountPaid)}</Td>
            <Td><StatusBadge status={i.status} /></Td>
          </tr>
        ))}
      </Table>
      <h2 className="mb-3 mt-10 font-sans text-lg font-semibold">Payment history</h2>
      <Table head={["Reference", "Invoice", "Date", "Amount", "Method", "Status"]} empty="No payments yet.">
        {payments.map((p) => (
          <tr key={p.id}>
            <Td className="font-mono text-xs">{p.reference}</Td>
            <Td className="font-mono text-xs">{p.invoice.number}</Td>
            <Td>{fmtDateTime(p.createdAt)}</Td>
            <Td className="tabular-nums">{naira(p.amount)}</Td>
            <Td>{p.method ?? p.provider}</Td>
            <Td><StatusBadge status={p.status} /></Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
