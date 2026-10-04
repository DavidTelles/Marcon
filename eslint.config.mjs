import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Express uses CommonJS; generated export metadata uses short circuits.
  { files: ["backend/**/*.js"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  { files: ["backend/src/workspace/workspace-actions.js", "backend/src/workspace/workspace-db.js"], rules: { "@typescript-eslint/no-unused-expressions": ["error", { allowShortCircuit: true }] } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-james-test/**",
    ".validation/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "test-results/**",
    "test-results-neon/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
