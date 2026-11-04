import { db, type Tx } from "../db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { makeReference } from "../references";
import { audit } from "../audit";
import { notify, notifyStaff } from "../notifications";
import { can, type Actor } from "../auth/rbac";
import { naira } from "../format";

/** Pure piece-rate rule: only QC-accepted units are payable. */
export function pieceRateAmount(acceptedQty: number, rate: number) {
  if (acceptedQty < 0 || rate < 0) throw new Error("Invalid piece-rate inputs");
  return acceptedQty * rate;
}

export async function createJob(actor: Actor, input: { title: string; garmentType: string; description: string; totalQuantity: number; defaultRate: number; dueDate?: Date | null; facilityId?: string | null; openToMarketplace: boolean; orderId?: string | null }) {
  if (!can(actor, "production.manage")) throw new ForbiddenError();
  if (input.totalQuantity < 1) throw new AppError("Quantity must be at least 1.");
  return db.$transaction(async (tx) => {
    const job = await tx.productionJob.create({ data: { ...input, reference: await makeReference("PJ", tx) } });
    await audit({ actorId: actor.userId, action: "job.create", entityType: "ProductionJob", entityId: job.id, data: input }, tx);
    if (input.openToMarketplace) await notifyStaff(["TAILOR"], { kind: "job.posted", title: `New production job: ${input.title}`, body: `${input.totalQuantity} × ${input.garmentType} at ${naira(input.defaultRate)} per accepted piece. Apply from your tailor dashboard.`, link: "/dashboard/tailor/jobs", channels: ["EMAIL"] }, tx);
    return job;
  });
}

