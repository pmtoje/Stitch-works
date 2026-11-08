// Build entry point.
// On Vercel (or with RUN_MIGRATIONS=1) it first applies database migrations and the idempotent
// seed, so a fresh Vercel Postgres/Neon database is ready on the first deploy. Elsewhere it just builds.
import { spawnSync } from "node:child_process";

const onVercel = process.env.VERCEL === "1";
const migrate = onVercel || process.env.RUN_MIGRATIONS === "1";

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (migrate) {
  // Runtime URL (pooled) and migration URL (direct). Covers Vercel's Neon and Supabase integrations.
  const runtimeUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL;
  const directUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING ?? runtimeUrl;
  if (!runtimeUrl) {
    console.error(`
✖ No database is connected to this Vercel project.
  In Vercel: Storage → Create Database → Neon (Postgres) → Connect to this project
  (tick Production and Preview), then redeploy. That sets DATABASE_URL automatically.
`);
    process.exit(1);
  }
  console.log("▶ Applying database migrations…");
  run("npx", ["prisma", "migrate", "deploy"], { DATABASE_URL: directUrl });

  const demo = process.env.SEED_DEMO === "true";
  if (demo && !process.env.SEED_DEMO_PASSWORD) {
    console.error("\n✖ SEED_DEMO=true needs SEED_DEMO_PASSWORD (the password for the seeded accounts). Add it in Vercel → Settings → Environment Variables.\n");
    process.exit(1);
  }
  console.log(`▶ Seeding base data${demo ? " + demo data" : ""}…`);
  run("npx", ["tsx", "prisma/seed.ts"], { DATABASE_URL: directUrl, SEED_DEMO: demo ? "true" : "false" });
}

run("npx", ["next", "build"]);
