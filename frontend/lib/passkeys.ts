import { createHash, randomBytes } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { getPool, transaction } from "./db";

export const challengeCookie = "marcon_passkey_challenge";
export type CredentialRow = RowDataPacket & { credential_id: string; user_id: number; public_key: Buffer; counter: number; transports: string[] | string | null };
export const credentialTransports = (value: CredentialRow["transports"]): string[] =>
  Array.isArray(value) ? value : typeof value === "string" ? JSON.parse(value) : [];
type ChallengeRow = RowDataPacket & { user_id: number; challenge: string; purpose: "register" | "login" };

export function relyingParty(origin: string) {
  const url = new URL(origin);
  return { rpID: url.hostname, expectedOrigin: url.origin };
}

export async function credentialsForUser(userId: number) {
  const [rows] = await getPool().execute<CredentialRow[]>("SELECT * FROM passkey_credentials WHERE user_id = ?", [userId]);
  return rows;
}

export async function userIdForIdentity(identity: string): Promise<number | null> {
  const [rows] = await getPool().execute<(RowDataPacket & { id: number })[]>(
    "SELECT id FROM users WHERE active = TRUE AND (employee_no = ? OR email = ?) LIMIT 1", [identity, identity]);
  return rows[0]?.id ?? null;
}

export async function createChallenge(userId: number, challenge: string, purpose: "register" | "login") {
  const token = randomBytes(32).toString("base64url");
  await getPool().execute("INSERT INTO passkey_challenges (token_hash, user_id, challenge, purpose, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 5 MINUTE))",
    [createHash("sha256").update(token).digest(), userId, challenge, purpose]);
  return token;
}

export async function consumeChallenge(token: string | undefined, purpose: "register" | "login") {
  if (!token || token.length > 128) return null;
  return transaction(async (connection) => {
    const hash = createHash("sha256").update(token).digest();
    const [rows] = await connection.execute<ChallengeRow[]>(
      "SELECT user_id, challenge, purpose FROM passkey_challenges WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP(3) FOR UPDATE", [hash]);
    await connection.execute("DELETE FROM passkey_challenges WHERE token_hash = ?", [hash]);
    return rows[0]?.purpose === purpose ? rows[0] : null;
  });
}
