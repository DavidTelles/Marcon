import type { Account } from "./accounts";
import type { RowDataPacket } from "./db-types";
import { getPool } from "./db";
import { operationsReport } from "./operations-report";
import { ActionError } from "./permissions";
import { graphProblems } from "./routing";
import {
  dashboardFilters,
  dashboardTitles,
  metricDefinitions,
  requestWhere,
  requestJoins,
  type DashboardFilter,
  type Metric,
} from "./dashboard-definitions";
export type DetailRecord = {
  id: string;
  kind: "request" | "movement" | "stock";
  item: string;
  code: string;
  quantity: number;
  unit: string;
  block: string;
  warehouse: string;
  status: string;
  priority: string;
  person: string;
  actor: string;
  date: string;
  reason: string;
  physical?: number;
  reserved?: number;
  available?: number;
  minimum?: number;
  cost?: number;
  hours?: number | null;
  timeline?: { label: string; at: string | null }[];
  request?: import("./demo-data").Request;
};
const open =
  "r.status IN ('Pendente','Em análise','Aprovada','Cancelamento solicitado')";
const requestMetric = (metric: Metric) =>
  ["pending", "urgent", "requests", "anomalies", "delivery"].includes(metric);
const movementMetric = (metric: Metric) =>
  ["withdrawals", "entries", "returns"].includes(metric);
