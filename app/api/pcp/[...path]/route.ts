import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/request-origin";
import { apiToken, backendFetch, BackendError } from "@/lib/backend-client";

async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  if (request.method !== "GET" && !sameOrigin(request))
    return NextResponse.json(
      { error: "Origem não autorizada." },
      { status: 403 },
    );
  if (!(await currentUser()))
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  const { path } = await context.params;
  if (path.some((p) => !/^[a-z0-9-]+$/.test(p)))
    return NextResponse.json({ error: "Rota inválida." }, { status: 400 });
  let body: unknown;
  if (request.method !== "GET") {
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  try {
    const data = await backendFetch(
      `/api/pcp/${path.join("/")}${request.nextUrl.search}`,
      {
        method: request.method as "GET" | "POST" | "PATCH",
        body,
        token: await apiToken(),
      },
    );
    return NextResponse.json(data, {
      status: request.method === "POST" ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof BackendError
            ? error.message
            : "API PCP indisponível.",
      },
      { status: error instanceof BackendError ? error.status : 503 },
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
