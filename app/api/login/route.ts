import { NextRequest, NextResponse } from "next/server";
import { cookieName, createSession } from "@/lib/auth";
import { databaseEnabled } from "@/lib/db";
import { accountByIdentity } from "@/lib/accounts";
import { roleLanding } from "@/lib/workspace-routes";
import {
  clearFailedLogins,
  loginBlocked,
  recordFailedLogin,
} from "@/lib/login-rate";
import {
  apiTokenCookie,
  BackendError,
  backendFetch,
} from "@/lib/backend-client";

type BackendLogin = {
  token: string;
  user: {
    employee_code: string;
    role_enum: "admin" | "lider" | "almoxarifado" | "funcionario";
  };
};

function setCookies(
  request: NextRequest,
  response: NextResponse,
  session: string,
  token?: string,
) {
  const secure = request.nextUrl.protocol === "https:";
  response.cookies.set(cookieName, session, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  if (token) {
    response.cookies.set(apiTokenCookie, token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json(
      { error: "Origem não autorizada." },
      { status: 403 },
    );
  let data;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  if (
    !data ||
    typeof data.identity !== "string" ||
    typeof data.password !== "string"
  )
    return NextResponse.json(
      { error: "Informe suas credenciais." },
      { status: 400 },
    );
  const identity = data.identity.trim().toLowerCase();
  if (!databaseEnabled())
    return NextResponse.json(
      {
        error:
          "Banco de dados não configurado. O acesso exige conexão com o banco da empresa.",
      },
      { status: 503 },
    );

  if (databaseEnabled()) {
    // Credenciais verificadas pela API do backend (dona do banco unificado).
    try {
      if (await loginBlocked(identity))
        return NextResponse.json(
          { error: "Muitas tentativas. Aguarde 15 minutos." },
          { status: 429 },
        );
      const session = await backendFetch<BackendLogin>("/login", {
        method: "POST",
        body: { login: identity, password: data.password },
      });
      await clearFailedLogins(identity);
      const account = await accountByIdentity(session.user.employee_code);
      if (!account)
        return NextResponse.json(
          { error: "Conta local não encontrada." },
          { status: 401 },
        );
      const response = NextResponse.json({
        destination: roleLanding[session.user.role_enum],
      });
      setCookies(
        request,
        response,
        createSession(account.account.id, account.passwordHash),
        session.token,
      );
      return response;
    } catch (error) {
      if (!(error instanceof BackendError) || error.status >= 500) {
        return NextResponse.json(
          {
            error:
              "Não foi possível consultar o backend ou o banco. Verifique a configuração compartilhada e tente novamente.",
          },
          { status: 503 },
        );
      }
      if (error.status === 429)
        return NextResponse.json({ error: error.message }, { status: 429 });
      await recordFailedLogin(identity);
      const status = error.status === 403 ? 403 : 401;
      const message =
        error.status === 403
          ? error.message
          : "E-mail, matrícula ou senha incorretos. Tente novamente.";
      return NextResponse.json({ error: message }, { status });
    }
  }

  return NextResponse.json(
    { error: "Banco de dados indisponível." },
    { status: 503 },
  );
}
