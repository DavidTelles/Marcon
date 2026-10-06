import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { databaseEnabled } from "@/lib/db";
import { ActionError } from "@/lib/permissions";
import { confirmJames, converseJames } from "@/lib/james-actions";
import { marcoBody } from "@/lib/marco-body";
import {
  marcoTelemetry,
  ollamaConfig,
  type MarcoMetrics,
} from "@/lib/marco-ollama.mjs";
export const runtime = "nodejs";
export const maxDuration = 60;
const active = new Set<string>();
const headers = { "Cache-Control": "no-store" };
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers });
function failure(error: unknown) {
  if (error instanceof ActionError)
    return { error: error.message, status: error.status };
  const timeout =
    error instanceof Error &&
    ["AbortError", "TimeoutError"].includes(error.name);
  return {
    error: timeout
      ? "Marco demorou ou foi interrompido. Nenhuma ação será repetida automaticamente; consulte o resultado antes de reenviar."
      : "Não foi possível consultar o modelo ou os dados. Seu carrinho foi preservado.",
    status: timeout ? 504 : 503,
  };
}
export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return json({ error: "Faça login." }, 401);
    let configured = true,
      configurationError: string | undefined;
    try {
      ollamaConfig();
    } catch (error) {
      configured = false;
      configurationError =
        error instanceof Error ? error.message : "Configuração inválida.";
    }
    return json({
      authenticated: true,
      userId: user.id,
      role: user.role,
      provider: "ollama",
      model: process.env.MARCO_OLLAMA_MODEL || "qwen3.5:0.8b",
      providerConfigured: configured,
      configurationError,
    });
  } catch {
    return json({ error: "Sessão indisponível." }, 503);
  }
}
export async function POST(request: NextRequest) {
  const started = performance.now();
  try {
    const user = await currentUser();
    if (!user)
      return json({ error: "Sua sessão terminou. Faça login novamente." }, 401);
    if (request.headers.get("origin") !== request.nextUrl.origin)
      return json({ error: "Origem inválida." }, 403);
    if (!databaseEnabled())
      throw new ActionError(
        "Marco precisa do banco para consultar dados reais.",
        503,
      );
    if (active.has(user.id))
      throw new ActionError("Aguarde a resposta em andamento.", 429);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new ActionError("Use JSON.", 415);
    // Reserve before reading to close concurrent-request races.
    active.add(user.id);
    let body;
    try {
      body = await marcoBody(request);
    } catch (error) {
      active.delete(user.id);
      throw error;
    }
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      (body.mode !== undefined && body.mode !== "confirm")
    ) {
      active.delete(user.id);
      throw new ActionError("Mensagem inválida.", 422);
    }
    const metrics: MarcoMetrics = {};
    const controller = new AbortController();
    const signal = AbortSignal.any([
      request.signal,
      controller.signal,
      AbortSignal.timeout(
        Math.max(1, 55000 - Math.round(performance.now() - started)),
      ),
    ]);
    const execute = async (progress?: (phase: string) => void) => {
      try {
        progress?.(body.mode === "confirm" ? "executando" : "interpretando");
        const result = await marcoTelemetry.run(
          { metrics, progress },
          async () => {
            if (signal.aborted) signal.throwIfAborted();
            return body.mode === "confirm"
              ? await confirmJames(
                  user,
                  body.token,
                  body.confirmation,
                  body.cart,
                )
              : await converseJames(user, body, signal);
          },
        );
        metrics.serverMs = Math.round(performance.now() - started);
        if (body.mode === "confirm") metrics.actionMs = metrics.serverMs;
        return { ...result, metrics };
      } finally {
        active.delete(user.id);
      }
    };
    if (request.headers.get("accept")?.includes("application/x-ndjson")) {
      const encoder = new TextEncoder();
      let closed = false;
      const stream = new ReadableStream({
        async start(output) {
          const emit = (data: unknown) => {
            if (!closed)
              output.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
          };
          try {
            emit({
              type: "result",
              data: await execute((phase) => emit({ type: "status", phase })),
            });
          } catch (error) {
            emit({ type: "error", ...failure(error) });
          } finally {
            if (!closed) {
              closed = true;
              output.close();
            }
          }
        },
        cancel() {
          closed = true;
          controller.abort();
        },
      });
      return new Response(stream, {
        headers: {
          ...headers,
          "Content-Type": "application/x-ndjson",
          "X-Accel-Buffering": "no",
        },
      });
    }
    const data = await execute();
    const response = json(data);
    response.headers.set("Server-Timing", `marco;dur=${metrics.serverMs}`);
    return response;
  } catch (error) {
    const failed = failure(error);
    return json({ error: failed.error }, failed.status);
  }
}
