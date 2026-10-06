import { NextResponse } from "next/server";
import { databaseEnabled, getPool } from "@/lib/db";
import { backendFetch, backendUrl } from "@/lib/backend-client";
import { databaseHealth } from "@/lib/database-health.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET() {
  if (!databaseEnabled())
    return NextResponse.json(
      { status: "unavailable", database: "not-configured" },
      { status: 503, headers },
    );
  let database;
  try {
    database = await databaseHealth(getPool());
  } catch {
    database = "disconnected";
  }
  if (database !== "connected") {
    return NextResponse.json(
      { status: "unavailable", database },
      { status: 503, headers },
    );
  }
  try {
    const transport = backendUrl() === null ? "embedded" : "external";
    await backendFetch("/health");
    return NextResponse.json(
      { status: "ok", database: "connected", backend: "connected", transport },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable", database: "connected", backend: "unavailable" },
      { status: 503, headers },
    );
  }
}
