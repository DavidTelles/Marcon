import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "dashboard-report-ui.spec.ts",
  workers: 1,
  use: { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
});
