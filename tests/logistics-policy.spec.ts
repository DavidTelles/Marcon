import { expect, test } from "@playwright/test";
import { graphProblems, shortestPath, planStops, pathValid, routeLegs, type FacilityGraph } from "../lib/routing";
import { coverageTarget, netConsumption, suggestTransfers, type StockTarget } from "../lib/forecast";
import { accessibleWarehousesForBlock, warehouseDistance, warehouseRoute } from "../lib/distribution-location";
import { demand } from "../lib/permissions";

const graph: FacilityGraph = {
  width: 100, height: 100, metersPerPixel: 0.1, scaleCalibrated: true,
  reviewed: true, walls: [],
  nodes: [
    { id: "a", label: "Almoxarifado 1", kind: "warehouse", x: 0, y: 0, warehouseId: 1 },
    { id: "b", label: "Passagem", kind: "passage", x: 0.5, y: 0 },
    { id: "c", label: "Estoque 5", kind: "local_stock", x: 1, y: 0, warehouseId: 5 },
    { id: "d", label: "Setor consumidor", kind: "sector", x: 1, y: 1, blockId: 5 },
  ],
  edges: [
    { from: "a", to: "b", blocked: false, distance: 2, seconds: 8 },
    { from: "b", to: "c", blocked: false, distance: 3, seconds: 8 },
    { from: "a", to: "c", blocked: false, distance: 9, seconds: 2 },
    { from: "c", to: "d", blocked: false, distance: 1, seconds: 1 },
  ],
};

test("menor distância e menor tempo têm resultados e unidades independentes", () => {
  expect(shortestPath(graph, "a", "c")).toMatchObject({ nodes: ["a", "b", "c"], cost: 5, unit: "m" });
  expect(shortestPath(graph, "a", "c", { objective: "time" })).toMatchObject({ nodes: ["a", "c"], cost: 2, unit: "s" });
  const legacy = { ...graph, scaleCalibrated: false };
  expect(shortestPath(legacy, "a", "c")?.unit).toBe("unidades do mapa");
  expect(shortestPath({ ...graph, edges: graph.edges.map((e) => ({ ...e, seconds: undefined })) }, "a", "d", { objective: "time" })).toBeNull();
});

test("sentido único, bloqueios e transporte alteram o grafo antes de Dijkstra", () => {
  const oneWay = { ...graph, edges: graph.edges.map((e) => ({ ...e, oneWay: true })) };
  expect(shortestPath(oneWay, "c", "a")).toBeNull();
  expect(shortestPath(oneWay, "a", "d")?.cost).toBe(6);
  const limited: FacilityGraph = { ...graph, edges: graph.edges.map((e) => e.from === "a" ? { ...e, allowedTransport: ["walking"] } : e) };
  expect(shortestPath(limited, "a", "c", { transport: "cart" })).toBeNull();
  expect(shortestPath(limited, "a", "c", { transport: "walking" })?.cost).toBe(5);
  expect(shortestPath({ ...graph, nodes: graph.nodes.map((n) => n.id === "b" ? { ...n, blocked: true } : n) }, "a", "c")?.cost).toBe(9);
  expect(shortestPath({ ...graph, nodes: graph.nodes.map((n) => n.id === "c" ? { ...n, restricted: true } : n) }, "a", "c")).toBeNull();
});

test("calibrar a planta conserva a unidade dos comprimentos já cadastrados", () => {
  const edges = graph.edges.map((e) => ({ ...e, distanceUnit: "map" as const }));
  expect(shortestPath({ ...graph, edges }, "a", "c")?.cost).toBe(0.5);
  expect(shortestPath({ ...graph, edges, scaleCalibrated: false }, "a", "c")?.cost).toBe(5);
  expect(shortestPath({ ...graph, scaleCalibrated: false, edges: edges.map((e) => ({ ...e, distanceUnit: "m" as const })) }, "a", "c")).toBeNull();
});

