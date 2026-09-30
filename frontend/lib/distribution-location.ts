import { shortestPath, type FacilityGraph } from "./routing";

// Cost follows the existing graph metric and its blocked edges, never straight lines.
export function warehouseDistance(
  graph: FacilityGraph,
  source: number,
  destination: number,
) {
  const from = graph.nodes.filter((n) => n.warehouseId === source);
  const to = graph.nodes.filter((n) => n.warehouseId === destination);
  return Math.min(
    Infinity,
    ...from.flatMap((a) =>
      to.map((b) => shortestPath(graph, a.id, b.id)?.cost ?? Infinity),
    ),
  );
}
export function nearestWarehouseForBlock(
  graph: FacilityGraph | null,
  blockId: number | null,
  warehouseIds: number[],
) {
  if (!graph || blockId === null) return null;
  const targets = graph.nodes.filter(
    (n) => n.blockId === blockId && ["block", "delivery"].includes(n.kind),
  );
  const ranked = warehouseIds
    .map((id) => ({
      id,
      cost: Math.min(
        Infinity,
        ...graph.nodes
          .filter((n) => n.warehouseId === id)
          .flatMap((n) =>
            targets.map(
              (t) => shortestPath(graph, n.id, t.id)?.cost ?? Infinity,
            ),
          ),
      ),
    }))
    .sort((a, b) => a.cost - b.cost || a.id - b.id);
  return Number.isFinite(ranked[0]?.cost) ? ranked[0] : null;
}
