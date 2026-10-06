import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { apiToken, backendFetch, BackendError } from "@/lib/backend-client";
import { ActionError } from "@/lib/permissions";
export const runtime = "nodejs";
function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof ActionError || error instanceof BackendError
          ? error.message
          : "Falha ao consultar ou configurar os vínculos. Tente novamente.",
    },
    {
      status:
        error instanceof ActionError || error instanceof BackendError
          ? error.status
          : 503,
    },
  );
}
export async function GET() {
  try {
    if (!(await currentUser())) throw new ActionError("Faça login.", 401);
    const token = await apiToken();
    if (!token)
      throw new ActionError("Faça login novamente para acessar a API.", 401);
    return NextResponse.json(
      await backendFetch("/api/industrial-links", { token }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      throw new ActionError("Origem não autorizada.", 403);
    if (!(await currentUser())) throw new ActionError("Faça login.", 401);
    const token = await apiToken();
    if (!token)
      throw new ActionError("Faça login novamente para acessar a API.", 401);
    return NextResponse.json(
      await backendFetch("/api/industrial-links", {
        method: "POST",
        token,
        body: await request.json(),
      }),
    );
  } catch (error) {
    return failure(error);
  }
}
