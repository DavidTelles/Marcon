import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { apiToken, backendFetch, BackendError } from "@/lib/backend-client";
import { ActionError } from "@/lib/permissions";
import {
  isPartsConsumptionReport,
  PARTS_REPORT_INCOMPATIBLE,
} from "@/lib/parts-consumption-contract";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user)
      return NextResponse.json({ error: "Faça login." }, { status: 401 });
    const q = new URLSearchParams(request.nextUrl.searchParams);
    const format = q.get("format");
    if (format && !["pdf", "xlsx"].includes(format))
      throw new ActionError("Formato inválido.");
    if (format) {
      q.set("export", "all");
      q.delete("details");
    }
    const data = await backendFetch<unknown>(
      "/api/parts/consumption?" + q,
      { token: await apiToken() },
    );
    if (!isPartsConsumptionReport(data))
      throw new ActionError(PARTS_REPORT_INCOMPATIBLE, 503);
    if (format === "pdf" || format === "xlsx") {
      const { exportPartsReport } = await import("@/lib/parts-export");
      const bytes = await exportPartsReport(data, format);
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type":
            format === "pdf"
              ? "application/pdf"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="marcon-pecas-${data.period.from}.${format}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
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