function metricPredicate(metric: Metric) {
  return metric === "pending"
    ? open
    : metric === "urgent"
      ? open + " AND r.priority='Urgente'"
      : metric === "anomalies"
        ? "r.status<>'Cancelada' AND (r.priority='Urgente' OR COALESCE(r.justification,'')<>'')"
        : "1=1";
}
async function validateReferences(f: DashboardFilter) {
  const pool = getPool();
  for (const [value, sql] of [
    [f.block, "SELECT id FROM blocks WHERE name=?"],
    [f.warehouse, "SELECT id FROM warehouses WHERE name=? AND active=TRUE"],
    [f.code, "SELECT id FROM parts WHERE code=?"],
    [f.requester, "SELECT id FROM users WHERE employee_no=?"],
  ])
    if (value) {
      const [r] = await pool.execute<RowDataPacket[]>(sql, [value]);
      if (!r.length) throw new ActionError("Filtro não encontrado.");
    }
}
export async function dashboardDetail(
  user: Account,
  f: DashboardFilter,
  offset = (f.page - 1) * f.pageSize,
  limit = f.pageSize,
): Promise<{ records: DetailRecord[]; total: number }> {
  const pool = getPool();
  if (requestMetric(f.metric)) {
    const w = requestWhere(user, f, f.metric !== "delivery");
    let condition = w.sql + " AND " + metricPredicate(f.metric),
      params = w.params;
    if (f.metric === "delivery") {
      condition +=
        " AND r.delivered_at>=? AND r.delivered_at<DATE_ADD(?,INTERVAL 1 DAY) AND r.delivered_at>=r.created_at";
      params = [...params, f.from, f.to];
    }
    const [count] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) total ${requestJoins} WHERE ${condition}`,
      params,
    );
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT r.*,COALESCE((SELECT SUM(m.quantity) FROM stock_movements m WHERE m.request_id=r.id AND m.kind='saida'),0) AS delivered_quantity,p.code,p.name AS item,p.unit,u.name AS person,u.employee_no,b.name AS block,COALESCE(au.name,ap.name,'Não atribuído') AS actor,TIMESTAMPDIFF(SECOND,r.created_at,r.delivered_at)/3600 AS hours ${requestJoins} LEFT JOIN users au ON au.id=r.fulfilled_by LEFT JOIN users ap ON ap.id=r.approved_by WHERE ${condition} ORDER BY CASE WHEN ${open} THEN 0 ELSE 1 END,FIELD(r.priority,'Urgente','Moderado','Leve'),r.created_at,r.id LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    const records: DetailRecord[] = [];
    for (const r of rows) {
      const [allocations] = await pool.execute<RowDataPacket[]>(
        "SELECT w.name AS warehouse,a.quantity,CONCAT(i.aisle,' / ',i.shelf) AS location,i.map_node_id AS nodeId FROM request_reservations a JOIN warehouses w ON w.id=a.warehouse_id JOIN inventory i ON i.part_id=a.part_id AND i.warehouse_id=a.warehouse_id WHERE a.request_id=?",
        [r.id],
      );
      const [events] = await pool.execute<RowDataPacket[]>(
        "SELECT created_at,JSON_UNQUOTE(JSON_EXTRACT(details,'$.status')) AS status FROM audit_log WHERE entity_type='request' AND entity_id=? AND action='changeRequestStatus' ORDER BY created_at LIMIT 100",
        [r.id],
      );
      const request = {
        id: Number(r.id),
        code: String(r.code),
        material: String(r.item),
        quantity: Number(r.quantity),
        requestedQuantity: Number(r.quantity),
        approvedQuantity: r.approved_at ? Number(r.quantity) : 0,
        deliveredQuantity: Number(r.delivered_quantity),
        person: String(r.person),
        block: String(r.block),
        sector: String(r.sector),
        date: String(r.created_at).slice(0, 10),
        status: r.status,
        priority: r.priority,
        justification: r.justification ?? undefined,
        requesterId: String(r.employee_no),
        createdAt: r.created_at,
        deliveredAt: r.delivered_at ?? undefined,
        receivedAt: r.received_at ?? undefined,
        batchId: r.batch_id ?? undefined,
        cancellationReason: r.cancellation_reason ?? undefined,
        reserved: allocations.reduce((s, a) => s + Number(a.quantity), 0),
        allocations: allocations.map((a) => ({
          warehouse: String(a.warehouse),
          quantity: Number(a.quantity),
          location: String(a.location),
          nodeId: a.nodeId ?? undefined,
        })),
      };
      const timeline = [
        { label: "Criada", at: r.created_at },
        {
          label: "Em análise",
          at: events.find((e) => e.status === "Em análise")?.created_at ?? null,
        },
        { label: "Aprovada / reservada", at: r.approved_at },
        { label: "Entregue / baixada", at: r.delivered_at },
        { label: "Recebimento confirmado", at: r.received_at },
      ];
      if (r.status === "Cancelada")
        timeline.push({
          label: "Cancelada",
          at:
            events.find((e) => e.status === "Cancelada")?.created_at ??
            r.updated_at,
        });
      records.push({
        id: String(r.id),
        kind: "request",
        item: r.item,
        code: r.code,
        quantity: Number(r.quantity),
        unit: r.unit,
        block: r.block,
        warehouse: allocations.map((a) => a.warehouse).join(", "),
        status: r.status,
        priority: r.priority,
        person: r.person,
        actor: r.actor,
        date: r.created_at,
        reason: r.justification || "",
        hours: r.hours === null ? null : Number(r.hours),
        timeline,
        request,
      });
    }
    return { records, total: Number(count[0].total) };
  }
  if (movementMetric(f.metric)) {
    const w = requestWhere(user, { ...f, warehouse: "" }, false),
      kind = { withdrawals: "saida", entries: "entrada", returns: "devolucao" }[
        f.metric as "withdrawals" | "entries" | "returns"
      ];
    const condition = `${w.sql} AND m.kind=? AND m.created_at>=? AND m.created_at<DATE_ADD(?,INTERVAL 1 DAY) ${f.warehouse ? "AND w.name=?" : ""}`,
      params = [
        ...w.params,
        kind,
        f.from,
        f.to,
        ...(f.warehouse ? [f.warehouse] : []),
      ];
    const joins =
      "FROM stock_movements m JOIN parts p ON p.id=m.part_id JOIN warehouses w ON w.id=m.warehouse_id JOIN users actor ON actor.id=m.actor_id LEFT JOIN requests r ON r.id=m.request_id LEFT JOIN users u ON u.id=r.requester_id LEFT JOIN blocks b ON b.id=m.block_id";
    const [count] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) total ${joins} WHERE ${condition}`,
      params,
    );
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT m.*,p.name AS item,p.code,p.unit,b.name AS block,w.name AS warehouse,u.name AS person,actor.name AS actor ${joins} WHERE ${condition} ORDER BY m.created_at DESC,m.id DESC LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    return {
      total: Number(count[0].total),
      records: rows.map((r) => ({
        id: String(r.id),
        kind: "movement",
        item: r.item,
        code: r.code,
        quantity: Number(r.quantity),
        unit: r.unit,
        block: r.block || "Sem bloco",
        warehouse: r.warehouse,
        status: r.kind,
        priority: "",
        person: r.person || "Não se aplica",
        actor: r.actor,
        date: r.created_at,
        reason: r.reason,
      })),
    };
  }
  throw new ActionError(
    "Indicador de estoque deve usar o relatório calculado.",
  );
}
export async function dashboardReport(
  user: Account,
  q: URLSearchParams,
  full = false,
) {
  const f = dashboardFilters(user, q);
  const part = q.get("part");
  if (part) {
    if (part.length > 128) throw new ActionError("Item inválido.");
    const [parts] = await getPool().execute<RowDataPacket[]>(
      "SELECT code FROM parts WHERE code=? OR CAST(id AS TEXT)=? LIMIT 1",
      [part, part],
    );
    if (!parts.length) throw new ActionError("Item não encontrado.", 404);
    f.code = String(parts[0].code);
  }
  if (f.view === "bloco" && !f.block) {
    const [blocks] = await getPool().query<RowDataPacket[]>(
      "SELECT name FROM blocks ORDER BY code LIMIT 1",
    );
    if (!blocks.length)
      throw new ActionError("Cadastre um bloco para consultar esta dashboard.");
    f.block = String(blocks[0].name);
  }
  await validateReferences(f);
  if (
    (user.role === "funcionario" &&
      ![
        "pending",
        "urgent",
        "requests",
        "anomalies",
        "delivery",
        "withdrawals",
        "returns",
      ].includes(f.metric)) ||
    (user.role === "lider" && f.metric === "buy")
  )
    throw new ActionError("Indicador fora do seu perfil.", 403);
  const pool = getPool(),
    base = await operationsReport(user, {
      ...f,
      purpose: f.view === "compra" ? "purchase" : "distribution",
    }),
    w = requestWhere(user, f);
  const [requestCounts] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) requests,COALESCE(SUM(CASE WHEN ${open} THEN 1 ELSE 0 END),0) pending,COALESCE(SUM(CASE WHEN ${open} AND r.priority='Urgente' THEN 1 ELSE 0 END),0) urgent,COALESCE(SUM(CASE WHEN r.status<>'Cancelada' AND (r.priority='Urgente' OR COALESCE(r.justification,'')<>'') THEN 1 ELSE 0 END),0) anomalies ${requestJoins} WHERE ${w.sql}`,
    w.params,
  );
  const deliveryWhere = requestWhere(user, f, false);
  const [delivery] = await pool.execute<RowDataPacket[]>(
    `SELECT AVG(TIMESTAMPDIFF(SECOND,r.created_at,r.delivered_at)/3600) hours,COUNT(*) count ${requestJoins} WHERE ${deliveryWhere.sql} AND r.delivered_at>=? AND r.delivered_at<DATE_ADD(?,INTERVAL 1 DAY) AND r.delivered_at>=r.created_at`,
    [...deliveryWhere.params, f.from, f.to],
  );
  const mw = requestWhere(user, { ...f, warehouse: "" }, false),
    mp = [...mw.params, f.from, f.to, ...(f.warehouse ? [f.warehouse] : [])];
  const [daily] = await pool.execute<RowDataPacket[]>(
    `SELECT DATE_FORMAT(m.created_at,'%Y-%m-%d') date,p.unit,m.kind,SUM(m.quantity) quantity FROM stock_movements m JOIN parts p ON p.id=m.part_id JOIN warehouses w ON w.id=m.warehouse_id LEFT JOIN requests r ON r.id=m.request_id LEFT JOIN users u ON u.id=r.requester_id LEFT JOIN blocks b ON b.id=m.block_id WHERE ${mw.sql} AND m.created_at>=? AND m.created_at<DATE_ADD(?,INTERVAL 1 DAY) ${f.warehouse ? "AND w.name=?" : ""} AND m.kind IN ('saida','entrada','devolucao') GROUP BY date,p.unit,m.kind ORDER BY date`,
    mp,
  );
  const [top] = await pool.execute<RowDataPacket[]>(
    `SELECT p.code,p.name item,p.unit,SUM(m.quantity) quantity FROM stock_movements m JOIN parts p ON p.id=m.part_id JOIN warehouses w ON w.id=m.warehouse_id LEFT JOIN requests r ON r.id=m.request_id LEFT JOIN users u ON u.id=r.requester_id LEFT JOIN blocks b ON b.id=m.block_id WHERE ${mw.sql} AND m.created_at>=? AND m.created_at<DATE_ADD(?,INTERVAL 1 DAY) ${f.warehouse ? "AND w.name=?" : ""} AND m.kind='saida' GROUP BY p.id ORDER BY quantity DESC,p.code LIMIT 12`,
    mp,
  );
  const [warehouses] = await pool.query<RowDataPacket[]>(
    "SELECT w.name,b.name AS block FROM warehouses w LEFT JOIN blocks b ON b.id=w.block_id WHERE w.active=TRUE",
  );
  const [prices] = await pool.query<RowDataPacket[]>(
    "SELECT p.code,p.lead_days,p.reference_unit_price,MAX(a.created_at) AS price_date FROM parts p LEFT JOIN audit_log a ON a.entity_type='part' AND a.entity_id=p.id AND a.action IN ('price','create','update') AND JSON_EXTRACT(a.details,'$.referenceUnitPrice')=p.reference_unit_price GROUP BY p.id",
  );
  const rows = base.rows
    .filter(
      (r) =>
        user.role !== "funcionario" &&
        (!f.warehouse || r.warehouse === f.warehouse) &&
        (q.get("planning") === "distribution" ? r.distribution?.matchesFilters : (!f.block ||
          warehouses.some(
            (w) => w.name === r.warehouse && w.block === f.block,
          ))),
    )
    .map((r) => {
      const price = prices.find((p) => p.code === r.code);
      return {
        ...r,
        leadDays: Number(price?.lead_days ?? 0),
        unitPrice: ["admin", "almoxarifado"].includes(user.role)
          ? Number(price?.reference_unit_price ?? 0)
          : null,
        priceDate: price?.price_date ? String(price.price_date) : null,
      };
    });
  const values = {
    missingLocation: rows.filter((r) =>
      r.location.split("/").some((s) => !s.trim()),
    ).length,
    insufficientHistory: rows.filter(
      (r) => r.analysis.confidence === "Dados insuficientes",
    ).length,
    missingPrice: rows.filter((r) => !r.priceDate).length,
    requests: Number(requestCounts[0].requests),
    pending: Number(requestCounts[0].pending),
    urgent: Number(requestCounts[0].urgent),
    anomalies: Number(requestCounts[0].anomalies),
    critical: rows.filter((r) => r.available < r.configuredMinimum).length,
    idle: rows.filter((r) => r.physical > 0 && r.withdrawals === 0).length,
    withdrawals: daily
      .filter((m) => m.kind === "saida")
      .reduce((s, m) => s + Number(m.quantity), 0),
    entries: daily
      .filter((m) => m.kind === "entrada")
      .reduce((s, m) => s + Number(m.quantity), 0),
    returns: daily
      .filter((m) => m.kind === "devolucao")
      .reduce((s, m) => s + Number(m.quantity), 0),
    delivery: delivery[0].hours === null ? null : Number(delivery[0].hours),
    buy: rows.filter((r) => r.buy > 0).length,
    stock: rows.length,
  };
  let selected = rows;
  if (f.metric === "missingLocation")
    selected = rows.filter((r) => r.location.split("/").some((s) => !s.trim()));
  if (f.metric === "insufficientHistory")
    selected = rows.filter(
      (r) => r.analysis.confidence === "Dados insuficientes",
    );
  if (f.metric === "missingPrice") selected = rows.filter((r) => !r.priceDate);
  if (f.metric === "critical")
    selected = rows.filter((r) => r.available < r.configuredMinimum);
  if (f.metric === "idle")
    selected = rows.filter((r) => r.physical > 0 && !r.withdrawals);
  if (f.metric === "buy") selected = rows.filter((r) => r.buy > 0);
  let details: { records: DetailRecord[]; total: number };
  if (requestMetric(f.metric) || movementMetric(f.metric)) {
    details = await dashboardDetail(user, f);
    if (full) {
      if (details.total > 10000)
        throw new ActionError(
          "Mais de 10.000 registros. Reduza o período/filtros para exportar.",
          413,
        );
      details = { records: [], total: details.total };
      for (let offset = 0; offset < details.total; offset += 500)
        details.records.push(
          ...(await dashboardDetail(user, f, offset, 500)).records,
        );
    }
  } else {
    details = {
      total: selected.length,
      records: (full
        ? selected
        : selected.slice((f.page - 1) * f.pageSize, f.page * f.pageSize)
      ).map((r) => ({
        id: r.code + "@" + r.warehouse,
        kind: "stock",
        item: r.item,
        code: r.code,
        quantity: r.available,
        unit: r.unit,
        block: r.block,
        warehouse: r.warehouse,
        status:
          r.available < r.configuredMinimum
            ? "Crítico"
            : r.physical > 0 && !r.withdrawals
              ? "Sem retirada no período"
              : "Regular",
        priority: "",
        person: "",
        actor: "",
        date: base.generatedAt,
        reason: r.analysis.reason,
        physical: r.physical,
        reserved: r.reserved,
        available: r.available,
        minimum: r.configuredMinimum,
        cost: r.cost,
      })),
    };
  }
  const [maps] = await pool.query<RowDataPacket[]>(
    "SELECT id,graph FROM map_versions WHERE status='Publicada'",
  );
  let mapVersion: number | null = null;
  if (maps[0]) {
    const graph =
      typeof maps[0].graph === "string"
        ? JSON.parse(maps[0].graph)
        : maps[0].graph;
    if (!graphProblems(graph).length && graph.reviewed)
      mapVersion = Number(maps[0].id);
  }
  const allowedMetrics = (Object.keys(metricDefinitions) as Metric[])
    .filter(
      (k) =>
        user.role !== "funcionario" ||
        [
          "pending",
          "urgent",
          "requests",
          "anomalies",
          "delivery",
          "withdrawals",
          "returns",
        ].includes(k),
    )
    .filter((k) => user.role !== "lider" || k !== "buy");
  const scope =
    user.role === "funcionario"
      ? "Meus pedidos (" + user.id + ")"
      : f.block || "Todos os blocos autorizados";
  const metrics = allowedMetrics.map((id) => ({
    id,
    ...metricDefinitions[id],
    value: values[id],
    breakdown: movementMetric(id)
      ? [
          ...new Set(
            daily
              .filter(
                (r) =>
                  r.kind ===
                  (
                    {
                      withdrawals: "saida",
                      entries: "entrada",
                      returns: "devolucao",
                    } as Record<string, string>
                  )[id],
              )
              .map((r) => String(r.unit)),
          ),
        ].map((unit) => ({
          unit,
          quantity: daily
            .filter(
              (r) =>
                r.unit === unit &&
                r.kind ===
                  (
                    {
                      withdrawals: "saida",
                      entries: "entrada",
                      returns: "devolucao",
                    } as Record<string, string>
                  )[id],
            )
            .reduce((sum, r) => sum + Number(r.quantity), 0),
        }))
      : [],
    period: ["critical", "stock", "idle", "buy"].includes(id)
      ? "Saldo atual; atividade " + f.from + " a " + f.to
      : f.from + " a " + f.to,
    scope,
    updatedAt: base.generatedAt,
  }));
  const decision = q.get("decision") || "action";
  if (
    ![
      "all",
      "action",
      "transfer",
      "buy",
      "insufficient",
      "analysis",
      "history",
    ].includes(decision)
  )
    throw new ActionError("Filtro de sugestões inválido.");
  const decisionPage = Number(q.get("decisionPage") || 1);
  if (
    !Number.isSafeInteger(decisionPage) ||
    decisionPage < 1 ||
    decisionPage > 100000
  )
    throw new ActionError("Página de sugestões inválida.");
  const proposals = rows.flatMap((row) => {
    const transfers = base.transfers.filter(
      (t) => t.code === row.code && t.to === row.warehouse,
    );
    const cards: {
      action: "transfer" | "buy" | "observe";
      row: typeof row;
      transfer: (typeof base.transfers)[number] | null;
    }[] = transfers.map((transfer) => ({ action: "transfer", row, transfer }));
    if (row.buy > 0 && q.get("planning") !== "distribution")
      cards.push({ action: "buy", row, transfer: null });
    if (!cards.length) cards.push({ action: "observe", row, transfer: null });
    return cards;
  });
  const decisionCards = proposals.filter(
    (c) =>
      decision === "all" ||
      (decision === "action" && c.action !== "observe") ||
      decision === c.action ||
      (decision === "insufficient" &&
        (c.row.analysis.confidence === "Dados insuficientes" ||
          (q.get("planning") === "distribution"
            ? !c.row.distribution?.verified ||
              !!c.row.distribution?.unmappedConsumption
            : !c.row.priceDate))),
  );
  return {
    decisions: {
      filter: decision,
      page: decisionPage,
      total: decisionCards.length,
      cards: decisionCards.slice(
        (decisionPage - 1) * f.pageSize,
        decisionPage * f.pageSize,
      ),
      transfers: proposals.filter((c) => c.action === "transfer").length,
      purchases: proposals.filter((c) => c.action === "buy").length,
      criticalItems: new Set(
        rows
          .filter((r) => r.available < r.configuredMinimum)
          .map((r) => r.code),
      ).size,
      awaitingReview: proposals.filter((c) => c.action !== "observe").length,
    },
    title:
      q.get("planning") === "distribution"
        ? "Recomendação de estoque"
        : f.view === "compra"
          ? "Compra preditiva"
          : dashboardTitles[f.view],
    view: f.view,
    filters: f,
    scope,
    generatedAt: base.generatedAt,
    options: {
      blocks: [
        ...new Set(warehouses.map((w) => w.block).filter(Boolean)),
      ].filter(
        (b) =>
          !["lider", "funcionario"].includes(user.role) || b === user.block,
      ),
      warehouses: warehouses
        .filter(
          (w) =>
            !["lider", "funcionario"].includes(user.role) ||
            w.block === user.block,
        )
        .map((w) => String(w.name)),
    },
    metrics,
    details,
    pages: Math.max(1, Math.ceil(details.total / f.pageSize)),
    rows: full
      ? rows
      : rows.slice((f.page - 1) * f.pageSize, f.page * f.pageSize),
    rowTotal: rows.length,
    stockByItem: rows.map(({ code, item, warehouse, unit, available }) => ({
      code, item, warehouse, unit, available,
    })),
    stockByWarehouse: [
      ...new Set(rows.map((row) => JSON.stringify([row.warehouse, row.unit]))),
    ].map((key) => {
      const [warehouse, unit] = JSON.parse(key) as [string, string];
      const locations = rows.filter(
        (row) => row.warehouse === warehouse && row.unit === unit,
      );
      return {
        warehouse,
        unit,
        available: locations.reduce((sum, row) => sum + row.available, 0),
        reserved: locations.reduce((sum, row) => sum + row.reserved, 0),
        physical: locations.reduce((sum, row) => sum + row.physical, 0),
      };
    }),
    daily: daily.map((r) => ({
      date: String(r.date),
      unit: String(r.unit),
      kind: String(r.kind),
      quantity: Number(r.quantity),
    })),
    top: top.map((r) => ({
      code: String(r.code),
      item: String(r.item),
      unit: String(r.unit),
      quantity: Number(r.quantity),
    })),
    transfers: base.transfers
      .filter((t) =>
        rows.some((r) => r.code === t.code && r.warehouse === t.to),
      )
      .slice(0, 50),
    incoming: base.incoming
      .filter(
        (r) =>
          (!f.code || r.code === f.code) &&
          (!f.warehouse || r.warehouse === f.warehouse),
      )
      .slice(0, 50),
    mapVersion,
    quality: [
      {
        metric: "missingLocation" as Metric,
        label: "Posições sem corredor/prateleira",
        count: rows.filter((r) => r.location.split("/").some((s) => !s.trim()))
          .length,
        detail: "Complete a localização no cadastro do estoque.",
      },
      {
        metric: "insufficientHistory" as Metric,
        label: "Locais com histórico insuficiente",
        count: rows.filter(
          (r) => r.analysis.confidence === "Dados insuficientes",
        ).length,
        detail: "A previsão usa regra simples; não há precisão comprovada.",
      },
      {
        metric: "missingPrice" as Metric,
        label: "Posições sem data verificável de preço",
        count: values.missingPrice,
        detail: "Valores internos não são cotações de mercado.",
      },
      {
        metric: null,
        label: "Mapa publicado válido",
        count: mapVersion ? 1 : 0,
        detail: mapVersion
          ? "Caminhos dependem de conferência física."
          : "Rota indisponível; operação manual.",
      },
    ],
    methodology: {
      period: f.from + " a " + f.to,
      scope,
      filters: f,
      generatedAt: base.generatedAt,
      source: "Neon local MARCON; eventos efetivamente persistidos.",
      definitions: metrics.map((m) => m.label + ": " + m.definition),
      formulas: [
        f.view === "compra"
          ? "Compra: consumo observado no local da baixa, independente da posição dos blocos no mapa; mínimo e prazo de reposição."
          : "Distribuição: somente baixas efetivas por bloco; demanda atribuída ao almoxarifado acessível mais próximo no mapa publicado. Sem acesso mapeado não há transferência automática sugerida.",
        "Disponível = físico - reservas de requisições - transferências solicitadas ainda sem saída.",
        "Compra preserva também o mínimo total do item: eventual diferença entre mínimo total e soma dos mínimos locais é atribuída ao Central (ou primeiro local cadastrado).",
        "Compra = max(0, alvo - disponível - entradas confirmadas - transferência possível).",
        "Tempo médio = média de (entrega - criação) em horas, somente horários válidos.",
        "Preço = estimativa interna; data do evento de cadastro/preço, quando registrada.",
        f.view === "compra" ? "Compra: dias observáveis, média, prazo, variabilidade e criticidade; validação temporal quando há histórico." : "Distribuição: alvo = max(mínimo, teto(consumo líquido/dias × (prazo+horizonte) × (1+margem))); demanda atribuída uma vez por proximidade, compartilhada conforme capacidade por material. Prioridade: risco de falta, déficit/alvo (normalizado entre unidades); origens por custo da rota. Sem capacidade cadastrada, verificação física necessária.",
        "Sem prazo de entrega cadastrado: fila ordenada por urgência e antiguidade; não inventa SLA.",
        "Sem conversão entre unidades: consulte séries separadas por unidade.",
        "Uma requisição representa uma linha de item; batch_id identifica o carrinho.",
      ],
    },
  };
}
export type DashboardReport = Awaited<ReturnType<typeof dashboardReport>>;
