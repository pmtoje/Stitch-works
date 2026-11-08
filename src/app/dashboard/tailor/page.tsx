import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { DL, Field, Input, PageHeader, Panel, StatusBadge, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { activeMembership } from "@/lib/memberships";
import { fmtDate } from "@/lib/format";
import { addPortfolioAction, removePortfolioAction, updateTailorProfileAction } from "../actions";

export default async function TailorProfile() {
  const u = await requireUser();
  const t = await db.tailor.findUnique({ where: { userId: u.id }, include: { facility: true, portfolio: { include: { upload: true }, orderBy: { createdAt: "desc" } }, allocations: { include: { submissions: { include: { inspection: true } } } } } });
  if (!t) redirect("/dashboard/application");
  const membership = await activeMembership(u.id);
  const accepted = t.allocations.flatMap((a) => a.submissions).reduce((s, x) => s + (x.inspection?.acceptedQty ?? 0), 0);
  const inspected = t.allocations.flatMap((a) => a.submissions).reduce((s, x) => s + (x.inspection?.inspectedQty ?? 0), 0);
  return (
    <>
      <PageHeader eyebrow={`Tailor ID ${t.code}`} title={u.fullName} actions={<StatusBadge status={t.verification} className="text-sm" />} />
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel title="Profile">
          <div className="mb-5 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {t.photoUploadId ? <img src={`/api/files/${t.photoUploadId}`} alt="" className="h-20 w-20 object-cover" /> : <div className="flex h-20 w-20 items-center justify-center bg-forest-100 font-display text-2xl text-forest-700">{u.fullName[0]}</div>}
            <DL items={[["Facility", t.facility?.name ?? "Unassigned"], ["Experience", `${t.yearsExperience} years`], ["Membership", membership ? `${membership.plan.name} · until ${fmtDate(membership.expiresAt)}` : "None"], ["Member since", fmtDate(t.createdAt)]]} />
          </div>
          <ActionForm action={updateTailorProfileAction} className="space-y-4">
            <Field label="Profile photo"><Input type="file" name="photo" accept="image/jpeg,image/png,image/webp" /></Field>
            <Field label="Bio"><Textarea name="bio" defaultValue={t.bio ?? ""} rows={3} /></Field>
            <Field label="Specialisations" hint="Comma separated"><Input name="specialisations" defaultValue={t.specialisations.join(", ")} /></Field>
            <SubmitButton>Save profile</SubmitButton>
          </ActionForm>
        </Panel>
        <Panel title="Performance">
          <DL items={[["Allocations", t.allocations.length], ["Pieces inspected", inspected.toLocaleString()], ["Pieces accepted", accepted.toLocaleString()], ["QC acceptance rate", inspected ? `${Math.round((accepted / inspected) * 100)}%` : "—"], ["Machine skills", t.machineSkills.join(", ") || "—"]]} />
        </Panel>
        <Panel title="Portfolio" className="xl:col-span-2">
          <ActionForm action={addPortfolioAction} className="mb-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" resetOnSuccess>
            <Field label="Title"><Input name="title" placeholder="e.g. Agbada with hand embroidery" /></Field>
            <Field label="Photos or videos"><Input type="file" name="files" multiple accept="image/*,video/mp4,video/quicktime" required /></Field>
            <SubmitButton>Upload</SubmitButton>
          </ActionForm>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {t.portfolio.map((p) => (
              <li key={p.id} className="border border-charcoal-900/10">
                {p.upload.mimeType.startsWith("video") ? <video src={`/api/files/${p.uploadId}`} controls className="aspect-square w-full bg-black object-cover" /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/files/${p.uploadId}`} alt={p.title} className="aspect-square w-full object-cover" />}
                <div className="flex items-center justify-between gap-2 p-2 text-xs"><span className="truncate">{p.title}</span><ActionForm action={removePortfolioAction}><input type="hidden" name="id" value={p.id} /><button className="text-red-700">Remove</button></ActionForm></div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
