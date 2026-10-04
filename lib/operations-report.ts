import type { Account } from "./accounts";
import { workspaceSnapshot } from "./workspace-db";
import { getPool } from "./db";
import type { RowDataPacket } from "./db-types";
import { ActionError, permitted } from "./permissions";
import {
  coverageTarget,
  netConsumption,
  predict,
  proportionalCoverage,
  suggestTransfers,
  type Forecast,
} from "./forecast";
import { createHash } from "node:crypto";
import { graphProblems, type FacilityGraph } from "./routing";
import { integrationStatus } from "./integrations/corporate";
import {
  accessibleWarehousesForBlock,
  warehouseRoute,
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
  horizon?: number;
  margin?: number;
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
    matchesFilters: boolean;
    idealTarget?: number;
  };
};
export async function operationsReport(user: Account, filters: ReportFilter) {
  filters = { ...filters, code: filters.code?.trim().toUpperCase() };
  const today = new Date().toISOString().slice(0, 10),
    from =
      filters.from ||
      new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    to = filters.to || today;
  const horizon = filters.horizon ?? 7,
    margin = filters.margin ?? 0.2;
  if (
    !Number.isInteger(horizon) ||
    horizon < 1 ||
    horizon > 365 ||
    !Number.isFinite(margin) ||
    margin < 0 ||
    margin > 2
  )
    throw new ActionError("Cobertura (1–365 dias) ou margem (0–2) inválida.");
  if (
    ![from, to].every(
      (v) =>
        /^\d{4}-\d{2}-\d{2}$/.test(v) &&
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v,
    ) ||
    from > to ||
    to > today ||
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
    `SELECT r.sector AS request_sector,r.status AS request_status,r.priority AS request_priority,m.request_id,m.id,m.part_id,m.warehouse_id,m.kind,m.quantity,m.reason,au.name AS actor,p.code,DATE_FORMAT(m.created_at,'%Y-%m-%d') AS date,b.id AS block_id,b.name AS block,u.employee_no AS requester FROM stock_movements m JOIN users au ON au.id=m.actor_id JOIN parts p ON p.id=m.part_id LEFT JOIN requests r ON r.id=m.request_id LEFT JOIN users u ON u.id=r.requester_id LEFT JOIN blocks b ON b.id=m.block_id WHERE ${scope} AND m.created_at>=? AND m.created_at<DATE_ADD(?,INTERVAL 1 DAY) ORDER BY m.created_at,m.id`,
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
  function mappedRoute(code: string, from: string, to: string) {
    if (!graph) return null;
    const a = warehouses.find((w) => w.name === from),
      b = warehouses.find((w) => w.name === to);
    const locations = snapshot.stock.find((p) => p.code === code)?.locations;
    return a && b
      ? warehouseRoute(
          graph,
          Number(a.id),
          Number(b.id),
          {},
          {
            source: locations?.find((l) => l.warehouseId === Number(a.id))
              ?.nodeId,
            destination: locations?.find((l) => l.warehouseId === Number(b.id))
              ?.nodeId,
          },
        )
      : null;
  }
  const [pendingTransfers] = permitted(user, "planning")
    ? await pool.query<RowDataPacket[]>(
        "SELECT part_id,source_warehouse_id,destination_warehouse_id,quantity,status FROM stock_transfers WHERE status IN ('Solicitada','Em trânsito')",
      )
    : [[]];
  const [incomingRows] = permitted(user, "planning")
    ? await pool.query<RowDataPacket[]>(
        "SELECT e.*,p.code,p.unit,i.map_node_id AS nodeId,w.name AS warehouse FROM expected_receipts e JOIN parts p ON p.id=e.part_id JOIN warehouses w ON w.id=e.warehouse_id LEFT JOIN inventory i ON i.part_id=e.part_id AND i.warehouse_id=e.warehouse_id WHERE e.status='Confirmada' OR e.id IN (SELECT id FROM expected_receipts ORDER BY id DESC LIMIT 1000) ORDER BY e.due_date DESC",
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
    const relevant = observations.filter((m) => Number(m.part_id) === p.id);
    // Filters used for presentation must not remove other sectors' needs from source coverage.
    const history = netConsumption<
      RowDataPacket & { kind: string; quantity: number }
    >(
      movements
        .filter(
          (m) =>
            Number(m.part_id) === p.id && m.date >= from && m.date <= endDay,
        )
        .map((m) => ({
          ...m,
          kind: String(m.kind),
          quantity: Number(m.quantity),
        })),
    );
    const locationIds = (p.locations ?? [])
      .filter(
        (l) =>
          l.capacity === null ||
          l.capacity === undefined ||
          l.capacity > l.reserved,
      )
      .map((l) => l.warehouseId);
    const allocated: typeof history = [];
    const remainingCapacity = new Map(
      (p.locations ?? []).map((l) => [
        l.warehouseId,
        l.capacity == null
          ? Infinity
          : (Math.max(0, l.capacity - l.reserved) * days) /
            ((p.leadDays + horizon) * (1 + margin)),
      ]),
    );
    if (filters.purpose === "purchase") allocated.push(...history);
    else
      for (const m of history) {
        const ranked = accessibleWarehousesForBlock(
          graph,
          m.block_id ? Number(m.block_id) : null,
          locationIds,
          new Map(p.locations?.map((l) => [l.warehouseId, l.nodeId])),
          String(m.request_sector ?? ""),
        );
        let remaining = m.quantity;
        for (const candidate of ranked) {
          const quantity = Math.min(
            remaining,
            remainingCapacity.get(candidate.id) ?? 0,
          );
          if (quantity > 0) {
            allocated.push({ ...m, quantity, warehouse_id: candidate.id });
            remainingCapacity.set(
              candidate.id,
              remainingCapacity.get(candidate.id)! - quantity,
            );
            remaining -= quantity;
          }
        }
        if (remaining > 0)
          allocated.push({ ...m, quantity: remaining, warehouse_id: null });
      }
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
        return allocated
          .filter(
            (m) =>
              m.date === day && Number(m.warehouse_id) === location.warehouseId,
          )
          .reduce((s, m) => s + Number(m.quantity), 0);
      });
      const forecast =
          filters.purpose === "purchase"
            ? predict(daily, p.leadDays, forecastMinimum, p.criticality)
            : coverageTarget(
                daily,
                p.leadDays,
                forecastMinimum,
                horizon,
                margin,
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
          matchesFilters:
            ![filters.block, filters.sector, filters.requester].some(Boolean) ||
            allocated.some(
              (m) =>
                Number(m.warehouse_id) === location.warehouseId &&
                m.quantity > 0 &&
                (!filters.block || m.block === filters.block) &&
                (!filters.sector ||
                  String(m.request_sector).toLowerCase() ===
                    filters.sector.toLowerCase()) &&
                (!filters.requester || m.requester === filters.requester),
            ),
          verified:
            !!graph &&
            allocated.some(
              (m) =>
                Number(m.warehouse_id) === location.warehouseId &&
                m.quantity > 0,
            ),
          unmappedConsumption: allocated
            .filter((m) => m.warehouse_id === null)
            .reduce((s, m) => s + Number(m.quantity), 0),
          consumption: [
            ...new Set(
              allocated
                .filter((m) => Number(m.warehouse_id) === location.warehouseId)
                .map((m) => String(m.block ?? "Sem bloco")),
            ),
          ].map((block) => ({
            block,
            quantity: allocated
              .filter(
                (m) =>
                  String(m.block ?? "Sem bloco") === block &&
                  Number(m.warehouse_id) === location.warehouseId,
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
        buy: permitted(user, "planning")
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
  if (filters.purpose === "distribution" && graph) {
    const balanced = proportionalCoverage(
      reportRows.map((row) => ({
        ...row,
        incoming: row.incoming + (row.distribution?.pendingIncoming ?? 0),
        target: row.distribution?.unmappedConsumption
          ? Math.max(row.target, row.available)
          : row.target,
      })),
      (a, b) => !!mappedRoute(a.code, a.warehouse, b.warehouse),
    );
    for (const row of reportRows) {
      const next = balanced.find(
        (value) => value.code === row.code && value.warehouse === row.warehouse,
      )!;
      if (row.distribution) row.distribution.idealTarget = row.target;
      if (!row.distribution?.unmappedConsumption) row.target = next.target;
    }
  }
  const projected = new Map(
    reportRows.map((r) => [`${r.code}:${r.warehouse}`, r.available]),
  );
  const transfers = permitted(user, "planning")
    ? suggestTransfers(
        reportRows.map((r) => ({
          code: r.code,
          warehouse: r.warehouse,
          available: Math.max(0, r.available),
          target:
            filters.purpose !== "purchase" &&
            r.distribution?.unmappedConsumption
              ? Math.max(r.target, r.available)
              : r.target,
          minimum: r.minimum,
          incoming: r.incoming + (r.distribution?.pendingIncoming ?? 0),
          capacity: r.capacity,
          reserved: r.reserved,
          physical: r.physical,
          unit: r.unit,
          step: 1, // Official stock flows permit loose base units; packSize converts boxes.
          daily: r.analysis.daily,
        })),
        (source, dest) =>
          mappedRoute(source.code, source.warehouse, dest.warehouse)?.cost ??
          Infinity,
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
        const sourceBefore = projected.get(`${t.code}:${t.from}`)!,
          destinationBefore = projected.get(`${t.code}:${t.to}`)!;
        projected.set(`${t.code}:${t.from}`, sourceBefore - t.quantity);
        projected.set(`${t.code}:${t.to}`, destinationBefore + t.quantity);
        return {
          ...t,
          key: createHash("sha256")
            .update(
              JSON.stringify([
                t,
                from,
                to,
                horizon,
                margin,
                published[0]?.id ?? null,
                source.available,
                source.target,
                dest.available,
                dest.target,
              ]),
            )
            .digest("hex"),
          reason:
            filters.purpose === "purchase"
              ? t.reason
              : "O destino atende consumo próximo e tem cobertura insuficiente; a origem mantém seu mínimo e sua cobertura após a transferência.",
          confidence: dest.analysis.confidence,
          benefit:
            dest.analysis.daily > 0
              ? `Cobertura adicional estimada: ${(t.quantity / dest.analysis.daily).toFixed(1)} dias no destino. Não é ganho medido.`
              : "Reposição do alvo cadastrado; consumo insuficiente para estimar benefício.",
          evidence: {
            period: { from, to },
            sourceAvailable: sourceBefore,
            sourceReserved: source.reserved,
            sourceMinimum: source.minimum,
            sourceTarget: source.target,
            destinationAvailable: destinationBefore,
            destinationReserved: dest.reserved,
            destinationTarget: dest.target,
            forecast: dest.forecast,
            leadDays: snapshot.stock.find((p) => p.code === t.code)?.leadDays,
            incoming: dest.incoming,
            horizon,
            margin,
            route: mappedRoute(t.code, t.from, t.to),
            sourceCoverageBefore:
              source.analysis.daily > 0
                ? sourceBefore / source.analysis.daily
                : null,
            sourceCoverageAfter:
              source.analysis.daily > 0
                ? (sourceBefore - t.quantity) / source.analysis.daily
                : null,
            destinationCoverageBefore:
              dest.analysis.daily > 0
                ? destinationBefore / dest.analysis.daily
                : null,
            destinationCoverageAfter:
              dest.analysis.daily > 0
                ? (destinationBefore + t.quantity) / dest.analysis.daily
                : null,
            capacityKnown: dest.capacity !== null,
            packSize:
              snapshot.stock.find((p) => p.code === t.code)?.packSize ?? 1,
            ...dest.distribution,
          },
        };
      })
    : [];
  const [rejected] = permitted(user, "planning")
    ? await pool.query<RowDataPacket[]>(
        "SELECT details FROM audit_log WHERE entity_type='recommendation' AND action='reject' ORDER BY id DESC LIMIT 10000",
      )
    : [[]];
  const rejectedKeys = new Set(
    rejected.map(
      (r) =>
        (typeof r.details === "string" ? JSON.parse(r.details) : r.details)
          ?.key,
    ),
  );
  const visibleTransfers = transfers.filter((t) => !rejectedKeys.has(t.key));
  for (const r of reportRows) {
    r.transfer = visibleTransfers
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
      "Consumo: baixas efetivas (saida), descontadas devoluções aptas vinculadas às mesmas baixas no período. Pedidos e transferências não são consumo. Cobertura usa dias observáveis; saldos são atuais.",
    rows: reportRows,
    transfers: visibleTransfers,
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
