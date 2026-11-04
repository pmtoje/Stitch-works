// Framework-agnostic authentication logic (unit-testable). Cookie handling lives in session.ts.
import { db } from "../db";
import { randomToken, sha256 } from "../crypto";
import { hashPassword, verifyPassword, passwordSchema } from "./password";
import { AppError } from "../errors";
import { audit } from "../audit";
import type { AuthTokenType, Role } from "@prisma/client";
import { verifyTotp, openSecret } from "./totp";

export const SESSION_TTL_DAYS = 14;
export const SESSION_IDLE_HOURS = 72;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
let dummyHash: string | undefined;

export async function createUser(input: { email: string; fullName: string; phone?: string; password?: string; roles?: Role[] }) {
  const email = input.email.trim().toLowerCase();
  if (await db.user.findUnique({ where: { email } })) throw new AppError("An account with this email already exists. Please sign in.", "EMAIL_TAKEN");
  if (input.password) passwordSchema.parse(input.password);
  return db.user.create({
    data: {
      email,
      fullName: input.fullName.trim(),
      phone: input.phone?.trim() || null,
      passwordHash: input.password ? await hashPassword(input.password) : null,
      roles: { create: (input.roles ?? ["CUSTOMER"]).map((role) => ({ role })) },
    },
  });
}

export async function issueToken(userId: string, type: AuthTokenType, ttlMinutes: number) {
  const token = randomToken();
  await db.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
  await db.authToken.create({ data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMinutes * 60_000) } });
  return token;
}

export async function consumeToken(token: string, types: AuthTokenType[]) {
  const row = await db.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || !types.includes(row.type) || row.usedAt || row.expiresAt < new Date()) {
    throw new AppError("This link is invalid or has expired. Please request a new one.", "TOKEN_INVALID");
  }
  const claimed = await db.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) throw new AppError("This link has already been used.", "TOKEN_USED");
  return row;
}

export type LoginResult = { ok: true; sessionToken: string; mfaRequired: boolean } | { ok: false; error: string };

export async function authenticate(emailRaw: string, password: string, meta: { ip?: string; userAgent?: string } = {}): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  const generic = { ok: false as const, error: "Incorrect email or password." };
  if (!user || !user.passwordHash || user.disabledAt) {
    // Equalise timing so attackers cannot enumerate registered emails.
    dummyHash ??= await hashPassword("timing-equaliser-password-1");
    await verifyPassword(password, dummyHash);
    return generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: "This account is temporarily locked after repeated failed attempts. Try again in 15 minutes." };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: failed >= MAX_FAILED ? 0 : failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
    });
    if (failed >= MAX_FAILED) await audit({ actorId: user.id, action: "auth.locked", entityType: "User", entityId: user.id, ip: meta.ip });
    return generic;
  }
  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  const mfaRequired = !!user.totpEnabledAt;
  const sessionToken = await createSession(user.id, { ...meta, mfaPassed: !mfaRequired });
  await audit({ actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id, ip: meta.ip });
  return { ok: true, sessionToken, mfaRequired };
}

export async function createSession(userId: string, opts: { ip?: string; userAgent?: string; mfaPassed?: boolean } = {}) {
  const token = randomToken();
  await db.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000),
      mfaPassed: opts.mfaPassed ?? true,
      ip: opts.ip?.slice(0, 64),
      userAgent: opts.userAgent?.slice(0, 255),
    },
  });
  return token;
}

/** Validates a session token, enforcing absolute and idle expiry. */
export async function resolveSession(token: string | undefined | null) {
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { roles: true } } },
  });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() < now || now - session.lastSeenAt.getTime() > SESSION_IDLE_HOURS * 3_600_000 || session.user.disabledAt) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (now - session.lastSeenAt.getTime() > 5 * 60_000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  return session;
}

export async function completeMfa(token: string, code: string) {
  const session = await resolveSession(token);
  if (!session || !session.user.totpSecretEnc) throw new AppError("Your sign-in has expired. Please sign in again.");
  if (!verifyTotp(code, openSecret(session.user.totpSecretEnc))) throw new AppError("That code is not valid. Check your authenticator app and try again.");
  await db.session.update({ where: { id: session.id }, data: { mfaPassed: true } });
}

export async function revokeSession(token: string) {
  await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export async function resetPassword(token: string, newPassword: string) {
  passwordSchema.parse(newPassword);
  const row = await consumeToken(token, ["PASSWORD_RESET", "ACCOUNT_SETUP"]);
  await db.user.update({
    where: { id: row.userId },
    data: { passwordHash: await hashPassword(newPassword), emailVerifiedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
  });
  // Invalidate all existing sessions after a password change.
  await db.session.deleteMany({ where: { userId: row.userId } });
  await audit({ actorId: row.userId, action: "auth.password_reset", entityType: "User", entityId: row.userId });
  return row.userId;
}
