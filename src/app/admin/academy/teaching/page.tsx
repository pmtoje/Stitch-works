import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { PageHeader, Table, Td } from "@/components/ui";
import { fmtDate } from "@/lib/format";

export default async function Teaching() {
  const u = await requirePermission("academy.teach");
  const instructor = await db.instructor.findUnique({ where: { userId: u.id } });
  const all = can(u.actor, "academy.manage");
  const sessions = await db.courseSession.findMany({ where: all ? {} : { OR: [{ instructorId: instructor?.id ?? "none" }, { course: { instructorId: instructor?.id ?? "none" } }] }, include: { course: true, _count: { select: { enrolments: true, classes: true, assignments: true } } }, orderBy: { startsOn: "desc" } });
  return (
    <>
      <PageHeader title="Teaching" description={all ? "All training sessions." : "Sessions you teach."} />
      <Table head={["Course", "Session", "Dates", "Students", "Classes", "Assignments"]} empty="No sessions assigned.">
        {sessions.map((s) => <tr key={s.id}><Td><Link className="text-forest-700 hover:underline" href={`/admin/academy/teaching/${s.id}`}>{s.course.title}</Link></Td><Td>{s.name}</Td><Td>{fmtDate(s.startsOn)} – {fmtDate(s.endsOn)}</Td><Td>{s._count.enrolments}/{s.capacity}</Td><Td>{s._count.classes}</Td><Td>{s._count.assignments}</Td></tr>)}
      </Table>
    </>
  );
}
