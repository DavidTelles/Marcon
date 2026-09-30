import { test, expect } from "@playwright/test";
import {
  shortestPath,
  planStops,
  graphProblems,
  type FacilityGraph,
} from "../lib/routing";
import { predict, suggestTransfers } from "../lib/forecast";
const graph: FacilityGraph = {
  width: 100,
  height: 100,
  metersPerPixel: 1,
  reviewed: true,
  walls: [],
  nodes: [
    { id: "a", label: "Entrada", kind: "door", x: 0, y: 0 },
    { id: "b", label: "Corredor", kind: "aisle", x: 1, y: 0 },
    { id: "c", label: "Destino", kind: "delivery", x: 1, y: 1 },
    { id: "d", label: "Isolado", kind: "shelf", x: 0, y: 1 },
  ],
  edges: [
    { from: "a", to: "b", seconds: 3, blocked: false },
    { from: "b", to: "c", seconds: 4, blocked: false },
    { from: "a", to: "c", seconds: 20, blocked: false },
  ],
};
test("Dijkstra, paradas, bloqueios e paredes", () => {
  expect(shortestPath(graph, "a", "c")).toEqual({
    nodes: ["a", "b", "c"],
    cost: 7,
  });
  expect(planStops(graph, "a", ["c", "b", "c"])?.cost).toBe(7);
  expect(
    shortestPath(
      {
        ...graph,
        edges: graph.edges.map((e, i) => ({ ...e, blocked: i === 0 })),
      },
      "a",
      "c",
    )?.cost,
  ).toBe(20);
  expect(planStops(graph, "a", ["d"])).toBeNull();
  const wall = { ...graph, walls: [{ x1: 0.5, y1: 0, x2: 0.5, y2: 1 }] };
  expect(graphProblems(wall).length).toBeGreaterThan(0);
  expect(shortestPath(wall, "a", "c")).toBeNull();
  expect(shortestPath({ ...graph, metersPerPixel: 0 }, "a", "c")).toBeNull();
});
test("previsão distingue histórico insuficiente e validação temporal", () => {
  const sparse = predict([0, 0, 3], 7, 10);
  expect(sparse.confidence).toBe("Dados insuficientes");
  expect(sparse.mae).toBeNull();
  expect(sparse.minimum).toBeGreaterThanOrEqual(10);
  const regular = predict(Array(120).fill(2), 7, 1);
  expect(regular.daily).toBe(2);
  expect(regular.mae).toBe(0);
  expect(regular.wape).toBe(0);
  expect(regular.target).toBe(28);
  const shock = predict([...Array(119).fill(2), 100], 7, 1);
  expect(shock.mae).toBeCloseTo(98 / 28);
  expect(shock.confidence).toBe("Baixa");
  expect(predict(Array(100).fill(0), 7, 5).confidence).toBe(
    "Dados insuficientes",
  );
});

test("rota calibrada usa somente metros, sem misturar tempos manuais", () => {
  const calibrated = shortestPath(
    { ...graph, scaleCalibrated: true, metersPerPixel: 0.1 },
    "a",
    "c",
  )!;
  expect(calibrated.nodes).toEqual(["a", "c"]);
  expect(calibrated.cost).toBeCloseTo(Math.sqrt(200));
  const estimated = shortestPath(
    { ...graph, scaleCalibrated: false },
    "a",
    "c",
  )!;
  expect(estimated.cost).toBeCloseTo(Math.sqrt(20000));
});
test("distribuição não duplica excesso, respeita entradas e capacidade", () => {
  const suggestions = suggestTransfers([
    {
      code: "x",
      warehouse: "Central",
      available: 30,
      minimum: 5,
      target: 10,
      incoming: 0,
      capacity: null,
    },
    {
      code: "x",
      warehouse: "A",
      available: 0,
      minimum: 2,
      target: 15,
      incoming: 5,
      capacity: 12,
    },
    {
      code: "x",
      warehouse: "B",
      available: 1,
      minimum: 2,
      target: 20,
      incoming: 0,
      capacity: null,
    },
  ]);
  expect(suggestions.reduce((s, t) => s + t.quantity, 0)).toBe(20);
  expect(suggestions.every((t) => t.from === "Central")).toBeTruthy();
  expect(
    suggestions.filter((t) => t.to === "A").reduce((s, t) => s + t.quantity, 0),
  ).toBeLessThanOrEqual(7);
});

test("capacidade de destino inclui unidades reservadas fisicamente presentes", () => {
  const suggestions = suggestTransfers([
    {
      code: "x",
      warehouse: "Origem",
      available: 100,
      target: 10,
      minimum: 10,
      incoming: 0,
      capacity: null,
    },
    {
      code: "x",
      warehouse: "Destino",
      available: 2,
      reserved: 6,
      target: 20,
      minimum: 2,
      incoming: 0,
      capacity: 10,
    },
  ]);
  expect(suggestions[0].quantity).toBe(2);
});
