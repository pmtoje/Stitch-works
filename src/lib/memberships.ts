import type { MembershipStatus } from "@prisma/client";
import { db, type Tx } from "./db";
import { AppError, ForbiddenError, NotFoundError } from "./errors";
import { createInvoice } from "./payments/invoices";
import { audit } from "./audit";
import { notify, notifyStaff } from "./notifications";
import { can, hasRole, type Actor } from "./auth/rbac";
import { fmtDate } from "./format";

const DAY = 86_400_000;

/** Member applies for (or renews) a plan. Returns the membership and its invoice. */
export async function applyForMembership(actor: Actor, planId: string) {
  return db.$transaction(async (tx) => {
    const plan = await tx.membershipPlan.findFirst({ where: { id: planId, active: true } });
    if (!plan) throw new NotFoundError("Membership plan not found.");
    const open = await tx.membership.findFirst({ where: { userId: actor.userId, planId, status: { in: ["PENDING_PAYMENT", "PENDING_APPROVAL"] } } });
    if (open) throw new AppError("You already have a pending application for this plan. Complete payment from your dashboard.");
    // Tailor plans are for verified StitchWorks tailors; others are reviewed by a manager first.
    const needsApproval = plan.audience === "TAILOR" && !hasRole(actor, "TAILOR");
    const status: MembershipStatus = needsApproval ? "PENDING_APPROVAL" : plan.fee > 0 ? "PENDING_PAYMENT" : "ACTIVE";
    const now = new Date();
    const m = await tx.membership.create({
      data: { userId: actor.userId, planId, status, ...(status === "ACTIVE" ? { startsAt: now, expiresAt: new Date(now.getTime() + plan.validityDays * DAY) } : {}) },
    });
    const invoice = plan.fee > 0 ? await createInvoice(tx, { userId: actor.userId, purpose: "MEMBERSHIP", membershipId: m.id, description: `${plan.name} membership (${plan.validityDays} days)`, amount: plan.fee }) : null;
    await audit({ actorId: actor.userId, action: "membership.apply", entityType: "Membership", entityId: m.id, data: { plan: plan.slug, status } }, tx);
    if (needsApproval) await notifyStaff(["FACILITY_MANAGER"], { kind: "membership.review", title: `Membership application: ${plan.name}`, body: "A membership application is awaiting review.", link: "/admin/memberships" }, tx);
    return { membership: m, invoice };
  });
}

export async function onMembershipPaid(tx: Tx, membershipId: string) {
  const m = await tx.membership.findUnique({ where: { id: membershipId }, include: { plan: true, invoices: true } });
  if (!m || m.status !== "PENDING_PAYMENT") return;
  const paid = m.invoices.reduce((s, i) => s + i.amountPaid, 0);
  if (paid < m.plan.fee) return;
  // Renewals stack on top of the current active period.
  const current = await tx.membership.findFirst({ where: { userId: m.userId, planId: m.planId, status: "ACTIVE", id: { not: m.id } }, orderBy: { expiresAt: "desc" } });
  const start = current?.expiresAt && current.expiresAt > new Date() ? current.expiresAt : new Date();
  const expiresAt = new Date(start.getTime() + m.plan.validityDays * DAY);
  if (current) await tx.membership.update({ where: { id: current.id }, data: { status: "EXPIRED", expiresAt: start } });
  await tx.membership.update({ where: { id: m.id }, data: { status: "ACTIVE", startsAt: current ? (current.startsAt ?? start) : start, expiresAt } });
  await audit({ action: "membership.activate", entityType: "Membership", entityId: m.id, data: { expiresAt } }, tx);
  await notify({ userId: m.userId, kind: "membership.active", title: `${m.plan.name} membership active`, body: `Your membership is active until ${fmtDate(expiresAt)}.`, link: "/dashboard/membership" }, tx);
}

