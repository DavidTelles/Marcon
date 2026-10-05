export type MapNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  kind: keyof typeof mapKinds;
  floor?: number;
  access?: string;
  blocked?: boolean;
  restricted?: boolean;
  allowedTransport?: Transport[];
  uncertain?: boolean;
  suggestion?: string;
  suggestedLabel?: string;
  warehouseId?: number;
  blockId?: number;
  sector?: string;
  sectorId?: number;
};
export type MapEdge = {
  from: string;
  to: string;
  blocked: boolean;
  seconds?: number;
  distance?: number;
  distanceUnit?: "m" | "map";
  oneWay?: boolean;
  vertical?: boolean;
  allowedTransport?: Transport[];
};
export type Wall = { x1: number; y1: number; x2: number; y2: number };
export type FacilityGraph = {
  width: number;
  height: number;
  metersPerPixel: number;
  nodes: MapNode[];
  edges: MapEdge[];
  walls: Wall[];
  reviewed: boolean;
  scaleCalibrated?: boolean;
  obstacles?: { width: number; height: number; cells: string };
};
export const transports = {
  walking: "A pé",
  cart: "Carrinho",
  forklift: "Empilhadeira",
} as const;
export type Transport = keyof typeof transports;
export type RouteOptions = {
  objective?: "distance" | "time";
  transport?: Transport;
  final?: string;
};
export type Path = {
  nodes: string[];
  cost: number;
  stops?: string[];
  unit?: "m" | "unidades do mapa" | "s";
  objective?: "distance" | "time";
  transport?: Transport;
  approximate?: boolean;
};
export const mapKinds = {
  warehouse: "Almoxarifado",
  aisle: "Corredor",
  junction: "Cruzamento",
  door: "Porta",
  access: "Acesso",
  block: "Bloco",
  delivery: "Entrega",
  shelf: "Acesso à prateleira",
  local_stock: "Almoxarifado menor",
  sector: "Setor",
  production_line: "Linha de produção",
  gate: "Portão",
  passage: "Passagem",
  pickup: "Coleta",
  replenishment: "Reposição",
  receiving: "Recebimento",
  shipping: "Expedição",
  loading: "Carga / descarga",
  office: "Escritório",
  administrative: "Área administrativa",
  stairs: "Escada",
  elevator: "Elevador",
  ramp: "Rampa",
  support: "Área de apoio",
  custom: "Personalizado",
} as const;
export function deliveryTargets(
  graph: FacilityGraph,
  blockId: number,
  sectorId?: number,
  pointId?: string,
) {
  const points = graph.nodes.filter(
    (node) =>
      node.blockId === blockId &&
      [
        "block",
        "sector",
        "production_line",
        "delivery",
        "replenishment",
      ].includes(node.kind),
  );
  if (pointId) return points.filter(node=>node.id===pointId);
  if (sectorId) return points.filter(node=>node.sectorId===sectorId);
  return points.filter((node) => !node.sectorId && !node.sector);
}
export function nextPointLabel(g: FacilityGraph, kind: keyof typeof mapKinds) {
  let number = 1;
  while (g.nodes.some((n) => n.label === `${mapKinds[kind]} ${number}`))
    number++;
  return `${mapKinds[kind]} ${number}`;
}
export function passageClear(
  g: FacilityGraph,
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  if (g.walls.some((w) => intersects(a, b, w))) return false;
  const m = g.obstacles;
  if (!m) return true;
  const x = a.x * (m.width - 1),
    y = a.y * (m.height - 1),
    dx = (b.x - a.x) * (m.width - 1),
    dy = (b.y - a.y) * (m.height - 1),
    steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 4) + 1;
  for (let i = 0; i <= steps; i++) {
    const px = x + (dx * i) / steps,
      py = y + (dy * i) / steps;
    for (const cx of [Math.floor(px), Math.ceil(px)])
      for (const cy of [Math.floor(py), Math.ceil(py)])
        if (m.cells[cy * m.width + cx] !== "0") return false;
  }
  return true;
}
export function routeLegs(g: FacilityGraph, path: Path) {
  if (!pathValid(g, path)) return [];
  return path.nodes.slice(1).map((id, i) => {
    const a = g.nodes.find((n) => n.id === path.nodes[i])!,
      b = g.nodes.find((n) => n.id === id)!;
    return {
      from: a.label,
      to: b.label,
      meters:
        g.scaleCalibrated === true
          ? edgeDistance(
              g,
              a,
              b,
              g.edges.find(
                (e) =>
                  (e.from === a.id && e.to === b.id) ||
                  (!e.oneWay && e.to === a.id && e.from === b.id),
              )!,
            )
          : null,
    };
  });
}
const cross = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
export function intersects(
  a: { x: number; y: number },
  b: { x: number; y: number },
  w: Wall,
) {
  const c = { x: w.x1, y: w.y1 },
    d = { x: w.x2, y: w.y2 };
  const epsilon = 1e-8;
  if (
    Math.max(a.x, b.x) + epsilon < Math.min(c.x, d.x) ||
    Math.max(c.x, d.x) + epsilon < Math.min(a.x, b.x) ||
    Math.max(a.y, b.y) + epsilon < Math.min(c.y, d.y) ||
    Math.max(c.y, d.y) + epsilon < Math.min(a.y, b.y)
  )
    return false;
  return (
    cross(a, b, c) * cross(a, b, d) <= epsilon &&
    cross(c, d, a) * cross(c, d, b) <= epsilon
  );
}
export function graphProblems(g: FacilityGraph): string[] {
  if (
    !g ||
    !Array.isArray(g.nodes) ||
    !Array.isArray(g.edges) ||
    !Array.isArray(g.walls) ||
    g.nodes.length > 200 ||
    g.edges.length > 1000 ||
    g.walls.length > 1000
  )
    return ["Grafo inválido ou excessivo."];
  if (
    ![g.width, g.height, g.metersPerPixel].every(
      (n) => Number.isFinite(n) && n > 0,
    ) ||
    g.width > 10000 ||
    g.height > 10000 ||
    g.metersPerPixel > 100
  )
    return ["Dimensões ou escala inválidas."];
  const errors: string[] = [],
    ids = new Set<string>();
  if (
    typeof g.reviewed !== "boolean" ||
    (g.scaleCalibrated !== undefined && typeof g.scaleCalibrated !== "boolean")
  )
    return ["Estado de revisão ou calibração inválido."];
  const mask = g.obstacles;
  if (
    mask &&
    (!Number.isInteger(mask.width) ||
      !Number.isInteger(mask.height) ||
      mask.width < 2 ||
      mask.height < 2 ||
      mask.width > 192 ||
      mask.height > 192 ||
      typeof mask.cells !== "string" ||
      mask.cells.length !== mask.width * mask.height ||
      /[^01]/.test(mask.cells))
  )
    return ["Máscara de obstáculos inválida."];
  for (const n of g.nodes) {
    if (
      !n ||
      typeof n.id !== "string" ||
      !/^[-\w]{1,64}$/.test(n.id) ||
      ids.has(n.id) ||
      typeof n.label !== "string" ||
      !n.label.trim() ||
      n.label.length > 120 ||
      !Object.hasOwn(mapKinds, n.kind) ||
      (n.floor !== undefined &&
        (!Number.isInteger(n.floor) || Math.abs(n.floor) > 200)) ||
      (n.access !== undefined &&
        (typeof n.access !== "string" || n.access.length > 120)) ||
      [n.blocked, n.restricted].some(
        (v) => v !== undefined && typeof v !== "boolean",
      ) ||
      !validTransport(n.allowedTransport) ||
      (n.sectorId !== undefined && (!Number.isSafeInteger(n.sectorId) || n.sectorId < 1 || !n.blockId)) ||
      (n.sector !== undefined &&
        (typeof n.sector !== "string" ||
          !n.sector.trim() ||
          n.sector.length > 80 ||
          !n.blockId)) ||
      ![n.x, n.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1) ||
      [n.warehouseId, n.blockId].some(
        (v) => v !== undefined && (!Number.isSafeInteger(v) || v < 1),
      )
    )
      return ["Ponto inválido ou duplicado."];
    ids.add(n.id);
  }
  for (const w of g.walls)
    if (
      !w ||
      ![w.x1, w.y1, w.x2, w.y2].every(
        (v) => Number.isFinite(v) && v >= 0 && v <= 1,
      )
    )
      return ["Parede inválida."];
  const directions = new Set<string>();
  for (const edge of g.edges) {
    if (!edge || typeof edge.blocked !== "boolean")
      return ["Caminho inválido."];
    const a = g.nodes.find((n) => n.id === edge.from),
      b = g.nodes.find((n) => n.id === edge.to);
    if (
      !a ||
      !b ||
      a === b ||
      (edge.distance !== undefined && edge.distanceUnit === undefined) ||
      [edge.seconds, edge.distance].some(
        (v) => v !== undefined && (!Number.isFinite(v) || v < 0 || v > 1e9),
      ) ||
      (edge.distanceUnit !== undefined &&
        !["m", "map"].includes(edge.distanceUnit)) ||
      [edge.oneWay, edge.vertical].some(
        (v) => v !== undefined && typeof v !== "boolean",
      ) ||
      !validTransport(edge.allowedTransport) ||
      ((a.floor ?? 0) !== (b.floor ?? 0) && !edge.vertical) ||
      (edge.vertical && edge.distance === undefined)
    )
      return ["Caminho ou tempo inválido."];
    const keys = [
      `${edge.from}:${edge.to}`,
      ...(!edge.oneWay ? [`${edge.to}:${edge.from}`] : []),
    ];
    if (keys.some((k) => directions.has(k)))
      return ["Conexão duplicada no mesmo sentido."];
    keys.forEach((k) => directions.add(k));
    if (!edge.blocked && !edge.vertical && !passageClear(g, a, b))
      errors.push(
        `Caminho ${a.label} → ${b.label} cruza uma parede ou obstáculo. Corrija os pontos e a passagem.`,
      );
  }
  return errors;
}
export function shortestPath(
  g: FacilityGraph,
  from: string,
  to: string,
  options: RouteOptions = {},
): Path | null {
  const objective = options.objective ?? "distance",
    transport = options.transport ?? "walking";
  if (
    !["distance", "time"].includes(objective) ||
    !Object.hasOwn(transports, transport) ||
    graphProblems(g).length ||
    !g.nodes.some((n) => n.id === from) ||
    !g.nodes.some((n) => n.id === to)
  )
    return null;
  const usable = (n: MapNode) =>
    !n.blocked &&
    !n.restricted &&
    (!n.allowedTransport || n.allowedTransport.includes(transport));
  if (![from, to].every((id) => usable(g.nodes.find((n) => n.id === id)!)))
    return null;
  const costs = new Map(g.nodes.map((n) => [n.id, Infinity])),
    previous = new Map<string, string>(),
    todo = new Set(costs.keys());
  costs.set(from, 0);
  while (todo.size) {
    const current = [...todo].sort((a, b) => costs.get(a)! - costs.get(b)!)[0];
    if (!Number.isFinite(costs.get(current))) break;
    todo.delete(current);
    if (current === to) break;
    for (const edge of g.edges) {
      if (
        edge.blocked ||
        (edge.allowedTransport && !edge.allowedTransport.includes(transport))
      )
        continue;
      const next =
        edge.from === current
          ? edge.to
          : !edge.oneWay && edge.to === current
            ? edge.from
            : null;
      if (!next || !todo.has(next)) continue;
      const a = g.nodes.find((n) => n.id === current)!,
        b = g.nodes.find((n) => n.id === next)!;
      if (!usable(b)) continue;
      // Missing durations make a segment unavailable for the time objective.
      const weight =
        objective === "time" ? edge.seconds : edgeDistance(g, a, b, edge);
      if (weight === undefined || !Number.isFinite(weight)) continue;
      const cost = costs.get(current)! + weight;
      if (cost < costs.get(next)!) {
        costs.set(next, cost);
        previous.set(next, current);
      }
    }
  }
  if (!Number.isFinite(costs.get(to))) return null;
  const nodes = [to];
  while (nodes[0] !== from) {
    const p = previous.get(nodes[0]);
    if (!p) return null;
    nodes.unshift(p);
  }
  return {
    nodes,
    cost: costs.get(to)!,
    objective,
    transport,
    unit:
      objective === "time"
        ? "s"
        : g.scaleCalibrated === true
          ? "m"
          : "unidades do mapa",
  };
}
export function pathValid(g: FacilityGraph, path: Path) {
  if (graphProblems(g).length || !path.nodes.length) return false;
  const transport = path.transport ?? "walking";
  const usable = (n: MapNode) =>
    !n.blocked &&
    !n.restricted &&
    (!n.allowedTransport || n.allowedTransport.includes(transport));
  if (!path.nodes.every((id) => g.nodes.some((n) => n.id === id && usable(n))))
    return false;
  return path.nodes.slice(1).every((id, i) =>
    g.edges.some(
      (e) =>
        !e.blocked &&
        (!e.allowedTransport || e.allowedTransport.includes(transport)) &&
        (path.objective !== "time" || e.seconds !== undefined) &&
        (path.objective === "time" ||
          Number.isFinite(
            edgeDistance(
              g,
              g.nodes.find((n) => n.id === path.nodes[i])!,
              g.nodes.find((n) => n.id === id)!,
              e,
            ),
          )) &&
        ((e.from === path.nodes[i] && e.to === id) ||
          (!e.oneWay && e.to === path.nodes[i] && e.from === id)),
    ),
  );
}
function validTransport(value: unknown) {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= 3 &&
      value.every((v) => typeof v === "string" && Object.hasOwn(transports, v)))
  );
}
function edgeDistance(g: FacilityGraph, a: MapNode, b: MapNode, edge: MapEdge) {
  if (edge.distance !== undefined && edge.distanceUnit) {
    if (edge.distanceUnit === "m")
      return g.scaleCalibrated === true ? edge.distance : Infinity;
    return edge.distance * (g.scaleCalibrated === true ? g.metersPerPixel : 1);
  }
  return (
    edge?.distance ??
    Math.hypot((a.x - b.x) * g.width, (a.y - b.y) * g.height) *
      (g.scaleCalibrated === true ? g.metersPerPixel : 1)
  );
}
export function planStops(
  g: FacilityGraph,
  start: string,
  stops: string[],
  options: RouteOptions = {},
): Path | null {
  if (!shortestPath(g, start, start, options)) return null;
  const pending = [...new Set(stops)].filter(
    (s) => s !== start && s !== options.final,
  );
  if (pending.length > 25) return null;
  const ids = [
      ...new Set([
        start,
        ...pending,
        ...(options.final ? [options.final] : []),
      ]),
    ],
    matrix = new Map<string, Path | null>();
  for (const a of ids)
    for (const b of ids)
      matrix.set(`${a}:${b}`, shortestPath(g, a, b, options));
  const order = [start];
  while (pending.length) {
    const from = order.at(-1)!;
    pending.sort(
      (a, b) =>
        (matrix.get(`${from}:${a}`)?.cost ?? Infinity) -
        (matrix.get(`${from}:${b}`)?.cost ?? Infinity),
    );
    const next = pending.shift()!;
    if (!matrix.get(`${from}:${next}`)) return null;
    order.push(next);
  }
  if (options.final && order.at(-1) !== options.final)
    order.push(options.final);
  const score = (arr: string[]) =>
    arr
      .slice(1)
      .reduce(
        (s, n, i) => s + (matrix.get(`${arr[i]}:${n}`)?.cost ?? Infinity),
        0,
      );
  // TSP aberto aproximado: vizinho mais próximo + 2-opt, sobre matriz Dijkstra.
  for (let pass = 0; pass < 10; pass++) {
    let improved = false;
    for (let i = 1; i < order.length - 1; i++)
      for (let j = i + 1; j < order.length - (options.final ? 1 : 0); j++) {
        const candidate = [
          ...order.slice(0, i),
          ...order.slice(i, j + 1).reverse(),
          ...order.slice(j + 1),
        ];
        if (score(candidate) + 1e-6 < score(order)) {
          order.splice(0, order.length, ...candidate);
          improved = true;
        }
      }
    if (!improved) break;
  }
  const nodes = [start];
  for (let i = 1; i < order.length; i++) {
    const leg = matrix.get(`${order[i - 1]}:${order[i]}`);
    if (!leg) return null;
    nodes.push(...leg.nodes.slice(1));
  }
  return {
    ...shortestPath(g, start, start, options)!,
    nodes,
    cost: score(order),
    stops: order,
    approximate: true,
  };
}