export async function updateJob(actor: Actor, jobId: string, data: { defaultRate?: number; openToMarketplace?: boolean; status?: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"; facilityId?: string | null; dueDate?: Date | null }) {
  if (!can(actor, "production.manage")) throw new ForbiddenError();
  const job = await db.productionJob.update({ where: { id: jobId }, data });
  await audit({ actorId: actor.userId, action: "job.update", entityType: "ProductionJob", entityId: jobId, data });
  return job;
}

async function allocatedQty(jobId: string, tx: Tx | typeof db = db) {
  const a = await tx.productionAllocation.aggregate({ where: { jobId, status: { not: "CANCELLED" } }, _sum: { quantity: true } });
  return a._sum.quantity ?? 0;
}

export async function allocate(actor: Actor, jobId: string, input: { tailorId?: string; teamId?: string; partnerName?: string; quantity: number; rate: number; dueDate?: Date | null; supervisorId?: string | null }) {
  if (!can(actor, "production.manage")) throw new ForbiddenError();
  const assignees = [input.tailorId, input.teamId, input.partnerName].filter(Boolean);
  if (assignees.length !== 1) throw new AppError("Allocate to exactly one tailor, team or external partner.");
  if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new AppError("Quantity must be a whole number above zero.");
  if (!Number.isInteger(input.rate) || input.rate < 0) throw new AppError("Rate must be zero or more.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ProductionJob" WHERE id = ${jobId} FOR UPDATE`;
    const job = await tx.productionJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundError();
    if (job.status === "COMPLETED" || job.status === "CANCELLED") throw new AppError("This job is closed.");
    const already = await allocatedQty(jobId, tx);
    if (already + input.quantity > job.totalQuantity) throw new AppError(`Only ${job.totalQuantity - already} units remain unallocated on this job.`);
    if (input.tailorId) {
      const t = await tx.tailor.findUnique({ where: { id: input.tailorId } });
      if (!t || t.verification !== "VERIFIED") throw new AppError("Production can only be allocated to verified tailors.");
    }
    const a = await tx.productionAllocation.create({
      data: { jobId, tailorId: input.tailorId ?? null, teamId: input.teamId ?? null, partnerName: input.partnerName ?? null, quantity: input.quantity, rate: input.rate, dueDate: input.dueDate ?? null, supervisorId: input.supervisorId ?? null, createdById: actor.userId },
    });
    if (job.status === "OPEN") await tx.productionJob.update({ where: { id: jobId }, data: { status: "IN_PROGRESS" } });
    await audit({ actorId: actor.userId, action: "allocation.create", entityType: "ProductionAllocation", entityId: a.id, data: input }, tx);
    const recipients = input.tailorId
      ? [(await tx.tailor.findUniqueOrThrow({ where: { id: input.tailorId } })).userId]
      : input.teamId
        ? (await tx.teamMember.findMany({ where: { teamId: input.teamId }, include: { tailor: true } })).map((m) => m.tailor.userId)
        : [];
    for (const userId of recipients) {
      await notify({ userId, kind: "allocation.new", title: `New allocation: ${job.title}`, body: `${input.quantity} × ${job.garmentType} at ${naira(input.rate)} per accepted piece.`, link: "/dashboard/tailor/jobs" }, tx);
    }
    return a;
  });
}

/** Tailor expresses interest in a marketplace job. */
export async function applyToJob(actor: Actor, jobId: string, quantity: number, message?: string) {
  const tailor = await db.tailor.findUnique({ where: { userId: actor.userId } });
  if (!tailor || tailor.verification !== "VERIFIED") throw new ForbiddenError("Only verified StitchWorks tailors can apply for production jobs.");
  const job = await db.productionJob.findUnique({ where: { id: jobId } });
  if (!job || !job.openToMarketplace || job.status === "COMPLETED" || job.status === "CANCELLED") throw new NotFoundError("This job is not open for applications.");
  // Membership plans may restrict production eligibility.
  const eligible = await db.membership.findFirst({ where: { userId: actor.userId, status: "ACTIVE", expiresAt: { gt: new Date() }, plan: { productionEligible: true } } });
  if (!eligible) throw new AppError("An active membership with production job eligibility is required to apply.");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > job.totalQuantity) throw new AppError("Enter a realistic quantity you can complete.");
  const app = await db.jobApplication.upsert({
    where: { jobId_tailorId: { jobId, tailorId: tailor.id } },
    create: { jobId, tailorId: tailor.id, quantity, message: message ?? null },
    update: { quantity, message: message ?? null, status: "PENDING" },
  });
  await audit({ actorId: actor.userId, action: "job.apply", entityType: "JobApplication", entityId: app.id, data: { quantity } });
  await notifyStaff(["PRODUCTION_MANAGER"], { kind: "job.application", title: `Job application: ${job.reference}`, body: `A tailor applied to produce ${quantity} units.`, link: `/admin/production/jobs/${jobId}` });
  return app;
}

export async function decideJobApplication(actor: Actor, applicationId: string, accept: boolean, quantity?: number, rate?: number) {
  if (!can(actor, "production.manage")) throw new ForbiddenError();
  const app = await db.jobApplication.findUnique({ where: { id: applicationId }, include: { job: true, tailor: true } });
  if (!app || app.status !== "PENDING") throw new AppError("Application is not pending.");
  if (accept) {
    await allocate(actor, app.jobId, { tailorId: app.tailorId, quantity: quantity ?? app.quantity, rate: rate ?? app.job.defaultRate });
  }
  await db.jobApplication.update({ where: { id: applicationId }, data: { status: accept ? "ACCEPTED" : "DECLINED" } });
  await audit({ actorId: actor.userId, action: accept ? "job.application_accept" : "job.application_decline", entityType: "JobApplication", entityId: applicationId });
  if (!accept) await notify({ userId: app.tailor.userId, kind: "job.application_declined", title: `Application for ${app.job.reference}`, body: "Thank you for applying. This job has been allocated elsewhere; keep an eye on new opportunities.", link: "/dashboard/tailor/jobs", channels: ["EMAIL"] });
}

/** A tailor (or team member, or supervising manager) reports completed units for QC. */
export async function submitOutput(actor: Actor, allocationId: string, quantity: number, note?: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ProductionAllocation" WHERE id = ${allocationId} FOR UPDATE`;
    const a = await tx.productionAllocation.findUnique({ where: { id: allocationId }, include: { tailor: true, team: { include: { members: { include: { tailor: true } } } }, job: true, submissions: { include: { inspection: true } } } });
    if (!a) throw new NotFoundError();
    const isAssignee = a.tailor?.userId === actor.userId || !!a.team?.members.some((m) => m.tailor.userId === actor.userId);
    if (!isAssignee && !can(actor, "production.manage")) throw new NotFoundError();
    if (a.status === "CANCELLED" || a.status === "COMPLETED") throw new AppError("This allocation is closed.");
    if (!Number.isInteger(quantity) || quantity < 1) throw new AppError("Enter the number of completed pieces.");
    const accepted = a.submissions.reduce((s, x) => s + (x.inspection?.acceptedQty ?? 0), 0);
    const pending = a.submissions.filter((x) => x.status === "PENDING_QC").reduce((s, x) => s + x.quantity, 0);
    const remaining = a.quantity - accepted - pending;
    if (quantity > remaining) throw new AppError(`You can submit at most ${remaining} more piece${remaining === 1 ? "" : "s"} on this allocation.`);
    const sub = await tx.productionSubmission.create({ data: { allocationId, quantity, note: note ?? null, submittedById: actor.userId } });
    await tx.productionAllocation.update({ where: { id: allocationId }, data: { status: "SUBMITTED" } });
    await audit({ actorId: actor.userId, action: "production.submit", entityType: "ProductionSubmission", entityId: sub.id, data: { quantity } }, tx);
    await notifyStaff(["QC_OFFICER"], { kind: "qc.pending", title: `QC needed: ${a.job.reference}`, body: `${quantity} pieces submitted for inspection.`, link: "/admin/production/qc" }, tx);
    return sub;
  });
}

export type InspectionInput = { inspectedQty: number; acceptedQty: number; rejectedQty: number; reworkQty: number; defects: string[]; reworkNotes?: string };

