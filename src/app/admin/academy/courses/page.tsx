import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { Field, Input, LinkButton, PageHeader, Panel, StatusBadge, Table, Td } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { naira } from "@/lib/format";
import { instructorAction } from "../../actions";

export default async function Courses() {
  await requirePermission("academy.manage");
  const [courses, instructors] = await Promise.all([db.course.findMany({ orderBy: { sortOrder: "asc" }, include: { sessions: { include: { _count: { select: { enrolments: true } } } }, instructor: { include: { user: true } } } }), db.instructor.findMany({ include: { user: true } })]);
  return (
    <>
      <PageHeader title="Courses & sessions" actions={<LinkButton href="/admin/academy/courses/new">New course</LinkButton>} />
      <Table head={["Course", "Level", "Weeks", "Fee", "Instructor", "Sessions", "Enrolled", "Status"]}>
        {courses.map((c) => <tr key={c.id}><Td><Link className="text-forest-700 hover:underline" href={`/admin/academy/courses/${c.id}`}>{c.title}</Link></Td><Td>{c.level}</Td><Td>{c.durationWeeks}</Td><Td>{naira(c.fee)}</Td><Td>{c.instructor?.user.fullName ?? "—"}</Td><Td>{c.sessions.length}</Td><Td>{c.sessions.reduce((s, x) => s + x._count.enrolments, 0)}</Td><Td><StatusBadge status={c.published ? "ACTIVE" : "DRAFT"} /></Td></tr>)}
      </Table>
      <Panel title="Instructors" className="mt-8">
        <ul className="mb-4 space-y-1 text-sm">{instructors.map((i) => <li key={i.id}>{i.user.fullName} · {i.title ?? "Instructor"} · {i.specialisms.join(", ")}</li>)}</ul>
        <ActionForm action={instructorAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" resetOnSuccess>
          <Field label="Account email"><Input name="email" type="email" required /></Field>
          <Field label="Title"><Input name="title" /></Field>
          <Field label="Specialisms"><Input name="specialisms" /></Field>
          <SubmitButton variant="secondary">Register instructor</SubmitButton>
        </ActionForm>
      </Panel>
    </>
  );
}
