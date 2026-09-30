import { test, expect } from "@playwright/test";
import { obstacleGrid, suggestGraph } from "../lib/map-suggestions";
import {
  graphProblems,
  passageClear,
  planStops,
  routeLegs,
  nextPointLabel,
  type FacilityGraph,
} from "../lib/routing";
const base: FacilityGraph = {
  width: 160,
  height: 160,
  metersPerPixel: 1,
  scaleCalibrated: false,
  nodes: [],
  edges: [],
  walls: [],
  reviewed: false,
};
test("sugestões preservam parede fina, passagem e tipos editáveis sem prateleiras", () => {
  const pixels = new Uint8Array(160 * 160).fill(255);
  for (let y = 0; y < 160; y++) if (y < 65 || y > 95) pixels[y * 160 + 80] = 0;
  const mask = obstacleGrid(pixels, 160, 160),
    graph = suggestGraph(base, mask, [
      { text: "ALMOXARIFADO 1", x: 0.3, y: 0.3, confidence: 95 },
    ]);
  expect(graph.nodes.length).toBeGreaterThan(4);
  expect(graph.edges.length).toBeGreaterThan(2);
  expect(
    graph.nodes.every((n) => n.kind !== "shelf" && n.uncertain),
  ).toBeTruthy();
  expect(
    graph.nodes.some(
      (n) => n.kind === "warehouse" && n.suggestedLabel === "ALMOXARIFADO 1",
    ),
  ).toBeTruthy();
  expect(graphProblems(graph)).toEqual([]);
  for (const e of graph.edges)
    expect(
      passageClear(
        graph,
        graph.nodes.find((n) => n.id === e.from)!,
        graph.nodes.find((n) => n.id === e.to)!,
      ),
    ).toBeTruthy();
  expect(passageClear(graph, { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 })).toBe(
    false,
  );
  expect(passageClear(graph, { x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 })).toBe(
    true,
  );
  const e = graph.edges[0],
    a = graph.nodes.find((n) => n.id === e.from)!,
    b = graph.nodes.find((n) => n.id === e.to)!;
  a.label = "Nome editado";
  const route = planStops(graph, a.id, [b.id])!;
  expect(route.stops).toEqual([a.id, b.id]);
  expect(routeLegs(graph, route).every((l) => l.meters === null)).toBeTruthy();
  graph.scaleCalibrated = true;
  graph.metersPerPixel = 0.1;
  expect(routeLegs(graph, route)[0].meters).toBeGreaterThan(0);
  expect(a.id).toBe(e.from);
  expect(
    nextPointLabel(
      { ...base, nodes: [{ ...a, label: "Porta 1", kind: "door" }] },
      "door",
    ),
  ).toBe("Porta 2");
});
test("imagem fechada não cria rota, máscara inválida e parede manual são recusadas", () => {
  const graph = suggestGraph(
    base,
    obstacleGrid(new Uint8Array(160 * 160), 160, 160),
  );
  expect(graph.nodes).toEqual([]);
  expect(planStops(graph, "a", ["b"])).toBeNull();
  expect(
    graphProblems({
      ...base,
      obstacles: { width: 2, height: 2, cells: "000" },
    }),
  ).not.toEqual([]);
});
