import ws from "ws";
import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { migrate as runMigrations } from "drizzle-orm/neon-serverless/migrator";
import { sql } from "drizzle-orm";
import path from "node:path";

neonConfig.webSocketConstructor = ws;

const tablesWithId = new Set([
  "blocks", "warehouses", "users", "parts", "requests", "stock_transfers",
  "return_records", "stock_movements", "audit_log", "expected_receipts",
  "map_versions", "delivery_route_history", "rfid_access_events",
  "password_reset_tokens",
]);
const bigintColumns = new Set([
  "id", "actor_id", "approved_by", "block_id", "created_by", "fulfilled_by",
  "fulfilled_from", "map_version_id", "part_id", "received_by", "request_id",
  "requester_id", "return_id", "shipped_by", "source_warehouse_id",
  "destination_warehouse_id", "transfer_id", "user_id", "warehouse_id",
  "performed_by", "counter", "entity_id",
]);

let pool;
let database;
let httpDatabase;

export function databaseConfigured(env = process.env) {
  return /^postgres(ql)?:\/\//i.test(env.DATABASE_URL || "");
}

function getDatabase() {
  if (database) return database;
  if (!databaseConfigured()) {
    throw new Error("Configure DATABASE_URL com a URL PostgreSQL do Neon.");
  }
  pool = createPool();
  database = drizzle({ client: pool });
  return database;
}

function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 5000,
  });
}

function getHttpDatabase() {
  if (!databaseConfigured())
    throw new Error("Configure DATABASE_URL com a URL PostgreSQL do Neon.");
  return httpDatabase ??= drizzleHttp({ client: neon(process.env.DATABASE_URL) });
}

function matchingParen(text, open) {
  let depth = 0;
  let quote = "";
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote && text[i + 1] === quote) i++;
      else if (ch === quote && text[i - 1] !== "\\") quote = "";
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return i;
  }
  return -1;
}

function splitArgs(text) {
  const args = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote && text[i + 1] === quote) i++;
      else if (ch === quote && text[i - 1] !== "\\") quote = "";
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      args.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  args.push(text.slice(start).trim());
  return args;
}

function rewriteCalls(text, name, convert) {
  let out = "";
  let i = 0;
  let quote = "";
  while (i < text.length) {
    const ch = text[i];
    if (quote) {
      out += ch;
      if (ch === quote && text[i + 1] === quote) out += text[++i];
      else if (ch === quote && text[i - 1] !== "\\") quote = "";
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
      i++;
      continue;
    }
    const match = text.slice(i).match(new RegExp(`^${name}\\s*\\(`, "i"));
    if (!match) {
      out += ch;
      i++;
      continue;
    }
    const open = i + match[0].lastIndexOf("(");
    const close = matchingParen(text, open);
    if (close < 0) {
      out += ch;
      i++;
      continue;
    }
    const args = splitArgs(text.slice(open + 1, close)).map((arg) =>
      rewriteCalls(arg, name, convert),
    );
    out += convert(args);
    i = close + 1;
  }
  return out;
}

