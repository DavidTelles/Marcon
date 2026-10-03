import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { findCatalogItem } from "@/lib/catalog";
import { demoRequests } from "@/lib/demo-requests";
import { databaseEnabled } from "@/lib/db";
import { workspaceSnapshot } from "@/lib/workspace-db";
import { ActionError, executeWorkspaceAction } from "@/lib/workspace-actions";
import { BackendError } from "@/lib/backend-client";

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Faça login para consultar requisições." },
      { status: 401 },
    );
  }
  if (databaseEnabled()) {
    try {
    const requests = (await workspaceSnapshot(user)).requests.map((item) => ({
      protocol: `REQ-${item.id}`, userId: item.requesterId, itemId: item.code,
      quantity: item.quantity, status: item.status, createdAt: item.date,
      requestedQuantity: item.requestedQuantity, approvedQuantity: item.approvedQuantity, deliveredQuantity: item.deliveredQuantity,
    }));
    return NextResponse.json({ requests }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return NextResponse.json({ error: error instanceof BackendError ? error.message : "Requisições indisponíveis." }, { status: error instanceof BackendError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
    }
  }
  const requests = Array.from(demoRequests.values()).filter(
    (item) => item.userId === user.id,
  );
  return NextResponse.json(
    { requests },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json(
      { error: "Origem não autorizada." },
      { status: 403 },
    );
  }
  const user = await currentUser();
  if (!user)
    return NextResponse.json(
      { error: "Faça login para requisitar." },
      { status: 401 },
    );
  if (user.role !== "funcionario")
    return NextResponse.json(
      { error: "Este perfil não pode criar requisições." },
      { status: 403 },
    );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("itemId" in body) ||
    !("quantity" in body)
  ) {
    return NextResponse.json(
      { error: "Informe o item e a quantidade." },
      { status: 400 },
    );
  }
  const { itemId, quantity } = body;
  if (typeof itemId !== "string") {
    return NextResponse.json({ error: "Item inválido." }, { status: 400 });
  }
  if (databaseEnabled()) {
    try {
      const values = body as Record<string, unknown>;
      if (typeof values.requestKey !== "string" || !/^[\w-]{16,64}$/.test(values.requestKey)) throw new ActionError("Informe requestKey para evitar envio duplicado.", 422);
      const result = await executeWorkspaceAction(user, {
        type: "createRequests",
        requestKey: values.requestKey,
        entries: [{ code: itemId, quantity, priority: values.priority ?? "Leve", justification: values.justification ?? "" }],
      }) as { ids: number[] };
      return NextResponse.json({ protocol: `REQ-${result.ids[0]}`, itemId, quantity, persistent: true }, { status: 201 });
    } catch (error) {
      if (error instanceof ActionError) return NextResponse.json({ error: error.message }, { status: error.status });
      return NextResponse.json({ error: "Não foi possível registrar a requisição. Atualize e tente novamente." }, { status: 503 });
    }
  }
  const item = findCatalogItem(itemId);
  if (!item)
    return NextResponse.json(
      { error: "Item não encontrado." },
      { status: 404 },
    );
  if (
    typeof quantity !== "number" ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > item.stock
  ) {
    return NextResponse.json(
      { error: "Escolha uma quantidade dentro do saldo disponível." },
      { status: 422 },
    );
  }

  // Demo-only storage lasts while the process is running; stock is not reserved.
  const protocol = `REQ-${randomUUID().slice(0, 8).toUpperCase()}`;
  demoRequests.set(protocol, {
    protocol,
    userId: user.id,
    itemId: item.id,
    quantity,
    createdAt: new Date().toISOString(),
  });
  return NextResponse.json(
    { protocol, itemId: item.id, quantity, persistent: false },
    { status: 201 },
  );
}
