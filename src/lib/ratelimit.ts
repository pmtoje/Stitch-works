import { db } from "./db";
import { AppError } from "./errors";

/**
 * Fixed-window rate limiter backed by Postgres so it holds across server instances.
 * Returns true when the call is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" (key, count, "windowStart") VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE "RateLimit".count + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE "RateLimit"."windowStart" END
    RETURNING count`;
  return Number(rows[0].count) <= limit;
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  if (!(await rateLimit(key, limit, windowSeconds))) {
    throw new AppError("Too many attempts. Please wait a few minutes and try again.", "RATE_LIMITED", 429);
  }
}
