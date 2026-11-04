import type { StudentApplicationStatus } from "@prisma/client";
import { db, type Tx } from "../db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { makeCertificateCode, makeReference } from "../references";
import { createInvoice } from "../payments/invoices";
import { audit } from "../audit";
import { notify, notifyStaff } from "../notifications";
import { can, type Actor } from "../auth/rbac";
import { fmtDate, humanize, naira } from "../format";

export const STUDENT_FLOW: Partial<Record<StudentApplicationStatus, StudentApplicationStatus[]>> = {
  SUBMITTED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["AWAITING_PAYMENT", "REGISTERED"],
  AWAITING_PAYMENT: ["REGISTERED", "WITHDRAWN"],
  REGISTERED: ["IN_TRAINING", "WITHDRAWN"],
  IN_TRAINING: ["COMPLETED", "WITHDRAWN"],
  COMPLETED: ["CERTIFIED"],
};

export type StudentApplicationInput = {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  dateOfBirth?: Date | null;
  education: string;
  experience: string;
  motivation: string;
  uploadIds: string[];
};

export async function submitStudentApplication(actor: Actor, sessionId: string, input: StudentApplicationInput) {
  return db.$transaction(async (tx) => {
    const session = await tx.courseSession.findUnique({ where: { id: sessionId }, include: { course: true, _count: { select: { enrolments: true } } } });
    if (!session || !session.open || !session.course.published) throw new NotFoundError("This training session is not open for applications.");
    if (session.applicationDeadline < new Date()) throw new AppError("The application deadline for this session has passed.");
    if (session._count.enrolments >= session.capacity) throw new AppError("This session is fully booked. Please choose another session.");
    const dupe = await tx.studentApplication.findUnique({ where: { userId_sessionId: { userId: actor.userId, sessionId } } });
    if (dupe) throw new AppError(`You have already applied for this session (${dupe.reference}).`);
    const uploads = await tx.upload.findMany({ where: { id: { in: input.uploadIds }, ownerId: actor.userId } });
    const { uploadIds: _u, ...data } = input;
    const app = await tx.studentApplication.create({
      data: { ...data, reference: await makeReference("SA", tx), userId: actor.userId, sessionId, files: { connect: uploads.map((u) => ({ id: u.id })) } },
    });
    if (session.course.applicationFee > 0) {
      await createInvoice(tx, { userId: actor.userId, purpose: "APPLICATION_FEE", studentApplicationId: app.id, description: `Application fee — ${session.course.title}`, amount: session.course.applicationFee });
    }
    const hasStudent = await tx.userRole.findFirst({ where: { userId: actor.userId, role: "STUDENT" } });
    if (!hasStudent) await tx.userRole.create({ data: { userId: actor.userId, role: "STUDENT" } });
    await audit({ actorId: actor.userId, action: "student_application.submit", entityType: "StudentApplication", entityId: app.id }, tx);
    await notify({ userId: actor.userId, kind: "student_application.submitted", title: `Application ${app.reference} received`, body: `Thank you for applying to ${session.course.title} (${session.name}).${session.course.applicationFee > 0 ? ` Please pay the ${naira(session.course.applicationFee)} application fee from your dashboard so we can review your application.` : " We will review it and get back to you shortly."}`, link: "/dashboard/academy" }, tx);
    await notifyStaff(["ACADEMY_ADMIN"], { kind: "student_application.new", title: `New Academy application ${app.reference}`, body: `${input.fullName} → ${session.course.title}`, link: `/admin/academy/applications/${app.id}` }, tx);
    return app;
  });
}

async function enrol(tx: Tx, applicationId: string) {
  const app = await tx.studentApplication.findUniqueOrThrow({ where: { id: applicationId }, include: { session: { include: { course: true } }, enrolment: true } });
  if (app.enrolment) return app.enrolment;
  await tx.$queryRaw`SELECT id FROM "CourseSession" WHERE id = ${app.sessionId} FOR UPDATE`;
  const count = await tx.enrolment.count({ where: { sessionId: app.sessionId, status: { not: "WITHDRAWN" } } });
  if (count >= app.session.capacity) throw new AppError("This session is now full. Please contact the Academy to move to another session.");
  const e = await tx.enrolment.create({ data: { userId: app.userId, sessionId: app.sessionId, applicationId } });
  await tx.invoice.updateMany({ where: { studentApplicationId: applicationId, purpose: "TUITION" }, data: { enrolmentId: e.id } });
  await tx.studentApplication.update({ where: { id: applicationId }, data: { status: "REGISTERED" } });
  await notify({ userId: app.userId, kind: "academy.registered", title: `You're registered for ${app.session.course.title}`, body: `Your place on ${app.session.name} is confirmed. Classes start ${fmtDate(app.session.startsOn)} (${app.session.schedule}).`, link: "/dashboard/academy" }, tx);
  return e;
}

