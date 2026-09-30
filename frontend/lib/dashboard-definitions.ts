import type { Account } from "./accounts";
import { ActionError } from "./permissions";
export const dashboardViews = [
  "geral",
  "bloco",
  "estoque",
  "requisicoes",
  "compra",
] as const;
export type DashboardView = (typeof dashboardViews)[number];
export const dashboardTitles: Record<DashboardView, string> = {
  geral: "Visão geral",
  bloco: "Dashboard do bloco",
  estoque: "Dashboard de estoque",
  requisicoes: "Dashboard de requisições",
  compra: "Consumo e planejamento",
};
export const metricDefinitions = {
  missingLocation: {
    label: "Posições sem localização completa",
    unit: "item/local",
    definition: "Posições com corredor ou prateleira não preenchidos.",
  },
  insufficientHistory: {
    label: "Histórico insuficiente",
    unit: "item/local",
    definition:
      "Posições cuja previsão usa regra simples por falta de histórico suficiente.",
  },
  missingPrice: {
    label: "Preço sem data verificável",
    unit: "item/local",
    definition:
      "Posições sem registro de data para o valor interno atual. Não representa cotação de mercado.",
  },
  pending: {
    label: "Pedidos pendentes",
    unit: "requisições",
    definition:
      "Linhas de requisição criadas no período e ainda pendentes, em análise, aprovadas ou aguardando cancelamento.",
  },
  urgent: {
    label: "Pedidos urgentes",
    unit: "requisições",
    definition:
      "Requisições abertas com urgência Urgente; pedidos entregues e cancelados não entram.",
  },
  requests: {
    label: "Pedidos criados",
    unit: "requisições",
    definition:
      "Linhas de requisição criadas no período. Um carrinho pode gerar várias linhas. Não representa retirada de estoque.",
  },
  anomalies: {
    label: "Anormalidades",
    unit: "requisições",
    definition:
      "Requisições não canceladas com urgência Urgente ou justificativa registrada. Não indica fraude.",
  },
  critical: {
    label: "Abaixo do mínimo",
    unit: "item/local",
    definition:
      "Locais com saldo disponível atual inferior ao mínimo cadastrado.",
  },
  idle: {
    label: "Itens parados",
    unit: "item/local",
    definition:
      "Saldo físico atual positivo sem baixa efetiva no período selecionado; não significa obsolescência.",
  },
  withdrawals: {
    label: "Retiradas efetivas",
    unit: "unidades cadastradas",
    definition:
      "Soma de stock_movements.kind=saida no período. Exclui pedidos não entregues, transferências e ajustes. Unidades diferentes são separadas no gráfico e nos detalhes.",
  },
  entries: {
    label: "Entradas",
    unit: "unidades cadastradas",
    definition:
      "Soma de kind=entrada no período. Não inclui devoluções, ajustes nem transferências.",
  },
  returns: {
    label: "Devoluções conferidas",
    unit: "unidades cadastradas",
    definition:
      "Soma de kind=devolucao no período; somente material apto já conferido.",
  },
  delivery: {
    label: "Tempo médio de entrega",
    unit: "horas",
    definition:
      "Média entre criação e entrega das requisições entregues no período, com horários válidos. Recebimento do requisitor é outra etapa.",
  },
  buy: {
    label: "Compra sugerida",
    unit: "item/local",
    definition:
      "Locais com necessidade positiva: máximo de zero, alvo menos disponível, entradas confirmadas e transferência possível.",
  },
  stock: {
    label: "Posições de estoque",
    unit: "item/local",
    definition:
      "Saldo físico, reservado e disponível atuais. Disponível = físico - reservado; o período se aplica às movimentações.",
  },
} as const;
export type Metric = keyof typeof metricDefinitions;
export type DashboardFilter = {
  view: DashboardView;
  from: string;
  to: string;
  block: string;
  requester: string;
  sector: string;
  code: string;
  warehouse: string;
  status: string;
  priority: string;
  page: number;
  pageSize: number;
  metric: Metric;
};
const statuses = [
  "Pendente",
  "Em análise",
  "Aprovada",
  "Entregue",
  "Cancelada",
  "Cancelamento solicitado",
];
export function dashboardFilters(
  user: Account,
  q: URLSearchParams,
): DashboardFilter {
  const view = q.get("dashboard") || "geral";
  if (!dashboardViews.includes(view as DashboardView))
    throw new ActionError("Dashboard inválida.");
  if (user.role === "funcionario" && !["requisicoes"].includes(view))
    throw new ActionError("Dashboard fora do seu perfil.", 403);
  if (user.role === "lider" && !["bloco", "requisicoes"].includes(view))
    throw new ActionError("Acesso limitado ao próprio bloco.", 403);
  if (
    q.get("consolidated") === "1" &&
    !["admin", "almoxarifado"].includes(user.role)
  )
    throw new ActionError("Relatório consolidado não autorizado.", 403);
  const today = new Date().toISOString().slice(0, 10),
    from =
      q.get("from") ||
      new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
    to = q.get("to") || today;
  const date = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  if (
    !date(from) ||
    !date(to) ||
    from > to ||
    to > today ||
    (Date.parse(to) - Date.parse(from)) / 86400000 > 365
  )
    throw new ActionError(
      "Período inválido: use até 366 dias, sem datas futuras.",
    );
  const block = q.get("block") || "",
    requester = q.get("requester") || "",
    sector = (q.get("sector") || "").trim(),
    code = (q.get("code") || "").trim().toUpperCase(),
    warehouse = q.get("warehouse") || "",
    status = q.get("status") || "",
    priority = q.get("priority") || "";
  if ([block, requester, code, warehouse, sector].some((s) => s.length > 128))
    throw new ActionError("Filtro muito longo.");
  if (user.role === "lider" && block && block !== user.block)
    throw new ActionError("Bloco fora do seu escopo.", 403);
  if (
    user.role === "funcionario" &&
    ((requester && requester !== user.id) || (block && block !== user.block))
  )
    throw new ActionError("Requisição fora do seu escopo.", 403);
  if (
    (status && !statuses.includes(status)) ||
    (priority && !["Leve", "Moderado", "Urgente"].includes(priority))
  )
    throw new ActionError("Estado/urgência inválido.");
  const page = Number(q.get("page") || 1),
    pageSize = Number(q.get("pageSize") || 12),
    metric =
      q.get("metric") ||
      (["estoque", "compra"].includes(view) ? "stock" : "requests");
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 50 ||
    !Object.hasOwn(metricDefinitions, metric)
  )
    throw new ActionError("Paginação/indicador inválido.");
  return {
    view: view as DashboardView,
    from,
    to,
    block:
      user.role === "lider"
        ? (user.block ?? "")
        : user.role === "funcionario"
          ? (user.block ?? "")
          : block,
    requester: user.role === "funcionario" ? user.id : requester,
    sector,
    code,
    warehouse,
    status,
    priority,
    page,
    pageSize,
    metric: metric as Metric,
  };
}
export function requestWhere(user: Account, f: DashboardFilter, period = true) {
  const clauses: string[] = ["1=1"],
    params: (string | number)[] = [];
  if (user.role === "funcionario") {
    clauses.push("u.employee_no=?");
    params.push(user.id);
  }
  if (user.role === "lider") {
    clauses.push("b.name=?");
    params.push(user.block ?? "");
  }
  for (const [value, col] of [
    [f.block, "b.name"],
    [f.requester, "u.employee_no"],
    [f.sector, "r.sector"],
    [f.code, "p.code"],
    [f.status, "r.status"],
    [f.priority, "r.priority"],
  ])
    if (value) {
      clauses.push(col + "=?");
      params.push(value);
    }
  if (period) {
    clauses.push("r.created_at>=? AND r.created_at<DATE_ADD(?,INTERVAL 1 DAY)");
    params.push(f.from, f.to);
  }
  if (f.warehouse) {
    clauses.push(
      "(EXISTS(SELECT 1 FROM request_reservations ra JOIN warehouses w ON w.id=ra.warehouse_id WHERE ra.request_id=r.id AND w.name=?) OR EXISTS(SELECT 1 FROM stock_movements sm JOIN warehouses w ON w.id=sm.warehouse_id WHERE sm.request_id=r.id AND w.name=?))",
    );
    params.push(f.warehouse, f.warehouse);
  }
  return { sql: clauses.join(" AND "), params };
}
export const requestJoins =
  "FROM requests r JOIN users u ON u.id=r.requester_id JOIN blocks b ON b.id=r.block_id JOIN parts p ON p.id=r.part_id";
