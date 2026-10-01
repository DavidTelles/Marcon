import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-james-test/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "test-results/**",
    "test-results-neon/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
