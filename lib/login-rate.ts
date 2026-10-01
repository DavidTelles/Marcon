import { createHash } from "node:crypto";
import type { RowDataPacket } from "./db-types";
import { getPool, transaction } from "./db";

type Attempt = RowDataPacket & { attempts: number; expired: number; blocked: number };
const digest = (identity: string) => createHash("sha256").update(identity.toLowerCase()).digest();

export async function loginBlocked(identity: string) {
  const [rows] = await getPool().execute<Attempt[]>(
    "SELECT blocked_until > UTC_TIMESTAMP(3) AS blocked FROM auth_attempts WHERE identity_digest = ?",
    [digest(identity)],
  );
  return Boolean(rows[0]?.blocked);
}

export async function recordFailedLogin(identity: string) {
  const key = digest(identity);
  await transaction(async (connection) => {
    await connection.execute("INSERT IGNORE INTO auth_attempts (identity_digest) VALUES (?)", [key]);
    const [rows] = await connection.execute<Attempt[]>(
      "SELECT attempts, first_at < UTC_TIMESTAMP(3) - INTERVAL 15 MINUTE AS expired FROM auth_attempts WHERE identity_digest = ? FOR UPDATE",
      [key],
    );
    const attempts = rows[0]?.expired ? 1 : Number(rows[0]?.attempts ?? 0) + 1;
    await connection.execute(
      "UPDATE auth_attempts SET attempts = ?, first_at = IF(?, UTC_TIMESTAMP(3), first_at), blocked_until = IF(? >= 5, UTC_TIMESTAMP(3) + INTERVAL 15 MINUTE, NULL) WHERE identity_digest = ?",
      [attempts, rows[0]?.expired ? 1 : 0, attempts, key],
    );
  });
}

export async function clearFailedLogins(identity: string) {
  await getPool().execute("DELETE FROM auth_attempts WHERE identity_digest = ?", [digest(identity)]);
}
