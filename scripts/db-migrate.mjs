import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import nextEnv from "@next/env";
import { databaseConfig } from "../lib/db-config.mjs";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const database = databaseConfig().database;
const identifier = `\`${database.replaceAll("`", "``")}\``;
// Conecta sem schema para permitir a primeira instalação.
const connection = await mysql.createConnection(
  databaseConfig(process.env, true),
);
try {
  const [existing] = await connection.query("SHOW DATABASES LIKE ?", [
    database.replace(/[\\%_]/g, "\\$&"),
  ]);
  if (!existing.length) {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${identifier} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  }
  await connection.query(`USE ${identifier}`);
  const file = await readFile(
    new URL("../db/001_initial.sql", import.meta.url),
    "utf8",
  );
  // O bloco do Workbench usa marcon, mas o CLI respeita DATABASE_URL, inclusive bancos de teste.
  const marker = "-- BEGIN TABLES";
  if (!file.includes(marker))
    throw new Error("Marcador das tabelas ausente na migração.");
  const tables = file.slice(file.indexOf(marker) + marker.length);
  for (const statement of tables
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await connection.query(statement);
  }
  await connection.execute(
    "INSERT IGNORE INTO schema_migrations (version) VALUES (?)",
    ["001_initial"],
  );
  const [applied] = await connection.execute(
    "SELECT version FROM schema_migrations WHERE version = '002_operations'",
  );
  if (!applied.length) {
    const { up } = await import("../db/migrations/002_operations.mjs");
    await up(connection);
    await connection.execute(
      "INSERT INTO schema_migrations(version) VALUES ('002_operations')",
    );
  }
  const [logistics] = await connection.execute(
    "SELECT version FROM schema_migrations WHERE version='003_logistics'",
  );
  if (!logistics.length) {
    const { up } = await import("../db/migrations/003_logistics.mjs");
    await up(connection);
    await connection.execute(
      "INSERT INTO schema_migrations(version) VALUES ('003_logistics')",
    );
  }
  const [submissions] = await connection.execute(
    "SELECT version FROM schema_migrations WHERE version='004_request_submissions'",
  );
  if (!submissions.length) {
    const { up } = await import("../db/migrations/004_request_submissions.mjs");
    await up(connection);
    await connection.execute(
      "INSERT INTO schema_migrations(version) VALUES ('004_request_submissions')",
    );
  }
  const [searchFields] = await connection.execute(
    "SELECT version FROM schema_migrations WHERE version='005_part_search'",
  );
  if (!searchFields.length) {
    const { up } = await import("../db/migrations/005_part_search.mjs");
    await up(connection);
    await connection.execute(
      "INSERT INTO schema_migrations(version) VALUES ('005_part_search')",
    );
  }
  console.log("Migração 005_part_search aplicada.");
  console.log("Migração 004_request_submissions aplicada.");
  console.log(
    "Migrações 001_initial, 002_operations e 003_logistics aplicadas.",
  );
} finally {
  await connection.end();
}
