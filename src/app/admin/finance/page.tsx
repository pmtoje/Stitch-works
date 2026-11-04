import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { parseRange } from "@/lib/analytics";
import { LinkButton, PageHeader, Panel, StatTile, StatusBadge, Table, Td } from "@/components/ui";
import { BarList, ColumnChart } from "@/components/dash/charts";
import { RangeFilter } from "@/components/dash/filters";
import { fmtDateTime, humanize, naira } from "@/lib/format";

export default async function Finance({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requirePermission("finance.view");
  const r = parseRange(sp);
  const [payments, pending, refunds, open, monthly] = await Promise.all([
    db.payment.findMany({ where: { status: "SUCCEEDED", verifiedAt: { gte: r.from, lte: r.to } }, include: { invoice: true, user: true }, orderBy: { verifiedAt: "desc" } }),
    db.payment.findMany({ where: { status: "PENDING" }, include: { invoice: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.refund.findMany({ where: { createdAt: { gte: r.from, lte: r.to } } }),
    db.invoice.findMany({ where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] } } }),
    db.$queryRaw<{ month: string; total: number }[]>`SELECT to_char(date_trunc('month', "verifiedAt" + interval '1 hour'), 'YYYY-MM') AS month, SUM(amount)::int AS total FROM "Payment" WHERE status = 'SUCCEEDED' AND "verifiedAt" > now() - interval '12 months' GROUP BY 1 ORDER BY 1`,
  ]);
  const total = payments.reduce((s, p) => s + p.amount, 0);
  const byPurpose: Record<string, number> = {};
  for (const p of payments) byPurpose[p.invoice.purpose] = (byPurpose[p.invoice.purpose] ?? 0) + p.amount;
  const refunded = refunds.reduce((s, x) => s + x.amount, 0);
  return (
    <>
      <PageHeader title="Finance overview" description="Only gateway-verified or finance-recorded payments count as revenue. Pending payments are never treated as paid." actions={<LinkButton href={`/api/reports/transactions?from=${r.fromStr}&to=${r.toStr}&format=xlsx`} variant="secondary">Export transactions</LinkButton>} />
      <RangeFilter from={r.fromStr} to={r.toStr} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Confirmed revenue" value={naira(total)} sub={`${payments.length} payments`} />
        <StatTile label="Refunds" value={naira(refunded)} />
        <StatTile label="Net" value={naira(total - refunded)} />
        <StatTile label="Outstanding invoices" value={naira(open.reduce((s, i) => s + i.amount - i.amountPaid, 0))} sub={`${open.length} open`} href="/admin/finance/invoices?status=open" />
        <StatTile label="Pending payments" value={pending.length} sub="awaiting gateway confirmation" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Monthly revenue (last 12 months)"><ColumnChart label="Monthly revenue" data={monthly.map((m) => ({ key: m.month, label: m.month, value: Number(m.total) }))} /></Panel>
        <Panel title="Revenue by service"><BarList data={Object.entries(byPurpose).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: humanize(k), value: v }))} /></Panel>
      </div>
      <Panel title="Confirmed payments" className="mt-6">
        <Table head={["Verified", "Reference", "Payer", "Invoice", "For", "Method", "Amount"]} empty="No payments in this period.">
          {payments.slice(0, 100).map((p) => <tr key={p.id}><Td>{fmtDateTime(p.verifiedAt)}</Td><Td className="font-mono text-xs">{p.reference}</Td><Td>{p.user.fullName}</Td><Td className="font-mono text-xs">{p.invoice.number}</Td><Td>{humanize(p.invoice.purpose)}</Td><Td>{p.method ?? p.provider}</Td><Td className="tabular-nums">{naira(p.amount)}</Td></tr>)}
        </Table>
      </Panel>
      <Panel title="Pending payments (not counted as paid)" className="mt-6">
        <Table head={["Started", "Reference", "Invoice", "Amount", "Status"]} empty="None.">
          {pending.map((p) => <tr key={p.id}><Td>{fmtDateTime(p.createdAt)}</Td><Td className="font-mono text-xs">{p.reference}</Td><Td className="font-mono text-xs">{p.invoice.number}</Td><Td>{naira(p.amount)}</Td><Td><StatusBadge status={p.status} /></Td></tr>)}
        </Table>
      </Panel>
    </>
  );
}