export function validateInspection(subQty: number, i: InspectionInput) {
  for (const n of [i.inspectedQty, i.acceptedQty, i.rejectedQty, i.reworkQty]) if (!Number.isInteger(n) || n < 0) throw new AppError("Quantities must be whole numbers.");
  if (i.inspectedQty !== subQty) throw new AppError(`All ${subQty} submitted pieces must be inspected.`);
  if (i.acceptedQty + i.rejectedQty + i.reworkQty !== i.inspectedQty) throw new AppError("Accepted + rejected + rework must equal the quantity inspected.");
  if ((i.rejectedQty > 0 || i.reworkQty > 0) && i.defects.length === 0) throw new AppError("Record the defects found for rejected or rework pieces.");
}

/** QC officer records an inspection; accepted units create a piece-rate earning awaiting approval. */
export async function recordInspection(actor: Actor, submissionId: string, input: InspectionInput) {
  if (!can(actor, "production.qc")) throw new ForbiddenError();
  return db.$transaction(async (tx) => {
    const sub = await tx.productionSubmission.findUnique({ where: { id: submissionId }, include: { allocation: { include: { tailor: true, job: true, submissions: { include: { inspection: true } } } } } });
    if (!sub) throw new NotFoundError();
    if (sub.status !== "PENDING_QC") throw new AppError("This submission has already been inspected.");
    if (sub.submittedById === actor.userId) throw new ForbiddenError("You cannot inspect your own production submission.");
    validateInspection(sub.quantity, input);
    const insp = await tx.qualityInspection.create({ data: { submissionId, ...input, reworkNotes: input.reworkNotes ?? null, officerId: actor.userId } });
    await tx.productionSubmission.update({ where: { id: submissionId }, data: { status: input.acceptedQty > 0 ? "INSPECTED" : "REJECTED" } });
    const a = sub.allocation;
    if (input.acceptedQty > 0) {
      await tx.pieceRateEarning.create({ data: { allocationId: a.id, tailorId: a.tailorId, inspectionId: insp.id, quantity: input.acceptedQty, rate: a.rate, amount: pieceRateAmount(input.acceptedQty, a.rate) } });
    }
    const acceptedTotal = a.submissions.reduce((s, x) => s + (x.inspection?.acceptedQty ?? 0), 0) + input.acceptedQty;
    const stillPending = a.submissions.some((x) => x.id !== submissionId && x.status === "PENDING_QC");
    await tx.productionAllocation.update({ where: { id: a.id }, data: { status: acceptedTotal >= a.quantity ? "COMPLETED" : stillPending ? "SUBMITTED" : "IN_PROGRESS" } });
    await audit({ actorId: actor.userId, action: "qc.inspect", entityType: "QualityInspection", entityId: insp.id, data: input }, tx);
    if (a.tailor) {
      await notify({ userId: a.tailor.userId, kind: "qc.result", title: `QC result: ${a.job.reference}`, body: `${input.acceptedQty} accepted, ${input.reworkQty} for rework, ${input.rejectedQty} rejected.${input.reworkNotes ? `\nRework notes: ${input.reworkNotes}` : ""}`, link: "/dashboard/tailor/jobs" }, tx);
    }
    return insp;
  });
}

export async function approveEarnings(actor: Actor, earningIds: string[]) {
  if (!can(actor, "earnings.approve")) throw new ForbiddenError();
  return db.$transaction(async (tx) => {
    const rows = await tx.pieceRateEarning.findMany({ where: { id: { in: earningIds }, status: "PENDING_APPROVAL" }, include: { tailor: true } });
    await tx.pieceRateEarning.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "APPROVED", approvedById: actor.userId, approvedAt: new Date() } });
    for (const r of rows) {
      await audit({ actorId: actor.userId, action: "earning.approve", entityType: "PieceRateEarning", entityId: r.id, data: { amount: r.amount } }, tx);
      if (r.tailor) await notify({ userId: r.tailor.userId, kind: "earning.approved", title: `Earnings approved: ${naira(r.amount)}`, body: `${r.quantity} accepted pieces at ${naira(r.rate)} each have been approved for payment.`, link: "/dashboard/tailor/earnings", channels: ["EMAIL"] }, tx);
    }
    return rows.length;
  });
}

export async function markEarningsPaid(actor: Actor, earningIds: string[], payoutRef: string) {
  if (!can(actor, "earnings.pay")) throw new ForbiddenError();
  if (!payoutRef.trim()) throw new AppError("Enter the payout/transfer reference.");
  return db.$transaction(async (tx) => {
    const rows = await tx.pieceRateEarning.findMany({ where: { id: { in: earningIds }, status: "APPROVED" }, include: { tailor: true } });
    await tx.pieceRateEarning.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "PAID", paidAt: new Date(), payoutRef } });
    for (const r of rows) {
      await audit({ actorId: actor.userId, action: "earning.pay", entityType: "PieceRateEarning", entityId: r.id, data: { amount: r.amount, payoutRef } }, tx);
      if (r.tailor) await notify({ userId: r.tailor.userId, kind: "earning.paid", title: `Payout sent: ${naira(r.amount)}`, body: `Reference ${payoutRef}.`, link: "/dashboard/tailor/earnings" }, tx);
    }
    return rows.length;
  });
}
