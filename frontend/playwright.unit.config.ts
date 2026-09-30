import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /james-(audio|language|local-voice)\.spec\.ts/,
  workers: 1,
});