test("empate determinístico, custo zero, origem igual e nós inexistentes", () => {
  const equal = { ...graph, edges: graph.edges.map((e) => e.from === "a" && e.to === "c" ? { ...e, distance: 5 } : e) };
  const route = shortestPath(equal, "a", "c")!;
  expect(route.cost).toBe(5);
  expect(shortestPath(equal, "a", "c")).toEqual(route);
  expect(shortestPath(graph, "a", "a")).toMatchObject({ nodes: ["a"], cost: 0 });
  expect(planStops(graph, "missing", [])).toBeNull();
  expect(shortestPath(graph, "a", "missing")).toBeNull();
  expect(shortestPath({ ...graph, edges: [{ from: "a", to: "c", blocked: false, distance: 0 }] }, "a", "c")?.cost).toBe(0);
});

test("pesos inválidos, conexões inexistentes e paredes nunca geram linhas fictícias", () => {
  for (const distance of [-1, NaN, Infinity]) expect(shortestPath({ ...graph, edges: [{ ...graph.edges[0], distance }] }, "a", "b")).toBeNull();
  expect(shortestPath({ ...graph, edges: [] }, "a", "c")).toBeNull();
  expect(shortestPath({ ...graph, walls: [{ x1: 0.3, y1: 0, x2: 0.3, y2: 1 }] }, "a", "c")).toBeNull();
  expect(graphProblems({ ...graph, edges: [...graph.edges, graph.edges[0]] }).length).toBeGreaterThan(0);
  const path = shortestPath(graph, "a", "c")!;
  expect(pathValid(graph, path)).toBe(true);
  expect(routeLegs(graph, path).reduce((s, l) => s + l.meters!, 0)).toBe(path.cost);
  const blocked = { ...graph, edges: graph.edges.map((e) => ({ ...e, blocked: true })) };
  expect(pathValid(blocked, path)).toBe(false);
  expect(routeLegs(blocked, path)).toEqual([]);
});

test("andares diferentes precisam de ligação vertical e comprimento cadastrado", () => {
  const floors: FacilityGraph = { ...graph, nodes: graph.nodes.map((n) => n.id === "d" ? { ...n, floor: 1, kind: "elevator" } : n) };
  expect(graphProblems(floors).length).toBeGreaterThan(0);
  const valid = { ...floors, edges: floors.edges.map((e) => e.to === "d" ? { ...e, vertical: true, distance: 4, allowedTransport: ["walking" as const] } : e) };
  expect(shortestPath(valid, "a", "d")?.cost).toBe(9);
  expect(shortestPath(valid, "a", "d", { transport: "forklift" })).toBeNull();
});

test("heurística preserva destino final e todos os trechos exibidos são cadastrados", () => {
  const route = planStops(graph, "a", ["d", "b", "c"], { final: "d" })!;
  expect(route.nodes.at(-1)).toBe("d");
  expect(route.stops?.at(-1)).toBe("d");
  expect(route.approximate).toBe(true);
  expect(pathValid(graph, route)).toBe(true);
  expect(planStops({ ...graph, edges: [] }, "a", ["d"], { final: "d" })).toBeNull();
});

test("proximidade por caminhos inclui estoques locais e setores novos", () => {
  expect(accessibleWarehousesForBlock(graph, 5, [1, 5])).toEqual([{ id: 5, cost: 1 }, { id: 1, cost: 6 }]);
  expect(warehouseDistance(graph, 1, 5)).toBe(5);
  expect(warehouseRoute(graph, 1, 5)?.nodes).toEqual(["a", "b", "c"]);
  expect(accessibleWarehousesForBlock({ ...graph, reviewed: false, edges: [] }, 5, [1, 5])).toEqual([]);
});

