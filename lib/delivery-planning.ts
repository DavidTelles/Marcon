import type { PoolConnection } from "./db-types";
import type { Account } from "./accounts";
import { transaction, getPool } from "./db";
import { ActionError, demand, integer, text } from "./permissions";
import { first, rows, audit } from "./stock-ledger";
import {
  graphProblems,
  planStops,
  type FacilityGraph,
  type Path,
} from "./routing";
import type { ResultSetHeader, RowDataPacket } from "./db-types";

export type DeliveryPlan = {
  route: Path | null;
  metric: "m" | "pixels estimados";
  reason: string;
  labels: string[];
  destinations: string[];
  start: string;
};
export async function deliveryHistory(id: number, page = 1) {
  const [history] = await getPool().execute<RowDataPacket[]>(
    `SELECT h.id,h.map_version_id,h.event,h.payload,h.created_at,u.name AS actor FROM delivery_route_history h JOIN users u ON u.id=h.actor_id WHERE h.request_id=? ORDER BY h.id DESC LIMIT 20 OFFSET ${(page - 1) * 20}`,
    [id],
  );
  return history.map((h) => ({
    ...h,
    payload: typeof h.payload === "string" ? JSON.parse(h.payload) : h.payload,
  }));
}
export async function planDelivery(user: Account, a: Record<string, unknown>) {
  demand(user, "stock");
  const id = integer(a.requestId);
  return transaction((c) => recordDeliveryPlan(c, user, a, id));
}
export async function recordDeliveryPlan(
  c: PoolConnection,
  user: Account,
  a: Record<string, unknown>,
  id: number,
) {
  const actor = await first(
    c,
    "SELECT id FROM users WHERE employee_no=? AND active=TRUE",
    [user.id],
  );
  if (!actor) throw new ActionError("Sessão inválida.", 401);
  const r = await first(c, "SELECT * FROM requests WHERE id=? FOR UPDATE", [
    id,
  ]);
  if (!r || r.status !== "Aprovada")
    throw new ActionError(
      "Rota disponível somente para requisição aprovada.",
      409,
    );
  const previous = await first(
    c,
    "SELECT * FROM delivery_route_history WHERE request_id=? ORDER BY id DESC LIMIT 1 FOR UPDATE",
    [id],
  );
  if (previous?.event === "Saída")
    throw new ActionError("Saída já registrada. Histórico preservado.", 409);
  // Publication updates lock this same row. A departure uses one committed map version.
  const map = await first(
    c,
    "SELECT id,graph FROM map_versions WHERE status='Publicada' LOCK IN SHARE MODE",
  );
  const graph: FacilityGraph | null = map
    ? typeof map.graph === "string"
      ? JSON.parse(map.graph)
      : map.graph
    : null;
  const old = previous
    ? ((typeof previous.payload === "string"
        ? JSON.parse(previous.payload)
        : previous.payload) as DeliveryPlan)
    : null;
  const depart = a.action === "departDelivery";
  const destinations = depart
    ? (old?.destinations ?? [])
    : (a.destinations ?? []);
  if (
    !Array.isArray(destinations) ||
    destinations.length > 20 ||
    !destinations.every((s) => typeof s === "string")
  )
    throw new ActionError("Destinos inválidos.");
  let route: Path | null = null;
  let start = depart ? (old?.start ?? "") : text(a.start, 64);
  let reason =
    "Rota indisponível: nenhum mapa publicado válido. Operação manual.";
  if (graph && graph.reviewed && !graphProblems(graph).length) {
    graph.scaleCalibrated = graph.scaleCalibrated === true;
    const reservations = await rows(
      c,
      "SELECT rr.warehouse_id,i.map_node_id FROM request_reservations rr JOIN inventory i ON i.part_id=rr.part_id AND i.warehouse_id=rr.warehouse_id WHERE rr.request_id=? ORDER BY rr.warehouse_id",
      [id],
    );
    const pickups = reservations.map(
      (v) =>
        graph.nodes.find((n) => n.id === v.map_node_id)?.id ??
        graph.nodes.find((n) => n.warehouseId === Number(v.warehouse_id))?.id,
    );
    const end =
      graph.nodes.find(
        (n) => n.blockId === Number(r.block_id) && n.kind === "delivery",
      ) ?? graph.nodes.find((n) => n.blockId === Number(r.block_id));
    if (
      destinations.some(
        (d) => !graph.nodes.some((n) => n.id === d && n.kind === "delivery"),
      )
    )
      throw new ActionError(
        "Destino adicional não é um ponto de entrega do mapa atual.",
      );
    start ||= pickups[0] ?? "";
    if (start && !graph.nodes.some((n) => n.id === start))
      start = pickups[0] ?? "";
    reason =
      "Rota indisponível: falta ligação transitável ou vínculo de origem/destino. Operação manual.";
    if (pickups.length && pickups.every(Boolean) && end) {
      const collection = planStops(graph, start, pickups as string[]);
      const delivery =
        collection &&
        planStops(graph, collection.nodes.at(-1)!, [end.id, ...destinations]);
      if (collection && delivery) {
        route = {
          nodes: [...collection.nodes, ...delivery.nodes.slice(1)],
          cost: collection.cost + delivery.cost,
          stops: [
            ...(collection.stops ?? []),
            ...(delivery.stops ?? []).slice(1),
          ],
        };
        reason =
          "Dijkstra e ordenação heurística das paradas; coletas antes das entregas. Sem movimentação de saldo.";
      }
    }
  }
  if (depart && !route && a.manual !== true)
    throw new ActionError(
      reason + " Confirme a saída manual explicitamente.",
      409,
    );
  const payload: DeliveryPlan = {
    route,
    metric: graph?.scaleCalibrated === true ? "m" : "pixels estimados",
    reason,
    labels:
      route?.nodes.map((id) => graph!.nodes.find((n) => n.id === id)!.label) ??
      [],
    destinations,
    start,
  };
  if (a.atDelivery === true) payload.reason += " Cálculo registrado na confirmação da entrega; horário de saída não informado.";
  const event = depart ? "Saída" : previous ? "Recalculada" : "Planejada";
  const [saved] = await c.execute<ResultSetHeader>(
    "INSERT INTO delivery_route_history(request_id,map_version_id,actor_id,event,payload) VALUES(?,?,?,?,?)",
    [id, map?.id ?? null, actor.id, event, JSON.stringify(payload)],
  );
  await audit(c, Number(actor.id), "request", id, "route", {
    routeId: saved.insertId,
    mapVersion: map?.id ?? null,
    event,
  });
  return {
    id: saved.insertId,
    mapVersion: map?.id ?? null,
    graph,
    ...payload,
    event,
  };
}
