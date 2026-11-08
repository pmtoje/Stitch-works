"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { safeAction, str } from "@/lib/action";
import { authenticate, completeMfa, createSession, createUser, consumeToken, issueToken, resetPassword, revokeSession } from "@/lib/auth/service";
import { clearSessionCookie, clientIp, sessionToken, setSessionCookie } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/ratelimit";
import { notify, kickDispatch } from "@/lib/notifications";
import { AppError } from "@/lib/errors";
import { STAFF_ROLES } from "@/lib/auth/rbac";
import { headers } from "next/headers";

const safeNext = (n: string) => (n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard");

export const loginAction = safeAction(async (_s: unknown, fd: FormData) => {
  const ip = await clientIp();
  const email = str(fd, "email").toLowerCase();
  await enforceRateLimit(`login:ip:${ip}`, 30, 900);
  await enforceRateLimit(`login:email:${email}`, 10, 900);
  const r = await authenticate(email, str(fd, "password"), { ip, userAgent: (await headers()).get("user-agent") ?? undefined });
  if (!r.ok) throw new AppError(r.error);
  await setSessionCookie(r.sessionToken);
  let next = safeNext(str(fd, "next"));
  if (!str(fd, "next")) {
    // Staff land in the management console by default.
    const roles = await db.userRole.findMany({ where: { user: { email } }, select: { role: true } });
    if (roles.some((x) => STAFF_ROLES.includes(x.role))) next = "/admin";
  }
  redirect(r.mfaRequired ? `/login/2fa?next=${encodeURIComponent(next)}` : next);
});

export const mfaAction = safeAction(async (_s: unknown, fd: FormData) => {
  const token = await sessionToken();
  if (!token) redirect("/login");
  await enforceRateLimit(`mfa:${await clientIp()}`, 10, 600);
  await completeMfa(token!, str(fd, "code"));
  redirect(safeNext(str(fd, "next")));
});

const registerSchema = z.object({
  fullName: z.string().min(2, "Enter your full name.").max(120),
  email: z.string().email("Enter a valid email address."),
  phone: z.string().regex(/^\+?[0-9 ]{10,16}$/, "Enter a valid phone number, e.g. +234 803 000 0000.").optional().or(z.literal("")),
  password: z.string(),
});

export const registerAction = safeAction(async (_s: unknown, fd: FormData) => {
  await enforceRateLimit(`register:${await clientIp()}`, 10, 3600);
  const input = registerSchema.parse({ fullName: str(fd, "fullName"), email: str(fd, "email"), phone: str(fd, "phone"), password: str(fd, "password") });
  if (input.password !== str(fd, "confirm")) throw new AppError("Passwords do not match.");
  const user = await createUser({ ...input, phone: input.phone || undefined });
  const token = await issueToken(user.id, "EMAIL_VERIFY", 60 * 48);
  await notify({ userId: user.id, kind: "auth.verify", title: "Verify your StitchWorks email", body: `Welcome to StitchWorks, ${user.fullName.split(" ")[0]}! Please confirm your email address.`, link: `/verify-email?token=${token}`, channels: ["EMAIL"] });
  kickDispatch();
  await setSessionCookie(await createSession(user.id, { ip: await clientIp() }));
  redirect(safeNext(str(fd, "next")) + (str(fd, "next") ? "" : "?welcome=1"));
});

export const forgotAction = safeAction(async (_s: unknown, fd: FormData) => {
  await enforceRateLimit(`forgot:${await clientIp()}`, 5, 900);
  const user = await db.user.findUnique({ where: { email: str(fd, "email").toLowerCase() } });
  if (user && !user.disabledAt) {
    const token = await issueToken(user.id, "PASSWORD_RESET", 60);
    await notify({ userId: user.id, kind: "auth.reset", title: "Reset your StitchWorks password", body: "Use the link below within 1 hour to choose a new password. If you did not request this, you can ignore this email.", link: `/reset-password?token=${token}`, channels: ["EMAIL"] });
    kickDispatch();
  }
  // Same response either way to avoid revealing registered emails.
  return { message: "If an account exists for that email, we've sent a password reset link. It expires in 1 hour." };
});

export const resetAction = safeAction(async (_s: unknown, fd: FormData) => {
  await enforceRateLimit(`reset:${await clientIp()}`, 10, 900);
  if (str(fd, "password") !== str(fd, "confirm")) throw new AppError("Passwords do not match.");
  await resetPassword(str(fd, "token"), str(fd, "password"));
  redirect("/login?reset=1");
});

export async function verifyEmailToken(token: string) {
  const row = await consumeToken(token, ["EMAIL_VERIFY"]);
  await db.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
}

export async function logoutAction() {
  const t = await sessionToken();
  if (t) await revokeSession(t);
  await clearSessionCookie();
  redirect("/");
}
