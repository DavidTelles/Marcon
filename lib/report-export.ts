import type { operationsReport } from "./operations-report";
type Report = Awaited<ReturnType<typeof operationsReport>>;
const columns = [
  ["code", "Código"],
  ["item", "Item"],
  ["unit", "Unidade"],
  ["block", "Bloco"],
  ["warehouse", "Almoxarifado"],
  ["location", "Localização"],
  ["withdrawals", "Baixadas"],
  ["entries", "Entradas"],
  ["returns", "Devoluções"],
  ["physical", "Saldo físico"],
  ["reserved", "Reservado"],
  ["available", "Disponível"],
  ["configuredMinimum", "Mínimo cadastrado"],
  ["minimum", "Mínimo sugerido"],
  ["target", "Alvo"],
  ["forecast", "Previsão no prazo"],
  ["incoming", "Entradas confirmadas"],
  ["buy", "Compra sugerida"],
  ["transfer", "Transferência sugerida"],
  ["cost", "Custo estimado"],
  ["priceLabel", "Origem do preço"],
] as const;
export async function exportReport(report: Report, format: "pdf" | "xlsx") {
  if (format === "xlsx") {
    const ExcelJS = await import("exceljs");
    const book = new ExcelJS.Workbook();
    book.creator = "MARCON";
    const sheet = book.addWorksheet("Estoque e consumo");
    sheet.addRow(["MARCON", report.period.from, report.period.to]);
    sheet.addRow([report.source]);
    sheet.addRow(["Gerado em", report.generatedAt]);
    sheet.addRow(columns.map((c) => c[1]));
    for (const r of report.rows) sheet.addRow(columns.map(([key]) => r[key]));
    sheet.views = [{ state: "frozen", ySplit: 4 }];
    sheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: Math.max(4, sheet.rowCount), column: columns.length },
    };
    sheet.columns.forEach((c, i) => {
      c.width = [1, 3, 4, 5, 19].includes(i) ? 30 : 18;
    });
    sheet.getRow(4).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(4).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF203DA4" },
    };
    sheet.getColumn(columns.findIndex((c) => c[0] === "cost") + 1).numFmt =
      '"R$" #,##0.00';
    const methods = book.addWorksheet("Métodos e limites");
    methods.addRow([
      "Código",
      "Local",
      "Método",
      "Dias",
      "Confiança",
      "MAE diário",
      "WAPE",
      "Justificativa",
    ]);
    for (const r of report.rows)
      methods.addRow([
        r.code,
        r.warehouse,
        r.analysis.method,
        r.analysis.days,
        r.analysis.confidence,
        r.analysis.mae,
        r.analysis.wape,
        r.analysis.reason,
      ]);
    methods.columns.forEach((c) => (c.width = 25));
    return Buffer.from(await book.xlsx.writeBuffer());
  }
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  // Uma ficha por item/local evita cortar dezenas de colunas em impressão.
  const clean = (s: unknown) =>
    String(s ?? "").replace(/[^\x20-\x7e\xa0-\xff]/g, " ");
  for (let offset = 0; offset < Math.max(1, report.rows.length); offset += 3) {
    const page = pdf.addPage([842, 595]);
    page.drawText("MARCON | Estoque, consumo e planejamento", {
      x: 28,
      y: 565,
      size: 16,
      font: bold,
      color: rgb(0.12, 0.24, 0.64),
    });
    page.drawText(
      `${report.period.from} a ${report.period.to} | ${report.generatedAt}`,
      { x: 28, y: 544, size: 9, font },
    );
    const rows = report.rows.slice(offset, offset + 3);
    if (!rows.length)
      page.drawText("Nenhum registro no período/escopo.", {
        x: 28,
        y: 500,
        size: 12,
        font,
      });
    rows.forEach((r, i) => {
      const top = 515 - i * 157;
      const fields = columns.map(
        ([key, label]) => `${label}: ${clean(r[key])}`,
      );
      page.drawText(clean(`${r.code} | ${r.item}`).slice(0, 115), {
        x: 28,
        y: top,
        size: 11,
        font: bold,
      });
      fields.forEach((f, j) =>
        page.drawText(f.slice(0, 78), {
          x: 28 + (j % 2) * 395,
          y: top - 18 - Math.floor(j / 2) * 11,
          size: 8,
          font,
        }),
      );
      page.drawText(
        clean(
          `${r.analysis.method} | ${r.analysis.confidence} | MAE: ${r.analysis.mae?.toFixed(2) ?? "sem validação"} | ${r.analysis.days} dias`,
        ).slice(0, 150),
        { x: 28, y: top - 144, size: 8, font },
      );
    });
    page.drawText(
      "Fonte: baixas efetivas no MySQL. Previsão não garante precisão. Valores internos sem frete/impostos cotados.",
      { x: 28, y: 15, size: 8, font },
    );
  }
  return Buffer.from(await pdf.save());
}

