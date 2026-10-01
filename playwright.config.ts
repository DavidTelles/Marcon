import { defineConfig } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT || "3000";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests",
  testIgnore: "**/neon/**",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next ${process.env.PLAYWRIGHT_PRODUCTION ? "start" : "dev"} -p ${port}`,
    url: `${baseURL}/login`,
    env: { DATABASE_URL: "" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
