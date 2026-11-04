import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/stitchworks_test",
      APP_ENCRYPTION_KEY: "test-encryption-key-that-is-long-enough-123",
      PAYMENT_PROVIDER: "mock",
      PAYSTACK_SECRET_KEY: "sk_test_dummy",
      APP_URL: "http://localhost:3000",
      NOTIFY_DRY_RUN: "1",
    },
  },
});
