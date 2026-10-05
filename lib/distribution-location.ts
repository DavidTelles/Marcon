import {
  deliveryTargets,
  shortestPath,
  type FacilityGraph,
  type RouteOptions,
} from "./routing";

// Cost follows the existing graph metric and its blocked edges, never straight lines.
export function warehouseDistance(
  graph: FacilityGraph,
  source: number,
  destination: number,
  options: RouteOptions = {},
) {
  return warehouseRoute(graph, source, destination, options)?.cost ?? Infinity;
}
export function warehouseRoute(
  graph: FacilityGraph,
  source: number,
  destination: number,
  options: RouteOptions = {},
  bindings: { source?: string; destination?: string } = {},
) {
  const from = graph.nodes.filter(
    (n) =>
      n.warehouseId === source &&
      (!bindings.source || n.id === bindings.source),
  );
  const to = graph.nodes.filter(
    (n) =>
      n.warehouseId === destination &&
      (!bindings.destination || n.id === bindings.destination),
  );
  const paths = from
    .flatMap((a) => to.map((b) => shortestPath(graph, a.id, b.id, options)))
    .filter((p) => p !== null);
  return paths.sort((a, b) => a.cost - b.cost)[0] ?? null;
}
export function nearestWarehouseForBlock(
  graph: FacilityGraph | null,
  blockId: number | null,
  warehouseIds: number[],
) {
  return accessibleWarehousesForBlock(graph, blockId, warehouseIds)[0] ?? null;
}
export function accessibleWarehousesForBlock(
  graph: FacilityGraph | null,
  blockId: number | null,
  warehouseIds: number[],
  bindings: Map<number, string | undefined> = new Map(),
  sectorId?: number,
) {
  if (!graph || blockId === null) return [];
  const targets = deliveryTargets(graph, blockId, sectorId);
  const ranked = warehouseIds
    .map((id) => ({
      id,
      cost: Math.min(
        Infinity,
        ...graph.nodes
          .filter(
            (n) =>
              n.warehouseId === id &&
              (!bindings.get(id) || n.id === bindings.get(id)),
          )
          .flatMap((n) =>
            targets.map(
              (t) => shortestPath(graph, n.id, t.id)?.cost ?? Infinity,
            ),
          ),
      ),
    }))
    .sort((a, b) => a.cost - b.cost || a.id - b.id);
  return ranked.filter((r) => Number.isFinite(r.cost));
}
