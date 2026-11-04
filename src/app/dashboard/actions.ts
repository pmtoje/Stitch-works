"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, clientIp } from "@/lib/auth/session";
import { safeAction, str, int, optStr, files } from "@/lib/action";
import { cancelBooking, rescheduleBooking } from "@/lib/booking/service";
import { initiatePayment } from "@/lib/payments/service";
import { respondToQuotation } from "@/lib/production/orders";
import { applyForMembership } from "@/lib/memberships";
import { applyToJob, submitOutput } from "@/lib/production/allocation";
import { submitAssignment } from "@/lib/academy/service";
import { saveUpload, saveUploads } from "@/lib/uploads";
import { kickDispatch, notify } from "@/lib/notifications";
import { newTotpSecret, sealSecret, openSecret, verifyTotp } from "@/lib/auth/totp";
import { hashPassword, verifyPassword, passwordSchema } from "@/lib/auth/password";
import { issueToken } from "@/lib/auth/service";
import { enforceRateLimit } from "@/lib/ratelimit";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";

export const cancelBookingAction = safeAction(async (_s: unknown, fd: FormData) => {
  const u = await requireUser();
  const r = await cancelBooking(u.actor, str(fd, "bookingId"), str(fd, "reason") || "Cancelled by customer");
  kickDispatch();
  revalidatePath("/dashboard/bookings");
  return { message: r.refundDue ? `Booking cancelled. A refund of ₦${r.refundDue.toLocaleString()} will be processed.` : "Booking cancelled." };
});

export const rescheduleBookingAction = safeAction(async (_s: unknown, fd: FormData) => {
  const u = await requireUser();
  await rescheduleBooking(u.actor, str(fd, "bookingId"), { date: str(fd, "date"), startTime: optStr(fd, "startTime"), endTime: optStr(fd, "endTime"), halfDaySlot: (optStr(fd, "halfDaySlot") as "AM" | "PM") ?? undefined });
  kickDispatch();
  revalidatePath(`/dashboard/bookings/${str(fd, "bookingId")}`);
  return { message: "Booking rescheduled." };
});

export const payInvoiceAction = safeAction(async (_s: unknown, fd: FormData) => {
  const u = await requireUser();
  await enforceRateLimit(`pay:${u.id}`, 20, 600);
  const r = await initiatePayment(u.actor, str(fd, "invoiceId"));
  redirect(r.authorizationUrl);
});

export const respondQuotationAction = safeAction(async (_s: unknown, fd: FormData) => {
  const u = await requireUser();
  const accept = str(fd, "decision") === "accept";
  await respondToQuotation(u.actor, str(fd, "quotationId"), accept, optStr(fd, "note"));
  kickDispatch();
  revalidatePath("/dashboard/orders");
  return { message: accept ? "Quotation accepted. Your deposit invoice is ready below." : "Thank you — we’ve let the production team know." };
});

export const applyMembershipAction = safeAction(async (_s: unknown, fd: FormData) => {
  const u = await requireUser();
  const r = await applyForMembership(u.actor, str(fd, "planId"));
  kickDispatch();
  if (r.invoice && r.membership.status === "PENDING_PAYMENT") redirect(`/dashboard/invoices/${r.invoice.id}`);
  revalidatePath("/dashboard/membership");
  return { message: r.membership.status === "PENDING_APPROVAL" ? "Application received. A manager will review it shortly." : "Membership active." };
});

export const applyJobAction = safeAction(async (_s: unknown, fd: FormData) => {
  const u = await requireUser();
  await applyToJob(u.actor, str(fd, "jobId"), int(fd, "quantity"), optStr(fd, "message"));
  kickDispatch();
  revalidatePath("/dashboard/tailor/jobs");
  return { message: "Application sent to the production manager." };
});

