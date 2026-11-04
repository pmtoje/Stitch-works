import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { Checkbox, DL, Field, Input, PageHeader, Panel, Select, StatusBadge, Table, Td } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { fmtDate, naira } from "@/lib/format";
import { allocateAction, jobAction, jobApplicationAction } from "../../../actions";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requirePermission("production.view");
  const j = await db.productionJob.findUnique({ where: { id }, include: { order: true, allocations: { include: { tailor: { include: { user: true } }, team: true, submissions: { include: { inspection: true } }, earnings: true }, orderBy: { createdAt: "asc" } }, applications: { include: { tailor: { include: { user: true } } }, orderBy: { createdAt: "asc" } } } });
  if (!j) notFound();
  const manage = can(u.actor, "production.manage");
  const [tailors, teams, facilities] = await Promise.all([db.tailor.findMany({ where: { verification: "VERIFIED" }, include: { user: true }, orderBy: { code: "asc" } }), db.tailorTeam.findMany(), db.facility.findMany()]);
  const allocated = j.allocations.filter((a) => a.status !== "CANCELLED").reduce((s, a) => s + a.quantity, 0);
  return (
    <>
      <PageHeader eyebrow={j.reference} title={j.title} description={j.order ? `From order ${j.order.reference}` : "Standalone job"} actions={<StatusBadge status={j.status} className="text-sm" />} />
      <div className="grid gap-6 2xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Panel title={`Allocations · ${allocated}/${j.totalQuantity} units allocated`}>
            <Table head={["Assignee", "Qty", "Rate", "Submitted", "Accepted", "Rework/rejected", "Payable (approved)", "Status"]} empty="No allocations yet.">
              {j.allocations.map((a) => {
                const sub = a.submissions.reduce((s, x) => s + x.quantity, 0);
                const acc = a.submissions.reduce((s, x) => s + (x.inspection?.acceptedQty ?? 0), 0);
                const rej = a.submissions.reduce((s, x) => s + (x.inspection ? x.inspection.reworkQty + x.inspection.rejectedQty : 0), 0);
                const payable = a.earnings.filter((e) => e.status === "APPROVED" || e.status === "PAID").reduce((s, e) => s + e.amount, 0);
                return <tr key={a.id}><Td>{a.tailor ? <>{a.tailor.user.fullName}<div className="font-mono text-xs text-stone-500">{a.tailor.code}</div></> : a.team ? `Team: ${a.team.name}` : `Partner: ${a.partnerName}`}</Td><Td>{a.quantity}</Td><Td>{naira(a.rate)}</Td><Td>{sub}</Td><Td>{acc}</Td><Td>{rej}</Td><Td>{naira(payable)}</Td><Td><StatusBadge status={a.status} /></Td></tr>;
              })}
            </Table>
          </Panel>
          {manage && allocated < j.totalQuantity ? (
            <Panel title="Allocate production">
              <ActionForm action={allocateAction} className="grid gap-3 sm:grid-cols-3" resetOnSuccess>
                <input type="hidden" name="jobId" value={j.id} />
                <Field label="Assign to"><Select name="assigneeType"><option value="tailor">Individual tailor</option><option value="team">Tailor team</option><option value="partner">External partner</option></Select></Field>
                <Field label="Tailor"><Select name="tailorId">{tailors.map((t) => <option key={t.id} value={t.id}>{t.code} · {t.user.fullName}</option>)}</Select></Field>
                <Field label="Team"><Select name="teamId"><option value="">—</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
                <Field label="External partner name"><Input name="partnerName" /></Field>
                <Field label={`Quantity (max ${j.totalQuantity - allocated})`}><Input type="number" name="quantity" min={1} max={j.totalQuantity - allocated} required /></Field>
                <Field label="Rate ₦/accepted piece"><Input name="rate" defaultValue={j.defaultRate} required /></Field>
                <Field label="Due"><Input type="date" name="dueDate" /></Field>
                <div className="self-end"><SubmitButton>Allocate</SubmitButton></div>
              </ActionForm>
            </Panel>
          ) : null}
          <Panel title="Marketplace applications">
            <Table head={["Tailor", "Qty offered", "Message", "Status", ""]} empty="No applications.">
              {j.applications.map((a) => <tr key={a.id}><Td>{a.tailor.user.fullName}<div className="font-mono text-xs">{a.tailor.code}</div></Td><Td>{a.quantity}</Td><Td>{a.message}</Td><Td><StatusBadge status={a.status} /></Td><Td>{manage && a.status === "PENDING" ? <ActionForm action={jobApplicationAction} className="flex gap-1"><input type="hidden" name="applicationId" value={a.id} /><input type="hidden" name="jobId" value={j.id} /><SubmitButton size="sm" name="decision" value="accept">Accept</SubmitButton><SubmitButton size="sm" variant="secondary" name="decision" value="decline">Decline</SubmitButton></ActionForm> : null}</Td></tr>)}
            </Table>
          </Panel>
        </div>
        <Panel title="Job settings">
          <DL items={[["Garment", j.garmentType], ["Total units", j.totalQuantity], ["Description", j.description], ["Due", fmtDate(j.dueDate)]]} />
          {manage ? (
            <ActionForm action={jobAction} className="mt-5 space-y-3 border-t border-charcoal-900/10 pt-5">
              <input type="hidden" name="id" value={j.id} />
              <Field label="Default piece rate ₦"><Input name="defaultRate" defaultValue={j.defaultRate} /></Field>
              <Field label="Due date"><Input type="date" name="dueDate" defaultValue={j.dueDate?.toISOString().slice(0, 10)} /></Field>
              <Field label="Facility"><Select name="facilityId" defaultValue={j.facilityId ?? ""}><option value="">—</option>{facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
              <Field label="Status"><Select name="status" defaultValue={j.status}>{["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((s) => <option key={s}>{s}</option>)}</Select></Field>
              <Checkbox name="openToMarketplace" defaultChecked={j.openToMarketplace} label="Open to Production Marketplace" />
              <SubmitButton variant="secondary">Save</SubmitButton>
            </ActionForm>
          ) : null}
          {j.order ? <p className="mt-4 text-sm"><Link className="link" href={`/admin/production/orders/${j.order.id}`}>View customer order →</Link></p> : null}
        </Panel>
      </div>
    </>
  );
}
