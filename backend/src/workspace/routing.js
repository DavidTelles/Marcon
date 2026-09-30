"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var routing_exports = {};
__export(routing_exports, {
  graphProblems: () => graphProblems,
  intersects: () => intersects,
  mapKinds: () => mapKinds,
  nextPointLabel: () => nextPointLabel,
  passageClear: () => passageClear,
  planStops: () => planStops,
  routeLegs: () => routeLegs,
  shortestPath: () => shortestPath
});
module.exports = __toCommonJS(routing_exports);
const mapKinds = {
  warehouse: "Almoxarifado",
  aisle: "Corredor",
  junction: "Cruzamento",
  door: "Porta",
  access: "Acesso",
  block: "Bloco",
  delivery: "Entrega"
};
function nextPointLabel(g, kind) {
  let number = 1;
  while (g.nodes.some((n) => n.label === `${mapKinds[kind]} ${number}`))
    number++;
  return `${mapKinds[kind]} ${number}`;
}
function passageClear(g, a, b) {
  if (g.walls.some((w) => intersects(a, b, w))) return false;
  const m = g.obstacles;
  if (!m) return true;
  const x = a.x * (m.width - 1), y = a.y * (m.height - 1), dx = (b.x - a.x) * (m.width - 1), dy = (b.y - a.y) * (m.height - 1), steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 4) + 1;
  for (let i = 0; i <= steps; i++) {
    const px = x + dx * i / steps, py = y + dy * i / steps;
    for (const cx of [Math.floor(px), Math.ceil(px)])
      for (const cy of [Math.floor(py), Math.ceil(py)])
        if (m.cells[cy * m.width + cx] !== "0") return false;
  }
  return true;
}
function routeLegs(g, path) {
  return path.nodes.slice(1).map((id, i) => {
    const a = g.nodes.find((n) => n.id === path.nodes[i]), b = g.nodes.find((n) => n.id === id);
    return {
      from: a.label,
      to: b.label,
      meters: g.scaleCalibrated === true ? Math.hypot((a.x - b.x) * g.width, (a.y - b.y) * g.height) * g.metersPerPixel : null
    };
  });
}
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function intersects(a, b, w) {
  const c = { x: w.x1, y: w.y1 }, d = { x: w.x2, y: w.y2 };
  const epsilon = 1e-8;
  if (Math.max(a.x, b.x) + epsilon < Math.min(c.x, d.x) || Math.max(c.x, d.x) + epsilon < Math.min(a.x, b.x) || Math.max(a.y, b.y) + epsilon < Math.min(c.y, d.y) || Math.max(c.y, d.y) + epsilon < Math.min(a.y, b.y))
    return false;
  return cross(a, b, c) * cross(a, b, d) <= epsilon && cross(c, d, a) * cross(c, d, b) <= epsilon;
}
function graphProblems(g) {
  if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.edges) || !Array.isArray(g.walls) || g.nodes.length > 200 || g.edges.length > 1e3 || g.walls.length > 1e3)
    return ["Grafo inv\xE1lido ou excessivo."];
  if (![g.width, g.height, g.metersPerPixel].every(
    (n) => Number.isFinite(n) && n > 0
  ) || g.width > 1e4 || g.height > 1e4 || g.metersPerPixel > 100)
    return ["Dimens\xF5es ou escala inv\xE1lidas."];
  const errors = [], ids = /* @__PURE__ */ new Set();
  const mask = g.obstacles;
  if (mask && (!Number.isInteger(mask.width) || !Number.isInteger(mask.height) || mask.width < 2 || mask.height < 2 || mask.width > 192 || mask.height > 192 || typeof mask.cells !== "string" || mask.cells.length !== mask.width * mask.height || /[^01]/.test(mask.cells)))
    return ["M\xE1scara de obst\xE1culos inv\xE1lida."];
  for (const n of g.nodes) {
    if (!n || typeof n.id !== "string" || !/^[-\w]{1,64}$/.test(n.id) || ids.has(n.id) || typeof n.label !== "string" || !n.label.trim() || n.label.length > 120 || ![
      "warehouse",
      "block",
      "aisle",
      "door",
      "shelf",
      "delivery",
      "junction",
      "access"
    ].includes(n.kind) || ![n.x, n.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1) || [n.warehouseId, n.blockId].some(
      (v) => v !== void 0 && (!Number.isSafeInteger(v) || v < 1)
    ))
      return ["Ponto inv\xE1lido ou duplicado."];
    ids.add(n.id);
  }
  for (const w of g.walls)
    if (!w || ![w.x1, w.y1, w.x2, w.y2].every(
      (v) => Number.isFinite(v) && v >= 0 && v <= 1
    ))
      return ["Parede inv\xE1lida."];
  for (const edge of g.edges) {
    if (!edge || typeof edge.blocked !== "boolean")
      return ["Caminho inv\xE1lido."];
    const a = g.nodes.find((n) => n.id === edge.from), b = g.nodes.find((n) => n.id === edge.to);
    if (!a || !b || a === b || edge.seconds !== void 0 && (!Number.isFinite(edge.seconds) || edge.seconds <= 0 || edge.seconds > 86400))
      return ["Caminho ou tempo inv\xE1lido."];
    if (!edge.blocked && !passageClear(g, a, b))
      errors.push(
        `Caminho ${a.label} \u2192 ${b.label} cruza uma parede ou obst\xE1culo. Corrija os pontos e a passagem.`
      );
  }
  return errors;
}
function shortestPath(g, from, to) {
  if (graphProblems(g).length || !g.nodes.some((n) => n.id === from) || !g.nodes.some((n) => n.id === to))
    return null;
  const costs = new Map(g.nodes.map((n) => [n.id, Infinity])), previous = /* @__PURE__ */ new Map(), todo = new Set(costs.keys());
  costs.set(from, 0);
  while (todo.size) {
    const current = [...todo].sort((a, b) => costs.get(a) - costs.get(b))[0];
    if (!Number.isFinite(costs.get(current))) break;
    todo.delete(current);
    if (current === to) break;
    for (const edge of g.edges) {
      if (edge.blocked) continue;
      const next = edge.from === current ? edge.to : edge.to === current ? edge.from : null;
      if (!next || !todo.has(next)) continue;
      const a = g.nodes.find((n) => n.id === current), b = g.nodes.find((n) => n.id === next);
      const cost = costs.get(current) + (g.scaleCalibrated === true ? Math.hypot((a.x - b.x) * g.width, (a.y - b.y) * g.height) * g.metersPerPixel : g.scaleCalibrated === false ? Math.hypot((a.x - b.x) * g.width, (a.y - b.y) * g.height) : edge.seconds ?? Math.hypot((a.x - b.x) * g.width, (a.y - b.y) * g.height) * g.metersPerPixel / 1.2);
      if (cost < costs.get(next)) {
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
  return { nodes, cost: costs.get(to) };
}
function planStops(g, start, stops) {
  const pending = [...new Set(stops)].filter((s) => s !== start);
  if (pending.length > 25) return null;
  const ids = [start, ...pending], matrix = /* @__PURE__ */ new Map();
  for (const a of ids)
    for (const b of ids) matrix.set(`${a}:${b}`, shortestPath(g, a, b));
  const order = [start];
  while (pending.length) {
    const from = order.at(-1);
    pending.sort(
      (a, b) => (matrix.get(`${from}:${a}`)?.cost ?? Infinity) - (matrix.get(`${from}:${b}`)?.cost ?? Infinity)
    );
    const next = pending.shift();
    if (!matrix.get(`${from}:${next}`)) return null;
    order.push(next);
  }
  const score = (arr) => arr.slice(1).reduce(
    (s, n, i) => s + (matrix.get(`${arr[i]}:${n}`)?.cost ?? Infinity),
    0
  );
  for (let pass = 0; pass < 10; pass++) {
    let improved = false;
    for (let i = 1; i < order.length - 1; i++)
      for (let j = i + 1; j < order.length; j++) {
        const candidate = [
          ...order.slice(0, i),
          ...order.slice(i, j + 1).reverse(),
          ...order.slice(j + 1)
        ];
        if (score(candidate) + 1e-6 < score(order)) {
          order.splice(0, order.length, ...candidate);
          improved = true;
        }
      }
    if (!improved) break;
  }
  const nodes = [start];
  for (let i = 1; i < order.length; i++)
    nodes.push(...matrix.get(`${order[i - 1]}:${order[i]}`).nodes.slice(1));
  return { nodes, cost: score(order), stops: order };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  graphProblems,
  intersects,
  mapKinds,
  nextPointLabel,
  passageClear,
  planStops,
  routeLegs,
  shortestPath
});