export async function moveStudentApplication(actor: Actor, applicationId: string, to: StudentApplicationStatus, note?: string) {
  if (!can(actor, "academy.manage")) throw new ForbiddenError();
  return db.$transaction(async (tx) => {
    const app = await tx.studentApplication.findUnique({ where: { id: applicationId }, include: { session: { include: { course: true } }, invoices: true } });
    if (!app) throw new NotFoundError();
    if (!STUDENT_FLOW[app.status]?.includes(to)) throw new AppError(`Cannot move from ${humanize(app.status)} to ${humanize(to)}.`);
    if (to === "UNDER_REVIEW") {
      const fee = app.invoices.find((i) => i.purpose === "APPLICATION_FEE");
      if (fee && fee.status !== "PAID") throw new AppError("The application fee has not been paid yet.");
    }
    await tx.studentApplication.update({ where: { id: applicationId }, data: { status: to, reviewNote: note ?? app.reviewNote } });
    if (to === "ACCEPTED") {
      const fee = app.session.feeOverride ?? app.session.course.fee;
      if (fee > 0) {
        await createInvoice(tx, { userId: app.userId, purpose: "TUITION", studentApplicationId: app.id, description: `Tuition — ${app.session.course.title} (${app.session.name})`, amount: fee, dueDate: app.session.startsOn });
        await tx.studentApplication.update({ where: { id: applicationId }, data: { status: "AWAITING_PAYMENT" } });
        await notify({ userId: app.userId, kind: "academy.accepted", title: `Admission offer: ${app.session.course.title}`, body: `Congratulations! You have been accepted. Pay the tuition of ${naira(fee)} to secure your place — places are confirmed in order of payment.`, link: "/dashboard/academy", channels: ["EMAIL", "SMS"] }, tx);
      } else {
        await enrol(tx, applicationId);
      }
    } else if (to === "REGISTERED") {
      await enrol(tx, applicationId); // manual registration (e.g. scholarship / offline payment)
    } else if (to === "IN_TRAINING") {
      await tx.enrolment.updateMany({ where: { applicationId }, data: { status: "IN_TRAINING" } });
    } else if (to === "WITHDRAWN") {
      await tx.enrolment.updateMany({ where: { applicationId }, data: { status: "WITHDRAWN" } });
    } else if (to === "REJECTED") {
      await notify({ userId: app.userId, kind: "academy.rejected", title: `Application ${app.reference}`, body: `Thank you for applying. We are unable to offer you a place on this session.${note ? ` ${note}` : ""}`, link: "/dashboard/academy" }, tx);
    }
    await audit({ actorId: actor.userId, action: "student_application.status", entityType: "StudentApplication", entityId: applicationId, data: { from: app.status, to, note } }, tx);
  });
}

export async function onAcademyInvoicePaid(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (inv.status !== "PAID" || !inv.studentApplicationId) return;
  const app = await tx.studentApplication.findUniqueOrThrow({ where: { id: inv.studentApplicationId } });
  if (inv.purpose === "TUITION" && app.status === "AWAITING_PAYMENT") await enrol(tx, app.id);
}

/** Instructors may act only on their own sessions; Academy admins on all. */
export async function assertCanTeach(actor: Actor, sessionId: string) {
  if (can(actor, "academy.manage")) return;
  if (!can(actor, "academy.teach")) throw new ForbiddenError();
  const instructor = await db.instructor.findUnique({ where: { userId: actor.userId } });
  const session = await db.courseSession.findUnique({ where: { id: sessionId }, include: { course: true } });
  if (!instructor || !session || (session.instructorId !== instructor.id && session.course.instructorId !== instructor.id)) throw new ForbiddenError();
}

export async function addClassMeeting(actor: Actor, sessionId: string, date: Date, topic: string) {
  await assertCanTeach(actor, sessionId);
  return db.classMeeting.create({ data: { sessionId, date, topic } });
}

