import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { findCatalogItem } from "@/lib/catalog";
import { databaseEnabled } from "@/lib/db";
import { workspaceSnapshot } from "@/lib/workspace-db";

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
  const { id } = await params;
  const item = databaseEnabled()
    ? (await workspaceSnapshot(user)).stock
        .filter((part) => part.code === id || String(part.id) === id)
        .map((part) => ({
          id: part.code,
          name: part.name,
          category: part.category,
          stock: part.available ?? part.quantity,
          unit: part.unit,
          location:
            part.locations
              ?.map((l) => `${l.warehouse} / ${l.aisle} / ${l.shelf}`)
              .join("; ") ?? part.location,
          description: part.name,
          specification: `QR/ID ${part.qrCode ?? part.code}`,
        }))[0]
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
}
