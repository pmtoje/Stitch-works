import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { assertCanTeach } from "@/lib/academy/service";
import { Field, Input, PageHeader, Panel, StatusBadge, Table, Td, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { fmtDate } from "@/lib/format";
import { assessmentAction, assignmentAction, attendanceAction, classMeetingAction, completeEnrolmentAction, gradeAction, issueCertificateAction } from "../../../actions";

export default async function SessionTeaching({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const u = await requirePermission("academy.teach");
  try { await assertCanTeach(u.actor, sessionId); } catch { redirect("/admin/academy/teaching"); }
  const s = await db.courseSession.findUnique({
    where: { id: sessionId },
    include: { course: true, classes: { orderBy: { date: "asc" }, include: { attendance: true } }, assignments: { include: { submissions: { include: { enrolment: { include: { user: true } } } } }, orderBy: { dueAt: "asc" } }, enrolments: { include: { user: true, assessments: true, certificate: true, attendance: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!s) notFound();
  const admin = can(u.actor, "academy.manage");
  const active = s.enrolments.filter((e) => e.status !== "WITHDRAWN");
  return (
    <>
      <PageHeader eyebrow={s.course.title} title={s.name} description={`${fmtDate(s.startsOn)} – ${fmtDate(s.endsOn)} · ${s.schedule} · ${active.length} students`} />
      <div className="space-y-6">
        <Panel title="Students, assessments & certification">
          <Table head={["Student", "Attendance", "Assessments", "Final", "Status", "Record assessment", ""]} empty="No students enrolled yet.">
            {s.enrolments.map((e) => {
              const pres = e.attendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
              return (
                <tr key={e.id}>
                  <Td>{e.user.fullName}</Td>
                  <Td>{pres}/{e.attendance.length}</Td>
                  <Td className="text-xs">{e.assessments.map((a) => <div key={a.id}>{a.title}: {a.score}/{a.maxScore} {a.passed ? "✓" : "✗"}</div>)}</Td>
                  <Td>{e.finalScore != null ? `${e.finalScore}%` : "—"}</Td>
                  <Td><StatusBadge status={e.status} />{e.certificate ? <div className="font-mono text-[10px]">{e.certificate.code}</div> : null}</Td>
                  <Td>{e.status !== "COMPLETED" && e.status !== "WITHDRAWN" ? <ActionForm action={assessmentAction} className="flex gap-1" resetOnSuccess><input type="hidden" name="enrolmentId" value={e.id} /><input type="hidden" name="sessionId" value={s.id} /><Input name="title" placeholder="Practical: shirt" className="w-36 py-1 text-xs" required /><Input name="score" placeholder="Score" className="w-16 py-1 text-xs" required /><Input name="maxScore" defaultValue={100} className="w-14 py-1 text-xs" /><SubmitButton size="sm" variant="ghost">Save</SubmitButton></ActionForm> : null}</Td>
                  <Td>{admin && (e.status === "IN_TRAINING" || e.status === "REGISTERED") ? <ActionForm action={completeEnrolmentAction}><input type="hidden" name="enrolmentId" value={e.id} /><input type="hidden" name="sessionId" value={s.id} /><SubmitButton size="sm" variant="secondary">Complete</SubmitButton></ActionForm> : admin && e.status === "COMPLETED" && !e.certificate ? <ActionForm action={issueCertificateAction}><input type="hidden" name="enrolmentId" value={e.id} /><input type="hidden" name="sessionId" value={s.id} /><SubmitButton size="sm">Issue certificate</SubmitButton></ActionForm> : null}</Td>
                </tr>
              );
            })}
          </Table>
        </Panel>
        <div className="grid gap-6 2xl:grid-cols-2">
          <Panel title="Classes & attendance">
            <ActionForm action={classMeetingAction} className="mb-5 flex flex-wrap items-end gap-2" resetOnSuccess>
              <input type="hidden" name="sessionId" value={s.id} />
              <Field label="Date"><Input type="date" name="date" required /></Field>
              <Field label="Topic"><Input name="topic" required /></Field>
              <SubmitButton size="sm" variant="secondary">Add class</SubmitButton>
            </ActionForm>
            <div className="space-y-4">
              {s.classes.map((c) => (
                <details key={c.id} className="border border-charcoal-900/10 p-3">
                  <summary className="cursor-pointer text-sm font-medium">{fmtDate(c.date)} · {c.topic} <span className="text-xs text-stone-500">({c.attendance.length} recorded)</span></summary>
                  <ActionForm action={attendanceAction} className="mt-3 space-y-2">
                    <input type="hidden" name="meetingId" value={c.id} /><input type="hidden" name="sessionId" value={s.id} />
                    {active.map((e) => {
                      const cur = c.attendance.find((a) => a.enrolmentId === e.id)?.status ?? "PRESENT";
                      return (
                        <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <input type="hidden" name="enrolmentId" value={e.id} />
                          <span>{e.user.fullName}</span>
                          <span className="flex gap-3">{["PRESENT", "LATE", "ABSENT", "EXCUSED"].map((st) => <label key={st} className="flex items-center gap-1 text-xs"><input type="radio" name={`status_${e.id}`} value={st} defaultChecked={cur === st} className="accent-forest-700" />{st.toLowerCase()}</label>)}</span>
                        </div>
                      );
                    })}
                    <SubmitButton size="sm">Save attendance</SubmitButton>
                  </ActionForm>
                </details>
              ))}
            </div>
          </Panel>
          <Panel title="Assignments">
            <ActionForm action={assignmentAction} className="mb-5 grid gap-2 sm:grid-cols-3" resetOnSuccess>
              <input type="hidden" name="sessionId" value={s.id} />
              <Field label="Title"><Input name="title" required /></Field>
              <Field label="Due"><Input type="date" name="dueAt" required /></Field>
              <Field label="Max score"><Input name="maxScore" defaultValue={100} /></Field>
              <Field label="Brief" className="sm:col-span-3"><Textarea name="brief" rows={2} required /></Field>
              <SubmitButton size="sm" variant="secondary">Publish assignment</SubmitButton>
            </ActionForm>
            {s.assignments.map((a) => (
              <div key={a.id} className="mb-4 border border-charcoal-900/10 p-3">
                <p className="font-medium">{a.title} <span className="text-xs text-stone-500">due {fmtDate(a.dueAt)} · {a.submissions.length} submitted</span></p>
                <ul className="mt-2 space-y-2">
                  {a.submissions.map((sub) => (
                    <li key={sub.id} className="text-sm">
                      <p>{sub.enrolment.user.fullName}: {sub.text ?? ""} {sub.uploadId ? <a className="link" target="_blank" href={`/api/files/${sub.uploadId}`}>file</a> : null}</p>
                      {sub.gradedAt ? <p className="text-xs text-stone-500">Graded {sub.score}/{a.maxScore}</p> : (
                        <ActionForm action={gradeAction} className="mt-1 flex gap-1"><input type="hidden" name="submissionId" value={sub.id} /><input type="hidden" name="sessionId" value={s.id} /><Input name="score" placeholder="Score" className="w-20 py-1 text-xs" required /><Input name="feedback" placeholder="Feedback" className="py-1 text-xs" /><SubmitButton size="sm" variant="ghost">Grade</SubmitButton></ActionForm>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </>
  );
}
