import { routeLegs, pathValid, transports, type FacilityGraph, type Path } from "@/lib/routing";
export function RouteSummary({
  graph,
  route,
}: {
  graph: FacilityGraph;
  route: Path;
}) {
  const legs = routeLegs(graph, route);
  if (!pathValid(graph, route)) return <p role="alert">Percurso desatualizado ou bloqueado. Recalcule pela planta publicada.</p>;
  return (
    <div className="map-route-summary">
      <h3>Ordem das paradas</h3>
      <ol>
        {(route.stops ?? [route.nodes[0], route.nodes.at(-1)!]).map((id, i) => (
          <li key={i}>{graph.nodes.find((n) => n.id === id)?.label}</li>
        ))}
      </ol>
      <p>
        Custo: {route.cost.toFixed(1)} {route.unit ?? (graph.scaleCalibrated === true ? "m" : "unidades do mapa")}.
        {route.objective === "time" ? " Durações cadastradas por trecho." : " Tempo não estimado sem duração cadastrada."}
        {graph.scaleCalibrated !== true && " Sem escala calibrada; distâncias em unidades do mapa."}
        {route.approximate && " Ordem das paradas aproximada por vizinho mais próximo e 2-opt; caminhos por Dijkstra."}
        {route.transport && ` Transporte: ${transports[route.transport]}. Respeita bloqueios e restrições cadastrados.`}
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
