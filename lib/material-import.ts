import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import type { Account } from "./accounts";
import { transaction } from "./db";
import { ActionError, demand } from "./permissions";
import { first, audit, insert } from "./stock-ledger";

export const importFields = ["code", "description", "group", "unit", "branch", "balance", "minimum", "maximum", "pack", "lead", "consumption", "average", "period", "directive", "order", "parcelTotal", "programme"] as const;
type Mapping = Partial<Record<typeof importFields[number], number>>;
type SourceRow = { row: number; values: Record<string, string>; raw: Record<string, unknown>; conflicts: string[]; programme: { column:number; label:string; value:string }[] };
function cellText(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "formula" in value && value.result === undefined)
    throw new ActionError(`Fórmula sem resultado na célula ${cell.address}.`);
  // An explicit Excel zero mask is part of the source, unlike guessed padding.
  const scalar = typeof value === "object" && "result" in value ? value.result : value;
  if (typeof scalar === "number" && /^0+$/.test(cell.numFmt)) return String(scalar).padStart(cell.numFmt.length, "0");
  return cell.text;
}
function number(value: string | undefined) {
  if (!value?.trim()) return null;
  const plain = value.trim().replace(/\s/g, "");
  // Brazilian decimal notation; ambiguous comma/dot combinations are rejected.
  const parsed = plain.includes(",") ? plain.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".") : plain;
  if (!/^-?\d+(?:\.\d+)?$/.test(parsed) || !Number.isFinite(Number(parsed))) throw new ActionError(`Número não reconhecido: ${value}`);
  return Number(parsed);
}
export async function previewMaterials(bytes: Buffer, fileName: string, mapping: Mapping, sheetName?: string, headerRow = 1, parcelColumns:number[] = []) {
  if (bytes.length > 2_000_000 || !/\.xlsx$/i.test(fileName)) throw new ActionError("Selecione uma planilha XLSX de até 2 MB.");
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(bytes as never); } catch { throw new ActionError("Planilha ilegível ou inválida."); }
  const sheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
  if (!sheet || !Number.isInteger(headerRow) || headerRow < 1 || sheet.rowCount > 1000 || sheet.columnCount > 100) throw new ActionError("Selecione uma aba e uma linha de cabeçalho válidas (máximo 1000 linhas e 100 colunas).");
  for (const [key, column] of Object.entries(mapping)) if (!importFields.includes(key as typeof importFields[number]) || !Number.isInteger(column) || column! < 1 || column! > sheet.columnCount) throw new ActionError("Mapeamento de colunas inválido.");
  if (!Array.isArray(parcelColumns) || parcelColumns.some(c=>!Number.isInteger(c)||c<1||c>sheet.columnCount)||new Set(parcelColumns).size!==parcelColumns.length) throw new ActionError("Colunas de parcelas inválidas.");
  const columns = Array.from({ length: sheet.columnCount }, (_, i) => ({ column: i + 1, label: cellText(sheet.getRow(headerRow).getCell(i + 1)) }));
  const complete = ["code", "description", "group", "unit", "branch"].every((key) => mapping[key as keyof Mapping]);
  const records: SourceRow[] = [];
  if (complete) for (let line = headerRow + 1; line <= sheet.rowCount; line++) {
    const row = sheet.getRow(line), values: Record<string, string> = {}, raw: Record<string, unknown> = {};
    for (const [key, column] of Object.entries(mapping)) values[key] = cellText(row.getCell(column!));
    if (!values.code && !Object.values(values).some(Boolean)) continue;
    const conflicts: string[] = [];
    for (const key of ["code", "description", "group", "unit", "branch"]) if (!values[key]?.trim()) conflicts.push(`Campo obrigatório ausente: ${key}`);
    if (values.code?.length > 64 || values.branch?.length > 64 || values.description?.length > 160 || values.unit?.length > 32) conflicts.push("Campo excede o tamanho do cadastro.");
    for (let c = 1; c <= sheet.columnCount; c++) raw[String(c)] = { value: row.getCell(c).value, format: row.getCell(c).numFmt, text: cellText(row.getCell(c)) };
    for (const key of ["balance", "minimum", "maximum", "pack", "lead", "consumption", "average", "order", "parcelTotal"]) {
      try { const n = number(values[key]); if (n !== null && n < 0) conflicts.push(`Quantidade negativa: ${key}`); } catch (error) { conflicts.push((error as Error).message); }
    }
    const programme = parcelColumns.map(column=>({column,label:columns[column-1].label,value:cellText(row.getCell(column))}));
    if (programme.length) {
      const quantities = programme.map(p=>numberSafe(p.value));
      if (programme.some((p,i)=>p.value.trim()&&quantities[i]===null)) conflicts.push("Parcela não numérica: preserve a programação e revise o total.");
      else values.parcelTotal = String(quantities.reduce<number>((sum,q)=>sum+(q??0),0));
    }
    const ordered = numberSafe(values.order), parcels = numberSafe(values.parcelTotal);
    if (ordered !== null && parcels !== null && ordered !== parcels) conflicts.push(`Pedido ${ordered}; parcelas ${parcels}; diferença ${ordered - parcels}.`);
    records.push({ row: line, values, raw, conflicts, programme });
  }
  return { fileName, hash: createHash("sha256").update(bytes).digest("hex"), sheet: sheet.name, headerRow, mapping, parcelColumns, columns, sheets: workbook.worksheets.map((s) => s.name), records, ready: complete && records.length === 48 && records.every((r) => ["code", "description", "group", "unit", "branch"].every((key) => !!r.values[key]?.trim())), warnings: records.length && records.length !== 48 ? [`Encontrados ${records.length} registros; são exigidos os 48 registros de origem.`] : [] };
}
function numberSafe(value?: string) { try { return number(value); } catch { return null; } }

