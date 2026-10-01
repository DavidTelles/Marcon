import nextEnv from "@next/env";
import { databaseConfigured } from "../lib/db-config.mjs";
import { closeDatabase, migrateDatabase } from "../lib/neon-db.mjs";

nextEnv.loadEnvConfig(process.cwd());
if (!databaseConfigured()) throw new Error("Configure DATABASE_URL do Neon no .env da raiz.");
try {
  await migrateDatabase();
  console.log("Migrações Drizzle aplicadas no Neon.");
} finally {
  await closeDatabase();
}
