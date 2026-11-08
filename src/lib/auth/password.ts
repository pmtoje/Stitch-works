import bcrypt from "bcryptjs";
import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Include at least one letter and one number.");

export async function hashPassword(p: string) {
  return bcrypt.hash(p, 12);
}
export async function verifyPassword(p: string, hash: string) {
  return bcrypt.compare(p, hash);
}
