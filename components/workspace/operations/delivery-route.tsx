"use client";
import { useEffect, useState } from "react";
import type { Request } from "@/lib/demo-data";
import type { DeliveryPlan } from "@/lib/delivery-planning";
import { transports, type FacilityGraph, type RouteOptions } from "@/lib/routing";
import { RouteSummary } from "./route-summary";
import { MapViewport } from "./map-viewport";
import { DashboardDialog } from "./dashboard-dialog";
type History = {
  id: number;
  map_version_id: number | null;
  event: string;
  created_at: string;
  actor: string;
  payload: DeliveryPlan;
};
export function DeliveryRoute({ request }: { request: Request }) {
  const [history, setHistory] = useState<History[]>([]),
    [page, setPage] = useState(1);
  const [data, setData] = useState<
    | (DeliveryPlan & {
        graph: FacilityGraph | null;
        mapVersion: number | null;
      })
    | null
  >(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  const [destinations, setDestinations] = useState<string[]>([]),
    [start, setStart] = useState("");
  const [revision, setRevision] = useState(0);
  const [objective, setObjective] = useState<RouteOptions["objective"]>("distance"),
    [transport, setTransport] = useState<RouteOptions["transport"]>("walking");
  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!data?.graph || document.hidden) return;
      try {
        const response = await fetch("/api/maps", { cache: "no-store" });
        if (!response.ok) throw new Error("Não foi possível verificar a planta. Recalcule a rota.");
        const body = await response.json();
        const published = body.maps.find((m: { status: string }) => m.status === "Publicada");
        if (!published || Number(published.id) !== data.mapVersion) throw new Error("A planta publicada mudou. Recalcule o percurso.");
      } catch (error) {
        if (active) { setData(null); setError(error instanceof Error ? error.message : "Rota indisponível."); }
      }
    };
    const interval = window.setInterval(() => void check(), 30_000);
    const update = () => void check();
    window.addEventListener("marcon:map-published", update);
    window.addEventListener("focus", update);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("marcon:map-published", update); window.removeEventListener("focus", update); };
  }, [data]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/maps?delivery=${request.id}&page=${page}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        setHistory(b.history);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [request.id, page, revision]);
  async function calculate(depart = false) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: depart ? "departDelivery" : "planDelivery",
          requestId: request.id,
          start,
          destinations,
          objective, transport,
          manual: depart && !data?.route,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setData(b);
      setStart(b.start);
      setPage(1);
      setRevision((v) => v + 1);
      setConfirm(false);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Falha no cálculo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="map-route-summary">
      <h3>Rota da entrega #{request.id}</h3>
      <p>
        O cálculo usa a versão publicada e não baixa estoque. A saída recalcula
        o percurso com os bloqueios atuais e preserva os cálculos anteriores.
      </p>
      {["Aprovada", "Em separação"].includes(request.status) && (
        <>
        <div className="ops-form">
          <label>Objetivo<select value={objective} onChange={(e) => { setObjective(e.target.value as RouteOptions["objective"]); setData(null); }}><option value="distance">Menor distância</option><option value="time">Menor tempo cadastrado</option></select></label>
          <label>Transporte<select value={transport} onChange={(e) => { setTransport(e.target.value as RouteOptions["transport"]); setData(null); }}>{Object.entries(transports).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        </div>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void calculate()}
        >
          {busy ? "Calculando…" : "Calcular / recalcular rota"}
        </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p role="status">{data.reason}</p>
          {data.graph && (
            <div className="ops-form">
              <label>
                Origem do percurso
                <select
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                >
                  {data.graph.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>Entregas adicionais (opcional)</legend>
                <div className="map-stop-list">
                  {data.graph.nodes
                    .filter((n) => n.kind === "delivery")
                    .map((n) => (
                      <label key={n.id}>
                        <input
                          type="checkbox"
                          checked={destinations.includes(n.id)}
                          onChange={(e) =>
                            setDestinations((d) =>
                              e.target.checked
                                ? [...d, n.id]
                                : d.filter((id) => id !== n.id),
                            )
                          }
                        />
                        {n.label}
                      </label>
                    ))}
                </div>
              </fieldset>
            </div>
          )}
          {data.graph && data.route && (
            <>
              <RouteSummary graph={data.graph} route={data.route} />
              <MapViewport>
                <svg
                  className="ops-map"
                  viewBox="0 0 1000 700"
                  role="img"
                  aria-label="Percurso de entrega"
                >
                  <image
                    href={`/api/maps?image=${data.mapVersion}`}
                    width="1000"
                    height="700"
                    preserveAspectRatio="none"
                  />
                  <polyline
                    className="route-path"
                    pathLength="1"
                    fill="none"
                    stroke="var(--blue)"
                    strokeWidth="6"
                    points={data.route.nodes
                      .map((id) => {
                        const n = data.graph!.nodes.find((n) => n.id === id)!;
                        return `${n.x * 1000},${n.y * 700}`;
                      })
                      .join(" ")}
                  />
                </svg>
              </MapViewport>
            </>
          )}
          <button
            className="button primary"
            disabled={
              busy ||
              history[0]?.event === "Saída" ||
              start !== data.start ||
              JSON.stringify(destinations) !== JSON.stringify(data.destinations)
            }
            onClick={() => setConfirm(true)}
          >
            Registrar saída {data.route ? "com recálculo" : "manual"}
          </button>
        </>
      )}
      <details>
        <summary>Histórico de rotas</summary>
        {!history.length ? (
          <p>Nenhum cálculo registrado nesta página.</p>
        ) : (
          history.map((h) => (
            <article className="ops-suggestion" key={h.id}>
              <p>
                <strong>
                  {h.event} · mapa {h.map_version_id ?? "indisponível"}
                </strong>
                <br />
                {h.created_at} · {h.actor}
                <br />
                {h.payload.labels.join(" → ")}
                <br />
                {h.payload.route
                  ? `Custo: ${h.payload.route.cost.toFixed(1)} ${h.payload.metric}`
                  : h.payload.reason}
              </p>
            </article>
          ))
        )}
        <button
          className="button secondary"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Rotas anteriores
        </button>
        <button
          className="button secondary"
          disabled={history.length < 20}
          onClick={() => setPage((p) => p + 1)}
        >
          Mais registros
        </button>
      </details>
      <DashboardDialog
        compact
        open={confirm}
        title="Confirmar saída da entrega"
        onClose={() => setConfirm(false)}
      >
        <p>
          {data?.route
            ? "Recalcular com o mapa publicado atual e registrar a saída?"
            : "Confirmar operação manual, sem rota válida?"}{" "}
          O estoque só é baixado na confirmação da entrega. Se mudou origem ou
          paradas, recalcule antes de sair.
        </p>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void calculate(true)}
        >
          Confirmar saída
        </button>
      </DashboardDialog>
    </section>
  );
}