export const submitOutputAction = safeAction(async (_s: unknown, fd: FormData) => {
  const u = await requireUser();
  await submitOutput(u.actor, str(fd, "allocationId"), int(fd, "quantity"), optStr(fd, "note"));
  kickDispatch();
  revalidatePath("/dashboard/tailor/jobs");
  return { message: "Submitted for quality inspection." };
});

export const updateTailorProfileAction = safeAction(async (_s: unknown, fd: FormData) => {
  const u = await requireUser();
  const t = await db.tailor.findUnique({ where: { userId: u.id } });
  if (!t) throw new AppError("Tailor profile not found.");
  const photo = files(fd, "photo")[0];
  const up = photo ? await saveUpload(photo, { ownerId: u.id, purpose: "PORTFOLIO", visibility: "PUBLIC" }) : null;
  await db.tailor.update({
    where: { id: t.id },
    data: { bio: str(fd, "bio").slice(0, 1200) || null, specialisations: str(fd, "specialisations").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12), ...(up ? { photoUploadId: up.id } : {}) },
  });
  revalidatePath("/dashboard/tailor");
  return { message: "Profile updated." };
});

export const addPortfolioAction = safeAction(async (_s: unknown, fd: FormData) => {
  const u = await requireUser();
  const t = await db.tailor.findUnique({ where: { userId: u.id } });
  if (!t) throw new AppError("Tailor profile not found.");
  const ups = await saveUploads(files(fd, "files"), { ownerId: u.id, purpose: "PORTFOLIO", visibility: "PUBLIC" }, 6);
  if (!ups.length) throw new AppError("Choose at least one photo or video.");
  for (const up of ups) await db.portfolioItem.create({ data: { tailorId: t.id, uploadId: up.id, title: str(fd, "title") || up.originalName } });
  revalidatePath("/dashboard/tailor");
  return { message: `${ups.length} item(s) added to your portfolio.` };
});

export const removePortfolioAction = safeAction(async (_s: unknown, fd: FormData) => {
  const u = await requireUser();
  await db.portfolioItem.deleteMany({ where: { id: str(fd, "id"), tailor: { userId: u.id } } });
  revalidatePath("/dashboard/tailor");
});

export const submitAssignmentAction = safeAction(async (_s: unknown, fd: FormData) => {
  const u = await requireUser();
  const f = files(fd, "file")[0];
  const up = f ? await saveUpload(f, { ownerId: u.id, purpose: "ASSIGNMENT" }) : null;
  await submitAssignment(u.actor, str(fd, "assignmentId"), { text: optStr(fd, "text"), uploadId: up?.id ?? null });
  revalidatePath("/dashboard/academy");
  return { message: "Assignment submitted." };
});

const measureKeys = ["chest", "waist", "hips", "shoulder", "sleeve", "neck", "inseam", "outseam", "height", "thigh"] as const;
export const saveMeasurementsAction = safeAction(async (_s: unknown, fd: FormData) => {
  const u = await requireUser();
  const values: Record<string, number> = {};
  for (const k of measureKeys) {
    const v = Number(str(fd, k));
    if (str(fd, k) && (!Number.isFinite(v) || v <= 0 || v > 400)) throw new AppError(`Enter a valid ${k} measurement.`);
    if (str(fd, k)) values[k] = v;
  }
  const id = optStr(fd, "id");
  const data = { label: str(fd, "label") || "My measurements", unit: str(fd, "unit") === "in" ? "in" : "cm", values, notes: optStr(fd, "notes") ?? null };
  if (id) await db.measurementProfile.updateMany({ where: { id, userId: u.id }, data });
  else await db.measurementProfile.create({ data: { ...data, userId: u.id } });
  revalidatePath("/dashboard/measurements");
  return { message: "Measurements saved." };
});

export const deleteMeasurementsAction = safeAction(async (_s: unknown, fd: FormData) => {
  const u = await requireUser();
  await db.measurementProfile.deleteMany({ where: { id: str(fd, "id"), userId: u.id } });
  revalidatePath("/dashboard/measurements");
});