export async function exportDashboard(
  report: import("./dashboard-report").DashboardReport,
  format: "pdf" | "xlsx",
) {
  const metadata = [
    ["Dashboard", report.title],
    ["Período", report.methodology.period],
    ["Escopo", report.scope],
    ["Filtros", JSON.stringify(report.filters)],
    ["Gerado em (UTC)", report.generatedAt],
    ["Origem", report.methodology.source],
    ...report.methodology.definitions.map((v) => ["Definição", v]),
    ...report.methodology.formulas.map((v) => ["Fórmula / limite", v]),
  ];
  const headers = [
    "ID",
    "Item",
    "Código",
    "Quantidade",
    "Unidade",
    "Bloco",
    "Almoxarifado",
    "Status",
    "Urgência",
    "Requisitor",
    "Responsável",
    "Data UTC",
    "Motivo",
    "Físico",
    "Reservado",
    "Disponível",
    "Mínimo",
    "Custo estimado",
    "Tempo entrega (h)",
  ];
  const values = (r: import("./dashboard-report").DetailRecord) => [
    r.id,
    r.item,
    r.code,
    r.quantity,
    r.unit,
    r.block,
    r.warehouse,
    r.status,
    r.priority,
    r.person,
    r.actor,
    r.date,
    r.reason,
    r.physical ?? "",
    r.reserved ?? "",
    r.available ?? "",
    r.minimum ?? "",
    r.cost ?? "",
    r.hours ?? "",
  ];
  if (format === "xlsx") {
    const ExcelJS = await import("exceljs"),
      book = new ExcelJS.Workbook();
    book.creator = "MARCON";
    const add = (name: string, rows: unknown[][]) => {
      const s = book.addWorksheet(name);
      for (const r of rows) s.addRow(r);
      s.views = [{ state: "frozen", ySplit: 1 }];
      s.columns.forEach((c) => (c.width = 26));
      s.getRow(1).font = { bold: true };
      s.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFEAF0FF" },
      };
      return s;
    };
    add("Indicadores", [
      ["Indicador", "Valor", "Unidade", "Período", "Escopo", "Atualização"],
      ...report.metrics.map((m) => [
        m.label,
        m.breakdown.length
          ? m.breakdown.map((b) => `${b.quantity} ${b.unit}`).join(" / ")
          : m.value,
        m.unit,
        m.period,
        m.scope,
        m.updatedAt,
      ]),
    ]);
    add("Registros", [headers, ...report.details.records.map(values)]);
    add("Etapas", [
      ["Requisição", "Etapa", "Data UTC"],
      ...report.details.records.flatMap((r) =>
        (r.timeline ?? []).map((e) => [
          r.id,
          e.label,
          e.at ?? "Não registrada",
        ]),
      ),
    ]);
    add("Estoque e previsão", [
      [
        "Código",
        "Item",
        "Local",
        "Unidade",
        "Físico",
        "Reservado",
        "Disponível",
        "Mínimo",
        "Retiradas",
        "Entradas",
        "Devoluções",
        "Prazo (dias)",
        "Previsão",
        "Transferir",
        "Comprar",
        "Preço unitário",
        "Fonte",
        "Data preço",
        "Custo",
        "Método",
        "MAE",
        "WAPE",
        "Confiança",
      ],
      ...report.rows.map((r) => [
        r.code,
        r.item,
        r.warehouse,
        r.unit,
        r.physical,
        r.reserved,
        r.available,
        r.configuredMinimum,
        r.withdrawals,
        r.entries,
        r.returns,
        r.leadDays,
        r.forecast,
        r.transfer,
        r.buy,
        r.unitPrice,
        r.priceLabel,
        r.priceDate ?? "Não registrada",
        r.cost,
        r.analysis.method,
        r.analysis.mae,
        r.analysis.wape,
        r.analysis.confidence,
      ]),
    ]);
    add("Evolução", [
      ["Data", "Unidade", "Movimento", "Quantidade"],
      ...report.daily.map((r) => [r.date, r.unit, r.kind, r.quantity]),
    ]);
    add("Metodologia", [["Campo", "Descrição"], ...metadata]);
    return Buffer.from(await book.xlsx.writeBuffer());
  }
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib"),
    pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]),
    y = 794;
  const clean = (v: unknown) =>
    String(v ?? "Não registrado").replace(/[^\x20-\x7e\xa0-\xff]/g, " ");
  function newPage() {
    page = pdf.addPage([595, 842]);
    y = 794;
  }
  function line(text: unknown, strong = false, size = 10) {
    const face = strong ? bold : font;
    let rest = clean(text);
    while (rest.length) {
      if (y < 48) newPage();
      let end = rest.length;
      while (end > 1 && face.widthOfTextAtSize(rest.slice(0, end), size) > 499)
        end--;
      if (end < rest.length) {
        const space = rest.lastIndexOf(" ", end);
        if (space > 0) end = space;
      }
      page.drawText(rest.slice(0, end), {
        x: 48,
        y,
        size,
        font: face,
        color: strong ? rgb(0.11, 0.25, 0.61) : rgb(0.06, 0.12, 0.22),
      });
      y -= size + 5;
      rest = rest.slice(end).trimStart();
    }
    if (!String(text ?? "").length) y -= 10;
  }
  line("MARCON | " + report.title, true, 17);
  line(report.methodology.period + " | " + report.scope);
  line("Gerado em UTC: " + report.generatedAt);
  y -= 12;
  for (const m of report.metrics) {
    line(
      m.label +
        ": " +
        (m.breakdown.length
          ? m.breakdown.map((b) => `${b.quantity} ${b.unit}`).join(" / ")
          : m.value === null
            ? "Sem dados"
            : Number(m.value.toFixed(2))) +
        " " +
        m.unit,
      true,
    );
    line(m.period + " | " + m.definition, false, 9);
    y -= 5;
  }
  line(
    "Registros: " +
      report.details.total +
      " | " +
      metricLabel(report.filters.metric),
    true,
    14,
  );
  for (const r of report.details.records) {
    if (y < 150) newPage();
    line("#" + r.id + " | " + r.item, true, 12);
    const vals = values(r);
    headers.forEach((h, i) => {
      if (vals[i] !== "" && vals[i] !== undefined)
        line(h + ": " + vals[i], false, 9);
    });
    for (const t of r.timeline ?? [])
      line(t.label + ": " + (t.at ?? "Não registrada"), false, 9);
    y -= 16;
  }
  if (["estoque", "compra", "geral", "bloco"].includes(report.view))
    for (const r of report.rows) {
      if (y < 150) newPage();
      line(r.code + " | " + r.item + " | " + r.warehouse, true, 12);
      line(
        `Físico ${r.physical}; reservado ${r.reserved}; disponível ${r.available}; mínimo ${r.configuredMinimum} ${r.unit}.`,
      );
      line(
        `Prazo ${r.leadDays} dias; previsão ${r.forecast}; transferência ${r.transfer}; compra ${r.buy}.`,
      );
      line(
        `Preço unitário: ${r.unitPrice ?? "Indisponível"}; custo estimado: R$ ${r.cost.toFixed(2)}; data: ${r.priceDate ?? "Não registrada"}.`,
      );
      line(r.priceLabel);
      line(
        `${r.analysis.method}; ${r.analysis.confidence}; MAE ${r.analysis.mae ?? "Indisponível"}; WAPE ${r.analysis.wape ?? "Indisponível"}.`,
      );
      line(r.analysis.reason);
      y -= 12;
    }
  newPage();
  line("Metodologia e filtros", true, 16);
  for (const [k, v] of metadata) line(k + ": " + v, false, 9);
  pdf.getPages().forEach((p, i) =>
    p.drawText(`${i + 1} / ${pdf.getPageCount()} | MARCON`, {
      x: 48,
      y: 25,
      size: 8,
      font,
    }),
  );
  return Buffer.from(await pdf.save());
}
function metricLabel(metric: import("./dashboard-definitions").Metric) {
  return metric;
}
