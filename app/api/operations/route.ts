import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { databaseEnabled } from "@/lib/db";
import { ActionError, demand } from "@/lib/permissions";
import { operationsReport } from "@/lib/operations-report";
import { BackendError } from "@/lib/backend-client";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  if (!databaseEnabled())
    return NextResponse.json(
      { error: "Planejamento real requer Neon configurado." },
      { status: 503 },
    );
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  try {
    const q = request.nextUrl.searchParams;
    if (q.has("planning")) {
      demand(user, "planning");
      const mode = q.get("planning");
      if (!["purchase", "distribution"].includes(mode ?? ""))
        throw new ActionError("Planejamento inválido.");
      q.set("dashboard", mode === "purchase" ? "compra" : "estoque");
      if (!q.has("decision"))
        q.set("decision", mode === "purchase" ? "buy" : "transfer");
      if (!q.has("metric")) q.set("metric", "stock");
    }
    if (q.has("dashboard")) {
      const { dashboardReport } = await import("@/lib/dashboard-report");
      const format = q.get("format");
      if (format && !["pdf", "xlsx"].includes(format))
        throw new ActionError("Formato invalido.");
      const data = await dashboardReport(user, q, !!format);
      if (format === "pdf" || format === "xlsx") {
        const { exportDashboard } = await import("@/lib/report-export");
        const bytes = await exportDashboard(data, format);
        return new NextResponse(new Uint8Array(bytes), {
          headers: {
            "Content-Type":
              format === "pdf"
                ? "application/pdf"
                : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="marcon-${data.view}-${data.filters.from}.${format}"`,
            "Cache-Control": "no-store",
          },
        });
      }
      return NextResponse.json(data, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const report = await operationsReport(user, {
      from: q.get("from") ?? undefined,
      to: q.get("to") ?? undefined,
      block: q.get("block") ?? undefined,
      requester: q.get("requester") ?? undefined,
      code: q.get("code") ?? undefined,
    });
    const format = q.get("format");
    if (format === "pdf" || format === "xlsx") {
      const { exportReport } = await import("@/lib/report-export");
      const bytes = await exportReport(report, format);
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type":
            format === "pdf"
              ? "application/pdf"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="marcon-${report.period.from}-${report.period.to}.${format}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof ActionError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof BackendError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause : e;
    console.error("[operations] failed", {
      name: cause instanceof Error ? cause.name : "Error",
      code: (cause as { code?: string })?.code,
      message: cause instanceof Error ? cause.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "Não foi possível gerar o relatório." },
      { status: 503 },
    );
  }
}
