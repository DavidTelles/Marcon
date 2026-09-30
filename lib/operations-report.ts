import type { Account } from "./accounts";
import { workspaceSnapshot } from "./workspace-db";
import { getPool } from "./db";
import type { RowDataPacket } from "mysql2";
import { ActionError, can } from "./permissions";
import { predict, suggestTransfers, type Forecast } from "./forecast";
import { graphProblems, type FacilityGraph } from "./routing";
import { integrationStatus } from "./integrations/corporate";
import {
  nearestWarehouseForBlock,
  warehouseDistance,
} from "./distribution-location";
export type ReportFilter = {
  purpose?: "purchase" | "distribution";
  from?: string;
  to?: string;
  block?: string;
  requester?: string;
  code?: string;
  status?: string;
  priority?: string;
  sector?: string;
};
export type ReportRow = {
  code: string;
  item: string;
  unit: string;
  block: string;
  warehouse: string;
  location: string;
  withdrawals: number;
  entries: number;
  returns: number;
  physical: number;
  reserved: number;
  available: number;
  minimum: number;
  configuredMinimum: number;
  itemMinimum: number;
  target: number;
  forecast: number;
  buy: number;
  transfer: number;
  cost: number;
  priceLabel: string;
  analysis: Forecast;
  capacity: number | null;
  incoming: number;
  distribution?: {
    verified: boolean;
    unmappedConsumption: number;
    consumption: { block: string; quantity: number }[];
    proximity: string;
    pendingOutgoing: number;
    pendingIncoming: number;
  };
};
export async function operationsReport(user: Account, filters: ReportFilter) {
  filters = { ...filters, code: filters.code?.trim().toUpperCase() };
  const today = new Date().toISOString().slice(0, 10),
    from =
      filters.from ||
      new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    to = filters.to || today;
  if (
    ![from, to].every(
      (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)),
    ) ||
    from > to ||
    (Date.parse(to) - Date.parse(from)) / 86400000 > 366
  )
    throw new ActionError("Período inválido (máximo 366 dias).");
  if (user.role === "lider" && filters.block && filters.block !== user.block)
    throw new ActionError("Bloco fora do seu escopo.", 403);
  if (
    user.role === "funcionario" &&
    filters.requester &&
    filters.requester !== user.id
  )
    throw new ActionError("Requisitor fora do seu escopo.", 403);
  const snapshot = await workspaceSnapshot(user, true),
    pool = getPool(),
    scope =
      user.role === "funcionario"
        ? "u.employee_no=?"
        : user.role === "lider"
          ? "b.name=?"
          : "1=1",
    params =
      user.role === "funcionario"
        ? [user.id]
        : user.role === "lider"
          ? [user.block ?? ""]
          : [];
  const [movements] = await pool.execute<RowDataPacket[]>(
    `SELECT r.sector AS request_sector,r.status AS request_status,r.priority AS request_priority,m.id,m.part_id,m.warehouse_id,m.kind,m.quantity,m.reason,au.name AS actor,p.code,DATE_FORMAT(m.created_at,'%Y-%m-%d') AS date,b.id AS block_id,b.name AS block,u.employee_no AS requester FROM stock_movements m JOIN users au ON au.id=m.actor_id JOIN parts p ON p.id=m.part_id LEFT JOIN requests r ON r.id=m.request_id LEFT JOIN users u ON u.id=r.requester_id LEFT JOIN blocks b ON b.id=m.block_id WHERE ${scope} AND m.created_at>=? AND m.created_at<DATE_ADD(?,INTERVAL 1 DAY)`,
    [...params, from, to],
  );
  const [warehouses] = await pool.query<RowDataPacket[]>(
    "SELECT id,name,block_id,is_central FROM warehouses WHERE active=TRUE",
  );
  const [published] = await pool.query<RowDataPacket[]>(
    "SELECT id,graph FROM map_versions WHERE status='Publicada'",
  );
  let graph = published[0]
    ? ((typeof published[0].graph === "string"
        ? JSON.parse(published[0].graph)
        : published[0].graph) as FacilityGraph)
    : null;
  if (graph && (!graph.reviewed || graphProblems(graph).length)) graph = null;
  if (graph) graph.scaleCalibrated = graph.scaleCalibrated === true;
  const locationCache = new Map<
    string,
    ReturnType<typeof nearestWarehouseForBlock>
  >();
  const costCache = new Map<string, number>();
  function mappedCost(from: string, to: string) {
    if (!graph) return filters.purpose === "purchase" ? 0 : Infinity;
    const key = `${from}:${to}`;
    if (!costCache.has(key)) {
      const a = warehouses.find((w) => w.name === from),
        b = warehouses.find((w) => w.name === to);
      costCache.set(
        key,
        a && b
          ? warehouseDistance(graph, Number(a.id), Number(b.id))
          : Infinity,
      );
    }
    return costCache.get(key)!;
  }
  const [pendingTransfers] = can(user.role, "planning")
    ? await pool.query<RowDataPacket[]>(
        "SELECT part_id,source_warehouse_id,destination_warehouse_id,quantity,status FROM stock_transfers WHERE status IN ('Solicitada','Em trânsito')",
      )
    : [[]];
  const [incomingRows] = can(user.role, "planning")
    ? await pool.query<RowDataPacket[]>(
        "SELECT e.*,p.code,w.name AS warehouse FROM expected_receipts e JOIN parts p ON p.id=e.part_id JOIN warehouses w ON w.id=e.warehouse_id ORDER BY e.due_date DESC LIMIT 1000",
      )
    : [[]];
  const [firstDates] = await pool.query<RowDataPacket[]>(
    "SELECT part_id,MIN(created_at) AS first_at FROM stock_movements GROUP BY part_id",
  );
  const observations = movements.filter(
    (m) =>
      (!filters.block || m.block === filters.block) &&
      (!filters.requester || m.requester === filters.requester) &&
      (!filters.status || m.request_status === filters.status) &&
      (!filters.priority || m.request_priority === filters.priority) &&
      (!filters.sector ||
        String(m.request_sector).toLowerCase() ===
          filters.sector.toLowerCase()),
  );
  const reportRows: ReportRow[] = [];
  for (const p of snapshot.stock.filter(
    (p) => !filters.code || p.code === filters.code,
  )) {
    const first = firstDates.find((d) => Number(d.part_id) === p.id)?.first_at;
    const endDay = to < today ? to : today;
    const startDay =
      first && String(first).slice(0, 10) > from
        ? String(first).slice(0, 10)
        : from;
    const days = Math.max(
      1,
      Math.min(
        367,
        first
          ? Math.floor((Date.parse(endDay) - Date.parse(startDay)) / 86400000) +
              1
          : 1,
      ),
    );
    const relevant = observations.filter((m) => Number(m.part_id) === p.id),
      history = relevant.filter(
        (m) => m.kind === "saida" && m.date >= from && m.date <= endDay,
      );
    const locationIds = (p.locations ?? [])
      .filter(
        (l) =>
          l.capacity === null ||
          l.capacity === undefined ||
          l.capacity > l.reserved,
      )
      .map((l) => l.warehouseId);
    const targetWarehouses = new Map(
      [
        ...new Set(
          history.map((m) => (m.block_id ? Number(m.block_id) : null)),
        ),
      ].map((id) => {
        const key = `${id}:${locationIds.join(",")}`;
        if (!locationCache.has(key))
          locationCache.set(
            key,
            nearestWarehouseForBlock(graph, id, locationIds),
          );
        return [id, locationCache.get(key)?.id];
      }),
    );
    const assignedWarehouse = (m: RowDataPacket) =>
      filters.purpose === "purchase"
        ? Number(m.warehouse_id)
        : targetWarehouses.get(m.block_id ? Number(m.block_id) : null);
    for (const location of p.locations ?? []) {
      const minimumGap = Math.max(
        0,
        p.minimum - (p.locations ?? []).reduce((s, l) => s + l.minimum, 0),
      );
      const minimumOwner =
        (p.locations ?? []).find((l) =>
          warehouses.some(
            (w) => Number(w.id) === l.warehouseId && w.is_central,
          ),
        ) ?? p.locations?.[0];
      const forecastMinimum =
        location.minimum +
        (filters.purpose === "purchase" &&
        minimumOwner?.warehouseId === location.warehouseId
          ? minimumGap
          : 0);
      const daily = Array.from({ length: days }, (_, i) => {
        const day = new Date(Date.parse(endDay) - (days - 1 - i) * 86400000)
          .toISOString()
          .slice(0, 10);
        return history
          .filter(
            (m) =>
              m.date === day && assignedWarehouse(m) === location.warehouseId,
          )
          .reduce((s, m) => s + Number(m.quantity), 0);
      });
      const forecast = predict(
          daily,
          p.leadDays,
          forecastMinimum,
          p.criticality,
        ),
        target = Math.max(
          0,
          Math.min(
            forecast.target,
            (location.capacity ?? Infinity) - location.reserved,
          ),
        );
      const period = relevant.filter(
          (m) =>
            Number(m.warehouse_id) === location.warehouseId &&
            m.date >= from &&
            m.date <= to,
        ),
        sum = (k: string) =>
          period
            .filter((m) => m.kind === k)
            .reduce((s, m) => s + Number(m.quantity), 0);
      const incoming = incomingRows
        .filter(
          (r) =>
            r.code === p.code &&
            Number(r.warehouse_id) === location.warehouseId &&
            r.status === "Confirmada" &&
            String(r.due_date).slice(0, 10) <=
              new Date(Date.now() + p.leadDays * 86400000)
                .toISOString()
                .slice(0, 10),
        )
        .reduce((s, r) => s + Number(r.quantity), 0);
      reportRows.push({
        distribution: {
          verified:
            !!graph &&
            history.some((m) => assignedWarehouse(m) === location.warehouseId),
          unmappedConsumption: history
            .filter(
              (m) =>
                !targetWarehouses.get(m.block_id ? Number(m.block_id) : null),
            )
            .reduce((s, m) => s + Number(m.quantity), 0),
          consumption: [
            ...new Set(
              history
                .filter((m) => assignedWarehouse(m) === location.warehouseId)
                .map((m) => String(m.block ?? "Sem bloco")),
            ),
          ].map((block) => ({
            block,
            quantity: history
              .filter(
                (m) =>
                  String(m.block ?? "Sem bloco") === block &&
                  assignedWarehouse(m) === location.warehouseId,
              )
              .reduce((s, m) => s + Number(m.quantity), 0),
          })),
          proximity:
            filters.purpose === "purchase"
              ? "Compra baseada nas baixas efetivas do próprio local, sem redistribuir consumo pelo mapa."
              : graph
                ? `Grafo publicado #${published[0].id}; menor custo praticável (${graph.scaleCalibrated ? "escala calibrada" : "geometria estimada"}). Blocos sem acesso mapeado não geram distribuição automática.`
                : "Sem mapa válido publicado: distribuição por proximidade indisponível. Mapeie os blocos, almoxarifados e caminhos; operação manual disponível.",
          pendingOutgoing: pendingTransfers
            .filter(
              (t) =>
                Number(t.part_id) === p.id &&
                Number(t.source_warehouse_id) === location.warehouseId &&
                t.status === "Solicitada",
            )
            .reduce((s, t) => s + Number(t.quantity), 0),
          pendingIncoming: pendingTransfers
            .filter(
              (t) =>
                Number(t.part_id) === p.id &&
                Number(t.destination_warehouse_id) === location.warehouseId,
            )
            .reduce((s, t) => s + Number(t.quantity), 0),
        },
        code: p.code,
        item: p.name,
        unit: p.unit ?? "un",
        block:
          filters.block ??
          (user.role === "lider"
            ? (user.block ?? "")
            : [...new Set(period.map((m) => m.block).filter(Boolean))].join(
                ", ",
              ) || "Sem retirada no período"),
        warehouse: location.warehouse,
        location: `${location.aisle} / ${location.shelf}`,
        withdrawals: sum("saida"),
        entries: sum("entrada"),
        returns: sum("devolucao"),
        physical: location.quantity,
        reserved: location.reserved,
        available: location.available,
        minimum: forecast.minimum,
        configuredMinimum: location.minimum,
        itemMinimum: p.minimum,
        target,
        forecast: Math.ceil(forecast.daily * p.leadDays),
        buy: can(user.role, "planning")
          ? Math.max(0, target - location.available - incoming)
          : 0,
        transfer: 0,
        cost: 0,
        priceLabel: "Estimativa interna; frete e impostos não cotados",
        analysis: forecast,
        capacity: location.capacity,
        incoming,
      });
    }
  }
  const transfers = can(user.role, "planning")
    ? suggestTransfers(
        reportRows.map((r) => ({
          code: r.code,
          warehouse: r.warehouse,
          available: Math.max(
            0,
            r.available - (r.distribution?.pendingOutgoing ?? 0),
          ),
          target: r.target,
          minimum: r.minimum,
          incoming: r.incoming + (r.distribution?.pendingIncoming ?? 0),
          capacity: r.capacity,
          reserved: r.reserved + (r.distribution?.pendingOutgoing ?? 0),
        })),
        (source, dest) => mappedCost(source.warehouse, dest.warehouse),
        (dest) =>
          filters.purpose === "purchase" ||
          !!reportRows.find(
            (r) => r.code === dest.code && r.warehouse === dest.warehouse,
          )?.distribution?.verified,
      ).map((t) => {
        const source = reportRows.find(
          (r) => r.code === t.code && r.warehouse === t.from,
        )!;
        const dest = reportRows.find(
          (r) => r.code === t.code && r.warehouse === t.to,
        )!;
        return {
          ...t,
          reason:
            filters.purpose === "purchase"
              ? t.reason
              : "Destino acessível mais próximo dos blocos consumidores; transferir somente o excesso acima do mínimo e alvo da origem.",
          confidence: dest.analysis.confidence,
          benefit:
            dest.analysis.daily > 0
              ? `Cobertura adicional estimada: ${(t.quantity / dest.analysis.daily).toFixed(1)} dias no destino. Não é ganho medido.`
              : "Reposição do alvo cadastrado; consumo insuficiente para estimar benefício.",
          evidence: {
            period: { from, to },
            sourceAvailable: source.available,
            sourceReserved: source.reserved,
            sourceMinimum: source.minimum,
            sourceTarget: source.target,
            destinationAvailable: dest.available,
            destinationReserved: dest.reserved,
            destinationTarget: dest.target,
            forecast: dest.forecast,
            leadDays: snapshot.stock.find((p) => p.code === t.code)?.leadDays,
            incoming: dest.incoming,
            ...dest.distribution,
          },
        };
      })
    : [];
  for (const r of reportRows) {
    r.transfer = transfers
      .filter((t) => t.code === r.code && t.to === r.warehouse)
      .reduce((s, t) => s + t.quantity, 0);
    r.buy = Math.max(
      0,
      r.buy - r.transfer - (r.distribution?.pendingIncoming ?? 0),
    );
    r.cost =
      r.buy *
      (snapshot.stock.find((p) => p.code === r.code)?.estimatedCost ?? 0);
  }
  const deliveryParams = [...params, from, to];
  let deliveryWhere =
    scope +
    " AND r.delivered_at>=? AND r.delivered_at<DATE_ADD(?,INTERVAL 1 DAY)";
  for (const [value, column] of [
    [filters.block, "b.name"],
    [filters.requester, "u.employee_no"],
    [filters.code, "p.code"],
  ])
    if (value) {
      deliveryWhere += " AND " + column + "=?";
      deliveryParams.push(value);
    }
  const [deliveryRows] = await pool.execute<RowDataPacket[]>(
    `SELECT AVG(TIMESTAMPDIFF(SECOND,r.created_at,r.delivered_at)/3600) AS hours FROM requests r JOIN users u ON u.id=r.requester_id JOIN blocks b ON b.id=r.block_id JOIN parts p ON p.id=r.part_id WHERE ${deliveryWhere} AND r.delivered_at>=r.created_at`,
    deliveryParams,
  );
  return {
    movements: observations
      .filter(
        (m) =>
          m.date >= from &&
          m.date <= to &&
          (!filters.code || m.code === filters.code),
      )
      .map((m) => ({
        id: Number(m.id),
        date: String(m.date),
        code: String(m.code),
        kind: String(m.kind),
        quantity: Number(m.quantity),
        block: m.block ? String(m.block) : null,
        requester: m.requester ? String(m.requester) : null,
        actor: String(m.actor),
        reason: String(m.reason),
        warehouse: warehouses.find(
          (w) => Number(w.id) === Number(m.warehouse_id),
        )?.name,
      })),
    period: { from, to },
    generatedAt: new Date().toISOString(),
    source:
      "MySQL local: baixas efetivas kind=saida; devoluções separadas. Previsão usa dias observáveis do período selecionado até hoje; saldos são atuais.",
    rows: reportRows,
    transfers,
    incoming: incomingRows,
    summary: {
      withdrawals: reportRows.reduce((s, r) => s + r.withdrawals, 0),
      entries: reportRows.reduce((s, r) => s + r.entries, 0),
      returns: reportRows.reduce((s, r) => s + r.returns, 0),
      critical: reportRows.filter((r) => r.available < r.configuredMinimum)
        .length,
      averageDeliveryHours:
        deliveryRows[0].hours === null ? null : Number(deliveryRows[0].hours),
      deliveryTimeNote:
        "Desde a data de criação; registros legados sem horário de entrega são excluídos.",
    },
    mapVersion: graph ? (published[0]?.id ?? null) : null,
    integrations: integrationStatus,
  };
}
