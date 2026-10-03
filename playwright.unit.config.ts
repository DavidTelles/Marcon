import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testIgnore: "**/neon/**",
  testMatch: /(james-(audio|language|local-voice)|operations-policy|logistics-policy|map-suggestions)\.spec\.ts/,
  workers: 1,
});