export async function recordAttendance(actor: Actor, meetingId: string, records: { enrolmentId: string; status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" }[]) {
  const meeting = await db.classMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) throw new NotFoundError();
  await assertCanTeach(actor, meeting.sessionId);
  const valid = await db.enrolment.findMany({ where: { sessionId: meeting.sessionId, id: { in: records.map((r) => r.enrolmentId) } }, select: { id: true } });
  const ok = new Set(valid.map((v) => v.id));
  await db.$transaction(
    records.filter((r) => ok.has(r.enrolmentId)).map((r) =>
      db.attendance.upsert({
        where: { meetingId_enrolmentId: { meetingId, enrolmentId: r.enrolmentId } },
        create: { meetingId, enrolmentId: r.enrolmentId, status: r.status, recordedById: actor.userId },
        update: { status: r.status, recordedById: actor.userId },
      }),
    ),
  );
  await audit({ actorId: actor.userId, action: "attendance.record", entityType: "ClassMeeting", entityId: meetingId, data: { count: records.length } });
}

export async function createAssignment(actor: Actor, sessionId: string, input: { title: string; brief: string; dueAt: Date; maxScore: number }) {
  await assertCanTeach(actor, sessionId);
  const a = await db.assignment.create({ data: { sessionId, ...input } });
  const enrolled = await db.enrolment.findMany({ where: { sessionId, status: { in: ["REGISTERED", "IN_TRAINING"] } } });
  for (const e of enrolled) await notify({ userId: e.userId, kind: "assignment.new", title: `New assignment: ${input.title}`, body: `Due ${fmtDate(input.dueAt)}.`, link: "/dashboard/academy", channels: ["EMAIL"] });
  return a;
}

export async function submitAssignment(actor: Actor, assignmentId: string, input: { text?: string; uploadId?: string | null }) {
  const assignment = await db.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw new NotFoundError();
  const enrolment = await db.enrolment.findFirst({ where: { sessionId: assignment.sessionId, userId: actor.userId, status: { in: ["REGISTERED", "IN_TRAINING"] } } });
  if (!enrolment) throw new NotFoundError();
  if (input.uploadId) {
    const up = await db.upload.findFirst({ where: { id: input.uploadId, ownerId: actor.userId } });
    if (!up) throw new AppError("Invalid file.");
  }
  const existing = await db.assignmentSubmission.findUnique({ where: { assignmentId_enrolmentId: { assignmentId, enrolmentId: enrolment.id } } });
  if (existing?.gradedAt) throw new AppError("This assignment has already been graded.");
  return db.assignmentSubmission.upsert({
    where: { assignmentId_enrolmentId: { assignmentId, enrolmentId: enrolment.id } },
    create: { assignmentId, enrolmentId: enrolment.id, text: input.text ?? null, uploadId: input.uploadId ?? null },
    update: { text: input.text ?? null, uploadId: input.uploadId ?? null, submittedAt: new Date() },
  });
}

export async function gradeSubmission(actor: Actor, submissionId: string, score: number, feedback?: string) {
  const sub = await db.assignmentSubmission.findUnique({ where: { id: submissionId }, include: { assignment: true, enrolment: true } });
  if (!sub) throw new NotFoundError();
  await assertCanTeach(actor, sub.assignment.sessionId);
  if (score < 0 || score > sub.assignment.maxScore) throw new AppError(`Score must be between 0 and ${sub.assignment.maxScore}.`);
  await db.assignmentSubmission.update({ where: { id: submissionId }, data: { score, feedback: feedback ?? null, gradedAt: new Date() } });
  await audit({ actorId: actor.userId, action: "assignment.grade", entityType: "AssignmentSubmission", entityId: submissionId, data: { score } });
  await notify({ userId: sub.enrolment.userId, kind: "assignment.graded", title: `Assignment graded: ${sub.assignment.title}`, body: `You scored ${score}/${sub.assignment.maxScore}.${feedback ? `\n${feedback}` : ""}`, link: "/dashboard/academy", channels: ["EMAIL"] });
}

