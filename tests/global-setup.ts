import { execSync } from "node:child_process";

// Applies pending migrations to the dedicated test database (non-destructive).
// Individual test files truncate tables between tests via helpers.resetDb().
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/stitchworks_test";
  if (!/test/i.test(url)) throw new Error("Refusing to run tests against a database whose name does not contain 'test'.");
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