export async function importMaterials(user: Account, preview: Awaited<ReturnType<typeof previewMaterials>>) {
  demand(user, "stock");
  if (!preview.ready) throw new ActionError("Prévia incompleta. Mapeie as colunas e confira os 48 registros.", 422);
  return transaction(async (c) => {
    const actor = await first(c, "SELECT id FROM users WHERE employee_no=? AND active=TRUE FOR UPDATE", [user.id]);
    if (!actor) throw new ActionError("Sessão inválida.", 401);
    await c.execute("SELECT pg_advisory_xact_lock(hashtext('marcon-product-identifiers'))");
    await c.execute("SELECT pg_advisory_xact_lock(hashtext(?))", [preview.hash]);
    const previous = await first(c, "SELECT id,mapping FROM material_import_runs WHERE file_hash=?", [preview.hash]);
    const mapping = { columns: preview.mapping, sheet: preview.sheet, headerRow: preview.headerRow, parcelColumns: preview.parcelColumns };
    if (previous) {
      const saved = typeof previous.mapping === "string" ? JSON.parse(previous.mapping) : previous.mapping;
      if (saved.sheet !== mapping.sheet || saved.headerRow !== mapping.headerRow || JSON.stringify(saved.parcelColumns??[])!==JSON.stringify(mapping.parcelColumns) || Object.keys({ ...saved.columns,...mapping.columns }).some((key) => saved.columns[key] !== mapping.columns[key as keyof Mapping])) throw new ActionError("Arquivo já importado com outro mapeamento. Revise a procedência; não será importado novamente.", 409);
      return { id: Number(previous.id), repeated: true, records: 48, conflicts: [] };
    }
    const run = await insert(c, "INSERT INTO material_import_runs(file_name,file_hash,mapping,actor_id) VALUES(?,?,?,?) RETURNING id", [preview.fileName, preview.hash, JSON.stringify(mapping), actor.id]);
    const conflicts: { row: number; code: string; reasons: string[] }[] = [];
    let created = 0;
    for (const row of preview.records) {
      const v = row.values, problems = [...row.conflicts];
      await c.execute("INSERT INTO branches(code) VALUES(?) ON CONFLICT(code) DO NOTHING", [v.branch]);
      const branch = await first(c, "SELECT id FROM branches WHERE code=?", [v.branch]);
      let material: import("./stock-ledger").Row | undefined = await first(c, "SELECT id,name,unit,category,description FROM parts WHERE code=? FOR UPDATE", [v.code]);
      if (material && (material.name !== v.description || material.unit !== v.unit || material.category !== v.group)) {
        problems.push("Cadastro existente diverge em descrição, grupo ou unidade; cadastro e movimentações preservados."); material = undefined;
      } else if (!material && !row.conflicts.some((p) => !p.startsWith("Pedido "))) {
        // No location, price, movement, monthly period or purchase receipt is inferred.
        const minimum = numberSafe(v.minimum), pack = numberSafe(v.pack), lead = numberSafe(v.lead);
        if ([minimum,pack,lead].some((n) => n !== null && !Number.isSafeInteger(n)) || pack === 0) problems.push("Parâmetro incompatível com cadastro inteiro; registro preservado para revisão.");
        else if (await first(c, "SELECT id FROM parts WHERE qr_code=? LIMIT 1", [v.code])) problems.push("Código já vinculado como QR de outro produto; revise o vínculo antes de importar.");
        else { material = await insert(c, "INSERT INTO parts(code,qr_code,name,description,category,unit,location,minimum_total,pack_size,pack_verified,lead_days,reference_unit_price) VALUES(?,?,?,?,?,?,'',?,?,?,?,NULL) RETURNING id", [v.code, v.code, v.description, v.description, v.group, v.unit, minimum ?? 0, pack ?? 1, pack !== null ? 1 : 0, lead ?? 0]); created++; }
        if (!v.pack) problems.push("Embalagem não informada; conversão por caixa deve ser configurada antes do uso.");
      }
      const line = await insert(c, "INSERT INTO material_import_lines(run_id,sheet,row_number,code,branch_code,material_id,raw_cells,parameters,consumption,conflicts) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING id", [run!.id, preview.sheet, row.row, v.code, v.branch, material?.id ?? null, JSON.stringify(row.raw), JSON.stringify({ minimum: v.minimum ?? null, maximum: v.maximum ?? null, pack: v.pack ?? null, lead: v.lead ?? null }), JSON.stringify({ aggregate: v.consumption ?? null, average: v.average ?? null, period: v.period ?? null, basis: "Relatório de origem; não gera baixa" }), JSON.stringify(problems)]);
      await c.execute("INSERT INTO reported_balances(source_line_id,material_id,branch_id,quantity,unit) VALUES(?,?,?,?,?)", [line!.id, material?.id ?? null, branch!.id, numberSafe(v.balance), v.unit]);
      await c.execute("INSERT INTO reported_purchases(source_line_id,material_id,branch_id,directive,order_quantity,parcel_total,programme) VALUES(?,?,?,?,?,?,?)", [line!.id, material?.id ?? null, branch!.id, v.directive ?? null, numberSafe(v.order), numberSafe(v.parcelTotal), JSON.stringify({ original: v.programme ?? null, parcels: row.programme, state: "Programação informada; recebimento não comprovado" })]);
      if (problems.length) conflicts.push({ row: row.row, code: v.code, reasons: problems });
    }
    await audit(c, Number(actor.id), "material_import", Number(run!.id), "import", { hash: preview.hash, rows: 48, created, conflicts });
    return { id: Number(run!.id), repeated: false, records: 48, created, conflicts, balanceStatus: "Saldos informados separados do estoque operacional; vincule local e concilie pelo fluxo oficial, sem sobrescrever movimentos." };
  });
}
