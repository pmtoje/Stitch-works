import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, StatTile, StatusBadge, Table, Td } from "@/components/ui";
import { fmtDate, naira } from "@/lib/format";

export default async function Earnings() {
  const u = await requireUser();
  const t = await db.tailor.findUnique({ where: { userId: u.id } });
  if (!t) redirect("/dashboard/application");
  // Only this tailor's own earnings are ever queried.
  const rows = await db.pieceRateEarning.findMany({ where: { tailorId: t.id }, include: { allocation: { include: { job: true } } }, orderBy: { createdAt: "desc" } });
  const sum = (s: string) => rows.filter((r) => r.status === s).reduce((a, r) => a + r.amount, 0);
  return (
    <>
      <PageHeader title="Piece-rate earnings" description="Earnings are created from QC-accepted pieces, approved by the production manager and paid by finance." />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatTile label="Pending approval" value={naira(sum("PENDING_APPROVAL"))} />
        <StatTile label="Approved, awaiting payout" value={naira(sum("APPROVED"))} />
        <StatTile label="Paid to date" value={naira(sum("PAID"))} />
      </div>
      <Table head={["Date", "Job", "Accepted pieces", "Rate", "Amount", "Status", "Payout ref"]} empty="No earnings yet.">
        {rows.map((r) => (
          <tr key={r.id}><Td>{fmtDate(r.createdAt)}</Td><Td>{r.allocation.job.title}</Td><Td>{r.quantity}</Td><Td>{naira(r.rate)}</Td><Td className="font-medium">{naira(r.amount)}</Td><Td><StatusBadge status={r.status} /></Td><Td className="font-mono text-xs">{r.payoutRef ?? "—"}</Td></tr>
        ))}
      </Table>
    </>
  );
}
