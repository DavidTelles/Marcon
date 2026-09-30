import { test, expect } from "@playwright/test";
import sharp from "sharp";
import type { FacilityGraph } from "../../lib/routing";
const origin = "http://localhost:3101";
test("OCR real local, revisão manual, publicação protegida e rotas sem atravessar tinta", async ({
  page,
  playwright,
}) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(10000);
  const image = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><rect width="1000" height="700" fill="white"/><path d="M500 0V270 M500 430V700" stroke="black" stroke-width="5"/><text x="70" y="150" font-family="Arial" font-size="32" fill="black">ALMOXARIFADO 1</text></svg>',
    ),
  )
    .png()
    .toBuffer();
  expect(
    (
      await page.request.post("/api/login", {
        headers: { origin },
        data: { identity: "1004", password: process.env.SEED_PASSWORD },
      })
    ).status(),
  ).toBe(200);
  const graph: FacilityGraph = {
    width: 1000,
    height: 700,
    metersPerPixel: 1,
    scaleCalibrated: false,
    reviewed: false,
    walls: [],
    nodes: [],
    edges: [],
  };
  const result = await page.request.post("/api/maps", {
    headers: { origin },
    multipart: {
      action: "suggest",
      graph: JSON.stringify(graph),
      image: { name: "plant.png", mimeType: "image/png", buffer: image },
    },
  });
  expect(result.status(), await result.text()).toBe(200);
  const suggestions = await result.json();
  expect(suggestions.ocr).toContain("concluído");
  expect(
    suggestions.texts.some((t: { text: string }) =>
      /ALMOXARIFADO/i.test(t.text),
    ),
  ).toBeTruthy();
  expect(suggestions.graph.reviewed).toBe(false);
  const saved = await page.request.post("/api/maps", {
    headers: { origin },
    multipart: {
      title: "Teste sugestões",
      graph: JSON.stringify(suggestions.graph),
      image: { name: "plant.png", mimeType: "image/png", buffer: image },
    },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  const id = (await saved.json()).id;
  expect(
    (
      await page.request.post("/api/maps", {
        headers: { origin },
        data: { action: "publish", id },
      })
    ).status(),
  ).toBe(400);
  await page.goto("/admin/map");
  const row = page
    .locator(".ops-suggestion")
    .filter({ hasText: "#" + id + " ·" });
  await row.getByRole("button", { name: "Abrir versão", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 740 });
  const zoom = page.getByRole("slider", { name: /Ampliação da planta/ });
  await zoom.fill("200");
  await expect(zoom).toHaveValue("200");
  expect(
    await page
      .locator(".map-viewport-scroll")
      .evaluate((e) => e.scrollWidth > e.clientWidth),
  ).toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(321);
  await zoom.focus();
  await page.keyboard.press("ArrowRight");
  await expect(zoom).toHaveValue("225");
  await page.getByRole("button", { name: "Ajustar à tela" }).click();
  await expect(zoom).toHaveValue("100");
  await expect(
    page.getByLabel("Tipo do novo ponto").locator("option[value=shelf]"),
  ).toHaveCount(0);
  const node = suggestions.graph.nodes.find((n: { id: string }) =>
    suggestions.graph.edges.some((e: { from: string }) => e.from === n.id),
  );
  await page
    .getByRole("combobox", { name: /^Ponto selecionado/ })
    .selectOption(node.id);
  await page.getByLabel("Nome", { exact: true }).fill("Acesso revisado");
  await page
    .getByRole("combobox", { name: "Tipo", exact: true })
    .selectOption("access");
  await page
    .getByRole("button", { name: "Marcar ponto como revisado", exact: true })
    .click();
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results-mysql/map-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page
    .getByRole("button", { name: "Salvar nova versão", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "salvo. Teste" }),
  ).toBeVisible();
  const maps = (await (await page.request.get("/api/maps")).json()).maps;
  const draft = maps[0];
  const edited =
    typeof draft.graph === "string" ? JSON.parse(draft.graph) : draft.graph;
  expect(edited.nodes.find((n: { id: string }) => n.id === node.id).label).toBe(
    "Acesso revisado",
  );
  expect(edited.reviewed).toBe(false);
  const crossing = {
    ...graph,
    reviewed: true,
    nodes: [
      { id: "a", label: "Acesso 1", kind: "access", x: 0.2, y: 0.8 },
      { id: "b", label: "Acesso 2", kind: "access", x: 0.8, y: 0.8 },
    ],
    edges: [{ from: "a", to: "b", blocked: false }],
  };
  const denied = await page.request.post("/api/maps", {
    headers: { origin },
    data: {
      action: "save",
      title: "Cruza parede",
      baseId: id,
      graph: crossing,
    },
  });
  expect(denied.status()).toBe(400);
  expect(await denied.text()).toContain("obstáculo");
  const reviewed = await page.request.post("/api/maps", {
    headers: { origin },
    data: {
      action: "save",
      title: "Revisada",
      baseId: draft.id,
      graph: { ...edited, reviewed: true },
    },
  });
  expect(reviewed.status()).toBe(200);
  const published = (await reviewed.json()).id;
  expect(
    (
      await page.request.post("/api/maps", {
        headers: { origin },
        data: { action: "publish", id: published },
      })
    ).status(),
  ).toBe(200);
  const staff = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { origin },
  });
  try {
    await staff.post("/api/login", {
      data: { identity: "1003", password: process.env.SEED_PASSWORD },
    });
    expect(
      (
        await staff.post("/api/maps", { data: { action: "publish", id } })
      ).status(),
    ).toBe(403);
    const e = edited.edges.find((e: { blocked: boolean }) => !e.blocked);
    const route = await staff.post("/api/maps", {
      data: { action: "test", start: e.from, stops: [e.to] },
    });
    expect((await route.json()).route.stops).toEqual([e.from, e.to]);
  } finally {
    await staff.dispose();
  }
});
