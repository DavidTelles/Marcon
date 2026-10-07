import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { ActionError, demand } from "@/lib/permissions";
import { previewMaterials, importMaterials } from "@/lib/material-import";
import { getPool } from "@/lib/db";
import { rows } from "@/lib/stock-ledger";
import { sameOrigin } from "@/lib/request-origin";
export const runtime = "nodejs";
export async function GET() {
  try {
    const user=await currentUser();if(!user)throw new ActionError("Faça login.",401);demand(user,"stock");
    const c=getPool();const [balances,warehouses]=await Promise.all([
      rows(c,"SELECT rb.id,rb.branch_id,rb.quantity,rb.unit,rb.reconciliation_movement_id,l.code,l.row_number,l.conflicts,r.file_name,br.code AS branch_code FROM reported_balances rb JOIN material_import_lines l ON l.id=rb.source_line_id JOIN material_import_runs r ON r.id=l.run_id JOIN branches br ON br.id=rb.branch_id ORDER BY rb.id DESC LIMIT 200"),
      rows(c,"SELECT id,name,branch_id FROM warehouses WHERE active=TRUE ORDER BY name"),
    ]);return NextResponse.json({balances,warehouses,limit:200},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return NextResponse.json({error:error instanceof ActionError?error.message:"Falha ao consultar a procedência da importação."},{status:error instanceof ActionError?error.status:503});}
}
export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) throw new ActionError("Origem não autorizada.", 403);
    const user = await currentUser();
    if (!user) throw new ActionError("Faça login.", 401);
    demand(user, "stock");
    const data = await request.formData(), file = data.get("file");
    if (!(file instanceof File) || file.size > 2_000_000) throw new ActionError("Selecione a planilha XLSX (até 2 MB).");
    let mapping;
    try { mapping = JSON.parse(String(data.get("mapping") ?? "{}")); } catch { throw new ActionError("Mapeamento inválido."); }
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) throw new ActionError("Mapeamento inválido.");
    let parcels;try{parcels=JSON.parse(String(data.get("parcelColumns")??"[]"));}catch{throw new ActionError("Colunas de parcelas inválidas.");}
    const preview = await previewMaterials(Buffer.from(await file.arrayBuffer()), file.name, mapping, String(data.get("sheet") ?? "") || undefined, Number(data.get("headerRow") ?? 1),parcels);
    return NextResponse.json(data.get("confirm") === "true" ? await importMaterials(user, preview) : preview, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ActionError ? error.message : "Não foi possível processar a planilha. Tente novamente." }, { status: error instanceof ActionError ? error.status : 503 });
  }
}
