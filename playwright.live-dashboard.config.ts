import { defineConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
export default defineConfig({
  testDir: "./tests",
  testMatch: "dashboard-live.spec.ts",
  workers: 1,
  outputDir: "test-results-live-dashboard",
  timeout: 60_000,
  use: {
    baseURL: process.env.LIVE_DASHBOARD_URL || "http://localhost:3110",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
});
