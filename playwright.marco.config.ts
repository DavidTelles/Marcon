import { defineConfig } from "@playwright/test";
// Parser/audio regressions do not need another dev server in the workspace.
export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "james-language.spec.ts",
    "james-audio.spec.ts",
    "james-local-voice.spec.ts",
  ],
  workers: 1,
  reporter: "list",
});
