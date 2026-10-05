import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { databaseEnabled } from "@/lib/db";
import { ActionError } from "@/lib/permissions";
import { confirmJames, converseJames } from "@/lib/james-actions";
export const runtime = "nodejs";
const active = new Set<string>();
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  try {
    const user = await currentUser();
    return user
      ? json({
          authenticated: true,
          userId: user.id,
          role: user.role,
          provider: "openai",
          providerConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
        })
      : json({ error: "Faca login." }, 401);
  } catch {
    return json({ error: "Sessao indisponivel." }, 503);
  }
}
export async function POST(request: NextRequest) {
  const startedAt = performance.now();
  let id: string | undefined;
  try {
    const user = await currentUser();
    if (!user)
      return json({ error: "Sua sessao terminou. Faca login novamente." }, 401);
    if (request.headers.get("origin") !== request.nextUrl.origin)
      return json({ error: "Origem invalida." }, 403);
    if (!databaseEnabled())
      throw new ActionError(
        "Marco precisa do banco local para consultar dados reais.",
        503,
      );
    if (active.has(user.id))
      throw new ActionError("Aguarde a resposta em andamento.", 429);
    const raw = await request.text();
    if (raw.length > 40000) throw new ActionError("Mensagem muito longa.", 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ActionError("Mensagem invalida.");
    }
    if (!body || typeof body !== "object")
      throw new ActionError("Mensagem invalida.");
    id = user.id;
    active.add(id);
    const response = json(
      body.mode === "confirm"
        ? await confirmJames(user, body.token, body.confirmation, body.cart)
        : await converseJames(user, body, request.signal),
    );
    response.headers.set("Server-Timing", `james;dur=${Math.round(performance.now() - startedAt)}`);
    return response;
  } catch (error) {
    if (error instanceof ActionError)
      return json({ error: error.message }, error.status);
    const timeout =
      error instanceof Error &&
      ["AbortError", "TimeoutError"].includes(error.name);
    return json(
      {
        error: timeout
          ? "Marco demorou para responder. Seu carrinho foi preservado."
          : "Nao foi possivel consultar o modelo ou os dados. Seu carrinho foi preservado.",
      },
      timeout ? 504 : 503,
    );
  } finally {
    if (id) active.delete(id);
  }
}
