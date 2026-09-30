import { expect, test } from "@playwright/test";
import {
  nearestWarehouseForBlock,
  warehouseDistance,
} from "../../lib/distribution-location";
import { suggestTransfers } from "../../lib/forecast";
import type { FacilityGraph } from "../../lib/routing";

test("distribution uses traversable paths, available excess and destination capacity", () => {
  const graph: FacilityGraph = {
    width: 100,
    height: 100,
    metersPerPixel: 1,
    reviewed: true,
    walls: [],
    nodes: [
      {
        id: "a",
        label: "A",
        kind: "warehouse",
        warehouseId: 1,
        x: 0.1,
        y: 0.1,
      },
      {
        id: "b",
        label: "B",
        kind: "warehouse",
        warehouseId: 2,
        x: 0.5,
        y: 0.1,
      },
      { id: "c", label: "Bloco", kind: "block", blockId: 1, x: 0.55, y: 0.1 },
    ],
    edges: [
      { from: "a", to: "b", blocked: false },
      { from: "b", to: "c", blocked: false },
    ],
  };
  expect(nearestWarehouseForBlock(graph, 1, [1, 2])?.id).toBe(2);
  expect(nearestWarehouseForBlock(null, 1, [1, 2])).toBeNull();
  expect(nearestWarehouseForBlock(graph, 99, [1, 2])).toBeNull();
  graph.edges[1].blocked = true;
  expect(nearestWarehouseForBlock(graph, 1, [1, 2])).toBeNull();
  graph.edges[1].blocked = false;
  graph.edges[0].blocked = true;
  expect(warehouseDistance(graph, 1, 2)).toBe(Infinity);
  const locations = [
    {
      code: "P",
      warehouse: "A",
      available: 20,
      target: 10,
      minimum: 12,
      incoming: 0,
      capacity: null,
    },
    {
      code: "P",
      warehouse: "B",
      available: 0,
      reserved: 2,
      target: 10,
      minimum: 1,
      incoming: 1,
      capacity: 7,
    },
  ];
  expect(suggestTransfers(locations, () => Infinity)).toEqual([]);
  expect(suggestTransfers(locations, () => 1)[0].quantity).toBe(4);
  expect(
    suggestTransfers(
      locations,
      () => 1,
      () => false,
    ),
  ).toEqual([]);
});

test("independent planning pages, legacy redirect, filters, exports and responsive cards", async ({
  page,
}, info) => {
  await page.request.post("/api/login", {
    headers: { origin: "http://localhost:3101" },
    data: { identity: "1003", password: process.env.SEED_PASSWORD },
  });
  await page.goto("/warehouse/dashboard?view=compra");
  await expect(page).toHaveURL(/\/warehouse\/purchases/);
  for (const [path, title] of [
    ["/warehouse/purchases", "Compra preditiva"],
    ["/warehouse/recommendations", "Recomendação de estoque"],
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: title, exact: true }).first(),
    ).toBeVisible();
    await expect(page.locator(".dashboard-context")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Dashboards", exact: true }),
    ).toHaveCount(0);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      await page.screenshot({
        path: info.outputPath(`${title}-${width}.png`),
        animations: "disabled",
      });
    }
    await page.getByText("Exportar", { exact: true }).click();
    for (const name of ["PDF", "Planilha"]) {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name, exact: true }).click();
      expect(await (await download).failure()).toBeNull();
    }
  }
  await page.goto("/warehouse/dashboard");
  await expect(
    page
      .getByRole("navigation", { name: "Dashboards", exact: true })
      .getByRole("button"),
  ).toHaveCount(4);
});
