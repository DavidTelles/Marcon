import nextEnv from "@next/env";
import { backendTarget } from "../lib/backend-config.mjs";
import { databaseConfigured } from "../lib/db-config.mjs";
import { databaseHealth } from "../lib/database-health.mjs";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
function report(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (!ok) process.exitCode = 1;
}

const args = process.argv.slice(2);
if (args.includes("--url")) {
  const value = args[args.indexOf("--url") + 1];
  try {
    const health = new URL("/health", value);
    if (
      !["http:", "https:"].includes(health.protocol) ||
      health.username ||
      health.password
    )
      throw new Error("URL inválida");
    const response = await fetch(health, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    report(
      `health HTTP ${response.status}`,
      response.ok && data.status === "ok",
    );
    report(
      `database: ${data.database || "unknown"}`,
      data.database === "connected",
    );
    report(
      `backend: ${data.backend || "unknown"}`,
      data.backend === "connected",
    );
  } catch {
    report("Não foi possível verificar /health da URL informada", false);
  }
} else {
  report("DATABASE_URL PostgreSQL configurada", databaseConfigured());
  for (const key of ["SESSION_SECRET", "JWT_SECRET"]) {
    const value = process.env[key] || "";
    report(
      `${key} configurado (mínimo 32 caracteres, sem valor de exemplo)`,
      value.length >= 32 && !/^(troque_|change-|gere-|banana)/i.test(value),
    );
  }
  try {
    // Validate as Vercel even when this check runs on the developer's PC.
    const target = backendTarget({ ...process.env, VERCEL: "1" });
    report(`Backend ${target === null ? "integrado" : "externo HTTPS"}`, true);
  } catch (error) {
    report(error.message, false);
  }
  if (args.includes("--database") && databaseConfigured()) {
    const { getPool, closeDatabase } = await import("../lib/neon-db.mjs");
    try {
      const state = await databaseHealth(getPool());
      report(`Neon e tabelas de login/estoque: ${state}`, state === "connected");
    } catch {
      report(
        "Conexão/tabelas do Neon; confira DATABASE_URL e migrações",
        false,
      );
    } finally {
      await closeDatabase();
    }
  }
}
