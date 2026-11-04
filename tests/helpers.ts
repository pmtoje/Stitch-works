import { db } from "@/lib/db";
import type { Role } from "@prisma/client";
import type { Actor } from "@/lib/auth/rbac";
import { addDays, todayLocal } from "@/lib/time";

export async function resetDb() {
  if (!/test/i.test(process.env.DATABASE_URL ?? "")) throw new Error("resetDb only runs against a test database");
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

let n = 0;
export async function makeUser(roles: Role[] = ["CUSTOMER"], facilityId?: string) {
  n++;
  const u = await db.user.create({ data: { email: `u${n}-${Date.now()}@test.ng`, fullName: `User ${n}`, phone: "+2348000000000", roles: { create: roles.map((role) => ({ role, facilityId: role === "FACILITY_MANAGER" ? facilityId ?? null : null })) } }, include: { roles: true } });
  const actor: Actor = { userId: u.id, roles: u.roles.map((r) => ({ role: r.role, facilityId: r.facilityId })) };
  return { user: u, actor };
}

export const ALL_DAYS = { mon: ["08:00", "18:00"], tue: ["08:00", "18:00"], wed: ["08:00", "18:00"], thu: ["08:00", "18:00"], fri: ["08:00", "18:00"], sat: ["08:00", "18:00"], sun: ["08:00", "18:00"] };

export async function makeFacility(opts: Partial<{ requiresApproval: boolean; depositPercent: number; operatingHours: object }> = {}) {
  n++;
  const f = await db.facility.create({ data: { slug: `f${n}`, name: `Facility ${n}`, address: "x", city: "Jos", state: "Plateau", operatingHours: opts.operatingHours ?? ALL_DAYS, requiresApproval: opts.requiresApproval ?? false, depositPercent: opts.depositPercent ?? 0, cancellationHours: 24, paymentHoldMinutes: 30, maxConsecutiveDays: 7, maxAdvanceDays: 60 } });
  const cat = await db.equipmentCategory.create({ data: { slug: `c${n}`, name: `Straight stitch ${n}` } });
  const cat2 = await db.equipmentCategory.create({ data: { slug: `o${n}`, name: `Overlock ${n}` } });
  await db.rateCard.create({ data: { facilityId: f.id, categoryId: cat.id, hourlyRate: 1000, halfDayRate: 4000, fullDayRate: 7000, multiDayRate: 6000, securityDeposit: 0 } });
  await db.rateCard.create({ data: { facilityId: f.id, categoryId: cat2.id, hourlyRate: 1500, halfDayRate: 5000, fullDayRate: 9000, multiDayRate: null, securityDeposit: 2000 } });
  const m = await Promise.all([1, 2, 3].map((i) => db.equipment.create({ data: { assetTag: `T${n}-SS-${i}`, name: `SS ${i}`, categoryId: cat.id, facilityId: f.id } })));
  const o = await db.equipment.create({ data: { assetTag: `T${n}-OL-1`, name: "OL 1", categoryId: cat2.id, facilityId: f.id } });
  const ws = await db.workstation.create({ data: { facilityId: f.id, code: `WS-${n}`, name: "Bench", hourlyRate: 500, halfDayRate: 1800, fullDayRate: 3000, multiDayRate: 2700 } });
  return { facility: f, machines: m, overlock: o, workstation: ws, category: cat };
}

export const tomorrow = () => addDays(todayLocal(), 1);
export const inDays = (d: number) => addDays(todayLocal(), d);
