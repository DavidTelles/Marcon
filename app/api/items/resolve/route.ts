import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { apiToken, backendFetch, BackendError } from "@/lib/backend-client";
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  if (!await currentUser()) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  try {
    let body;
    try { body = await request.json(); } catch { return NextResponse.json({error:"JSON inválido."},{status:400}); }
    if(!body || typeof body.code !== "string")return NextResponse.json({error:"Informe o conteúdo exato do código."},{status:400});
    const data = await backendFetch("/api/products/resolve-code", { method: "POST", body: { code: body.code }, token: await apiToken() });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof BackendError ? error.message : "Não foi possível resolver o código." }, { status: error instanceof BackendError ? error.status : 503 });
  }
}
