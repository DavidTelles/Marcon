import { defineConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !/^postgres(ql)?:\/\//i.test(databaseUrl) || !new URL(databaseUrl).pathname.endsWith("_test")) {
  throw new Error("Use DATABASE_URL de um banco Neon descartável terminado em _test.");
}
if (!process.env.SEED_PASSWORD) throw new Error("Defina SEED_PASSWORD para os testes.");

export default defineConfig({
  testDir: "./tests/neon",
  workers: 1,
  outputDir: "test-results-neon",
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:3101",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: {
    command: process.env.PLAYWRIGHT_PRODUCTION ? "node scripts/run-with-backend.mjs start -p 3101" : "node scripts/run-with-backend.mjs dev -p 3101",
    url: "http://localhost:3101/login",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
