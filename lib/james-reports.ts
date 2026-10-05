import { ActionError } from "./permissions";
import { commandText } from "./james-commands";
import type { JamesStep } from "./james-model";

export type JamesReportContext = {
  view: string;
  action: "requests" | "dashboard";
  filters: Record<string, string>;
};
const views = [
  "pecas",
  "por-peca",
  "geral",
  "bloco",
  "estoque",
  "requisicoes",
  "compra",
  "recomendacoes",
];
const fields = [
  "unit",
  "group",
  "threshold",
  "limit",
  "from",
  "to",
  "block",
  "blocks",
  "code",
  "warehouse",
  "status",
  "priority",
  "page",
];
export function reportContext(value: unknown): JamesReportContext | undefined {
  if (value === undefined || value === null) return;
  if (typeof value !== "object" || Array.isArray(value))
    throw new ActionError("Contexto de relatório inválido.", 422);
  const v = value as JamesReportContext;
  if (
    !views.includes(v.view) ||
    !["requests", "dashboard"].includes(v.action) ||
    !v.filters ||
    typeof v.filters !== "object" ||
    Array.isArray(v.filters) ||
    Object.entries(v.filters).some(
      ([k, x]) =>
        !fields.includes(k) || typeof x !== "string" || x.length > 128,
    )
  )
    throw new ActionError("Filtros de contexto inválidos.", 422);
  return { view: v.view, action: v.action, filters: { ...v.filters } };
}
export function explicitReportPlan(
  message: string,
  context?: JamesReportContext,
): JamesStep[] | undefined {
  const text = commandText(message);
  if (
    /^(?:leia|mostre|consulte|abra|acesse) (?:o |a )?dashboard (?:de )?pecas?$/.test(
      text,
    )
  )
    return [{ action: "dashboard", view: "pecas" }];
  if (
    /^(?:leia|mostre|consulte|abra|acesse) (?:o |a )?dashboard por peca$/.test(
      text,
    )
  )
    return [{ action: "dashboard", view: "por-peca" }];
  const nav = text.match(
    /^(?:abra|acesse) (?:o |a |as |os )?(catalogo|estoque|requisicoes|transferencias|rotas|recomendacoes|compra|mapa|perfil|historico|funcionarios|devolucoes|dashboard)$/,
  );
  if (nav) return [{ action: "navigate", view: nav[1] }];
  const initial = text.match(
    /^(?:(?:leia|mostre|consulte) (?:a |o |as |os |minhas |meu )?|acompanhe minhas )(requisicoes|dashboard(?: geral| do bloco| de estoque)?|recomendacoes|compra)$/,
  );
  if (initial) {
    const view = initial[1].startsWith("dashboard")
      ? initial[1].includes("bloco")
        ? "bloco"
        : initial[1].includes("estoque")
          ? "estoque"
          : "geral"
      : initial[1];
    return [
      { action: view === "requisicoes" ? "requests" : "dashboard", view },
    ];
  }
  if (!context) return;
  let filters = { ...context.filters };
  if (/^(proxima pagina|pagina seguinte|pagina anterior)$/.test(text)) {
    const page =
      Number(filters.page || 1) + (text === "pagina anterior" ? -1 : 1);
    filters.page = String(Math.max(1, page));
  } else if (/^limp(?:e|ar) (?:os )?filtros$/.test(text)) filters = {};
  else {
    const page = text.match(/^pagina (\d+)$/);
    const period = text.match(
      /^(?:periodo|filtre de) (\d{4}-\d{2}-\d{2}) (?:a|ate) (\d{4}-\d{2}-\d{2})$/,
    );
    const filter = message
      .trim()
      .match(
        /^filtre por (status|bloco|c[oó]digo|almoxarifado|urg[eê]ncia|unidade|grupo)\s+(.+)$/i,
      );
    const format = text.match(/^(?:exporte|exportar)(?: em)? (pdf|planilha)$/);
    if (format)
      return [
        {
          action: "export",
          view: context.view,
          filters,
          format: format[1] === "pdf" ? "pdf" : "xlsx",
        },
      ];
    if (page) filters.page = page[1];
    else if (period)
      filters = { ...filters, from: period[1], to: period[2], page: "1" };
    else if (filter) {
      if (
        ["pecas", "por-peca"].includes(context.view) &&
        ["status", "urgencia"].includes(commandText(filter[1]))
      )
        throw new ActionError(
          "Estas dashboards comparam entregas confirmadas. Use período, código, bloco, unidade, grupo ou almoxarifado.",
          422,
        );
      const key = (
        {
          status: "status",
          bloco: "block",
          codigo: "code",
          almoxarifado: "warehouse",
          urgencia: "priority",
          unidade: "unit",
          grupo: "group",
        } as Record<string, string>
      )[commandText(filter[1])];
      const raw = filter[2].replace(/[.!]$/, "");
      const canonical = [
        "Pendente",
        "Em análise",
        "Aprovada",
        "Entregue",
        "Cancelada",
        "Leve",
        "Moderado",
        "Urgente",
      ].find((v) => commandText(v) === commandText(raw));
      filters = { ...filters, [key]: canonical || raw, page: "1" };
      if (["pecas", "por-peca"].includes(context.view) && key === "code")
        delete filters.unit;
    } else return;
  }
  return [{ action: context.action, view: context.view, filters }];
}
