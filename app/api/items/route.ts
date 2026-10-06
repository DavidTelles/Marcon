import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { catalogItems, catalogItemFromPart } from "@/lib/catalog";
import { databaseEnabled } from "@/lib/db";
import { workspaceSnapshot } from "@/lib/workspace-db";
import { BackendError } from "@/lib/backend-client";

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Acesso não autorizado." },
      { status: 401 },
    );
  }
  try {
    const items = databaseEnabled()
      ? (await workspaceSnapshot(user, true)).stock.map(catalogItemFromPart)
      : catalogItems;
    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof BackendError
            ? error.message
            : "Catálogo indisponível. Tente atualizar.",
      },
      {
        status: error instanceof BackendError ? error.status : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