export const markNotificationsReadAction = async () => {
  const u = await requireUser();
  await db.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/dashboard", "layout");
};

export const updateProfileAction = safeAction(async (_s: unknown, fd: FormData) => {
  const u = await requireUser();
  const data = z.object({ fullName: z.string().min(2).max(120), phone: z.string().regex(/^\+?[0-9 ]{10,16}$/, "Enter a valid phone number.").or(z.literal("")) }).parse({ fullName: str(fd, "fullName"), phone: str(fd, "phone") });
  await db.user.update({ where: { id: u.id }, data: { fullName: data.fullName, phone: data.phone || null } });
  revalidatePath("/dashboard/security");
  return { message: "Profile saved." };
});

export const changePasswordAction = safeAction(async (_s: unknown, fd: FormData) => {
  const u = await requireUser();
  await enforceRateLimit(`pwchange:${u.id}`, 5, 900);
  const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
  if (!user.passwordHash || !(await verifyPassword(str(fd, "current"), user.passwordHash))) throw new AppError("Your current password is incorrect.");
  passwordSchema.parse(str(fd, "password"));
  if (str(fd, "password") !== str(fd, "confirm")) throw new AppError("Passwords do not match.");
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(str(fd, "password")) } });
  await audit({ actorId: u.id, action: "auth.password_change", entityType: "User", entityId: u.id, ip: await clientIp() });
  await notify({ userId: u.id, kind: "security.password", title: "Your password was changed", body: "If this wasn't you, reset your password immediately and contact StitchWorks.", channels: ["EMAIL"] });
  kickDispatch();
  return { message: "Password changed." };
});

export const startTotpAction = safeAction(async () => {
  const u = await requireUser();
  const secret = newTotpSecret();
  await db.user.update({ where: { id: u.id }, data: { totpSecretEnc: sealSecret(secret), totpEnabledAt: null } });
  revalidatePath("/dashboard/security");
});

export const confirmTotpAction = safeAction(async (_s: unknown, fd: FormData) => {
  const u = await requireUser();
  const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
  if (!user.totpSecretEnc) throw new AppError("Start two-factor setup first.");
  if (!verifyTotp(str(fd, "code"), openSecret(user.totpSecretEnc))) throw new AppError("That code is not valid. Check the time on your phone and try again.");
  await db.user.update({ where: { id: u.id }, data: { totpEnabledAt: new Date() } });
  await audit({ actorId: u.id, action: "auth.2fa_enable", entityType: "User", entityId: u.id });
  revalidatePath("/dashboard/security");
  return { message: "Two-factor authentication is on." };
});

export const disableTotpAction = safeAction(async (_s: unknown, fd: FormData) => {
  const u = await requireUser();
  const user = await db.user.findUniqueOrThrow({ where: { id: u.id } });
  if (!user.totpSecretEnc || !verifyTotp(str(fd, "code"), openSecret(user.totpSecretEnc))) throw new AppError("Enter a valid code from your authenticator app to turn off 2FA.");
  await db.user.update({ where: { id: u.id }, data: { totpEnabledAt: null, totpSecretEnc: null } });
  await audit({ actorId: u.id, action: "auth.2fa_disable", entityType: "User", entityId: u.id });
  revalidatePath("/dashboard/security");
  return { message: "Two-factor authentication turned off." };
});

export const resendVerificationAction = safeAction(async () => {
  const u = await requireUser();
  await enforceRateLimit(`verify-resend:${u.id}`, 3, 3600);
  const token = await issueToken(u.id, "EMAIL_VERIFY", 60 * 48);
  await notify({ userId: u.id, kind: "auth.verify", title: "Verify your StitchWorks email", body: "Please confirm your email address.", link: `/verify-email?token=${token}`, channels: ["EMAIL"] });
  kickDispatch();
  return { message: "Verification email sent." };
});
