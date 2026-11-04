import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { resolveSession } from "./service";
import { can, isStaff, type Actor, type Permission } from "./rbac";
import type { Role } from "@prisma/client";

export const SESSION_COOKIE = "sw_session";

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 14 * 86400,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export const getSession = cache(async () => {
  const s = await resolveSession(await sessionToken());
  return s && s.mfaPassed ? s : null;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getSession>>>["user"] & { actor: Actor };

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await getSession();
  if (!s) return null;
  return { ...s.user, actor: { userId: s.user.id, roles: s.user.roles.map((r) => ({ role: r.role, facilityId: r.facilityId })) } };
});

export async function requireUser(next?: string): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return u;
}

export async function requireRole(roles: Role[]): Promise<CurrentUser> {
  const u = await requireUser();
  if (!u.actor.roles.some((r) => roles.includes(r.role))) redirect("/dashboard?denied=1");
  return u;
}

export async function requirePermission(perm: Permission, facilityId?: string): Promise<CurrentUser> {
  const u = await requireUser();
  if (!can(u.actor, perm, facilityId)) redirect("/admin?denied=1");
  return u;
}

export async function requireStaff(): Promise<CurrentUser> {
  const u = await requireUser("/admin");
  if (!isStaff(u.actor)) redirect("/dashboard?denied=1");
  return u;
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
