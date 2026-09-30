"use client";
import { useState } from "react";
import { shortestPath, type FacilityGraph, type Path } from "@/lib/routing";
import { RouteSummary } from "./route-summary";
import { MapViewport } from "./map-viewport";
export function DistributionMap({
  version,
  from,
  to,
}: {
  version: number | null;
  from?: string;
  to?: string;
}) {
  const [graph, setGraph] = useState<FacilityGraph | null>(null),
    [route, setRoute] = useState<Path | null>(null),
    [message, setMessage] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setMessage("Carregando mapa publicado…");
    try {
      const r = await fetch("/api/maps"),
        body = await r.json();
      if (!r.ok) throw Error(body.error);
      const m = body.maps.find((m: { id: number }) => Number(m.id) === version);
      if (!m || m.status !== "Publicada")
        throw Error("Mapa indisponível. Atualize o relatório.");
      const g: FacilityGraph =
        typeof m.graph === "string" ? JSON.parse(m.graph) : m.graph;
      setGraph(g);
      setMessage("");
      if (from && to) {
        const point = (name: string) =>
          g.nodes.find(
            (n) =>
              n.warehouseId ===
              Number(
                body.warehouses.find((w: { name: string }) => w.name === name)
                  ?.id,
              ),
          )?.id;
        const a = point(from),
          b = point(to);
        const path =
          a && b
            ? shortestPath(
                { ...g, scaleCalibrated: g.scaleCalibrated === true },
                a,
                b,
              )
            : null;
        setStart(a ?? "");
        setEnd(b ?? "");
        setRoute(path);
        setMessage(
          path
            ? `Mapa publicado #${version}; percurso pelos caminhos cadastrados.`
            : "Rota indisponível: faltam vínculos de origem/destino ou caminhos transitáveis.",
        );
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao carregar mapa.");
    } finally {
      setBusy(false);
    }
  }
  if (!version)
    return (
      <p>
        Rota indisponível: nenhum mapa válido publicado. A operação manual
        continua disponível.
      </p>
    );
  return (
    <div>
      {!graph ? (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          {busy
            ? "Carregando rota…"
            : from && to
              ? "Ver rota"
              : "Abrir planta publicada"}
        </button>
      ) : (
        <>
          <div className="ops-form">
            <label>
              Origem
              <select value={start} onChange={(e) => setStart(e.target.value)}>
                <option value="">Selecione</option>
                {graph.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Destino
              <select value={end} onChange={(e) => setEnd(e.target.value)}>
                <option value="">Selecione</option>
                {graph.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button secondary"
              disabled={!start || !end}
              onClick={async () => {
                try {
                  const r = await fetch("/api/maps", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "test",
                        start,
                        stops: [end],
                      }),
                    }),
                    data = await r.json();
                  if (!r.ok) throw Error(data.error);
                  setRoute(data.route);
                  setMessage(data.reason);
                } catch (e) {
                  setMessage(
                    e instanceof Error ? e.message : "Falha ao calcular.",
                  );
                }
              }}
            >
              Calcular caminho
            </button>
          </div>
          <MapViewport>
            <svg
              className="ops-map"
              viewBox="0 0 1000 700"
              role="img"
              aria-label="Planta publicada e percurso"
            >
              <image
                href={"/api/maps?image=" + version}
                width="1000"
                height="700"
                preserveAspectRatio="none"
              />
              {route && (
                <polyline
                  key={route.nodes.join("-")}
                  className="route-path"
                  pathLength="1"
                  points={route.nodes
                    .map((id) => {
                      const n = graph.nodes.find((n) => n.id === id)!;
                      return `${n.x * 1000},${n.y * 700}`;
                    })
                    .join(" ")}
                  fill="none"
                  stroke="var(--blue)"
                  strokeWidth="6"
                />
              )}
            </svg>
          </MapViewport>
          {route && <RouteSummary graph={graph} route={route} />}
        </>
      )}
      {message && <p role="status">{message}</p>}
      <p>
        Consulta sem alteração de saldo. Validade depende dos caminhos
        conferidos no mapa.
      </p>
    </div>
  );
}
