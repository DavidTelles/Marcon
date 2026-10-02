"use client";
import { useEffect, useRef, useState } from "react";
import { MapViewport } from "./map-viewport";
import {
  graphProblems,
  planStops,
  type FacilityGraph,
  type MapNode,
  type Path,
  mapKinds,
  nextPointLabel,
  passageClear,
} from "@/lib/routing";
import { RouteSummary } from "./route-summary";
type Version = {
  id: number;
  title: string;
  status: string;
  graph: FacilityGraph;
};
const empty: FacilityGraph = {
  width: 1000,
  height: 700,
  metersPerPixel: 1,
  scaleCalibrated: false,
  nodes: [],
  edges: [],
  walls: [],
  reviewed: false,
};
export function MapEditor() {
  const [versions, setVersions] = useState<Version[]>([]),
    [warehouses, setWarehouses] = useState<{ id: number; name: string }[]>([]),
    [blocks, setBlocks] = useState<{ id: number; name: string }[]>([]),
    [graph, setGraph] = useState<FacilityGraph>(empty),
    [base, setBase] = useState<number>(),
    [title, setTitle] = useState("Planta MARCON"),
    [url, setUrl] = useState(""),
    [mode, setMode] = useState("select"),
    [selected, setSelected] = useState(""),
    [kind, setKind] = useState<MapNode["kind"]>("aisle"),
    [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null),
    [route, setRoute] = useState<Path | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<FacilityGraph | null>(null),
    [connectTo, setConnectTo] = useState("");
  const file = useRef<File | null>(null),
    objectUrl = useRef("");
  async function refresh() {
    const response = await fetch("/api/maps");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setVersions(
      body.maps.map((m: Version) => ({
        ...m,
        graph: typeof m.graph === "string" ? JSON.parse(m.graph) : m.graph,
      })),
    );
    setWarehouses(body.warehouses);
    setBlocks(body.blocks);
  }
  useEffect(() => {
    void Promise.resolve()
      .then(refresh)
      .catch((e) => setMessage(e.message));
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);
  function change(next: FacilityGraph) {
    const edges = next.edges.map((e) => {
      const a = next.nodes.find((n) => n.id === e.from),
        b = next.nodes.find((n) => n.id === e.to);
      return a && b && !passageClear(next, a, b) ? { ...e, blocked: true } : e;
    });
    setGraph({ ...next, edges, reviewed: false });
    setRoute(null);
  }
  function choose(v: Version) {
    setBase(v.id);
    setTitle(v.title);
    setGraph({
      ...v.graph,
      nodes: v.graph.nodes.map((n) =>
        n.kind === "shelf" ? { ...n, kind: "access" } : n,
      ),
    });
    setSuggestion(null);
    setUrl("/api/maps?image=" + v.id);
    file.current = null;
    setSelected("");
    setRoute(null);
    setMessage("Edições são salvas como uma nova versão em rascunho.");
  }
  async function upload(f?: File) {
    if (!f) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(f.type) ||
      f.size > 5_000_000
    ) {
      setMessage("Envie PNG, JPEG ou WebP de até 5 MB.");
      return;
    }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      if (img.width * img.height > 16_000_000) {
        setMessage("A planta excede 16 milhões de pixels.");
        return;
      }
      file.current = f;
      setBase(undefined);
      setUrl(objectUrl.current);
      change({ ...empty, width: img.width, height: img.height });
      setSuggestion(null);
      setSelected("");
    };
    img.onerror = () => setMessage("Imagem inválida.");
    img.src = objectUrl.current;
  }
  function pointClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect(),
      x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    if (mode === "point") {
      const id = "p" + Date.now().toString(36);
      change({
        ...graph,
        nodes: [
          ...graph.nodes,
          {
            id,
            label: nextPointLabel(graph, kind === "shelf" ? "access" : kind),
            kind,
            x,
            y,
          },
        ],
      });
      setSelected(id);
    } else if (mode === "wall") {
      if (anchor) {
        change({
          ...graph,
          walls: [...graph.walls, { x1: anchor.x, y1: anchor.y, x2: x, y2: y }],
        });
        setAnchor(null);
      } else setAnchor({ x, y });
    } else if (mode === "move" && selected) {
      change({
        ...graph,
        nodes: graph.nodes.map((n) => (n.id === selected ? { ...n, x, y } : n)),
      });
    }
  }
  function nodeClick(id: string) {
    if (
      mode === "connect" &&
      selected &&
      id !== selected &&
      !graph.edges.some(
        (e) => [e.from, e.to].includes(id) && [e.from, e.to].includes(selected),
      )
    ) {
      const a = graph.nodes.find((n) => n.id === selected)!,
        b = graph.nodes.find((n) => n.id === id)!;
      if (!passageClear(graph, a, b)) {
        setMessage(
          "Ligação recusada: parede ou obstáculo no trajeto. Adicione pontos ao longo da passagem livre.",
        );
        return;
      }
      change({
        ...graph,
        edges: [...graph.edges, { from: selected, to: id, blocked: false }],
      });
    }
    setSelected(id);
  }
  async function suggest() {
    setBusy(true);
    setMessage("Analisando passagens e texto da planta localmente…");
    try {
      const f = new FormData();
      f.set("action", "suggest");
      f.set("graph", JSON.stringify(graph));
      if (base) f.set("baseId", String(base));
      if (file.current) f.set("image", file.current);
      const r = await fetch("/api/maps", { method: "POST", body: f }),
        data = await r.json();
      if (!r.ok) throw Error(data.error);
      setSuggestion(data.graph);
      setMessage(data.ocr + " " + data.warning);
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Falha ao analisar. Continue a edição manual.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      const problems = graphProblems(graph);
      if (problems.length) throw new Error(problems[0]);
      const f = new FormData();
      f.set("title", title);
      f.set("graph", JSON.stringify(graph));
      if (base) f.set("baseId", String(base));
      if (file.current) f.set("image", file.current);
      const response = await fetch("/api/maps", { method: "POST", body: f }),
        body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setBase(body.id);
      file.current = null;
      setUrl("/api/maps?image=" + body.id);
      await refresh();
      setMessage(
        "Rascunho " +
          body.id +
          " salvo. Teste e confira os caminhos antes de publicar.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function publish(id: number) {
    setBusy(true);
    try {
      const response = await fetch("/api/maps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "publish", id }),
        }),
        body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await refresh();
      setMessage(
        "Versão " + id + " publicada. Versões anteriores preservadas.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao publicar.");
    } finally {
      setBusy(false);
    }
  }
  const node = graph.nodes.find((n) => n.id === selected);
  function patchNode(p: Partial<MapNode>) {
    change({
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === selected ? { ...n, ...p } : n)),
    });
  }
  return (
    <section className="panel ops-panel">
      <div className="panel-head">
        <div>
          <h2>Planta e caminhos transitáveis</h2>
          <p>
            Posicione os pontos sobre a planta e conecte somente trajetos
            livres. Desenhe paredes em segmentos, deixando as portas abertas. A
            análise automática gera candidatos que exigem revisão. Prateleiras
            pertencem ao estoque; use pontos de acesso próximos.
          </p>
        </div>
      </div>
      <div className="ops-form">
        <label>
          Título
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
        </label>
        <label>
          Planta PNG, JPEG ou WebP
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </label>
        <label>
          Escala: metros por pixel
          <input
            type="number"
            min="0.000001"
            max="100"
            step="any"
            value={graph.metersPerPixel}
            onChange={(e) =>
              change({
                ...graph,
                metersPerPixel: Number(e.target.value),
                scaleCalibrated: false,
              })
            }
          />
        </label>
        <label>
          Ferramenta
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setAnchor(null);
            }}
          >
            <option value="select">Selecionar ponto</option>
            <option value="point">Adicionar ponto</option>
            <option value="move">Mover selecionado</option>
            <option value="connect">Conectar dois pontos</option>
            <option value="wall">Parede: clicar início e fim</option>
          </select>
        </label>
        <label>
          Tipo do novo ponto
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as MapNode["kind"])}
          >
            {Object.entries(mapKinds).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        <input
          type="checkbox"
          checked={graph.scaleCalibrated === true}
          onChange={(e) =>
            change({ ...graph, scaleCalibrated: e.target.checked })
          }
        />{" "}
        Escala calibrada por medida conhecida na planta
      </label>
      <button
        className="button secondary"
        disabled={!url || busy}
        onClick={() => void suggest()}
      >
        Sugerir pontos e caminhos
      </button>
      {suggestion && (
        <section className="map-suggestion-review">
          <h3>Sugestões para revisão</h3>
          <p>
            {suggestion.nodes.length} pontos e {suggestion.edges.length}{" "}
            conexões candidatas. Tipos, nomes e passagens são incertos. Aplicar
            substitui os pontos do rascunho atual; as versões salvas permanecem
            preservadas.
          </p>
          <button
            className="button primary"
            onClick={() => {
              change({
                ...suggestion,
                metersPerPixel: graph.metersPerPixel,
                scaleCalibrated: graph.scaleCalibrated,
                walls: graph.walls,
              });
              setSuggestion(null);
              setSelected("");
            }}
          >
            Aplicar sugestões ao rascunho
          </button>
          <button
            className="button secondary"
            onClick={() => setSuggestion(null)}
          >
            Descartar sugestões
          </button>
        </section>
      )}
      {url ? (
        <MapViewport>
          <svg
            className="ops-map"
            viewBox="0 0 1000 700"
            onClick={pointClick}
            role="img"
            aria-label="Editor visual da planta; pontos também editáveis nos campos abaixo"
          >
            <image
              href={url}
              width="1000"
              height="700"
              preserveAspectRatio="none"
            />
            {graph.walls.map((w, i) => (
              <line
                key={"w" + i}
                x1={w.x1 * 1000}
                y1={w.y1 * 700}
                x2={w.x2 * 1000}
                y2={w.y2 * 700}
                stroke="var(--danger)"
                strokeWidth="5"
              />
            ))}
            {graph.edges.map((e, i) => {
              const a = graph.nodes.find((n) => n.id === e.from)!,
                b = graph.nodes.find((n) => n.id === e.to)!;
              return (
                <line
                  key={i}
                  x1={a.x * 1000}
                  y1={a.y * 700}
                  x2={b.x * 1000}
                  y2={b.y * 700}
                  stroke={e.blocked ? "var(--danger)" : "var(--success)"}
                  strokeWidth="4"
                  strokeDasharray={e.blocked ? "8 6" : undefined}
                />
              );
            })}
            {route && (
              <polyline
                className="route-path"
                pathLength="1"
                points={route.nodes
                  .map((id) => {
                    const n = graph.nodes.find((n) => n.id === id)!;
                    return `${n.x * 1000},${n.y * 700}`;
                  })
                  .join(" ")}
                stroke="var(--blue)"
                strokeWidth="7"
                fill="none"
              />
            )}
            {graph.nodes.map((n) => (
              <g
                key={n.id}
                onClick={(e) => {
                  e.stopPropagation();
                  nodeClick(n.id);
                }}
              >
                <circle
                  cx={n.x * 1000}
                  cy={n.y * 700}
                  r={selected === n.id ? 12 : 9}
                  fill={
                    selected === n.id || n.uncertain ? "#b96a00" : "var(--blue)"
                  }
                />
                <text
                  x={n.x * 1000 + 12}
                  y={n.y * 700 - 12}
                  fontSize="16"
                  paintOrder="stroke"
                  stroke="white"
                  strokeWidth="4"
                  fill="var(--ink)"
                >
                  {n.label}
                </text>
              </g>
            ))}
          </svg>
        </MapViewport>
      ) : (
        <p>Envie uma planta ou abra uma versão abaixo.</p>
      )}
      {anchor && <p>Clique no final da parede.</p>}
      <label>
        Ponto selecionado
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Selecione</option>
          {graph.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label} ({n.id})
            </option>
          ))}
        </select>
      </label>
      {node && (
        <div className="ops-form">
          {node.uncertain && (
            <p role="status">
              Sugestão incerta: {node.suggestion || "Revise este ponto."}
            </p>
          )}
          {node.uncertain && (
            <button
              className="button secondary"
              onClick={() => patchNode({ uncertain: false })}
            >
              Marcar ponto como revisado
            </button>
          )}
          {node.suggestedLabel && (
            <button
              className="button secondary"
              onClick={() => patchNode({ label: node.suggestedLabel })}
            >
              Usar nome OCR: {node.suggestedLabel}
            </button>
          )}
          <label>
            Nome
            <input
              value={node.label}
              onChange={(e) => patchNode({ label: e.target.value })}
            />
          </label>
          <label>
            Tipo
            <select
              value={node.kind}
              onChange={(e) =>
                patchNode({ kind: e.target.value as MapNode["kind"] })
              }
            >
              {Object.entries(mapKinds).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Almoxarifado
            <select
              value={node.warehouseId ?? ""}
              onChange={(e) =>
                patchNode({ warehouseId: Number(e.target.value) || undefined })
              }
            >
              <option value="">Sem vínculo</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Bloco
            <select
              value={node.blockId ?? ""}
              onChange={(e) =>
                patchNode({ blockId: Number(e.target.value) || undefined })
              }
            >
              <option value="">Sem vínculo</option>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          {(["x", "y"] as const).map((axis) => (
            <label key={axis}>
              Posição {axis} (0 a 1)
              <input
                type="number"
                min="0"
                max="1"
                step="0.001"
                value={node[axis]}
                onChange={(e) => patchNode({ [axis]: Number(e.target.value) })}
              />
            </label>
          ))}
          <label>
            Ligar ao ponto
            <select
              value={connectTo}
              onChange={(e) => setConnectTo(e.target.value)}
            >
              <option value="">Selecione</option>
              {graph.nodes
                .filter((n) => n.id !== selected)
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="button secondary"
            disabled={!connectTo}
            onClick={() => {
              const a = graph.nodes.find((n) => n.id === selected)!,
                b = graph.nodes.find((n) => n.id === connectTo);
              if (!b || !passageClear(graph, a, b)) {
                setMessage("Ligação recusada: parede ou obstáculo no trajeto.");
                return;
              }
              if (
                !graph.edges.some(
                  (e) =>
                    [e.from, e.to].includes(selected) &&
                    [e.from, e.to].includes(connectTo),
                )
              )
                change({
                  ...graph,
                  edges: [
                    ...graph.edges,
                    { from: selected, to: connectTo, blocked: false },
                  ],
                });
            }}
          >
            Ligar pontos
          </button>
          <button
            className="button secondary"
            onClick={() => {
              change({
                ...graph,
                nodes: graph.nodes.filter((n) => n.id !== selected),
                edges: graph.edges.filter(
                  (e) => e.from !== selected && e.to !== selected,
                ),
              });
              setSelected("");
            }}
          >
            Remover ponto
          </button>
        </div>
      )}
      <details>
        <summary>Caminhos e bloqueios ({graph.edges.length})</summary>
        {graph.edges.map((edge, i) => (
          <div className="ops-form" key={i}>
            <span>
              {graph.nodes.find((n) => n.id === edge.from)?.label} ↔{" "}
              {graph.nodes.find((n) => n.id === edge.to)?.label}
            </span>
            <label>
              Bloqueado
              <input
                type="checkbox"
                checked={edge.blocked}
                onChange={(e) =>
                  change({
                    ...graph,
                    edges: graph.edges.map((v, j) =>
                      j === i ? { ...v, blocked: e.target.checked } : v,
                    ),
                  })
                }
              />
            </label>
            <label>
              Tempo em segundos (vazio: escala)
              <input
                type="number"
                min="1"
                value={edge.seconds ?? ""}
                onChange={(e) =>
                  change({
                    ...graph,
                    edges: graph.edges.map((v, j) =>
                      j === i
                        ? {
                            ...v,
                            seconds: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          }
                        : v,
                    ),
                  })
                }
              />
            </label>
            <button
              className="button secondary"
              onClick={() =>
                change({
                  ...graph,
                  edges: graph.edges.filter((_, j) => j !== i),
                })
              }
            >
              Excluir caminho
            </button>
          </div>
        ))}
      </details>
      <button
        className="button secondary"
        disabled={!graph.walls.length}
        onClick={() => change({ ...graph, walls: graph.walls.slice(0, -1) })}
      >
        Desfazer última parede
      </button>
      <form
        className="ops-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            result = planStops(
              graph,
              String(f.get("start")),
              f.getAll("stops") as string[],
            );
          setRoute(result);
          setMessage(
            result
              ? "Percurso calculado, sem movimentação de saldo."
              : "Rota indisponível. Confira ligações, paredes e bloqueios.",
          );
        }}
      >
        <label>
          Início
          <select name="start">
            {graph.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Paradas (selecione até 25)
          <span className="map-stop-list">
            {graph.nodes.map((n) => (
              <span key={n.id}>
                <input
                  aria-label={"Parada " + n.label}
                  type="checkbox"
                  name="stops"
                  value={n.id}
                />
                {n.label}
              </span>
            ))}
          </span>
        </label>
        <button className="button secondary">Testar percurso</button>
      </form>
      {route && <RouteSummary graph={graph} route={route} />}
      <label>
        <input
          type="checkbox"
          checked={graph.reviewed}
          onChange={(e) => setGraph({ ...graph, reviewed: e.target.checked })}
        />{" "}
        Conferi fisicamente a escala, paredes, portas e caminhos transitáveis
        desta versão.
      </label>
      <button
        className="button primary"
        disabled={busy || !url}
        onClick={() => void save()}
      >
        Salvar nova versão
      </button>
      {message && <p role="status">{message}</p>}
      <h3>Histórico de versões</h3>
      {versions.map((v) => (
        <div className="ops-suggestion" key={v.id}>
          <span>
            #{v.id} · {v.title} · {v.status}
          </span>
          <button className="button secondary" onClick={() => choose(v)}>
            Abrir versão
          </button>
          {v.status === "Rascunho" && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void publish(v.id)}
            >
              Publicar versão {v.id}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
