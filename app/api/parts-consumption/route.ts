import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { apiToken, backendFetch, BackendError } from "@/lib/backend-client";
import { ActionError } from "@/lib/permissions";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user)
      return NextResponse.json({ error: "Faça login." }, { status: 401 });
    return NextResponse.json(
      await backendFetch(
        "/api/parts/consumption?" + request.nextUrl.searchParams,
        { token: await apiToken() },
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ActionError || error instanceof BackendError
            ? error.message
            : "Não foi possível consultar o consumo no banco.",
      },
      {
        status:
          error instanceof ActionError || error instanceof BackendError
            ? error.status
            : 503,
      },
    );
  }
}