test("consumo usa baixas e devoluções vinculadas, sem contar pedidos ou transferências", () => {
  const events = [
    { kind: "saida", quantity: 10, request_id: 1, part_id: 1 },
    { kind: "saida", quantity: 3, request_id: 2, part_id: 1 },
    { kind: "devolucao", quantity: 4, request_id: 1, part_id: 1 },
    { kind: "devolucao", quantity: 30, request_id: 2, part_id: 1 },
    { kind: "devolucao", quantity: 99, request_id: null, part_id: 1 },
    { kind: "transferencia_saida", quantity: 99, request_id: null, part_id: 1 },
    { kind: "entrada", quantity: 99, request_id: null, part_id: 1 },
  ];
  expect(netConsumption(events).map((e) => e.quantity)).toEqual([6, 0]);
  expect(coverageTarget(Array(3).fill(0), 2, 1).confidence).toBe("Dados insuficientes");
  expect(coverageTarget([...Array(29).fill(0), 30], 2, 1).confidence).toBe("Dados insuficientes");
});

function nails(): StockTarget[] {
  const source = coverageTarget([...Array(6).fill(1), ...Array(24).fill(0)], 2, 2, 8, 0.25);
  const destination = coverageTarget([...Array(24).fill(1), ...Array(6).fill(0)], 2, 1, 8, 0.25);
  return [
    { code: "PREGOS", unit: "caixa", warehouse: "Almoxarifado 1", available: 20, physical: 20, reserved: 0, minimum: source.minimum, target: source.target, incoming: 0, capacity: null },
    { code: "PREGOS", unit: "caixa", warehouse: "Estoque 5", available: 1, physical: 1, reserved: 0, minimum: destination.minimum, target: destination.target, incoming: 0, capacity: 12 },
  ];
}

test("exemplo obrigatório: 20 caixas versus 1 recomenda 9 com consumo e rota controlados", () => {
  const places = nails();
  expect(places.map((l) => l.target)).toEqual([3, 10]);
  const result = suggestTransfers(places, () => warehouseDistance(graph, 1, 5));
  expect(result).toMatchObject([{ from: "Almoxarifado 1", to: "Estoque 5", quantity: 9 }]);
  expect(places[0].available - result[0].quantity).toBeGreaterThanOrEqual(places[0].target);
  expect(places[1].available + result[0].quantity).toBe(places[1].target);
});

test("capacidade, reservas, entradas, embalagem e unidades limitam transferências", () => {
  const places = nails();
  const limited = [{ ...places[0], available: 6, physical: 20, reserved: 14, step: 2 }, { ...places[1], capacity: 4, incoming: 1, step: 2 }];
  expect(suggestTransfers(limited)[0].quantity).toBe(2);
  expect(suggestTransfers([places[0], { ...places[1], unit: "un" }])).toEqual([]);
  expect(suggestTransfers(places, () => Infinity)).toEqual([]);
  expect(suggestTransfers([places[0], { ...places[1], incoming: 10 }])).toEqual([]);
  expect(suggestTransfers([{ ...places[0], step: 2 }, { ...places[1], step: 3 }])[0].quantity).toBe(6);
});

test("vários destinos disputam um excedente único, priorizado por risco e déficit", () => {
  const places = nails();
  const result = suggestTransfers([{ ...places[0], available: 8 }, places[1], { ...places[1], warehouse: "Estoque 6", available: 0, physical: 0, target: 12 }]);
  expect(result.reduce((s, t) => s + t.quantity, 0)).toBe(5);
  expect(result[0].to).toBe("Estoque 6");
  expect(result.every((t) => t.from === "Almoxarifado 1")).toBe(true);
});

test("negações explícitas de permissão prevalecem no servidor", () => {
  const user = { id: "1", name: "Operador", email: "o@example.test", label: "Almoxarifado", role: "almoxarifado" as const, permissionOverrides: { "stock.manage": false } };
  expect(() => demand(user, "stock")).toThrow();
  expect(() => demand(user, "planning")).toThrow();
});
