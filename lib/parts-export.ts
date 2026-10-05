import type { PartsConsumptionReport } from "./parts-consumption";

/** Aggregate export: every filtered material/block, not just the visible page. */
export async function exportPartsReport(
  r: PartsConsumptionReport,
  format: "pdf" | "xlsx",
) {
  const metadata: (string | number)[][] = [
    ["MARCON", "Peça / Por Peça · quantidade entregue"],
    [
      "Recorte",
      "Todos os resultados agregados filtrados; não inclui linhas individuais de origem",
    ],
    ["Período UTC", r.period.from, r.period.to],
    ["Anterior UTC", r.comparison.from, r.comparison.to],
    ["Unidade", r.filters.unit],
    ["Escopo", r.scope],
    ["Filtros", JSON.stringify(r.filters)],
    ["Atualização UTC", r.generatedAt],
    ["Base", r.methodology],
    ["Participação", r.participation],
    ["Pedidos", r.cohortMethod],
    ["Custos", r.quality.financialUnavailable],
    ["Cobertura", r.quality.coverageUnavailable],
    [
      "Alerta",
      `Atual > média de 3 períodos anteriores equivalentes com atividade × (1 + ${r.threshold}/100)`,
    ],
    ["Sem bloco (linhas)", r.quality.missingBlock],
    ["Outras unidades sem conversão (materiais)", r.quality.nonConvertible],
    ["Sem custo oficial (materiais entregues)", r.quality.missingCost],
    [
      "Sem preço de referência (materiais entregues)",
      r.quality.missingReferencePrice,
    ],
    ["Histórico insuficiente (materiais)", r.quality.insufficientHistory],
    [
      "Legado entregue sem baixa (pedidos excluídos)",
      r.quality.legacyWithoutLedger,
    ],
  ];
  type Cell = string | number | null;
  const sections: { title: string; headers: string[]; rows: Cell[][] }[] = [
    {
      title: "Materiais",
      headers: [
        "Código",
        "Descrição",
        "Unidade",
        "Entregue",
        "Anterior",
        "Diferença",
        "Variação %",
        "Retiradas",
        "Média por retirada",
      ],
      rows: r.items.map((p) => [
        p.code,
        p.name,
        p.unit,
        p.quantity,
        p.previousQuantity,
        p.difference,
        p.change,
        p.withdrawals,
        p.average,
      ]),
    },
    {
      title: "Blocos",
      headers: [
        "Bloco",
        "Unidade",
        "Entregue",
        "Anterior",
        "Diferença",
        "Variação %",
        "Participação %",
        "Retiradas",
        "Média por retirada",
      ],
      rows: r.blocks.map((b) => [
        b.label,
        r.filters.unit,
        b.quantity,
        b.previousQuantity,
        b.difference,
        b.change,
        b.percentage,
        b.withdrawals,
        b.average,
      ]),
    },
    {
      title: "Evolução",
      headers: ["Série", "Data UTC", "Unidade", "Entregue"],
      rows: r.daily.map((d) => [d.series, d.date, r.filters.unit, d.quantity]),
    },
    {
      title: "Pedidos",
      headers: [
        "Bloco",
        "Unidade",
        "Solicitada",
        "Entregue até atualização",
        "Pendente de confirmação",
      ],
      rows: r.cohort.map((c) => [
        c.block,
        r.filters.unit,
        c.requested,
        c.delivered,
        c.pending,
      ]),
    },
    {
      title: "Devoluções",
      headers: [
        "Código",
        "Bloco",
        "Condição",
        "Unidade",
        "Quantidade",
        "Registros",
        "Sem vínculo ao pedido",
      ],
      rows: r.returns.map((v) => [
        v.code,
        v.block,
        v.condition,
        r.filters.unit,
        v.quantity,
        v.records,
        v.unlinked,
      ]),
    },
    {
      title: "Distribuição",
      headers: ["Bloco", "Almoxarifado de origem", "Unidade", "Entregue"],
      rows: r.distribution.map((d) => [
        d.block,
        d.warehouse,
        r.filters.unit,
        d.quantity,
      ]),
    },
    {
      title: "Saldos atuais",
      headers: [
        "Código",
        "Almoxarifado",
        "Unidade",
        "Físico",
        "Disponível",
        "Mínimo local",
      ],
      rows: r.stocks.map((s) => [
        s.code,
        s.warehouse,
        r.filters.unit,
        s.physical,
        s.available,
        s.minimum,
      ]),
    },
    {
      title: "Transferências",
      headers: ["ID do movimento", "Data UTC", "Código", "Descrição", "Unidade", "Quantidade", "Etapa", "Origem", "Destino", "Responsável"],
      rows: r.transferEvents.map((event) => [event.id,event.date,event.code,event.name,event.unit,event.quantity,event.kind,event.origin,event.destination,event.actor]),
    },
    {
      title: "Alertas",
      headers: [
        "Código",
        "Unidade",
        "Atual",
        "Média anterior",
        "Limiar %",
        "Períodos anteriores",
      ],
      rows: r.items
        .filter((p) => p.alert)
        .map((p) => [
          p.code,
          p.unit,
          p.quantity,
          p.alert!.baseline,
          r.threshold,
          p.alert!.history.join(", "),
        ]),
    },
  ];
  if (format === "xlsx") {
    const ExcelJS = await import("exceljs");
    const book = new ExcelJS.Workbook();
    book.creator = "MARCON";
    const methods = book.addWorksheet("Metodologia");
    metadata.forEach((row) => methods.addRow(row));
    methods.columns = [{ width: 34 }, { width: 100 }, { width: 24 }];
    methods.eachRow((row) => {
      row.alignment = { wrapText: true, vertical: "top" };
    });
    for (const section of sections) {
      const sheet = book.addWorksheet(section.title);
      sheet.addRow(section.headers);
      section.rows.forEach((row) => sheet.addRow(row));
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.columns.forEach((col) => {
        col.width = 25;
      });
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF155486" },
      };
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: {
          row: Math.max(1, sheet.rowCount),
          column: section.headers.length,
        },
      };
    }
    return Buffer.from(await book.xlsx.writeBuffer());
  }
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const clean = (v: unknown) =>
    String(v ?? "Indisponível / sem base percentual").replace(
      /[^\x20-\x7e\xa0-\xff]/g,
      " ",
    );
  let page = pdf.addPage([842, 595]),
    y = 559;
  function write(text: string, strong = false) {
    const f = strong ? bold : font,
      size = strong ? 12 : 9;
    // Wrap by actual font width so long descriptions and methodology are preserved.
    const words = clean(text).split(/\s+/);
    let line = "";
    const emit = () => {
      if (y < 35) {
        page = pdf.addPage([842, 595]);
        y = 559;
      }
      page.drawText(line, {
        x: 28,
        y,
        size,
        font: f,
        color: strong ? rgb(0.08, 0.3, 0.5) : rgb(0.12, 0.16, 0.2),
      });
      y -= strong ? 20 : 14;
    };
    for (const word of words) {
      if (line && f.widthOfTextAtSize(`${line} ${word}`, size) > 780) {
        emit();
        line = word;
      } else line += (line ? " " : "") + word;
    }
    if (line) emit();
    y -= 4;
  }
  metadata.forEach((row, i) => write(row.join(" | "), i === 0));
  for (const section of sections) {
    write(section.title, true);
    if (!section.rows.length) write("Nenhum registro neste filtro.");
    section.rows.forEach((row) =>
      write(
        row
          .map((cell, i) => `${section.headers[i]}: ${clean(cell)}`)
          .join(" | "),
      ),
    );
  }
  return Buffer.from(await pdf.save());
}
