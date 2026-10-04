import { NextResponse } from "next/server";
import { databaseEnabled, getPool } from "@/lib/db";

export const runtime = "nodejs";
export async function GET() {
  if (!databaseEnabled()) return NextResponse.json({ status: "unavailable", database: "not-configured" }, { status: 503 });
  try {
    await getPool().query("SELECT 1");
    return NextResponse.json({ status: "ok", database: "connected" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable", database: "disconnected" }, { status: 503 });
  }
}
