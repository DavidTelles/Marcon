import { defineConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
if (
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
)
  throw new Error(
    "Use um banco descartável terminado em _test para os testes de fluxo.",
  );
if (!process.env.SEED_PASSWORD)
  throw new Error("Defina SEED_PASSWORD das contas de teste.");
export default defineConfig({
  testDir: "./tests/neon",
  testMatch: [
    "enterprise-workflow.spec.ts",
    "ledger-idempotency.spec.ts",
    "operations.spec.ts",
    "workspace.spec.ts",
    "logistics.spec.ts",
  ],
  workers: 1,
  timeout: 240_000,
  outputDir: ".validation/workflow-results",
  reporter: "list",
  use: {
    baseURL: "http://localhost:3101",
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
});
