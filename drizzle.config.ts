import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/neon",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://missing:missing@127.0.0.1:5432/marcon",
  },
});
