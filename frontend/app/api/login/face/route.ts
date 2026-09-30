import { createHash, randomBytes, randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { cookieName, createSession, currentUser } from "@/lib/auth";
import { databaseEnabled, getPool, transaction } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { roleLanding, type Role } from "@/lib/workspace-routes";
import { decryptFace, encryptFace } from "@/lib/face-crypto";
import {
  FACE_CONSENT,
  FACE_MODEL,
  FACE_TTL,
  matchesEnrollment,
  validateCapture,
  type FacePose,
} from "@/lib/face-policy";

export const runtime = "nodejs";
const challengeCookie = "marcon_face_challenge";
const digest = (s: string) => createHash("sha256").update(s).digest();
const json = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const fail = (error: string, status = 400) => json({ error }, status);
const cookiesFor = (r: NextRequest) => ({
  httpOnly: true,
  secure: r.nextUrl.protocol === "https:",
  sameSite: "strict" as const,
  path: "/api/login/face",
  maxAge: FACE_TTL / 1000,
});
type UserRow = RowDataPacket & {
  id: number;
  employee_no: string;
  password_hash: string;
  active: number;
  role: string;
};
type ChallengeRow = RowDataPacket & {
  user_id: number;
  purpose: string;
  poses: FacePose[] | string;
  session_hash: Buffer | null;
  password_hash: string;
  age_ms: number;
};
type StoredFace = RowDataPacket & { embeddings: Buffer; model_version: string };

// Reserve antes de emitir desafios: até tentativas abandonadas contam; bloqueio
// e incremento são atômicos para que requisições paralelas não burlem o limite.
async function reserveAttempt(identity: string) {
  return transaction(async (c) => {
    const hash = digest(`face:${identity}`);
    await c.execute(
      "INSERT IGNORE INTO auth_attempts (identity_digest) VALUES (?)",
      [hash],
    );
    const [rows] = await c.execute<RowDataPacket[]>(
      "SELECT attempts, first_at < UTC_TIMESTAMP(3) - INTERVAL 15 MINUTE AS expired FROM auth_attempts WHERE identity_digest = ? FOR UPDATE",
      [hash],
    );
    if (!rows[0].expired && rows[0].attempts >= 5) return false;
    const count = rows[0].expired ? 1 : Number(rows[0].attempts) + 1;
    await c.execute(
      "UPDATE auth_attempts SET attempts = ?, first_at = IF(?, UTC_TIMESTAMP(3), first_at) WHERE identity_digest = ?",
      [count, rows[0].expired ? 1 : 0, hash],
    );
    return true;
  });
}

async function readBody(
  request: NextRequest,
): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 256_000) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    if (!databaseEnabled())
      return fail("Configure o MySQL para usar o acesso facial.", 503);
    const user = await currentUser();
    if (!user) return fail("Faça login para consultar seu cadastro.", 401);
    const [rows] = await getPool().execute<RowDataPacket[]>(
      "SELECT f.model_version FROM face_credentials f JOIN users u ON u.id = f.user_id WHERE u.employee_no = ?",
      [user.id],
    );
    return json({
      enrolled: rows.length > 0,
      compatible: rows[0]?.model_version === FACE_MODEL,
    });
  } catch {
    return fail("Não foi possível consultar o cadastro facial.", 503);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      return fail("Origem não autorizada.", 403);
    if (!databaseEnabled())
      return fail("Configure o MySQL para usar o acesso facial.", 503);
    const body = await readBody(request);
    if (!body) return fail("Dados inválidos ou captura muito grande.");
    if (body.action === "start" || body.action === "delete") {
      const registering = body.purpose === "register";
      const managing = registering || body.action === "delete";
      if (
        body.action === "start" &&
        !["login", "register"].includes(String(body.purpose))
      )
        return fail("Ação inválida.");
      const user = managing ? await currentUser() : null;
      if (managing && !user)
        return fail("Faça login para alterar o cadastro facial.", 401);
      const adminTarget =
        registering &&
        user?.role === "admin" &&
        typeof body.adminTarget === "string"
          ? body.adminTarget.trim()
          : "";
      const identity =
        adminTarget ||
        user?.id ||
        (typeof body.identity === "string"
          ? body.identity.trim().toLowerCase()
          : "");
      if (!identity || identity.length > 190)
        return fail("Informe seu e-mail ou matrícula.");
      const [rows] = await getPool().execute<UserRow[]>(
        "SELECT id, employee_no, password_hash, active, role FROM users WHERE active = TRUE AND (employee_no = ? OR email = ?) LIMIT 1",
        [identity, identity],
      );
      const account = rows[0];
      const key = `${managing ? "manage" : "login"}:${account?.id ?? identity}`;
      if (!(await reserveAttempt(key)))
        return fail(
          "Limite de 5 tentativas atingido. Aguarde 15 minutos ou entre com senha.",
          429,
        );
      if (!account)
        return fail(
          "Acesso facial indisponível para esta conta. Entre com senha.",
          401,
        );
      if (
        managing &&
        !adminTarget &&
        (typeof body.password !== "string" ||
          body.password.length > 1024 ||
          !verifyPassword(body.password, account.password_hash))
      )
        return fail("Senha atual incorreta.", 401);
      if (registering && body.consent !== FACE_CONSENT)
        return fail("Confirme o consentimento antes de cadastrar.");
      if (body.action === "delete") {
        const deleted = await transaction(async (c) => {
          const [current] = await c.execute<UserRow[]>(
            "SELECT id, active, password_hash FROM users WHERE id = ? FOR UPDATE",
            [account.id],
          );
          if (
            !current[0]?.active ||
            current[0].password_hash !== account.password_hash
          )
            return false;
          await c.execute("DELETE FROM face_credentials WHERE user_id = ?", [
            account.id,
          ]);
          await c.execute("DELETE FROM face_challenges WHERE user_id = ?", [
            account.id,
          ]);
          return true;
        });
        if (!deleted)
          return fail("Conta alterada. Entre novamente com senha.", 401);
        const response = json({ ok: true });
        response.cookies.set(challengeCookie, "", {
          ...cookiesFor(request),
          maxAge: 0,
        });
        return response;
      }
      if (!registering) {
        const [stored] = await getPool().execute<StoredFace[]>(
          "SELECT model_version FROM face_credentials WHERE user_id = ?",
          [account.id],
        );
        if (stored[0]?.model_version !== FACE_MODEL)
          return fail(
            "Acesso facial indisponível para esta conta. Entre com senha.",
            401,
          );
      }
      const turns: FacePose[] = randomInt(2)
        ? ["left", "right"]
        : ["right", "left"];
      const poses: FacePose[] = [
        "center",
        turns[0],
        "center",
        turns[1],
        "center",
        ...(registering ? ["light" as const] : []),
      ];
      const token = randomBytes(32).toString("base64url");
      await getPool().execute(
        "DELETE FROM face_challenges WHERE expires_at < UTC_TIMESTAMP(3)",
      );
      await getPool().execute(
        "INSERT INTO face_challenges (token_hash, user_id, purpose, poses, session_hash, password_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 120 SECOND))",
        [
          digest(token),
          account.id,
          registering ? "register" : "login",
          JSON.stringify(poses),
          managing
            ? digest(request.cookies.get(cookieName)?.value ?? "")
            : null,
          account.password_hash,
        ],
      );
      const response = json({ poses, model: FACE_MODEL, expiresIn: FACE_TTL });
      response.cookies.set(challengeCookie, token, cookiesFor(request));
      return response;
    }
    if (body.action !== "finish") return fail("Ação inválida.");
    const token = request.cookies.get(challengeCookie)?.value;
    if (!token || token.length > 128)
      return fail("Captura expirada. Inicie novamente.");
    const [challenges] = await getPool().execute<ChallengeRow[]>(
      "SELECT *, TIMESTAMPDIFF(MICROSECOND, created_at, UTC_TIMESTAMP(3)) / 1000 AS age_ms FROM face_challenges WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP(3)",
      [digest(token)],
    );
    const challenge = challenges[0];
    if (!challenge)
      return fail("Captura expirada ou já utilizada. Inicie novamente.");
    const poses =
      typeof challenge.poses === "string"
        ? JSON.parse(challenge.poses)
        : challenge.poses;
    const samples = body.samples;
    const sessionUser =
      challenge.purpose === "register" ? await currentUser() : null;
    const response = await transaction(async (c) => {
      const [users] = await c.execute<UserRow[]>(
        "SELECT id, employee_no, password_hash, active, role FROM users WHERE id = ? FOR UPDATE",
        [challenge.user_id],
      );
      // A exclusão/recadastro também bloqueia users antes de invalidar desafios.
      // Revalidar sob o mesmo lock impede ressuscitar cadastro já excluído.
      const [pending] = await c.execute<RowDataPacket[]>(
        "SELECT token_hash FROM face_challenges WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP(3) FOR UPDATE",
        [digest(token)],
      );
      if (!pending.length)
        return fail("Captura expirada ou já utilizada. Inicie novamente.");
      await c.execute("DELETE FROM face_challenges WHERE token_hash = ?", [
        digest(token),
      ]);
      if (
        body.model !== FACE_MODEL ||
        !validateCapture(samples, poses) ||
        samples.at(-1)!.elapsed > challenge.age_ms + 1000
      )
        return fail(
          "Captura inválida. Repita os movimentos com boa iluminação.",
          422,
        );
      const user = users[0];
      if (!user?.active || user.password_hash !== challenge.password_hash)
        return fail("Conta alterada. Entre novamente com senha.", 401);
      if (challenge.purpose === "register") {
        if (
          !challenge.session_hash?.equals(
            digest(request.cookies.get(cookieName)?.value ?? ""),
          ) ||
          (sessionUser?.id !== user.employee_no &&
            sessionUser?.role !== "admin")
        )
          return fail("Sessão expirada. Entre novamente.", 401);
        await c.execute(
          "INSERT INTO face_credentials (user_id, embeddings, model_version, consent_version) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE embeddings = VALUES(embeddings), model_version = VALUES(model_version), consent_version = VALUES(consent_version), created_at = CURRENT_TIMESTAMP(3)",
          [
            user.id,
            encryptFace(
              user.id,
              samples.map((s) => s.embedding),
            ),
            FACE_MODEL,
            FACE_CONSENT,
          ],
        );
        await c.execute("DELETE FROM face_challenges WHERE user_id = ?", [
          user.id,
        ]);
        return json({ ok: true });
      }
      const [stored] = await c.execute<StoredFace[]>(
        "SELECT embeddings, model_version FROM face_credentials WHERE user_id = ?",
        [user.id],
      );
      if (
        !stored[0] ||
        stored[0].model_version !== FACE_MODEL ||
        !matchesEnrollment(samples, decryptFace(user.id, stored[0].embeddings))
      )
        return fail(
          "Rosto não confirmado. Tente novamente ou entre com senha.",
          401,
        );
      // Apenas este resultado calculado no servidor autoriza a sessão. Nunca
      // receber recognized=true, id escolhido pelo cliente, ou escore do cliente.
      const result = json({ destination: roleLanding[user.role as Role] });
      result.cookies.set(
        cookieName,
        createSession(user.employee_no, user.password_hash),
        {
          httpOnly: true,
          secure: request.nextUrl.protocol === "https:",
          sameSite: "lax",
          path: "/",
          maxAge: 8 * 60 * 60,
        },
      );
      return result;
    });
    response.cookies.set(challengeCookie, "", {
      ...cookiesFor(request),
      maxAge: 0,
    });
    return response;
  } catch (cause) {
    // Não registrar corpos, vetores, senhas, frames ou dados descriptografados.
    console.error("[face] Serviço indisponível", {
      code: (cause as { code?: string })?.code ?? "UNKNOWN",
    });
    return fail(
      "O acesso facial está indisponível. Entre com senha e tente novamente mais tarde.",
      503,
    );
  }
}
