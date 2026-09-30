// Migração do banco unificado MARCON (schema do aplicativo + recursos do backend).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const here = path.dirname(fileURLToPath(import.meta.url));

const host = process.env.DB_HOST || "localhost";
const port = Number(process.env.DB_PORT || 3306);
const user = process.env.DB_USER || "marcon";
const password = process.env.DB_PASSWORD || "";
const database = process.env.DB_NAME || "marcon";

const identifier = `\`${database.replaceAll("`", "``")}\``;
const connection = await mysql.createConnection({
  host,
  port,
  user,
  password,
  multipleStatements: false,
});

try {
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS ${identifier} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await connection.query(`USE ${identifier}`);

  const file = await readFile(path.join(here, "../db/001_initial.sql"), "utf8");
  const marker = "-- BEGIN TABLES";
  if (!file.includes(marker))
    throw new Error("Marcador das tabelas ausente na migração 001.");
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

  const migrations = [
    "002_operations",
    "003_logistics",
    "004_request_submissions",
    "005_part_search",
    "006_integration",
  ];
  for (const version of migrations) {
    const [applied] = await connection.execute(
      "SELECT version FROM schema_migrations WHERE version = ?",
      [version],
    );
    if (applied.length) continue;
    const { up } = await import(`../db/${version}.mjs`);
    await up(connection);
    await connection.execute(
      "INSERT INTO schema_migrations(version) VALUES (?)",
      [version],
    );
    console.log(`Migração aplicada: ${version}`);
  }
  console.log(`Banco '${database}' migrado com sucesso.`);
} finally {
  await connection.end();
}