export function translateSql(input) {
  let text = input.replaceAll("`", '"');
  text = text.replace(/\bUTC_TIMESTAMP\s*\(\s*\d*\s*\)/gi, "CURRENT_TIMESTAMP");
  text = text.replace(/\bNOW\s*\(\s*\)/gi, "CURRENT_TIMESTAMP");
  text = text.replace(/\bINTERVAL\s+(\d+)\s+(SECOND|MINUTE|HOUR|DAY|WEEK|MONTH|YEAR)\b/gi,
    (_all, amount, unit) => `INTERVAL '${amount} ${unit.toLowerCase()}'`);
  text = rewriteCalls(text, "DATE_ADD", ([date, interval]) => `(CAST(${date} AS timestamp) + ${interval})`);
  text = rewriteCalls(text, "DATE_SUB", ([date, interval]) => `(CAST(${date} AS timestamp) - ${interval})`);
  text = rewriteCalls(text, "DATE_FORMAT", ([date, format]) => {
    const fmt = format.replace(/^'|'$/g, "").replace(/%Y/g, "YYYY").replace(/%m/g, "MM").replace(/%d/g, "DD");
    return `TO_CHAR(${date}, '${fmt}')`;
  });
  text = rewriteCalls(text, "TIMESTAMPDIFF", ([unit, start, end]) => {
    if (unit.replaceAll("'", "").toUpperCase() === "SECOND") return `EXTRACT(EPOCH FROM (${end} - ${start}))`;
    if (unit.replaceAll("'", "").toUpperCase() === "MINUTE") return `(EXTRACT(EPOCH FROM (${end} - ${start})) / 60)`;
    if (unit.replaceAll("'", "").toUpperCase() === "HOUR") return `(EXTRACT(EPOCH FROM (${end} - ${start})) / 3600)`;
    return `(${end} - ${start})`;
  });
  text = rewriteCalls(text, "JSON_UNQUOTE", ([value]) => value.replace(/JSON_EXTRACT\(([^,]+),\s*'\$\.([\w]+)'\)/i, "$1->>'$2'"));
  text = rewriteCalls(text, "JSON_EXTRACT", ([value, path]) => {
    const key = path.match(/^'\$\.([\w]+)'$/)?.[1];
    return key ? `(${value}->>'${key}')${key === "referenceUnitPrice" ? "::numeric" : ""}` : value;
  });
  text = rewriteCalls(text, "IF", ([condition, yes, no]) => {
    const predicate = condition.trim() === "?" ? "(? <> 0)" : condition;
    return `(CASE WHEN ${predicate} THEN ${yes} ELSE ${no} END)`;
  });
  text = rewriteCalls(text, "FIELD", ([value, ...choices]) =>
    `(CASE ${value} ${choices.map((choice, i) => `WHEN ${choice} THEN ${i + 1}`).join(" ")} ELSE 0 END)`,
  );
  text = text.replace(/([\w."']+)\s*=\s*TRUE\b/gi, "$1=1");
  text = text.replace(/([\w."']+)\s*=\s*FALSE\b/gi, "$1=0");

  const insert = text.match(/^\s*INSERT\s+(IGNORE\s+)?INTO\s+([\w"]+)/i);
  if (insert) {
    const table = insert[2].replaceAll('"', "").toLowerCase();
    const ignored = Boolean(insert[1]);
    text = text.replace(/^\s*INSERT\s+IGNORE\s+INTO/i, "INSERT INTO");
    const duplicate = /\s+ON DUPLICATE KEY UPDATE\s+(.+)$/i.exec(text);
    if (duplicate) {
      const conflict = {
        face_credentials: "user_id",
        request_reservations: "request_id, warehouse_id",
        user_permission_overrides: "user_id, permission",
      }[table];
      if (!conflict) throw new Error(`Falta regra ON CONFLICT para ${table}.`);
      const assignments = duplicate[1].replace(/VALUES\((\w+)\)/gi, "EXCLUDED.$1");
      text = text.replace(duplicate[0], ` ON CONFLICT (${conflict}) DO UPDATE SET ${assignments}`);
    } else if (ignored) {
      text += " ON CONFLICT DO NOTHING";
    }
    if (tablesWithId.has(table) && !/\bRETURNING\b/i.test(text)) text += " RETURNING id";
  }
  return text;
}

function parameterized(text, params = []) {
  const query = sql.empty();
  let start = 0;
  let index = 0;
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote && text[i + 1] === quote) i++;
      else if (ch === quote && text[i - 1] !== "\\") quote = "";
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === "?") {
      query.append(sql.raw(text.slice(start, i)));
      const value = params[index++];
      query.append(sql`${typeof value === "boolean" ? Number(value) : value}`);
      start = i + 1;
    }
  }
  query.append(sql.raw(text.slice(start)));
  if (index !== params.length) throw new Error(`SQL espera ${index} parâmetros, recebeu ${params.length}.`);
  return query;
}

class Executor {
  constructor(client) { this.client = client; }
  async execute(text, params = []) {
    let result;
    let postgresSql;
    try {
      postgresSql = translateSql(text);
      result = await this.client.execute(parameterized(postgresSql, params));
    } catch (error) {
      if (error?.code === "23505") error.code = "ER_DUP_ENTRY";
      throw error;
    }
    const rows = (result.rows || []).map((row) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        value instanceof Date
          ? value.toISOString().replace("T", " ").replace("Z", "")
          : bigintColumns.has(key) && typeof value === "string" && /^\d+$/.test(value)
            ? Number(value)
            : key === "reference_unit_price" && typeof value === "string"
              ? Number(value)
              : value,
      ]),
    ));
    const insertId = Number(rows[0]?.id || 0);
    if (/^\s*INSERT\b/i.test(postgresSql)) {
      return [{ insertId, affectedRows: result.rowCount || 0, changedRows: result.rowCount || 0, warningStatus: 0 }];
    }
    if (/^\s*(SELECT|WITH)\b/i.test(postgresSql)) return [rows];
    return [{ insertId, affectedRows: result.rowCount || 0, changedRows: result.rowCount || 0, warningStatus: 0 }];
  }
  query(text, params = []) { return this.execute(text, params); }
}

export function getPool() {
  // HTTP queries do not leave WebSocket connections in suspended functions.
  let client;
  if (process.env.VERCEL && new URL(process.env.DATABASE_URL || "").searchParams.has("options")) {
    // HTTP gateways can ignore session startup options (including search_path).
    // Preserve those options through a connection limited to this operation.
    client = {
      async execute(query) {
        const requestPool = createPool();
        try { return await drizzle({ client: requestPool }).execute(query); }
        finally { await requestPool.end(); }
      },
    };
  } else client = process.env.VERCEL ? getHttpDatabase() : getDatabase();
  const executor = new Executor(client);
  return { execute: executor.execute.bind(executor), query: executor.query.bind(executor), end: closeDatabase };
}

export async function transaction(work) {
  if (process.env.VERCEL) {
    if (!databaseConfigured())
      throw new Error("Configure DATABASE_URL com a URL PostgreSQL do Neon.");
    // Interactive transactions need a connection, owned by this invocation.
    // Never close another concurrent request's pool, or retry a mutation.
    const requestPool = createPool();
    try {
      return await drizzle({ client: requestPool }).transaction((tx) => work(new Executor(tx)));
    } finally {
      await requestPool.end();
    }
  }
  return getDatabase().transaction((tx) => work(new Executor(tx)));
}

export async function migrateDatabase() {
  const folder = path.resolve(process.cwd(), "db", "neon");
  getDatabase();
  const users = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'");
  if (users.rowCount) {
    const columns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'");
    const hasMarconUsers = columns.rows.some(({ column_name }) => column_name === "employee_no");
    const hasLegacyUsers = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'legacy_new_db_users'");
    if (!hasMarconUsers && hasLegacyUsers.rowCount) {
      throw new Error("A tabela users do Neon não é compatível e legacy_new_db_users já existe; preserve/exporte os dados antes de migrar.");
    }
    if (!hasMarconUsers) await pool.query('ALTER TABLE "users" RENAME TO "legacy_new_db_users"');
  }
  const legacy = await pool.query("SELECT to_regclass('public.legacy_new_db_users') AS table_name");
  if (legacy.rows[0]?.table_name) {
    const sequence = await pool.query("SELECT pg_get_serial_sequence('public.legacy_new_db_users', 'id') AS name");
    if (sequence.rows[0]?.name) {
      const oldName = sequence.rows[0].name.split(".").at(-1).replaceAll('"', "");
      const newName = "legacy_new_db_users_id_seq";
      const exists = await pool.query("SELECT to_regclass($1) AS name", [`public.${newName}`]);
      if (!exists.rows[0]?.name && oldName !== newName) {
        await pool.query(`ALTER SEQUENCE "${oldName.replaceAll('"', '""')}" RENAME TO "${newName}"`);
      }
    }
    const oldIndexes = await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'legacy_new_db_users' AND indexname LIKE 'users_%'");
    for (const { indexname } of oldIndexes.rows) {
      const nextName = `legacy_new_db_${indexname}`;
      await pool.query(`ALTER INDEX "${indexname.replaceAll('"', '""')}" RENAME TO "${nextName.replaceAll('"', '""')}"`);
    }
  }
  await runMigrations(getDatabase(), { migrationsFolder: folder });
}

export async function closeDatabase() {
  if (pool) await pool.end();
  pool = undefined;
  database = undefined;
  httpDatabase = undefined;
}
