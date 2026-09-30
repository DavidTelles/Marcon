import { NextRequest, NextResponse } from "next/server";
import { cookieName, createSession } from "@/lib/auth";
import { demoUsers } from "@/lib/users";
import { databaseEnabled } from "@/lib/db";
import { accountByIdentity } from "@/lib/accounts";
import { roleLanding, type Role } from "@/lib/workspace-routes";
import {
  apiTokenCookie,
  BackendError,
  backendFetch,
} from "@/lib/backend-client";

type BackendLogin = {
  token: string;
  user: { employee_code: string; role_enum: string };
};

// Leitura simulada no modo demonstração; no modo persistente o crachá é
// validado pela API do backend (tag do corpo, RFID_DEMO_TAG ou leitor externo).
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }
  const secure = request.nextUrl.protocol === "https:";
  const setCookies = (response: NextResponse, session: string, token?: string) => {
    response.cookies.set(cookieName, session, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 8 * 60 * 60 });
    if (token) response.cookies.set(apiTokenCookie, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 8 * 60 * 60 });
  };

  if (databaseEnabled()) {
    let tag = process.env.RFID_DEMO_TAG || "";
    try {
      const body = await request.json().catch(() => null);
      if (body && typeof body.rfid_id === "string") tag = body.rfid_id;
      else if (body && typeof body.tag === "string") tag = body.tag;
    } catch { /* corpo vazio: usa RFID_DEMO_TAG */ }
    if (!tag)
      return NextResponse.json(
        { error: "Leitura RFID indisponível: defina RFID_DEMO_TAG ou conecte um leitor autenticado." },
        { status: 501 },
      );
    try {
      const session = await backendFetch<BackendLogin>("/login/rfid", {
        method: "POST",
        body: { rfid_id: tag },
      });
      const account = await accountByIdentity(session.user.employee_code);
      if (!account) return NextResponse.json({ error: "Conta local não encontrada." }, { status: 401 });
      const response = NextResponse.json({ destination: roleLanding[account.account.role] });
      setCookies(response, createSession(account.account.id, account.passwordHash), session.token);
      return response;
    } catch (error) {
      const status = error instanceof BackendError ? error.status : 500;
      const message = error instanceof BackendError ? error.message : "Falha na validação do crachá.";
      return NextResponse.json({ error: message }, { status });
    }
  }

  const user = demoUsers[0];
  const response = NextResponse.json({ destination: roleLanding[user.role as Role] });
  setCookies(response, createSession(user.id));
  return response;
}
