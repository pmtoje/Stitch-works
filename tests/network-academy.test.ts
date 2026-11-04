import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { moveTailorApplication, submitTailorApplication } from "@/lib/tailors/service";
import { applyForMembership, manageMembership, runMembershipLifecycle } from "@/lib/memberships";
import { addClassMeeting, completeEnrolment, issueCertificate, moveStudentApplication, recordAssessment, recordAttendance, submitStudentApplication, verifyCertificate } from "@/lib/academy/service";
import { initiatePayment, verifyPayment } from "@/lib/payments/service";
import { makeFacility, makeUser, resetDb } from "./helpers";
import type { Actor } from "@/lib/auth/rbac";

beforeEach(resetDb);

async function pay(actor: Actor, invoiceId: string) {
  const { reference } = await initiatePayment(actor, invoiceId);
  await db.mockGatewaySession.update({ where: { reference }, data: { outcome: "success" } });
  await verifyPayment(reference);
}

const tailorApp = (uploadIds: string[] = []) => ({ fullName: "Musa", phone: "+2348022222222", email: "m@x.ng", address: "Jos", state: "Plateau", lga: "Jos North", yearsExperience: 7, specialisations: ["Uniforms"], garmentTypes: ["shirts"], machineSkills: ["Overlock"], previousWork: "Ten years at a tailoring shop", workingArrangement: "Piece-rate", interests: ["PIECE_RATE", "MACHINE_RENTAL"], uploadIds });

describe("tailor registration", () => {
  it("submits, reviews, shortlists, schedules, approves and creates a verified tailor profile with role", async () => {
    const applicant = await makeUser();
    const pm = await makeUser(["PRODUCTION_MANAGER"]);
    const up = await db.upload.create({ data: { ownerId: applicant.user.id, storageKey: `p-${Date.now()}`, originalName: "a.jpg", mimeType: "image/jpeg", size: 1, purpose: "PORTFOLIO" } });
    const app = await submitTailorApplication(applicant.actor, tailorApp([up.id]));
    await expect(submitTailorApplication(applicant.actor, tailorApp())).rejects.toThrow(/already have an application/);
    await expect(moveTailorApplication(pm.actor, app.id, "APPROVED")).rejects.toThrow(/Cannot move/);
    await moveTailorApplication(pm.actor, app.id, "UNDER_REVIEW");
    await moveTailorApplication(pm.actor, app.id, "SHORTLISTED");
    await expect(moveTailorApplication(pm.actor, app.id, "ASSESSMENT_SCHEDULED")).rejects.toThrow(/assessment date/);
    await moveTailorApplication(pm.actor, app.id, "ASSESSMENT_SCHEDULED", { assessmentAt: new Date(Date.now() + 864e5) });
    await moveTailorApplication(pm.actor, app.id, "APPROVED");
    const t = await db.tailor.findUniqueOrThrow({ where: { userId: applicant.user.id } });
    expect(t.code).toMatch(/^SW-T-\d{4}$/);
    expect(t.verification).toBe("VERIFIED");
    expect(await db.userRole.count({ where: { userId: applicant.user.id, role: "TAILOR" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: applicant.user.id, kind: "tailor_application.status" } })).toBe(4);
    expect((await db.tailorApplication.findUniqueOrThrow({ where: { id: app.id }, include: { files: true } })).files).toHaveLength(1);
  });

  it("does not let customers or finance review applications", async () => {
    const applicant = await makeUser();
    const fin = await makeUser(["FINANCE_OFFICER"]);
    const app = await submitTailorApplication(applicant.actor, tailorApp());
    await expect(moveTailorApplication(applicant.actor, app.id, "UNDER_REVIEW")).rejects.toThrow(/permission/);
    await expect(moveTailorApplication(fin.actor, app.id, "UNDER_REVIEW")).rejects.toThrow(/permission/);
  });
});

