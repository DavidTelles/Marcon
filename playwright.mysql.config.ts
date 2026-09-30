import { defineConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { databaseConfig } from "./lib/db-config.mjs";

loadEnvConfig(process.cwd());
if (!databaseConfig().database?.endsWith("_test")) {
  throw new Error("Use um banco descartável com nome terminado em _test.");
}
if (!process.env.SEED_PASSWORD)
  throw new Error("Defina SEED_PASSWORD para os testes.");

export default defineConfig({
  testDir: "./tests/mysql",
  workers: 1,
  outputDir: "test-results-mysql",
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:3101",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: {
    command: process.env.PLAYWRIGHT_PRODUCTION
      ? "npx next start -p 3101"
      : "npx next dev -p 3101",
    url: "http://localhost:3101/login",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
