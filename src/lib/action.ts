import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { publicMessage } from "./errors";

export type ActionState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string>; data?: unknown; at?: number };

/** Wraps a server action so user-safe errors become form state and redirects pass through. */
export function safeAction<A extends unknown[]>(fn: (...args: A) => Promise<ActionState | void>) {
  return async (...args: A): Promise<ActionState> => {
    try {
      const r = await fn(...args);
      return { ok: true, ...(r ?? {}), at: Date.now() };
    } catch (e) {
      unstable_rethrow(e);
      if (e instanceof ZodError) {
        const fieldErrors: Record<string, string> = {};
        for (const i of e.issues) fieldErrors[i.path.join(".")] ??= i.message;
        return { ok: false, error: e.issues[0]?.message ?? "Please check the form.", fieldErrors, at: Date.now() };
      }
      return { ok: false, error: publicMessage(e), at: Date.now() };
    }
  };
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const optStr = (fd: FormData, k: string) => str(fd, k) || undefined;
export const int = (fd: FormData, k: string) => {
  const n = Number(String(fd.get(k) ?? "").replace(/[,\s₦]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : NaN;
};
export const optInt = (fd: FormData, k: string) => (str(fd, k) === "" ? null : int(fd, k));
export const list = (fd: FormData, k: string) => fd.getAll(k).map(String).map((s) => s.trim()).filter(Boolean);
export const files = (fd: FormData, k: string) => fd.getAll(k).filter((f): f is File => typeof f === "object" && f !== null && "size" in f && (f as File).size > 0);
export const bool = (fd: FormData, k: string) => ["on", "true", "1"].includes(str(fd, k));
export const date = (fd: FormData, k: string) => (str(fd, k) ? new Date(str(fd, k)) : null);
