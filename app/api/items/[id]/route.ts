import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { findCatalogItem, catalogItemFromPart } from "@/lib/catalog";
import { databaseEnabled } from "@/lib/db";
import { workspaceSnapshot } from "@/lib/workspace-db";
import { BackendError } from "@/lib/backend-client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Acesso não autorizado." },
      { status: 401 },
    );
  }
  try {
    const { id } = await params;
    const item = databaseEnabled()
      ? (await workspaceSnapshot(user, true)).stock
          .filter((part) => part.code === id || String(part.id) === id)
          .map(catalogItemFromPart)[0]
      : findCatalogItem(id);
    if (!item) {
      return NextResponse.json(
        { error: "Item não encontrado." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { item },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof BackendError
            ? error.message
            : "Material indisponível. Tente atualizar.",
      },
      {
        status: error instanceof BackendError ? error.status : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
