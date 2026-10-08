import type { ReportRow } from "./operations-report";

export type StockNeed = {
  key: string;
  source: "operational" | "imported";
  code: string;
  item: string;
  unit: string;
  destination: string;
  available: number;
  target: number;
  incoming: number;
  quantity: number;
  issues: string[];
  purchaseBlocked: boolean;
  reference: string;
  consumption: string | null;
  conflicts: string[];
};

export function operationalNeeds(
  rows: ReportRow[],
  mapVersion: number | null,
): StockNeed[] {
  return rows.flatMap((row) => {
    const incoming =
      row.incoming + (row.distribution?.pendingIncoming ?? 0) + row.transfer;
    const target = Math.max(row.configuredMinimum, row.target);
    const quantity = Math.max(0, target - row.available - incoming);
    if (!quantity) return [];
    const issues: string[] = [];
    if (!mapVersion)
      issues.push(
        "Publicar a planta com os almoxarifados, blocos e caminhos vinculados.",
      );
    else
      issues.push(
        "Conferir origens com excedente e caminho transitável; nenhuma transferência cobre este déficit.",
      );
    if (row.distribution?.unmappedConsumption)
      issues.push(
        "Vincular os destinos das retiradas à planta para incluir o consumo por proximidade.",
      );
    if (row.capacity === null)
      issues.push(
        "Cadastrar a capacidade desta peça no destino ou conferir o espaço físico.",
      );
    return [
      {
        key: `stock:${row.code}:${row.warehouse}`,
        source: "operational" as const,
        code: row.code,
        item: row.item,
        unit: row.unit,
        destination: row.warehouse,
        available: row.available,
        target,
        incoming,
        quantity,
        issues,
        purchaseBlocked: false,
        reference:
          "Saldo operacional atual; reservas e entradas previstas consideradas.",
        consumption: null,
        conflicts: [],
      },
    ];
  });
}

export function importedNeed(source: {
  id: number;
  code: string;
  item: string;
  unit: string;
  branch: string;
  balance: unknown;
  minimum: unknown;
  consumption: string | null;
  period: string | null;
  file: string;
  sheet: string;
  line: number;
  importedAt: string;
  directive: string | null;
  conflicts: string[];
  materialLinked: boolean;
}): StockNeed | null {
  // Missing values must never become an observed zero or a fabricated deficit.
  const number = (value: unknown) =>
    value === null || value === undefined || String(value).trim() === ""
      ? null
      : Number(value);
  const available = number(source.balance),
    target = number(source.minimum);
  if (
    available === null ||
    target === null ||
    !Number.isFinite(available) ||
    !Number.isFinite(target) ||
    available < 0 ||
    target <= available
  )
    return null;
  const issues = [
    "Confirmar o almoxarifado desta filial e conciliar o saldo informado com o estoque operacional.",
  ];
  if (!source.materialLinked)
    issues.push(
      "Resolver a divergência do cadastro ou do QR antes de vincular esta peça.",
    );
  if (!source.period)
    issues.push(
      "Informar o período do consumo agregado; ele não foi convertido em retiradas diárias.",
    );
  const purchaseBlocked = /n[aã]o\s+comprar/i.test(
    source.directive ?? source.item,
  );
  if (purchaseBlocked)
    issues.push(
      "A origem informa NÃO COMPRAR. Revisar alternativas de reposição; compra permanece bloqueada nesta análise.",
    );
  return {
    key: `import:${source.id}`,
    source: "imported",
    code: source.code,
    item: source.item,
    unit: source.unit,
    destination: `Filial ${source.branch} · almoxarifado a confirmar`,
    available,
    target,
    incoming: 0,
    quantity: target - available,
    issues,
    purchaseBlocked,
    reference: `${source.file} · ${source.sheet} · linha ${source.line}. Importado em ${source.importedAt.slice(0, 10)}; data do saldo não informada.`,
    consumption:
      source.consumption === null
        ? null
        : `${source.consumption} ${source.unit} no relatório${source.period ? ` · período ${source.period}` : " · período não informado"}`,
    conflicts: source.conflicts,
  };
}
