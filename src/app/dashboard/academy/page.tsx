import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Alert, DL, EmptyState, Field, Input, LinkButton, PageHeader, Panel, StatusBadge, Table, Td, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { fmtDate, naira } from "@/lib/format";
import { outstanding } from "@/lib/payments/invoices";
import { payInvoiceAction, submitAssignmentAction } from "../actions";

export default async function StudentPortal() {
  const u = await requireUser();
  const apps = await db.studentApplication.findMany({
    where: { userId: u.id },
    orderBy: { createdAt: "desc" },
    include: {
      invoices: true,
      session: { include: { course: { include: { resources: true } }, instructor: { include: { user: true } }, classes: { orderBy: { date: "asc" } }, assignments: { orderBy: { dueAt: "asc" } } } },
      enrolment: { include: { attendance: true, submissions: true, assessments: true, certificate: true } },
    },
  });
  if (!apps.length) return (<><PageHeader title="StitchWorks Academy" /><EmptyState title="No applications yet" body="Browse programmes and apply in a few minutes." action={<LinkButton href="/academy">Browse programmes</LinkButton>} /></>);
  return (
    <>
      <PageHeader title="Student portal" description="Your courses, schedules, attendance, assignments, results and certificates." actions={<LinkButton href="/academy" variant="secondary">Browse programmes</LinkButton>} />
      <div className="space-y-8">
        {apps.map((a) => {
          const e = a.enrolment;
          const s = a.session;
          const unpaid = a.invoices.filter((i) => outstanding(i) > 0 && i.status !== "VOID");
          const present = e?.attendance.filter((x) => x.status === "PRESENT" || x.status === "LATE").length ?? 0;
          return (
            <section key={a.id} className="border border-charcoal-900/10 bg-white">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-charcoal-900/10 bg-cream-100/60 px-5 py-4">
                <div><p className="font-mono text-xs text-stone-500">{a.reference}</p><h2 className="text-2xl">{s.course.title}</h2><p className="text-sm text-stone-600">{s.name} · {s.schedule}</p></div>
                <StatusBadge status={a.status} className="text-sm" />
              </header>
              <div className="grid gap-6 p-5 xl:grid-cols-2">
                <div className="space-y-4">
                  {unpaid.map((i) => (
                    <Alert key={i.id} tone="warn">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span>{i.description}: {naira(outstanding(i))} due.</span>
                        <ActionForm action={payInvoiceAction}><input type="hidden" name="invoiceId" value={i.id} /><SubmitButton size="sm">Pay now</SubmitButton></ActionForm>
                      </div>
                    </Alert>
                  ))}
                  <DL items={[["Dates", `${fmtDate(s.startsOn)} – ${fmtDate(s.endsOn)}`], ["Instructor", s.instructor?.user.fullName ?? "To be confirmed"], ["Attendance", e ? `${present} of ${e.attendance.length} classes recorded` : "—"], ["Final score", e?.finalScore != null ? `${e.finalScore}%` : "—"]]} />
                  {e?.certificate ? (
                    <Alert tone="success">Certificate issued: <span className="font-mono">{e.certificate.code}</span> · <Link className="link" href={`/verify/${e.certificate.code}`}>View & download</Link></Alert>
                  ) : null}
                  {e && s.classes.length ? (
                    <div><p className="mb-2 text-sm font-semibold">Class schedule</p><ul className="max-h-56 space-y-1 overflow-y-auto text-sm">{s.classes.map((c) => { const at = e.attendance.find((x) => x.meetingId === c.id); return <li key={c.id} className="flex justify-between gap-2"><span>{fmtDate(c.date)} · {c.topic}</span>{at ? <StatusBadge status={at.status} /> : null}</li>; })}</ul></div>
                  ) : null}
                  {e && s.course.resources.length ? (
                    <div><p className="mb-2 text-sm font-semibold">Learning resources</p><ul className="space-y-1 text-sm">{s.course.resources.map((r) => <li key={r.id}><a className="link" target="_blank" rel="noopener noreferrer" href={r.uploadId ? `/api/files/${r.uploadId}` : r.url ?? "#"}>{r.title}</a> <span className="text-xs text-stone-500">{r.kind.toLowerCase()}</span></li>)}</ul></div>
                  ) : null}
                </div>
                {e ? (
                  <div className="space-y-4">
                    <p className="text-sm font-semibold">Assignments</p>
                    {s.assignments.length ? s.assignments.map((as) => {
                      const sub = e.submissions.find((x) => x.assignmentId === as.id);
                      return (
                        <div key={as.id} className="border border-charcoal-900/10 p-4">
                          <div className="flex justify-between gap-2"><p className="font-medium">{as.title}</p><span className="text-xs text-stone-500">Due {fmtDate(as.dueAt)}</span></div>
                          <p className="mt-1 text-sm text-charcoal-600">{as.brief}</p>
                          {sub?.gradedAt ? <p className="mt-2 text-sm">Score: <strong>{sub.score}/{as.maxScore}</strong>{sub.feedback ? ` — ${sub.feedback}` : ""}</p> : (
                            <ActionForm action={submitAssignmentAction} className="mt-3 space-y-2">
                              <input type="hidden" name="assignmentId" value={as.id} />
                              <Field label={sub ? "Update submission" : "Your submission"}><Textarea name="text" rows={2} defaultValue={sub?.text ?? ""} /></Field>
                              <Input type="file" name="file" accept="image/*,application/pdf,.docx" />
                              <SubmitButton size="sm">{sub ? "Resubmit" : "Submit"}</SubmitButton>
                            </ActionForm>
                          )}
                        </div>
                      );
                    }) : <p className="text-sm text-stone-500">No assignments yet.</p>}
                    {e.assessments.length ? (
                      <Table head={["Assessment", "Score", "Result"]}>{e.assessments.map((r) => <tr key={r.id}><Td>{r.title}</Td><Td>{r.score}/{r.maxScore}</Td><Td><StatusBadge status={r.passed ? "PASSED_APPROVED" : "FAILED"} /></Td></tr>)}</Table>
                    ) : null}
                  </div>
                ) : <p className="text-sm text-stone-600">Your learning materials and assignments appear here once you are registered.</p>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
