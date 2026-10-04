import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { databaseEnabled } from "./db";
import { accountByIdentity, type Account } from "./accounts";
if (
  databaseEnabled() &&
  (!process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 32 ||
    process.env.SESSION_SECRET.startsWith("troque_"))
) {
  throw new Error(
    "SESSION_SECRET forte (mínimo 32 caracteres) é obrigatória no modo Neon.",
  );
}
const globalAuth = globalThis as typeof globalThis & { marconSecret?: string };
const secret =
  process.env.SESSION_SECRET ||
  (globalAuth.marconSecret ??= randomBytes(32).toString("hex"));
export const cookieName = "marcon_session";
const sign = (value: string) =>
  createHmac("sha256", secret).update(value).digest("hex");
const passwordVersion = (passwordHash: string) =>
  sign(passwordHash).slice(0, 24);
export function createSession(id: string, passwordHash?: string) {
  const payload = `${id}:${Date.now() + 8 * 60 * 60 * 1000}${passwordHash ? `:${passwordVersion(passwordHash)}` : ""}`;
  return `${payload}:${sign(payload)}`;
}
export async function currentUser(): Promise<Account | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const parts = token.split(":");
  const [id, expiry] = parts;
  const signature = parts.at(-1);
  if (
    ![3, 4].includes(parts.length) ||
    !id ||
    !expiry ||
    !signature ||
    !/^\d+$/.test(expiry) ||
    Number(expiry) <= Date.now()
  )
    return null;
  const expected = Buffer.from(sign(parts.slice(0, -1).join(":")));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return null;
  if (databaseEnabled()) {
    if (parts.length !== 4) return null;
    const account = await accountByIdentity(id);
    return account && parts[2] === passwordVersion(account.passwordHash)
      ? account.account
      : null;
  }
  if (parts.length !== 3) return null;
  return null;
}
