import { routeLegs, type FacilityGraph, type Path } from "@/lib/routing";
export function RouteSummary({
  graph,
  route,
}: {
  graph: FacilityGraph;
  route: Path;
}) {
  const legs = routeLegs(graph, route);
  return (
    <div className="map-route-summary">
      <h3>Ordem das paradas</h3>
      <ol>
        {(route.stops ?? [route.nodes[0], route.nodes.at(-1)!]).map((id, i) => (
          <li key={i}>{graph.nodes.find((n) => n.id === id)?.label}</li>
        ))}
      </ol>
      <p>
        {graph.scaleCalibrated === true
          ? `Distância total: ${legs.reduce((s, l) => s + (l.meters ?? 0), 0).toFixed(1)} m · caminhada estimada: ${Math.ceil(route.cost / 1.2)} s.`
          : "Sem escala calibrada: distância e tempo indisponíveis. Ordem aproximada pela geometria da imagem."}
      </p>
      <details>
        <summary>Distância por trecho ({legs.length})</summary>
        <ol>
          {legs.map((l, i) => (
            <li key={i}>
              {l.from} → {l.to}:{" "}
              {l.meters === null
                ? "distância indisponível"
                : l.meters.toFixed(1) + " m"}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
