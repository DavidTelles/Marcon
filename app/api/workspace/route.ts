import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { databaseEnabled } from "@/lib/db";
import {
  apiToken,
  BackendError,
  backendFetch,
} from "@/lib/backend-client";
import { workspaceSnapshot } from "@/lib/workspace-db";
import { ActionError, executeWorkspaceAction } from "@/lib/workspace-actions";

export const runtime = "nodejs";
const unavailable = () =>
  NextResponse.json(
    {
      error:
        "Configure DATABASE_URL do Neon para usar o modo persistente.",
    },
    { status: 503 },
  );

function failure(error: unknown) {
  if (error instanceof ActionError || error instanceof BackendError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    {
      error:
        "Não foi possível carregar o estoque. Verifique a API do backend e o Neon.",
    },
    { status: 503 },
  );
}

export async function GET(request: NextRequest) {
  if (!databaseEnabled()) return unavailable();
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  try {
    if (request.nextUrl.searchParams.has("transfers")) {
      const token = await apiToken();
      if (!token)
        return NextResponse.json(
          { error: "Sessão sem vínculo com a API. Faça login novamente." },
          { status: 401 },
        );
      const query = request.nextUrl.searchParams;
      query.delete("transfers");
      const data = await backendFetch<{ transfers: unknown[] }>(
        `/api/workspace/transfers?${query.toString()}`,
        { token },
      );
      return NextResponse.json(data, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json(await workspaceSnapshot(user), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  if (!databaseEnabled()) return unavailable();
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json(
      { error: "Origem não autorizada." },
      { status: 403 },
    );
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  try {
    const result = await executeWorkspaceAction(user, payload);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
