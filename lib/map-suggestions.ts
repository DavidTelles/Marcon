import {
  nextPointLabel,
  passageClear,
  type FacilityGraph,
  type MapNode,
} from "./routing";
export type MapText = {
  text: string;
  x: number;
  y: number;
  confidence: number;
};

/** Only unambiguous exact catalog matches acquire IDs; positions still require review. */
export function bindSuggestedLocations(
  graph: FacilityGraph,
  catalog: {
    warehouses: { id: number; name: string }[];
    blocks: { id: number; name: string }[];
    sectors: { id: number; name: string; block_id: number }[];
  },
) {
  const normalized = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return {
    ...graph,
    reviewed: false,
    nodes: graph.nodes.map((node) => {
      if (!node.suggestedLabel) return node;
      const label = normalized(node.suggestedLabel);
      const matches = [
        ...catalog.warehouses
          .filter((w) => normalized(w.name) === label)
          .map((w) => ({
            kind: "warehouse" as const,
            warehouseId: Number(w.id),
          })),
        ...catalog.blocks
          .filter((b) => normalized(b.name) === label)
          .map((b) => ({ kind: "block" as const, blockId: Number(b.id) })),
        ...catalog.sectors
          .filter((s) => normalized(s.name) === label)
          .map((s) => ({
            kind: "sector" as const,
            sectorId: Number(s.id),
            blockId: Number(s.block_id),
          })),
      ];
      if (matches.length !== 1) return node;
      return {
        ...node,
        ...matches[0],
        label: node.suggestedLabel,
        uncertain: true,
        suggestion: `Cadastro identificado pelo texto da planta: ${node.suggestedLabel}. Confira a posição física antes de publicar.`,
      };
    }),
  };
}
// Conservative occupancy: even a thin dark stroke blocks its entire cell.
// Text/furniture may therefore reject a real passage. Never erase ink to guess a door.
export function obstacleGrid(
  pixels: Uint8Array,
  width: number,
  height: number,
): NonNullable<FacilityGraph["obstacles"]> {
  const w = Math.min(160, width),
    h = Math.max(2, Math.min(160, Math.round((height * w) / width))),
    cells = new Uint8Array(w * h);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (pixels[y * width + x] < 150)
        cells[
          Math.min(h - 1, Math.floor((y * h) / height)) * w +
            Math.min(w - 1, Math.floor((x * w) / width))
        ] = 1;
  return { width: w, height: h, cells: Array.from(cells).join("") };
}
export function suggestGraph(
  base: FacilityGraph,
  obstacles: NonNullable<FacilityGraph["obstacles"]>,
  texts: MapText[] = [],
) {
  const graph: FacilityGraph = {
      ...base,
      nodes: [],
      edges: [],
      obstacles,
      reviewed: false,
    },
    m = obstacles;
  const free = (x: number, y: number) =>
    x >= 1 &&
    y >= 1 &&
    x < m.width - 1 &&
    y < m.height - 1 &&
    m.cells[y * m.width + x] === "0";
  const clearance = (x: number, y: number) => {
    for (let r = 1; r <= 8; r++)
      for (let d = -r; d <= r; d++)
        if (
          !free(x + d, y - r) ||
          !free(x + d, y + r) ||
          !free(x - r, y + d) ||
          !free(x + r, y + d)
        )
          return r - 1;
    return 8;
  };
  // Sample traversable regions and join neighbouring regions only with clear visibility.
  const step = 14,
    tiles = new Map<string, MapNode>();
  for (let ty = 0; ty < m.height; ty += step)
    for (let tx = 0; tx < m.width; tx += step) {
      let best: { x: number; y: number; score: number } | null = null;
      for (let y = ty + 2; y < Math.min(ty + step, m.height - 2); y++)
        for (let x = tx + 2; x < Math.min(tx + step, m.width - 2); x++) {
          const score = clearance(x, y);
          if (score >= 1 && (!best || score > best.score))
            best = { x, y, score };
        }
      if (!best) continue;
      const node: MapNode = {
        id: `s-${tx}-${ty}`,
        label: nextPointLabel(graph, "aisle"),
        kind: "aisle",
        x: best.x / (m.width - 1),
        y: best.y / (m.height - 1),
        uncertain: true,
        suggestion: "Região livre estimada; confirme corredor ou acesso.",
      };
      graph.nodes.push(node);
      tiles.set(`${tx}:${ty}`, node);
    }
  for (const [key, a] of tiles) {
    const [x, y] = key.split(":").map(Number);
    for (const key of [`${x + step}:${y}`, `${x}:${y + step}`]) {
      const b = tiles.get(key);
      if (b && passageClear(graph, a, b))
        graph.edges.push({ from: a.id, to: b.id, blocked: false });
    }
  }
  for (const n of graph.nodes) {
    const degree = graph.edges.filter(
      (e) => e.from === n.id || e.to === n.id,
    ).length;
    const radius = clearance(
      Math.round(n.x * (m.width - 1)),
      Math.round(n.y * (m.height - 1)),
    );
    const kind =
      degree >= 3
        ? "junction"
        : degree === 2 && radius <= 2
          ? "door"
          : degree <= 1
            ? "access"
            : "aisle";
    n.kind = kind;
    n.label = nextPointLabel(
      { ...graph, nodes: graph.nodes.filter((v) => v !== n) },
      kind,
    );
    n.suggestion =
      kind === "door"
        ? "Estreitamento: possível porta, confirme presencialmente."
        : "Classificação geométrica incerta; revise o tipo e as ligações.";
  }
  for (const t of texts) {
    if (t.confidence < 45 || t.text.trim().length < 3) continue;
    const n = [...graph.nodes].sort(
      (a, b) =>
        Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y),
    )[0];
    if (!n || Math.hypot(n.x - t.x, n.y - t.y) > 0.16) continue;
    if (/almox|estoque|dep[oó]sito/i.test(t.text)) {
      n.kind = "warehouse";
      n.label = nextPointLabel(
        { ...graph, nodes: graph.nodes.filter((v) => v !== n) },
        "warehouse",
      );
    }
    n.suggestedLabel = t.text.trim().replace(/\s+/g, " ").slice(0, 120);
    n.suggestion = `OCR ${Math.round(t.confidence)}%: ${n.suggestedLabel}. Confirme associação e nome.`;
  }
  return graph;
}
