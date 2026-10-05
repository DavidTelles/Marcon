import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "parts-consumption-ui.spec.ts",
  workers: 1,
  timeout: 60000,
  outputDir: "test-results/parts-consumption",
  use: {
    baseURL: "http://localhost:3117",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "node node_modules/next/dist/bin/next dev .validation/parts-ui -p 3117",
    url: "http://localhost:3117/admin/dashboard/parts",
    timeout: 120000,
    reuseExistingServer: true,
  },
});
