import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Alert, EmptyState, Field, Input, PageHeader, Panel, StatusBadge, Table, Td } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { fmtDate, naira } from "@/lib/format";
import { applyJobAction, submitOutputAction } from "../../actions";

export default async function TailorJobs() {
  const u = await requireUser();
  const t = await db.tailor.findUnique({ where: { userId: u.id } });
  if (!t) redirect("/dashboard/application");
  const teamIds = (await db.teamMember.findMany({ where: { tailorId: t.id } })).map((m) => m.teamId);
  const [allocations, jobs, myApps] = await Promise.all([
    db.productionAllocation.findMany({ where: { OR: [{ tailorId: t.id }, { teamId: { in: teamIds } }], status: { not: "CANCELLED" } }, include: { job: true, team: true, submissions: { include: { inspection: true }, orderBy: { createdAt: "desc" } } }, orderBy: { createdAt: "desc" } }),
    db.productionJob.findMany({ where: { openToMarketplace: true, status: { in: ["OPEN", "IN_PROGRESS"] } }, include: { allocations: { where: { status: { not: "CANCELLED" } } } }, orderBy: { createdAt: "desc" } }),
    db.jobApplication.findMany({ where: { tailorId: t.id } }),
  ]);
  return (
    <>
      <PageHeader title="Production jobs" description="Your allocations, QC results and open jobs in the StitchWorks Production Marketplace." />
      <h2 className="mb-3 font-sans text-lg font-semibold">My allocations</h2>
      {allocations.length ? (
        <div className="space-y-4">
          {allocations.map((a) => {
            const accepted = a.submissions.reduce((s, x) => s + (x.inspection?.acceptedQty ?? 0), 0);
            const pending = a.submissions.filter((x) => x.status === "PENDING_QC").reduce((s, x) => s + x.quantity, 0);
            const remaining = a.quantity - accepted - pending;
            return (
              <Panel key={a.id} title={<>{a.job.title} <span className="font-mono text-xs font-normal text-stone-500">{a.job.reference}{a.team ? ` · team ${a.team.name}` : ""}</span></>} actions={<StatusBadge status={a.status} />}>
                <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                  <div>
                    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                      <div><p className="text-stone-500">Allocated</p><p className="text-xl font-semibold">{a.quantity}</p></div>
                      <div><p className="text-stone-500">QC accepted</p><p className="text-xl font-semibold text-forest-700">{accepted}</p></div>
                      <div><p className="text-stone-500">Awaiting QC</p><p className="text-xl font-semibold">{pending}</p></div>
                      <div><p className="text-stone-500">Rate / piece</p><p className="text-xl font-semibold">{naira(a.rate)}</p></div>
                    </div>
                    <div className="h-2 bg-cream-200"><div className="h-2 bg-forest-600" style={{ width: `${Math.min((accepted / a.quantity) * 100, 100)}%` }} /></div>
                    {a.submissions.length ? (
                      <ul className="mt-4 space-y-1 text-sm">
                        {a.submissions.map((s) => <li key={s.id} className="flex flex-wrap gap-2"><span className="text-stone-500">{fmtDate(s.createdAt)}</span> submitted {s.quantity} · {s.inspection ? <span>{s.inspection.acceptedQty} accepted, {s.inspection.reworkQty} rework, {s.inspection.rejectedQty} rejected{s.inspection.reworkNotes ? ` — ${s.inspection.reworkNotes}` : ""}</span> : <StatusBadge status="PENDING_QC" />}</li>)}
                      </ul>
                    ) : null}
                  </div>
                  {remaining > 0 && a.status !== "COMPLETED" ? (
                    <ActionForm action={submitOutputAction} className="space-y-3 border-l border-charcoal-900/10 pl-0 lg:pl-6" resetOnSuccess>
                      <input type="hidden" name="allocationId" value={a.id} />
                      <Field label={`Completed pieces (max ${remaining})`}><Input type="number" name="quantity" min={1} max={remaining} required /></Field>
                      <Field label="Note"><Input name="note" /></Field>
                      <SubmitButton>Submit for QC</SubmitButton>
                    </ActionForm>
                  ) : null}
                </div>
              </Panel>
            );
          })}
        </div>
      ) : <EmptyState title="No allocations yet" body="Apply for open jobs below. Production managers also allocate work directly to verified tailors." />}

      <h2 id="marketplace" className="mb-3 mt-10 font-sans text-lg font-semibold">Open jobs · Production Marketplace</h2>
      <Alert tone="info">Applying requires an active membership with production eligibility. Only QC-accepted pieces are paid, after management approval.</Alert>
      <div className="mt-4">
        <Table head={["Job", "Garment", "Remaining", "Rate", "Due", "Apply"]} empty="No open jobs right now.">
          {jobs.map((j) => {
            const left = j.totalQuantity - j.allocations.reduce((s, a) => s + a.quantity, 0);
            const applied = myApps.find((x) => x.jobId === j.id);
            return (
              <tr key={j.id}>
                <Td>{j.title}<div className="font-mono text-xs text-stone-500">{j.reference}</div></Td>
                <Td>{j.garmentType}</Td>
                <Td>{left.toLocaleString()}</Td>
                <Td>{naira(j.defaultRate)}</Td>
                <Td>{fmtDate(j.dueDate)}</Td>
                <Td>{applied ? <StatusBadge status={applied.status} /> : left > 0 ? (
                  <ActionForm action={applyJobAction} className="flex gap-2">
                    <input type="hidden" name="jobId" value={j.id} />
                    <Input type="number" name="quantity" min={1} max={left} placeholder="Qty" className="w-24 py-1.5" required />
                    <SubmitButton size="sm">Apply</SubmitButton>
                  </ActionForm>
                ) : "Fully allocated"}</Td>
              </tr>
            );
          })}
        </Table>
      </div>
    </>
  );
}
