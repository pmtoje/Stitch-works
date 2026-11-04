import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { Checkbox, Field, Input, PageHeader, Panel, Select } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { CourseForm } from "@/components/dash/course-form";
import { resourceAction, sessionAction } from "../../../actions";

export default async function CourseAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission("academy.manage");
  const c = await db.course.findUnique({ where: { id }, include: { sessions: { orderBy: { startsOn: "asc" }, include: { _count: { select: { enrolments: true, applications: true } } } }, resources: true } });
  if (!c) notFound();
  const [instructors, facilities] = await Promise.all([db.instructor.findMany({ include: { user: true } }), db.facility.findMany()]);
  const d = (x?: Date) => x?.toISOString().slice(0, 10);
  return (
    <>
      <PageHeader eyebrow="Course" title={c.title} actions={c.published ? <Link className="link text-sm" href={`/academy/${c.slug}`}>View public page</Link> : null} />
      <div className="grid gap-6 2xl:grid-cols-2">
        <Panel title="Course details"><CourseForm c={c} instructors={instructors.map((i) => ({ id: i.id, name: i.user.fullName }))} /></Panel>
        <div className="space-y-6">
          {[...c.sessions, null].map((s) => (
            <Panel key={s?.id ?? "new"} title={s ? `${s.name} · ${s._count.enrolments}/${s.capacity} enrolled · ${s._count.applications} applications` : "New training session"} actions={s ? <Link className="text-sm text-forest-700" href={`/admin/academy/teaching/${s.id}`}>Teaching →</Link> : null}>
              <ActionForm action={sessionAction} className="grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="courseId" value={c.id} />{s ? <input type="hidden" name="id" value={s.id} /> : null}
                <Field label="Name" className="sm:col-span-2"><Input name="name" defaultValue={s?.name} required /></Field>
                <Field label="Facility"><Select name="facilityId" defaultValue={s?.facilityId}>{facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
                <Field label="Starts"><Input type="date" name="startsOn" defaultValue={d(s?.startsOn)} required /></Field>
                <Field label="Ends"><Input type="date" name="endsOn" defaultValue={d(s?.endsOn)} required /></Field>
                <Field label="Application deadline"><Input type="date" name="applicationDeadline" defaultValue={d(s?.applicationDeadline)} required /></Field>
                <Field label="Schedule"><Input name="schedule" defaultValue={s?.schedule ?? "Mon · Wed · Fri, 9:00–13:00"} /></Field>
                <Field label="Capacity (slots)"><Input name="capacity" defaultValue={s?.capacity ?? 16} /></Field>
                <Field label="Fee override (₦)"><Input name="feeOverride" defaultValue={s?.feeOverride ?? ""} /></Field>
                <Field label="Instructor"><Select name="instructorId" defaultValue={s?.instructorId ?? ""}><option value="">Course default</option>{instructors.map((i) => <option key={i.id} value={i.id}>{i.user.fullName}</option>)}</Select></Field>
                <Checkbox name="open" defaultChecked={s?.open ?? true} label="Open for applications" />
                <div className="self-end"><SubmitButton size="sm" variant="secondary">{s ? "Save session" : "Create session"}</SubmitButton></div>
              </ActionForm>
            </Panel>
          ))}
          <Panel title="Learning resources">
            <ul className="mb-4 space-y-1 text-sm">{c.resources.map((r) => <li key={r.id}>{r.title} · {r.kind.toLowerCase()}</li>)}</ul>
            <ActionForm action={resourceAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" resetOnSuccess>
              <input type="hidden" name="courseId" value={c.id} />
              <Field label="Title"><Input name="title" required /></Field>
              <Field label="File"><Input type="file" name="file" /></Field>
              <Field label="…or link"><Input name="url" type="url" /></Field>
              <SubmitButton size="sm" variant="secondary">Upload</SubmitButton>
            </ActionForm>
          </Panel>
        </div>
      </div>
    </>
  );
}
