import type { Role } from "@prisma/client";
import { ForbiddenError } from "../errors";

/**
 * Permission matrix. Roles never imply each other: a finance officer does not get
 * user administration, a facility manager is limited to their facilities, etc.
 */
export const PERMISSIONS = {
  "booking.manage": ["FACILITY_MANAGER", "SUPER_ADMIN"],
  "facility.manage": ["FACILITY_MANAGER", "SUPER_ADMIN"],
  "facility.create": ["SUPER_ADMIN"],
  "equipment.manage": ["FACILITY_MANAGER", "SUPER_ADMIN"],
  "pricing.manage": ["FACILITY_MANAGER", "SUPER_ADMIN"],
  "materials.manage": ["FACILITY_MANAGER", "PRODUCTION_MANAGER", "SUPER_ADMIN"],
  "production.view": ["PRODUCTION_MANAGER", "QC_OFFICER", "FINANCE_OFFICER", "SUPER_ADMIN"],
  "production.manage": ["PRODUCTION_MANAGER", "SUPER_ADMIN"],
  "production.qc": ["QC_OFFICER", "PRODUCTION_MANAGER", "SUPER_ADMIN"],
  "earnings.approve": ["PRODUCTION_MANAGER", "SUPER_ADMIN"],
  "earnings.pay": ["FINANCE_OFFICER", "SUPER_ADMIN"],
  "finance.view": ["FINANCE_OFFICER", "SUPER_ADMIN"],
  "finance.record": ["FINANCE_OFFICER", "SUPER_ADMIN"],
  "tailors.review": ["PRODUCTION_MANAGER", "FACILITY_MANAGER", "SUPER_ADMIN"],
  "memberships.manage": ["FACILITY_MANAGER", "SUPER_ADMIN"],
  "academy.manage": ["ACADEMY_ADMIN", "SUPER_ADMIN"],
  "academy.teach": ["INSTRUCTOR", "ACADEMY_ADMIN", "SUPER_ADMIN"],
  "cms.manage": ["SUPER_ADMIN"],
  "enquiries.manage": ["FACILITY_MANAGER", "PRODUCTION_MANAGER", "ACADEMY_ADMIN", "SUPER_ADMIN"],
  "reports.view": ["FACILITY_MANAGER", "PRODUCTION_MANAGER", "FINANCE_OFFICER", "ACADEMY_ADMIN", "SUPER_ADMIN"],
  "users.manage": ["SUPER_ADMIN"],
  "audit.view": ["SUPER_ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const STAFF_ROLES: Role[] = [
  "FACILITY_MANAGER",
  "PRODUCTION_MANAGER",
  "FINANCE_OFFICER",
  "QC_OFFICER",
  "ACADEMY_ADMIN",
  "INSTRUCTOR",
  "SUPER_ADMIN",
];

export type RoleGrant = { role: Role; facilityId: string | null };
export type Actor = { userId: string; roles: RoleGrant[] };

export function hasRole(actor: Actor | null | undefined, role: Role): boolean {
  return !!actor?.roles.some((r) => r.role === role);
}

export function isStaff(actor: Actor | null | undefined): boolean {
  return !!actor?.roles.some((r) => STAFF_ROLES.includes(r.role));
}

/**
 * True when the actor holds a role granting `perm`. If `facilityId` is given,
 * a facility-scoped grant must match it (unscoped grants apply everywhere).
 */
export function can(actor: Actor | null | undefined, perm: Permission, facilityId?: string | null): boolean {
  if (!actor) return false;
  const allowed = PERMISSIONS[perm] as readonly Role[];
  return actor.roles.some(
    (g) => allowed.includes(g.role) && (g.facilityId == null || facilityId === undefined || g.facilityId === facilityId),
  );
}

/** Facilities the actor may act on for `perm`: "ALL" or an explicit list. */
export function facilityScope(actor: Actor, perm: Permission): "ALL" | string[] {
  const allowed = PERMISSIONS[perm] as readonly Role[];
  const grants = actor.roles.filter((g) => allowed.includes(g.role));
  if (grants.some((g) => g.facilityId == null)) return "ALL";
  return grants.map((g) => g.facilityId!).filter(Boolean);
}

export function assertCan(actor: Actor | null | undefined, perm: Permission, facilityId?: string | null): asserts actor is Actor {
  if (!can(actor, perm, facilityId)) throw new ForbiddenError();
}
