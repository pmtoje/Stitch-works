import { createCipheriv, createDecipheriv, createHash, randomBytes, createHmac, timingSafeEqual } from "node:crypto";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function key(): Buffer {
  const k = process.env.APP_ENCRYPTION_KEY;
  if (!k || k.length < 32) throw new Error("APP_ENCRYPTION_KEY must be set (min 32 chars)");
  return createHash("sha256").update(k).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export function hmacHex(algo: "sha256" | "sha512", secret: string, body: string): string {
  return createHmac(algo, secret).update(body).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Human-friendly code without ambiguous characters (no 0/O/1/I). */
export function friendlyCode(len: number): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
