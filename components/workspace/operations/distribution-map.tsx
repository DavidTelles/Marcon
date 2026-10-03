"use client";
import { useState, useEffect } from "react";
import { shortestPath, transports, type FacilityGraph, type Path, type RouteOptions } from "@/lib/routing";
import { warehouseRoute } from "@/lib/distribution-location";
import { RouteSummary } from "./route-summary";
import { MapViewport } from "./map-viewport";
export function DistributionMap({
  version,
  from,
  to,
  fromNode,
  toNode,
  receivingOnly = false,
  onStart,
}: {
  version: number | null;
  from?: string;
  to?: string;
  fromNode?: string;
  toNode?: string;
  receivingOnly?: boolean;
  onStart?: (node: string, parameters: RouteOptions) => void;
}) {
  const [graph, setGraph] = useState<FacilityGraph | null>(null),
    [route, setRoute] = useState<Path | null>(null),
    [message, setMessage] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [objective, setObjective] = useState<RouteOptions["objective"]>("distance"),
    [transport, setTransport] = useState<RouteOptions["transport"]>("walking");
  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!graph || document.hidden) return;
      try {
        const response = await fetch("/api/maps", { cache: "no-store" });
        if (!response.ok) throw new Error("Falha ao verificar a planta. Recarregue a rota.");
        const data = await response.json();
        const current = data.maps.find((m: { status: string }) => m.status === "Publicada");
        if (!current || Number(current.id) !== version || JSON.stringify(typeof current.graph === "string" ? JSON.parse(current.graph) : current.graph) !== JSON.stringify(graph))
          throw new Error("A planta ou seus bloqueios mudaram. Atualize o relatório e recalcule a rota.");
      } catch (error) {
        if (active) { setRoute(null); setGraph(null); setMessage(error instanceof Error ? error.message : "Rota indisponível."); }
      }
    };
    const timer = window.setInterval(() => void check(), 30_000);
    const update = () => void check();
    window.addEventListener("marcon:map-published", update);
    window.addEventListener("focus", update);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("marcon:map-published", update); window.removeEventListener("focus", update); };
  }, [graph, version]);
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
      if (receivingOnly && to) {
        const warehouseId = Number(body.warehouses.find((w: { name: string }) => w.name === to)?.id);
        const destination = g.nodes.find((n) => n.warehouseId === warehouseId && (!toNode || n.id === toNode));
        setEnd(destination?.id ?? "");
        setMessage("Selecione o ponto real de recebimento. Se faltar vínculo ou acesso, complete o mapeamento.");
      }
      if (from && to) {
        const location = (name: string) => Number(body.warehouses.find((w: { name: string }) => w.name === name)?.id);
        const path = g.reviewed ? (fromNode && toNode ? shortestPath(g, fromNode, toNode, { objective, transport }) : warehouseRoute(g, location(from), location(to), { objective, transport })) : null;
        const a = path?.nodes[0], b = path?.nodes.at(-1);
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
      setRoute(null);
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
            <label>Objetivo<select value={objective} onChange={(e) => { const value = e.target.value as RouteOptions["objective"]; setObjective(value); onStart?.(start, { objective: value, transport }); setRoute(null); }}><option value="distance">Menor distância</option><option value="time">Menor tempo cadastrado</option></select></label>
            <label>Transporte<select value={transport} onChange={(e) => { const value = e.target.value as RouteOptions["transport"]; setTransport(value); onStart?.(start, { objective, transport: value }); setRoute(null); }}>{Object.entries(transports).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>
              Origem
              <select disabled={!!from && !!to} value={start} onChange={(e) => { setStart(e.target.value); onStart?.(e.target.value, { objective, transport }); setRoute(null); }}>
                <option value="">Selecione</option>
                {graph.nodes.filter((n) => !receivingOnly || ["receiving", "loading"].includes(n.kind)).map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Destino
              <select disabled={receivingOnly || !!from && !!to} value={end} onChange={(e) => { setEnd(e.target.value); setRoute(null); }}>
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
                setBusy(true);
                setRoute(null);
                try {
                  const r = await fetch("/api/maps", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "test",
                        start,
                        stops: [end],
                        mapVersion: version, objective, transport,
                      }),
                    }),
                    data = await r.json();
                  if (!r.ok) throw Error(data.error);
                  setGraph(data.graph);
                  setRoute(data.route);
                  setMessage(data.reason);
                } catch (e) {
                  setMessage(
                    e instanceof Error ? e.message : "Falha ao calcular.",
                  );
                } finally {
                  setBusy(false);
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
