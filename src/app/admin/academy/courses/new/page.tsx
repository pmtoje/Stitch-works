import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader, Panel } from "@/components/ui";
import { CourseForm } from "@/components/dash/course-form";

export default async function NewCourse() {
  await requirePermission("academy.manage");
  const instructors = await db.instructor.findMany({ include: { user: true } });
  return (<><PageHeader title="New course" /><Panel><CourseForm instructors={instructors.map((i) => ({ id: i.id, name: i.user.fullName }))} /></Panel></>);
}
