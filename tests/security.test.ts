import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { can, facilityScope, PERMISSIONS } from "@/lib/auth/rbac";
import { authenticate, createSession, resolveSession, createUser, issueToken, resetPassword, consumeToken } from "@/lib/auth/service";
import { hashPassword } from "@/lib/auth/password";
import { cancelBooking, createBooking } from "@/lib/booking/service";
import { handleWebhook, initiatePayment, recordRefund } from "@/lib/payments/service";
import { detectKind } from "@/lib/uploads";
import { toCsv } from "@/lib/reports";
import { rateLimit } from "@/lib/ratelimit";
import { decrypt, encrypt, hmacHex } from "@/lib/crypto";
import { makeFacility, makeUser, resetDb, tomorrow } from "./helpers";

beforeEach(resetDb);

describe("role-based access control", () => {
  it("never grants finance officers administration rights", () => {
    const fin = { userId: "f", roles: [{ role: "FINANCE_OFFICER" as const, facilityId: null }] };
    expect(can(fin, "finance.record")).toBe(true);
    for (const p of ["users.manage", "cms.manage", "audit.view", "production.manage", "booking.manage", "earnings.approve"] as const) expect(can(fin, p)).toBe(false);
  });
  it("scopes facility managers to their facilities", () => {
    const fm = { userId: "m", roles: [{ role: "FACILITY_MANAGER" as const, facilityId: "A" }] };
    expect(can(fm, "booking.manage", "A")).toBe(true);
    expect(can(fm, "booking.manage", "B")).toBe(false);
    expect(facilityScope(fm, "booking.manage")).toEqual(["A"]);
  });
  it("gives customers, tailors and students no management permission", () => {
    for (const role of ["CUSTOMER", "CORPORATE_CLIENT", "TAILOR", "STUDENT"] as const) {
      const a = { userId: "x", roles: [{ role, facilityId: null }] };
      for (const p of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) expect(can(a, p)).toBe(false);
    }
  });
  it("supports users holding multiple roles", () => {
    const a = { userId: "x", roles: [{ role: "TAILOR" as const, facilityId: null }, { role: "INSTRUCTOR" as const, facilityId: null }] };
    expect(can(a, "academy.teach")).toBe(true);
    expect(can(a, "academy.manage")).toBe(false);
  });
});

describe("cross-user record access (IDOR)", () => {
  it("prevents cancelling or paying another customer's booking", async () => {
    const { facility, machines } = await makeFacility();
    const owner = await makeUser();
    const attacker = await makeUser();
    const b = await createBooking(owner.actor, { facilityId: facility.id, durationType: "FULL_DAY", date: tomorrow(), equipmentIds: [machines[0].id], workstationIds: [] });
    await expect(cancelBooking(attacker.actor, b.id, "x")).rejects.toThrow(/not found/i);
    const inv = await db.invoice.findFirstOrThrow({ where: { bookingId: b.id } });
    await expect(initiatePayment(attacker.actor, inv.id)).rejects.toThrow(/not found/i);
  });
  it("prevents customers from booking on behalf of others (privilege escalation)", async () => {
    const { facility, machines } = await makeFacility();
    const a = await makeUser();
    const victim = await makeUser();
    await expect(createBooking(a.actor, { facilityId: facility.id, durationType: "FULL_DAY", date: tomorrow(), equipmentIds: [machines[0].id], workstationIds: [] }, { onBehalfOfUserId: victim.user.id })).rejects.toThrow(/permission/);
  });
  it("prevents non-finance staff from recording refunds", async () => {
    const { facility, machines } = await makeFacility();
    const c = await makeUser();
    const fm = await makeUser(["FACILITY_MANAGER"], facility.id);
    const b = await createBooking(c.actor, { facilityId: facility.id, durationType: "FULL_DAY", date: tomorrow(), equipmentIds: [machines[0].id], workstationIds: [] });
    const inv = await db.invoice.findFirstOrThrow({ where: { bookingId: b.id } });
    await expect(recordRefund(fm.actor, inv.id, { amount: 1, method: "cash", reason: "x" })).rejects.toThrow(/permission/);
  });
});

