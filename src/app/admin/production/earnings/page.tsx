import type { EarningStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { Field, Input, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { SearchBar } from "@/components/dash/search";
import { fmtDate, naira } from "@/lib/format";
import { approveEarningsAction, payEarningsAction } from "../../actions";

export default async function EarningsAdmin({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requirePermission("production.view");
  const status = (sp.status || "PENDING_APPROVAL") as EarningStatus;
  const rows = await db.pieceRateEarning.findMany({ where: { status }, include: { tailor: { include: { user: true } }, allocation: { include: { job: true, team: true } } }, orderBy: { createdAt: "asc" } });
  const approve = can(u.actor, "earnings.approve") && status === "PENDING_APPROVAL";
  const pay = can(u.actor, "earnings.pay") && status === "APPROVED";
  const form = approve ? approveEarningsAction : payEarningsAction;
  const table = (
    <Table head={[approve || pay ? "" : "#", "Date", "Payee", "Job", "Accepted", "Rate", "Amount", "Status"]} empty="Nothing in this list.">
      {rows.map((r) => <tr key={r.id}><Td>{approve || pay ? <input type="checkbox" name="earningIds" value={r.id} defaultChecked className="accent-forest-700" aria-label="Select" /> : null}</Td><Td>{fmtDate(r.createdAt)}</Td><Td>{r.tailor ? `${r.tailor.user.fullName} (${r.tailor.code})` : r.allocation.team ? `Team ${r.allocation.team.name}` : r.allocation.partnerName}</Td><Td>{r.allocation.job.reference}</Td><Td>{r.quantity}</Td><Td>{naira(r.rate)}</Td><Td className="font-medium">{naira(r.amount)}</Td><Td><StatusBadge status={r.status} /></Td></tr>)}
    </Table>
  );
  return (
    <>
      <PageHeader title="Piece-rate earnings" description="Created only from QC-accepted pieces. Production managers approve; finance records payouts (separation of duties)." />
      <SearchBar status={status} statuses={["PENDING_APPROVAL", "APPROVED", "PAID", "VOID"]} />
      <p className="mb-3 text-sm">Total in list: <strong>{naira(rows.reduce((s, r) => s + r.amount, 0))}</strong></p>
      {approve || pay ? (
        <ActionForm action={form} className="space-y-4">
          {table}
          <div className="flex flex-wrap items-end gap-3">
            {pay ? <Field label="Payout / transfer reference"><Input name="payoutRef" required /></Field> : null}
            <SubmitButton>{approve ? "Approve selected" : "Mark selected as paid"}</SubmitButton>
          </div>
        </ActionForm>
      ) : table}
    </>
  );
}
