import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { apiToken, backendFetch, BackendError } from "@/lib/backend-client";
import QRCode from "qrcode";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await currentUser()))
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id))
    return NextResponse.json({ error: "Produto inválido." }, { status: 400 });
  try {
    const p = await backendFetch<{
      qr_code: string;
      code: string;
      name: string;
    }>(`/api/products/${id}`, { token: await apiToken() });
    const value = p.qr_code || p.code;
    if (!value || value.length > 128)
      throw new BackendError("Conteúdo da etiqueta inválido.", 422);
    const svg = await QRCode.toString(value, {
      type: "svg",
      errorCorrectionLevel: "M",
      maskPattern: 1,
      margin: 4,
      width: 320,
    });
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="produto-${id}-qr.svg"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof BackendError
            ? error.message
            : "Falha ao gerar etiqueta.",
      },
      { status: error instanceof BackendError ? error.status : 503 },
    );
  }
}
