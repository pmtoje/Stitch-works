/**
 * Public base URL of the site. Uses APP_URL when set; on Vercel falls back to the system
 * variables (branch URL for previews, production domain for production) so callbacks and
 * links work without extra configuration.
 */
export function appUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const host =
    process.env.VERCEL_ENV === "preview"
      ? process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL
      : process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return host ? `https://${host}` : "http://localhost:3000";
}
