import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { TAILOR_FLOW } from "@/lib/tailors/service";
import { DL, Field, Input, PageHeader, Panel, Select, StatusBadge, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { fmtDate, fmtDateTime, humanize } from "@/lib/format";
import { tailorAppCommentAction, tailorAppStatusAction } from "../../../actions";

export default async function TailorApp({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission("tailors.review");
  const a = await db.tailorApplication.findUnique({ where: { id }, include: { files: true, comments: { orderBy: { createdAt: "asc" } } } });
  if (!a) notFound();
  const [authors, facilities, history] = await Promise.all([
    db.user.findMany({ where: { id: { in: a.comments.map((c) => c.authorId) } }, select: { id: true, fullName: true } }),
    db.facility.findMany({ select: { id: true, name: true } }),
    db.auditLog.findMany({ where: { entityType: "TailorApplication", entityId: a.id }, orderBy: { createdAt: "asc" }, include: { actor: true } }),
  ]);
  const next = TAILOR_FLOW[a.status];
  return (
    <>
      <PageHeader eyebrow={`Application ${a.reference}`} title={a.fullName} description={`${a.yearsExperience} years · ${a.lga}, ${a.state}`} actions={<StatusBadge status={a.status} className="text-sm" />} />
      <div className="grid gap-6 2xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Panel title="Applicant">
            <DL items={[["Contact", `${a.phone} · ${a.email}`], ["Address", a.address], ["Date of birth", fmtDate(a.dateOfBirth)], ["Specialisations", a.specialisations.join(", ")], ["Garments produced", a.garmentTypes.join(", ")], ["Machine competencies", a.machineSkills.join(", ")], ["Previous work", a.previousWork], ["Preferred arrangement", a.workingArrangement], ["Interested in", a.interests.map(humanize).join(", ")], ["References", a.references], ["Assessment", fmtDateTime(a.assessmentAt)]]} />
          </Panel>
          <Panel title={`Portfolio & documents (${a.files.length})`}>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {a.files.map((f) => (
                <li key={f.id} className="border border-charcoal-900/10">
                  <a href={`/api/files/${f.id}`} target="_blank" rel="noopener noreferrer">
                    {f.mimeType.startsWith("image/") ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/files/${f.id}`} alt={f.originalName} className="aspect-square w-full object-cover" /> : <div className="flex aspect-square items-center justify-center bg-cream-100 text-xs">{f.mimeType.split("/")[1].toUpperCase()}</div>}
                    <p className="truncate p-2 text-xs">{f.originalName}</p>
                  </a>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Internal comments">
            <ul className="mb-4 space-y-3">{a.comments.map((c) => <li key={c.id} className="border-l-2 border-ochre-400 pl-3 text-sm"><p>{c.body}</p><p className="text-xs text-stone-500">{authors.find((x) => x.id === c.authorId)?.fullName} · {fmtDateTime(c.createdAt)}</p></li>)}</ul>
            <ActionForm action={tailorAppCommentAction} className="space-y-2" resetOnSuccess><input type="hidden" name="applicationId" value={a.id} /><Textarea name="body" rows={2} required placeholder="Visible to staff only" /><SubmitButton size="sm" variant="secondary">Add comment</SubmitButton></ActionForm>
          </Panel>
        </div>
        <div className="space-y-6">
          {next.length ? (
            <Panel title="Next step">
              <ActionForm action={tailorAppStatusAction} className="space-y-3">
                <input type="hidden" name="applicationId" value={a.id} />
                <Field label="Move to"><Select name="to">{next.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></Field>
                <div className="grid grid-cols-2 gap-2"><Field label="Assessment date"><Input type="date" name="assessmentDate" /></Field><Field label="Time"><Input type="time" name="assessmentTime" defaultValue="10:00" /></Field></div>
                <Field label="Assign to facility (on approval)"><Select name="facilityId" defaultValue={a.preferredFacilityId ?? ""}>{facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
                <Field label="Note (sent to applicant for rejections; logged internally)"><Textarea name="note" rows={2} /></Field>
                <SubmitButton>Update application</SubmitButton>
              </ActionForm>
            </Panel>
          ) : null}
          <Panel title="Audit trail"><ul className="space-y-1 text-xs">{history.map((h) => <li key={h.id}>{fmtDateTime(h.createdAt)} · {h.action} · {h.actor?.fullName ?? "system"}{h.data && typeof h.data === "object" && "to" in h.data ? ` → ${String((h.data as { to: string }).to)}` : ""}</li>)}</ul></Panel>
        </div>
      </div>
    </>
  );
}
