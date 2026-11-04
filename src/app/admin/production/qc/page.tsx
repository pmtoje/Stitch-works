import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { EmptyState, Field, Input, PageHeader, Panel, Table, Td } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { fmtDateTime } from "@/lib/format";
import { inspectionAction } from "../../actions";

export default async function QC() {
  await requirePermission("production.qc");
  const [pending, recent] = await Promise.all([
    db.productionSubmission.findMany({ where: { status: "PENDING_QC" }, include: { allocation: { include: { job: true, tailor: { include: { user: true } }, team: true } } }, orderBy: { createdAt: "asc" } }),
    db.qualityInspection.findMany({ orderBy: { inspectedAt: "desc" }, take: 30, include: { submission: { include: { allocation: { include: { job: true, tailor: { include: { user: true } }, team: true } } } } } }),
  ]);
  const officers = await db.user.findMany({ where: { id: { in: recent.map((r) => r.officerId) } }, select: { id: true, fullName: true } });
  return (
    <>
      <PageHeader title="Quality control" description="Inspect every submission. Only accepted pieces become payable piece-rate earnings; every inspection is recorded with the officer and date." />
      <h2 className="mb-3 font-sans text-lg font-semibold">Awaiting inspection ({pending.length})</h2>
      {pending.length ? (
        <div className="space-y-4">
          {pending.map((s) => (
            <Panel key={s.id} title={<>{s.allocation.job.title} <span className="font-mono text-xs font-normal text-stone-500">{s.allocation.job.reference}</span></>} actions={<span className="text-sm">{s.quantity} pieces · {s.allocation.tailor?.user.fullName ?? s.allocation.team?.name ?? s.allocation.partnerName} · {fmtDateTime(s.createdAt)}</span>}>
              <ActionForm action={inspectionAction} className="grid grid-cols-2 gap-3 md:grid-cols-6">
                <input type="hidden" name="submissionId" value={s.id} />
                <Field label="Inspected"><Input name="inspectedQty" defaultValue={s.quantity} required /></Field>
                <Field label="Accepted"><Input name="acceptedQty" defaultValue={s.quantity} required /></Field>
                <Field label="Rework"><Input name="reworkQty" defaultValue={0} /></Field>
                <Field label="Rejected"><Input name="rejectedQty" defaultValue={0} /></Field>
                <Field label="Defects (comma separated)" className="col-span-2"><Input name="defects" placeholder="skipped stitches, uneven hem" /></Field>
                <Field label="Rework instructions" className="col-span-2 md:col-span-5"><Input name="reworkNotes" /></Field>
                <div className="self-end"><SubmitButton>Record inspection</SubmitButton></div>
              </ActionForm>
              {s.note ? <p className="mt-2 text-sm text-stone-600">Tailor note: {s.note}</p> : null}
            </Panel>
          ))}
        </div>
      ) : <EmptyState title="Nothing waiting for QC" />}
      <h2 className="mb-3 mt-10 font-sans text-lg font-semibold">Recent inspections</h2>
      <Table head={["Date", "Job", "Assignee", "Inspected", "Accepted", "Rework", "Rejected", "Defects", "Officer"]}>
        {recent.map((r) => <tr key={r.id}><Td>{fmtDateTime(r.inspectedAt)}</Td><Td>{r.submission.allocation.job.reference}</Td><Td>{r.submission.allocation.tailor?.user.fullName ?? r.submission.allocation.team?.name ?? r.submission.allocation.partnerName}</Td><Td>{r.inspectedQty}</Td><Td>{r.acceptedQty}</Td><Td>{r.reworkQty}</Td><Td>{r.rejectedQty}</Td><Td>{r.defects.join(", ") || "—"}</Td><Td>{officers.find((o) => o.id === r.officerId)?.fullName}</Td></tr>)}
      </Table>
    </>
  );
}
