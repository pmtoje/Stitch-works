import type { TailorApplicationStatus } from "@prisma/client";
import { db } from "../db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { makeReference, makeTailorCode } from "../references";
import { audit } from "../audit";
import { notify, notifyStaff } from "../notifications";
import { can, type Actor } from "../auth/rbac";
import { fmtDateTime, humanize } from "../format";

export const TAILOR_FLOW: Record<TailorApplicationStatus, TailorApplicationStatus[]> = {
  SUBMITTED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["SHORTLISTED", "REJECTED"],
  SHORTLISTED: ["ASSESSMENT_SCHEDULED", "APPROVED", "REJECTED"],
  ASSESSMENT_SCHEDULED: ["APPROVED", "REJECTED"],
  APPROVED: ["ONBOARDING"],
  ONBOARDING: ["ACTIVE"],
  ACTIVE: [],
  REJECTED: ["UNDER_REVIEW"],
};

export type TailorApplicationInput = {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  state: string;
  lga: string;
  dateOfBirth?: Date | null;
  yearsExperience: number;
  specialisations: string[];
  garmentTypes: string[];
  machineSkills: string[];
  previousWork: string;
  workingArrangement: string;
  interests: string[];
  references?: string;
  preferredFacilityId?: string | null;
  uploadIds: string[];
};

export async function submitTailorApplication(actor: Actor, input: TailorApplicationInput) {
  const open = await db.tailorApplication.findFirst({ where: { userId: actor.userId, status: { notIn: ["REJECTED", "ACTIVE"] } } });
  if (open) throw new AppError(`You already have an application in progress (${open.reference}). Track it from your dashboard.`);
  if (!input.interests.length) throw new AppError("Select at least one opportunity you are interested in.");
  return db.$transaction(async (tx) => {
    const uploads = await tx.upload.findMany({ where: { id: { in: input.uploadIds }, ownerId: actor.userId } });
    const { uploadIds: _ignored, ...data } = input;
    const app = await tx.tailorApplication.create({
      data: { ...data, references: data.references ?? null, reference: await makeReference("TA", tx), userId: actor.userId, files: { connect: uploads.map((u) => ({ id: u.id })) } },
    });
    await audit({ actorId: actor.userId, action: "tailor_application.submit", entityType: "TailorApplication", entityId: app.id }, tx);
    await notify({ userId: actor.userId, kind: "tailor_application.submitted", title: `Application ${app.reference} received`, body: "Thank you for applying to join the StitchWorks tailor network. Our team will review your experience and portfolio and contact you about the next steps.", link: "/dashboard/application" }, tx);
    await notifyStaff(["PRODUCTION_MANAGER", "FACILITY_MANAGER"], { kind: "tailor_application.new", title: `New tailor application ${app.reference}`, body: `${input.fullName} · ${input.yearsExperience} yrs · ${input.specialisations.join(", ")}`, link: `/admin/tailors/applications/${app.id}` }, tx);
    return app;
  });
}

export async function moveTailorApplication(actor: Actor, applicationId: string, to: TailorApplicationStatus, opts: { note?: string; assessmentAt?: Date; facilityId?: string | null } = {}) {
  if (!can(actor, "tailors.review")) throw new ForbiddenError();
  return db.$transaction(async (tx) => {
    const app = await tx.tailorApplication.findUnique({ where: { id: applicationId } });
    if (!app) throw new NotFoundError();
    if (!TAILOR_FLOW[app.status].includes(to)) throw new AppError(`Cannot move from ${humanize(app.status)} to ${humanize(to)}.`);
    if (to === "ASSESSMENT_SCHEDULED" && !opts.assessmentAt) throw new AppError("Choose the assessment date and time.");
    await tx.tailorApplication.update({
      where: { id: applicationId },
      data: { status: to, ...(opts.assessmentAt ? { assessmentAt: opts.assessmentAt } : {}), ...(["APPROVED", "REJECTED"].includes(to) ? { decidedAt: new Date() } : {}) },
    });
    if (opts.note) await tx.applicationComment.create({ data: { applicationId, authorId: actor.userId, body: opts.note } });

    if (to === "APPROVED") {
      const existing = await tx.tailor.findUnique({ where: { userId: app.userId } });
      if (!existing) {
        await tx.tailor.create({
          data: {
            code: await makeTailorCode(tx),
            userId: app.userId,
            facilityId: opts.facilityId ?? app.preferredFacilityId ?? null,
            specialisations: app.specialisations,
            machineSkills: app.machineSkills,
            yearsExperience: app.yearsExperience,
            verification: "VERIFIED",
          },
        });
      } else if (existing.verification !== "VERIFIED") {
        await tx.tailor.update({ where: { id: existing.id }, data: { verification: "VERIFIED" } });
      }
      const has = await tx.userRole.findFirst({ where: { userId: app.userId, role: "TAILOR" } });
      if (!has) await tx.userRole.create({ data: { userId: app.userId, role: "TAILOR" } });
    }
    await audit({ actorId: actor.userId, action: "tailor_application.status", entityType: "TailorApplication", entityId: applicationId, data: { from: app.status, to, note: opts.note } }, tx);

    const messages: Partial<Record<TailorApplicationStatus, string>> = {
      UNDER_REVIEW: "Your application is now being reviewed by our team.",
      SHORTLISTED: "Good news — you have been shortlisted. We will contact you to arrange a practical assessment.",
      ASSESSMENT_SCHEDULED: `Your practical assessment is scheduled for ${opts.assessmentAt ? fmtDateTime(opts.assessmentAt) : ""}. Please bring samples of your work.`,
      APPROVED: "Congratulations — you have been approved as a StitchWorks tailor. Your tailor profile is now active; choose a membership plan from your dashboard to unlock member rates and production jobs.",
      REJECTED: `Thank you for your interest. We are unable to approve your application at this time.${opts.note ? ` Feedback: ${opts.note}` : ""} You are welcome to apply again or explore StitchWorks Academy.`,
      ONBOARDING: "Welcome aboard! Your onboarding has started — check your dashboard for next steps.",
      ACTIVE: "You are now an active member of the StitchWorks tailor network.",
    };
    if (messages[to]) await notify({ userId: app.userId, kind: "tailor_application.status", title: `Application ${app.reference}: ${humanize(to)}`, body: messages[to]!, link: "/dashboard/application", channels: ["EMAIL", "SMS"] }, tx);
  });
}

export async function commentOnApplication(actor: Actor, applicationId: string, body: string) {
  if (!can(actor, "tailors.review")) throw new ForbiddenError();
  if (!body.trim()) throw new AppError("Write a comment.");
  const c = await db.applicationComment.create({ data: { applicationId, authorId: actor.userId, body: body.slice(0, 2000) } });
  await audit({ actorId: actor.userId, action: "tailor_application.comment", entityType: "TailorApplication", entityId: applicationId });
  return c;
}
