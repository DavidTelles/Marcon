import type { PoolConnection } from "./db-types";
import type { Account } from "./accounts";
import { transaction, getPool } from "./db";
import { ActionError, demand, integer, text } from "./permissions";
import { first, rows, audit } from "./stock-ledger";
import {
  graphProblems,
  deliveryTargets,
  planStops,
  shortestPath,
  type FacilityGraph,
  type Path,
  transports,
  type RouteOptions,
} from "./routing";
import type { ResultSetHeader, RowDataPacket } from "./db-types";

export type DeliveryPlan = {
  route: Path | null;
  metric: "m" | "unidades do mapa" | "s";
  parameters?: RouteOptions;
  reason: string;
  labels: string[];
  destinations: string[];
  start: string;
};
export async function storageRoute(
  c: PoolConnection,
  part: number,
  source: number | string,
  destination: number,
  options: RouteOptions = {},
) {
  const parameters: RouteOptions = {
    objective: options.objective ?? "distance",
    transport: options.transport ?? "walking",
  };
  if (
    !["distance", "time"].includes(parameters.objective!) ||
    !Object.hasOwn(transports, parameters.transport!)
  )
    throw new ActionError("Objetivo ou transporte inválido.");
  const map = await first(
    c,
    "SELECT id,graph FROM map_versions WHERE status='Publicada' FOR SHARE",
  );
  const graph: FacilityGraph | null = map
    ? typeof map.graph === "string"
      ? JSON.parse(map.graph)
      : map.graph
    : null;
  if (!graph?.reviewed || graphProblems(graph).length)
    return {
      mapVersion: null,
      route: null,
      reason:
        "Publique uma planta revisada e mapeie os locais reais de retirada e entrega.",
    };
  const locations = await rows(
    c,
    "SELECT warehouse_id,map_node_id FROM inventory WHERE part_id=? AND warehouse_id IN (?,?)",
    [part, typeof source === "number" ? source : destination, destination],
  );
  const points = (id: number | string) => {
    if (typeof id === "string")
      return graph.nodes.filter(
        (n) => n.id === id && ["receiving", "loading"].includes(n.kind),
      );
    const linked = locations.find(
      (l) => Number(l.warehouse_id) === id,
    )?.map_node_id;
    return graph.nodes.filter(
      (n) => n.warehouseId === id && (!linked || n.id === linked),
    );
  };
  const paths = points(source)
    .flatMap((a) =>
      points(destination).map((b) =>
        shortestPath(graph, a.id, b.id, parameters),
      ),
    )
    .filter((p) => p !== null)
    .sort((a, b) => a.cost - b.cost);
  return {
    mapVersion: Number(map.id),
    route: paths[0] ?? null,
    reason: paths.length
      ? "Percurso pela rede publicada, com bloqueios e restrições cadastrados."
      : "Sem acesso transitável ou vínculo válido entre os locais. Mapeie o percurso necessário.",
    parameters,
  };
}
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
  if (!r || !["Aprovada", "Em separação"].includes(String(r.status)))
    throw new ActionError(
      "Rota disponível somente para requisição aprovada.",
      409,
    );
  const previous = await first(
    c,
    "SELECT * FROM delivery_route_history WHERE request_id=? ORDER BY id DESC LIMIT 1 FOR UPDATE",
    [id],
  );
  const departed = await first(
    c,
    "SELECT id FROM delivery_route_history WHERE request_id=? AND event='Saída' LIMIT 1",
    [id],
  );
  if (departed && a.action === "departDelivery")
    throw new ActionError("Saída já registrada. Histórico preservado.", 409);
  // Publication updates lock this same row. A departure uses one committed map version.
  const map = await first(
    c,
    "SELECT id,graph FROM map_versions WHERE status='Publicada' FOR SHARE",
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
  const parameters: RouteOptions = depart
    ? (old?.parameters ?? {})
    : {
        objective:
          a.objective === undefined
            ? "distance"
            : (a.objective as RouteOptions["objective"]),
        transport:
          a.transport === undefined
            ? "walking"
            : (a.transport as RouteOptions["transport"]),
      };
  if (
    !["distance", "time"].includes(parameters.objective ?? "distance") ||
    !Object.hasOwn(transports, parameters.transport ?? "walking")
  )
    throw new ActionError("Objetivo ou transporte inválido.");
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
    const pickups = reservations.map((v) =>
      v.map_node_id
        ? graph.nodes.find(
            (n) =>
              n.id === v.map_node_id &&
              n.warehouseId === Number(v.warehouse_id),
          )?.id
        : graph.nodes.find((n) => n.warehouseId === Number(v.warehouse_id))?.id,
    );
    const ends = deliveryTargets(graph, Number(r.block_id), String(r.sector));
    if (
      destinations.some(
        (d) => !graph.nodes.some((n) => n.id === d && n.kind === "delivery"),
      )
    )
      throw new ActionError(
        "Destino adicional não é um ponto de entrega do mapa atual.",
      );
    start ||= pickups[0] ?? "";
    if (start && !pickups.includes(start))
      throw new ActionError(
        "Escolha uma origem de retirada reservada nesta requisição.",
        409,
      );
    reason =
      "Rota indisponível: falta ligação transitável ou vínculo de origem/destino. Operação manual.";
    if (pickups.length && pickups.every(Boolean) && ends.length) {
      const collection = planStops(
        graph,
        start,
        pickups as string[],
        parameters,
      );
      const delivery =
        collection &&
        ends
          .map((end) =>
            planStops(
              graph,
              collection.nodes.at(-1)!,
              destinations as string[],
              { ...parameters, final: end.id },
            ),
          )
          .filter((path) => path !== null)
          .sort((a, b) => a.cost - b.cost)[0];
      if (collection && delivery) {
        route = {
          ...delivery,
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
    metric:
      parameters.objective === "time"
        ? "s"
        : graph?.scaleCalibrated === true
          ? "m"
          : "unidades do mapa",
    parameters,
    reason,
    labels:
      route?.nodes.map((id) => graph!.nodes.find((n) => n.id === id)!.label) ??
      [],
    destinations,
    start,
  };
  if (a.atDelivery === true)
    payload.reason +=
      " Cálculo registrado na retirada conferida; a confirmação da entrega no bloco ocorre em etapa posterior.";
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