describe("authentication & sessions", () => {
  it("hashes passwords, authenticates, and locks the account after repeated failures", async () => {
    const u = await createUser({ email: "Lock@Test.ng", fullName: "L", password: "Correct-horse-9" });
    expect(u.passwordHash).not.toContain("Correct");
    expect((await authenticate("lock@test.ng", "Correct-horse-9")).ok).toBe(true);
    for (let i = 0; i < 5; i++) expect((await authenticate("lock@test.ng", "wrong-password-1")).ok).toBe(false);
    const r = await authenticate("lock@test.ng", "Correct-horse-9");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/locked/);
  });
  it("rejects weak passwords and duplicate emails", async () => {
    await expect(createUser({ email: "a@test.ng", fullName: "A", password: "short" })).rejects.toThrow();
    await createUser({ email: "dup@test.ng", fullName: "A" });
    await expect(createUser({ email: "DUP@test.ng", fullName: "B" })).rejects.toThrow(/already exists/);
  });
  it("requires the second factor before a 2FA session is usable", async () => {
    const u = await makeUser();
    await db.user.update({ where: { id: u.user.id }, data: { passwordHash: await hashPassword("Password-123x"), totpEnabledAt: new Date(), totpSecretEnc: encrypt("JBSWY3DPEHPK3PXP") } });
    const r = await authenticate(u.user.email, "Password-123x");
    expect(r.ok && r.mfaRequired).toBe(true);
    const s = await resolveSession(r.ok ? r.sessionToken : "");
    expect(s?.mfaPassed).toBe(false);
  });
  it("expires sessions on absolute and idle timeouts", async () => {
    const u = await makeUser();
    const t1 = await createSession(u.user.id);
    expect(await resolveSession(t1)).not.toBeNull();
    await db.session.updateMany({ where: { userId: u.user.id }, data: { lastSeenAt: new Date(Date.now() - 4 * 86_400_000) } });
    expect(await resolveSession(t1)).toBeNull();
    const t2 = await createSession(u.user.id);
    await db.session.updateMany({ where: { userId: u.user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await resolveSession(t2)).toBeNull();
    expect(await resolveSession("forged-token")).toBeNull();
  });
  it("disabled users lose their sessions", async () => {
    const u = await makeUser();
    const t = await createSession(u.user.id);
    await db.user.update({ where: { id: u.user.id }, data: { disabledAt: new Date() } });
    expect(await resolveSession(t)).toBeNull();
  });
  it("uses single-use, expiring reset tokens and revokes sessions on reset", async () => {
    const u = await makeUser();
    const s = await createSession(u.user.id);
    const token = await issueToken(u.user.id, "PASSWORD_RESET", 60);
    await resetPassword(token, "Brand-new-pass-1");
    expect(await resolveSession(s)).toBeNull();
    await expect(resetPassword(token, "Another-pass-22")).rejects.toThrow();
    const expired = await issueToken(u.user.id, "PASSWORD_RESET", -1);
    await expect(consumeToken(expired, ["PASSWORD_RESET"])).rejects.toThrow(/expired/);
  });
});

describe("payments & financial integrity", () => {
  it("rejects webhooks with invalid signatures and de-duplicates valid ones", async () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "nope", id: 1 } });
    expect((await handleWebhook("mock", body, "bad")).status).toBe(401);
    const sig = hmacHex("sha512", "mock-webhook-secret", body);
    expect((await handleWebhook("mock", body, sig)).status).toBe(200);
    expect((await handleWebhook("mock", body, sig)).duplicate).toBe(true);
  });
  it("makes succeeded payments and audit logs immutable at the database level", async () => {
    const u = await makeUser();
    const inv = await db.invoice.create({ data: { number: "INV-T-1", userId: u.user.id, purpose: "OTHER", description: "x", amount: 100 } });
    const p = await db.payment.create({ data: { reference: "R1", invoiceId: inv.id, userId: u.user.id, provider: "manual", amount: 100, status: "SUCCEEDED" } });
    await expect(db.payment.update({ where: { id: p.id }, data: { amount: 1 } })).rejects.toThrow();
    await expect(db.payment.update({ where: { id: p.id }, data: { status: "FAILED" } })).rejects.toThrow();
    const log = await db.auditLog.create({ data: { action: "t", entityType: "t", entityId: "t" } });
    await expect(db.auditLog.update({ where: { id: log.id }, data: { action: "x" } })).rejects.toThrow(/append-only/);
    await expect(db.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/append-only/);
  });
  it("prevents refunding more than was paid", async () => {
    const u = await makeUser();
    const fin = await makeUser(["FINANCE_OFFICER"]);
    const inv = await db.invoice.create({ data: { number: "INV-T-2", userId: u.user.id, purpose: "OTHER", description: "x", amount: 100, amountPaid: 100, status: "PAID" } });
    await expect(recordRefund(fin.actor, inv.id, { amount: 101, method: "cash", reason: "x" })).rejects.toThrow(/between/);
    await recordRefund(fin.actor, inv.id, { amount: 100, method: "cash", reason: "x" });
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("REFUNDED");
  });
});

describe("uploads, exports, crypto & rate limiting", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const pdf = Buffer.from("%PDF-1.7 test");
  it("detects file types by content, not by name", () => {
    expect(detectKind(png, "a.png", ["png"]).mime).toBe("image/png");
    expect(detectKind(pdf, "a.pdf", ["pdf"]).ext).toBe("pdf");
    expect(() => detectKind(Buffer.from("<script>alert(1)</script>"), "evil.png", ["png", "jpg"])).toThrow(/not an accepted/);
    expect(() => detectKind(Buffer.from("MZ\x90\x00"), "x.pdf", ["pdf"])).toThrow();
    expect(() => detectKind(pdf, "a.pdf", ["png"])).toThrow(); // purpose whitelist
  });
  it("enforces size limits", () => {
    const big = Buffer.concat([png, Buffer.alloc(11 * 1024 * 1024)]);
    expect(() => detectKind(big, "big.png", ["png"])).toThrow(/larger/);
  });
  it("neutralises CSV formula injection", () => {
    expect(toCsv([{ a: "=HYPERLINK(\"x\")", b: "ok" }])).toContain("'=HYPERLINK");
  });
  it("encrypts secrets with authenticated encryption", () => {
    const c = encrypt("secret");
    expect(decrypt(c)).toBe("secret");
    const tampered = c.slice(0, -2) + (c.endsWith("A") ? "BB" : "AA");
    expect(() => decrypt(tampered)).toThrow();
  });
  it("rate limits repeated attempts", async () => {
    const key = `rl-${Date.now()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit(key, 3, 60));
    expect(results).toEqual([true, true, true, false]);
  });
});