export async function recordAssessment(actor: Actor, enrolmentId: string, input: { title: string; score: number; maxScore: number; remarks?: string; passMark?: number }) {
  const e = await db.enrolment.findUnique({ where: { id: enrolmentId } });
  if (!e) throw new NotFoundError();
  await assertCanTeach(actor, e.sessionId);
  if (input.maxScore <= 0 || input.score < 0 || input.score > input.maxScore) throw new AppError("Enter a valid score.");
  const passed = input.score / input.maxScore >= (input.passMark ?? 0.5);
  const r = await db.assessmentResult.create({ data: { enrolmentId, title: input.title, score: input.score, maxScore: input.maxScore, passed, remarks: input.remarks ?? null, assessorId: actor.userId } });
  await audit({ actorId: actor.userId, action: "assessment.record", entityType: "Enrolment", entityId: enrolmentId, data: { title: input.title, score: input.score, passed } });
  return r;
}

export async function completeEnrolment(actor: Actor, enrolmentId: string) {
  if (!can(actor, "academy.manage")) throw new ForbiddenError();
  return db.$transaction(async (tx) => {
    const e = await tx.enrolment.findUnique({ where: { id: enrolmentId }, include: { assessments: true, application: true } });
    if (!e) throw new NotFoundError();
    if (e.status !== "IN_TRAINING" && e.status !== "REGISTERED") throw new AppError("Only active enrolments can be completed.");
    if (!e.assessments.length) throw new AppError("Record at least one assessment before completing the programme.");
    const pct = (e.assessments.reduce((s, a) => s + a.score / a.maxScore, 0) / e.assessments.length) * 100;
    await tx.enrolment.update({ where: { id: enrolmentId }, data: { status: "COMPLETED", finalScore: Math.round(pct * 10) / 10 } });
    await tx.studentApplication.update({ where: { id: e.applicationId }, data: { status: "COMPLETED" } });
    await audit({ actorId: actor.userId, action: "enrolment.complete", entityType: "Enrolment", entityId: enrolmentId, data: { finalScore: pct } }, tx);
  });
}

export function gradeFor(pct: number) {
  return pct >= 85 ? "Distinction" : pct >= 70 ? "Merit" : pct >= 50 ? "Pass" : null;
}

export async function issueCertificate(actor: Actor, enrolmentId: string) {
  if (!can(actor, "academy.manage")) throw new ForbiddenError();
  return db.$transaction(async (tx) => {
    const e = await tx.enrolment.findUnique({ where: { id: enrolmentId }, include: { user: true, session: { include: { course: true } }, certificate: true, assessments: true } });
    if (!e) throw new NotFoundError();
    if (e.certificate) throw new AppError("A certificate has already been issued for this enrolment.");
    if (e.status !== "COMPLETED") throw new AppError("The student must complete the programme before a certificate is issued.");
    if (!e.assessments.every((a) => a.passed)) throw new AppError("All assessments must be passed before certification.");
    const grade = gradeFor(e.finalScore ?? 0);
    if (!grade) throw new AppError("The final score is below the pass mark.");
    let code = makeCertificateCode();
    while (await tx.certificate.findUnique({ where: { code } })) code = makeCertificateCode();
    const cert = await tx.certificate.create({ data: { code, enrolmentId, holderName: e.user.fullName, courseTitle: e.session.course.title, grade, issuedById: actor.userId } });
    await tx.studentApplication.update({ where: { id: e.applicationId }, data: { status: "CERTIFIED" } });
    await audit({ actorId: actor.userId, action: "certificate.issue", entityType: "Certificate", entityId: cert.id, data: { code } }, tx);
    await notify({ userId: e.userId, kind: "certificate.issued", title: "Your StitchWorks Academy certificate", body: `Congratulations on completing ${e.session.course.title}! Certificate ${code} can be downloaded from your dashboard and verified by anyone at /verify.`, link: "/dashboard/academy" }, tx);
    return cert;
  });
}

export async function revokeCertificate(actor: Actor, certificateId: string, reason: string) {
  if (!can(actor, "academy.manage")) throw new ForbiddenError();
  await db.certificate.update({ where: { id: certificateId }, data: { revokedAt: new Date(), revokeReason: reason } });
  await audit({ actorId: actor.userId, action: "certificate.revoke", entityType: "Certificate", entityId: certificateId, data: { reason } });
}

/** Public verification — exposes only what is printed on the certificate. */
export async function verifyCertificate(code: string) {
  const c = await db.certificate.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!c) return null;
  return { code: c.code, holderName: c.holderName, courseTitle: c.courseTitle, grade: c.grade, issuedAt: c.issuedAt, revoked: !!c.revokedAt };
}