export async function manageMembership(actor: Actor, membershipId: string, action: "APPROVE" | "SUSPEND" | "REINSTATE" | "CANCEL", note?: string) {
  if (!can(actor, "memberships.manage")) throw new ForbiddenError();
  return db.$transaction(async (tx) => {
    const m = await tx.membership.findUnique({ where: { id: membershipId }, include: { plan: true } });
    if (!m) throw new NotFoundError();
    const transitions: Record<string, { from: MembershipStatus[]; to: MembershipStatus }> = {
      APPROVE: { from: ["PENDING_APPROVAL"], to: m.plan.fee > 0 ? "PENDING_PAYMENT" : "ACTIVE" },
      SUSPEND: { from: ["ACTIVE"], to: "SUSPENDED" },
      REINSTATE: { from: ["SUSPENDED"], to: m.expiresAt && m.expiresAt < new Date() ? "EXPIRED" : "ACTIVE" },
      CANCEL: { from: ["PENDING_APPROVAL", "PENDING_PAYMENT", "ACTIVE", "SUSPENDED"], to: "CANCELLED" },
    };
    const t = transitions[action];
    if (!t.from.includes(m.status)) throw new AppError(`Cannot ${action.toLowerCase()} a ${m.status.toLowerCase().replace(/_/g, " ")} membership.`);
    const now = new Date();
    await tx.membership.update({
      where: { id: m.id },
      data: { status: t.to, ...(t.to === "ACTIVE" && !m.startsAt ? { startsAt: now, expiresAt: new Date(now.getTime() + m.plan.validityDays * DAY) } : {}) },
    });
    if (action === "APPROVE" && m.plan.fee > 0) {
      const has = await tx.invoice.findFirst({ where: { membershipId: m.id, status: { not: "VOID" } } });
      if (!has) await createInvoice(tx, { userId: m.userId, purpose: "MEMBERSHIP", membershipId: m.id, description: `${m.plan.name} membership (${m.plan.validityDays} days)`, amount: m.plan.fee });
    }
    if (action === "CANCEL") await tx.invoice.updateMany({ where: { membershipId: m.id, amountPaid: 0, status: "ISSUED" }, data: { status: "VOID" } });
    await audit({ actorId: actor.userId, action: `membership.${action.toLowerCase()}`, entityType: "Membership", entityId: m.id, data: { note } }, tx);
    const body: Record<string, string> = {
      APPROVE: m.plan.fee > 0 ? "Your membership application was approved. Please complete payment from your dashboard to activate it." : "Your membership is now active.",
      SUSPEND: `Your membership has been suspended.${note ? ` Reason: ${note}` : ""} Contact the facility manager for details.`,
      REINSTATE: "Your membership has been reinstated.",
      CANCEL: `Your membership has been cancelled.${note ? ` Note: ${note}` : ""}`,
    };
    await notify({ userId: m.userId, kind: `membership.${action.toLowerCase()}`, title: `${m.plan.name} membership update`, body: body[action], link: "/dashboard/membership" }, tx);
  });
}

/** Daily job: expiry, renewal reminders. */
export async function runMembershipLifecycle(now = new Date()) {
  const expiring = await db.membership.findMany({ where: { status: "ACTIVE", expiresAt: { lte: now } }, include: { plan: true } });
  for (const m of expiring) {
    await db.$transaction(async (tx) => {
      await tx.membership.update({ where: { id: m.id }, data: { status: "EXPIRED", expiryNotifiedAt: now } });
      await notify({ userId: m.userId, kind: "membership.expired", title: `${m.plan.name} membership expired`, body: "Your membership has expired. Renew to keep member rates and production job eligibility.", link: "/dashboard/membership" }, tx);
    });
  }
  const soon = await db.membership.findMany({
    where: { status: "ACTIVE", renewalReminderAt: null, expiresAt: { gt: now, lte: new Date(now.getTime() + 14 * DAY) } },
    include: { plan: true },
  });
  for (const m of soon) {
    await db.$transaction(async (tx) => {
      await tx.membership.update({ where: { id: m.id }, data: { renewalReminderAt: now } });
      await notify({ userId: m.userId, kind: "membership.renewal_reminder", title: `Renew your ${m.plan.name} membership`, body: `Your membership expires on ${fmtDate(m.expiresAt)}. Renew now to avoid interruption.`, link: "/dashboard/membership" }, tx);
    });
  }
  return { expired: expiring.length, reminded: soon.length };
}

export async function activeMembership(userId: string) {
  return db.membership.findFirst({ where: { userId, status: "ACTIVE", expiresAt: { gt: new Date() } }, include: { plan: true }, orderBy: { expiresAt: "desc" } });
}
