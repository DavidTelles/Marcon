import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { currentUser, cookieName, createSession } from "@/lib/auth";
import { accountByIdentity } from "@/lib/accounts";
import { roleLanding } from "@/lib/workspace-routes";
import { verifyPassword } from "@/lib/password";
import { databaseEnabled, getPool, transaction } from "@/lib/db";
import type { RowDataPacket } from "@/lib/db-types";
import { clearFailedLogins, loginBlocked, recordFailedLogin } from "@/lib/login-rate";
import { challengeCookie, consumeChallenge, createChallenge, credentialTransports, credentialsForUser, relyingParty, userIdForIdentity, type CredentialRow } from "@/lib/passkeys";

export const runtime = "nodejs";
const error = (message: string, status: number) => NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
const cookieOptions = (request: NextRequest) => ({ httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax" as const, path: "/api/passkey", maxAge: 300 });

export async function POST(request: NextRequest) {
  try {
    return await handlePost(request);
  } catch (cause) {
    const code = (cause as { code?: string } | null)?.code;
    console.error("[passkey] Falha na operação", { code: code ?? "UNKNOWN" });
    if (code === "ER_NO_SUCH_TABLE") return error("O cadastro de passkeys precisa de uma atualização no servidor. Contate o administrador.", 503);
    return error("O serviço de passkeys está indisponível. Tente novamente em instantes.", 503);
  }
}

async function handlePost(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return error("Origem não autorizada.", 403);
  if (!databaseEnabled()) return error("Configure o Neon para usar passkeys.", 503);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return error("Dados inválidos.", 400); }
  if (!body || typeof body !== "object") return error("Dados inválidos.", 400);
  const { rpID, expectedOrigin } = relyingParty(request.nextUrl.origin);
  if (body.action === "register-options") {
    const user = await currentUser();
    if (!user) return error("Faça login para cadastrar a passkey.", 401);
    const attemptKey = `passkey-register:${user.id}`;
    if (await loginBlocked(attemptKey)) return error("Muitas tentativas. Aguarde 15 minutos.", 429);
    const account = await accountByIdentity(user.id);
    if (!account || typeof body.password !== "string" || !verifyPassword(body.password, account.passwordHash)) {
      await recordFailedLogin(attemptKey);
      return error("Senha atual incorreta.", 401);
    }
    await clearFailedLogins(attemptKey);
    const userId = await userIdForIdentity(user.id);
    if (!userId) return error("Conta indisponível.", 404);
    const credentials = await credentialsForUser(userId);
    const options = await generateRegistrationOptions({ rpName: "Marcon Smartway", rpID, userName: user.email,
      userDisplayName: user.name, userID: new TextEncoder().encode(user.id), attestationType: "none",
      excludeCredentials: credentials.map((item) => ({ id: item.credential_id })),
      authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" } });
    const token = await createChallenge(userId, options.challenge, "register");
    const response = NextResponse.json(options, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(challengeCookie, token, cookieOptions(request));
    return response;
  }
  if (body.action === "register-verify") {
    const user = await currentUser();
    if (!user) return error("Faça login para cadastrar a passkey.", 401);
    const challenge = await consumeChallenge(request.cookies.get(challengeCookie)?.value, "register");
    const userId = await userIdForIdentity(user.id);
    if (!challenge || challenge.user_id !== userId) return error("Cadastro expirado. Tente novamente.", 400);
    let result;
    try {
      result = await verifyRegistrationResponse({ response: body.response as RegistrationResponseJSON,
        expectedChallenge: challenge.challenge, expectedOrigin, expectedRPID: rpID, requireUserVerification: true });
    } catch { return error("Não foi possível validar a passkey.", 400); }
    if (!result.verified) return error("Não foi possível validar a passkey.", 400);
    const credential = result.registrationInfo.credential;
    await getPool().execute("INSERT INTO passkey_credentials (credential_id, user_id, public_key, counter, transports) VALUES (?, ?, ?, ?, ?)",
      [credential.id, userId, Buffer.from(credential.publicKey), credential.counter, JSON.stringify(credential.transports ?? [])]);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(challengeCookie, "", { ...cookieOptions(request), maxAge: 0 });
    return response;
}
if (body.action === "login-options") {
  const identity = typeof body.identity === "string" ? body.identity.trim().toLowerCase() : "";
  if (!identity || identity.length > 190) return error("Informe seu e-mail ou matrícula.", 400);
  if (await loginBlocked(identity)) return error("Muitas tentativas. Aguarde 15 minutos.", 429);
  const userId = await userIdForIdentity(identity);
  const credentials = userId ? await credentialsForUser(userId) : [];
  if (!userId || !credentials.length) return error("Passkey não cadastrada para esta conta.", 404);
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required",
    allowCredentials: credentials.map((item) => ({ id: item.credential_id, transports: credentialTransports(item.transports) })) });
  const token = await createChallenge(userId, options.challenge, "login");
  const response = NextResponse.json(options, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(challengeCookie, token, cookieOptions(request));
  return response;
}
if (body.action === "login-verify") {
  const challenge = await consumeChallenge(request.cookies.get(challengeCookie)?.value, "login");
  if (!challenge) return error("Autenticação expirada. Tente novamente.", 400);
  const assertion = body.response as AuthenticationResponseJSON;
  if (!assertion || typeof assertion.id !== "string") return error("Resposta inválida.", 400);
  const result = await transaction(async (connection) => {
    const [rows] = await connection.execute<CredentialRow[]>(
      "SELECT * FROM passkey_credentials WHERE credential_id = ? AND user_id = ? FOR UPDATE", [assertion.id, challenge.user_id]);
    const stored = rows[0];
    if (!stored) return null;
    let verification;
    try {
      verification = await verifyAuthenticationResponse({ response: assertion, expectedChallenge: challenge.challenge,
        expectedOrigin, expectedRPID: rpID, requireUserVerification: true,
        credential: { id: stored.credential_id, publicKey: new Uint8Array(stored.public_key), counter: stored.counter,
          transports: credentialTransports(stored.transports) } });
    } catch { return null; }
    if (!verification.verified) return null;
    await connection.execute("UPDATE passkey_credentials SET counter = ? WHERE credential_id = ?", [verification.authenticationInfo.newCounter, stored.credential_id]);
    return stored.user_id;
  });
  if (!result) return error("Não foi possível validar a passkey.", 401);
  const [accountRows] = await getPool().execute<RowDataPacket[]>("SELECT employee_no FROM users WHERE id = ? AND active = TRUE", [result]);
  const account = accountRows[0] ? await accountByIdentity(accountRows[0].employee_no) : null;
  if (!account) return error("Conta indisponível.", 401);
  await clearFailedLogins(account.account.id);
  const response = NextResponse.json({ destination: roleLanding[account.account.role] });
  response.cookies.set(cookieName, createSession(account.account.id, account.passwordHash),
    { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: 8 * 60 * 60 });
  response.cookies.set(challengeCookie, "", { ...cookieOptions(request), maxAge: 0 });
  return response;
}
return error("Ação inválida.", 400);
}