describe("memberships", () => {
  it("requires approval for non-tailors on tailor plans, then activates on payment and tracks expiry", async () => {
    const u = await makeUser();
    const fm = await makeUser(["FACILITY_MANAGER"]);
    const plan = await db.membershipPlan.create({ data: { slug: "ind", name: "Individual", description: "", fee: 10000, validityDays: 30, benefits: [], workspaceAccess: "", machineAccess: "", audience: "TAILOR" } });
    const { membership } = await applyForMembership(u.actor, plan.id);
    expect(membership.status).toBe("PENDING_APPROVAL");
    await manageMembership(fm.actor, membership.id, "APPROVE");
    const inv = await db.invoice.findFirstOrThrow({ where: { membershipId: membership.id } });
    await pay(u.actor, inv.id);
    const m = await db.membership.findUniqueOrThrow({ where: { id: membership.id } });
    expect(m.status).toBe("ACTIVE");
    expect(Math.round((m.expiresAt!.getTime() - m.startsAt!.getTime()) / 864e5)).toBe(30);
    // Expiry
    await db.membership.update({ where: { id: m.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await runMembershipLifecycle();
    expect(r.expired).toBe(1);
    expect((await db.membership.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("EXPIRED");
  });

  it("suspends and cancels memberships with permission only", async () => {
    const u = await makeUser(["TAILOR"]);
    const fm = await makeUser(["FACILITY_MANAGER"]);
    const plan = await db.membershipPlan.create({ data: { slug: "free", name: "Free", description: "", fee: 0, validityDays: 30, benefits: [], workspaceAccess: "", machineAccess: "", audience: "TAILOR" } });
    const { membership } = await applyForMembership(u.actor, plan.id);
    expect(membership.status).toBe("ACTIVE");
    await expect(manageMembership(u.actor, membership.id, "CANCEL")).rejects.toThrow(/permission/);
    await manageMembership(fm.actor, membership.id, "SUSPEND");
    await manageMembership(fm.actor, membership.id, "REINSTATE");
    await manageMembership(fm.actor, membership.id, "CANCEL");
    expect((await db.membership.findUniqueOrThrow({ where: { id: membership.id } })).status).toBe("CANCELLED");
  });
});

describe("StitchWorks Academy", () => {
  async function course(capacity = 2) {
    const { facility } = await makeFacility();
    const instr = await makeUser(["INSTRUCTOR"]);
    const instructor = await db.instructor.create({ data: { userId: instr.user.id, specialisms: [] } });
    const c = await db.course.create({ data: { slug: `c-${Date.now()}`, title: "Basic Garment Construction", summary: "s", description: "d", level: "Foundation", durationWeeks: 8, objectives: [], requirements: [], outline: [], format: "In-person", fee: 120000, applicationFee: 5000, certification: "Cert", instructorId: instructor.id, published: true } });
    const s = await db.courseSession.create({ data: { courseId: c.id, facilityId: facility.id, name: "Cohort 1", startsOn: new Date(Date.now() + 30 * 864e5), endsOn: new Date(Date.now() + 90 * 864e5), schedule: "MWF", applicationDeadline: new Date(Date.now() + 10 * 864e5), capacity, instructorId: instructor.id } });
    return { c, s, instr };
  }
  const studentForm = { fullName: "Grace", phone: "+2348033333333", email: "g@x.ng", address: "Jos", education: "SSCE", experience: "None", motivation: "I want to build a career", uploadIds: [] as string[] };

  it("runs the full journey: apply → fee → review → accept → tuition → enrol → attend → assess → complete → certify → verify", async () => {
    const { s, instr } = await course();
    const student = await makeUser();
    const admin = await makeUser(["ACADEMY_ADMIN"]);
    const app = await submitStudentApplication(student.actor, s.id, studentForm);
    expect(await db.userRole.count({ where: { userId: student.user.id, role: "STUDENT" } })).toBe(1);
    await expect(moveStudentApplication(admin.actor, app.id, "UNDER_REVIEW")).rejects.toThrow(/application fee/);
    await pay(student.actor, (await db.invoice.findFirstOrThrow({ where: { studentApplicationId: app.id, purpose: "APPLICATION_FEE" } })).id);
    await moveStudentApplication(admin.actor, app.id, "UNDER_REVIEW");
    await moveStudentApplication(admin.actor, app.id, "ACCEPTED");
    expect((await db.studentApplication.findUniqueOrThrow({ where: { id: app.id } })).status).toBe("AWAITING_PAYMENT");
    await pay(student.actor, (await db.invoice.findFirstOrThrow({ where: { studentApplicationId: app.id, purpose: "TUITION" } })).id);
    const enrolment = await db.enrolment.findUniqueOrThrow({ where: { applicationId: app.id } });
    expect((await db.studentApplication.findUniqueOrThrow({ where: { id: app.id } })).status).toBe("REGISTERED");
    await moveStudentApplication(admin.actor, app.id, "IN_TRAINING");

    const meeting = await addClassMeeting(instr.actor, s.id, new Date(), "Seams");
    await recordAttendance(instr.actor, meeting.id, [{ enrolmentId: enrolment.id, status: "PRESENT" }]);
    expect(await db.attendance.count({ where: { enrolmentId: enrolment.id } })).toBe(1);

    await expect(issueCertificate(admin.actor, enrolment.id)).rejects.toThrow(/complete/);
    await expect(completeEnrolment(admin.actor, enrolment.id)).rejects.toThrow(/assessment/);
    await recordAssessment(instr.actor, enrolment.id, { title: "Practical", score: 78, maxScore: 100 });
    await completeEnrolment(admin.actor, enrolment.id);
    const cert = await issueCertificate(admin.actor, enrolment.id);
    expect(cert.code).toMatch(/^SWA-\d{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(cert.grade).toBe("Merit");
    await expect(issueCertificate(admin.actor, enrolment.id)).rejects.toThrow(/already/);
    const v = await verifyCertificate(cert.code.toLowerCase());
    expect(v).toMatchObject({ holderName: student.user.fullName, revoked: false });
    expect(await verifyCertificate("SWA-0000-XXXX-XXXX")).toBeNull();
  });

  it("enforces capacity and prevents duplicate applications", async () => {
    const { s } = await course(1);
    const admin = await makeUser(["ACADEMY_ADMIN"]);
    const a = await makeUser();
    const b = await makeUser();
    const appA = await submitStudentApplication(a.actor, s.id, studentForm);
    await expect(submitStudentApplication(a.actor, s.id, studentForm)).rejects.toThrow(/already applied/);
    const appB = await submitStudentApplication(b.actor, s.id, studentForm);
    for (const app of [appA, appB]) await db.studentApplication.update({ where: { id: app.id }, data: { status: "UNDER_REVIEW" } });
    await moveStudentApplication(admin.actor, appA.id, "ACCEPTED");
    await moveStudentApplication(admin.actor, appA.id, "REGISTERED");
    await moveStudentApplication(admin.actor, appB.id, "ACCEPTED");
    await expect(moveStudentApplication(admin.actor, appB.id, "REGISTERED")).rejects.toThrow(/full/);
  });

  it("only lets an instructor record attendance for their own sessions", async () => {
    const { s } = await course();
    const other = await makeUser(["INSTRUCTOR"]);
    await db.instructor.create({ data: { userId: other.user.id, specialisms: [] } });
    await expect(addClassMeeting(other.actor, s.id, new Date(), "x")).rejects.toThrow(/permission/);
    const student = await makeUser();
    await expect(addClassMeeting(student.actor, s.id, new Date(), "x")).rejects.toThrow(/permission/);
  });
});
