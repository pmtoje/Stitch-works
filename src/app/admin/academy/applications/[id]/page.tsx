import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { STUDENT_FLOW } from "@/lib/academy/service";
import { DL, Field, PageHeader, Panel, Select, StatusBadge, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { fmtDate, humanize, naira } from "@/lib/format";
import { studentAppStatusAction } from "../../../actions";

export default async function Admission({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission("academy.manage");
  const a = await db.studentApplication.findUnique({ where: { id }, include: { session: { include: { course: true, _count: { select: { enrolments: true } } } }, files: true, invoices: true } });
  if (!a) notFound();
  const next = STUDENT_FLOW[a.status] ?? [];
  return (
    <>
      <PageHeader eyebrow={a.reference} title={a.fullName} description={`${a.session.course.title} · ${a.session.name} · ${a.session._count.enrolments}/${a.session.capacity} places taken`} actions={<StatusBadge status={a.status} className="text-sm" />} />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Panel title="Application">
          <DL items={[["Contact", `${a.phone} · ${a.email}`], ["Address", a.address], ["Date of birth", fmtDate(a.dateOfBirth)], ["Education", a.education], ["Experience", a.experience], ["Motivation", a.motivation], ["Documents", a.files.length ? a.files.map((f) => <a key={f.id} className="link mr-3" target="_blank" href={`/api/files/${f.id}`}>{f.originalName}</a>) : "—"], ["Invoices", a.invoices.map((i) => <span key={i.id} className="mr-3"><Link className="link font-mono" href={`/admin/finance/invoices/${i.id}`}>{i.number}</Link> {humanize(i.purpose)} {naira(i.amount)} <StatusBadge status={i.status} /></span>)]]} />
        </Panel>
        {next.length ? (
          <Panel title="Decision">
            <ActionForm action={studentAppStatusAction} className="space-y-3">
              <input type="hidden" name="applicationId" value={a.id} />
              <Field label="Move to"><Select name="to">{next.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></Field>
              <p className="text-xs text-stone-500">Accepting issues the tuition invoice; the student is registered automatically once it is paid. “Registered” manually enrols (e.g. scholarship or offline payment).</p>
              <Field label="Note"><Textarea name="note" rows={2} /></Field>
              <SubmitButton>Update</SubmitButton>
            </ActionForm>
          </Panel>
        ) : null}
      </div>
    </>
  );
}
