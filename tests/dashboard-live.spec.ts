import { expect, test } from "@playwright/test";
import type { DashboardReport } from "../lib/dashboard-report";

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post("/api/login", {
    headers: { origin: baseURL! },
    data: {
      identity: process.env.LIVE_DASHBOARD_ACCOUNT || "1003",
      password: process.env.SEED_PASSWORD,
    },
  });
  expect(response.status()).toBe(200);
});

test("submenu lateral: estoque real por peça, filtros e menu móvel", async ({ page }) => {
  await page.goto("/warehouse/dashboard");
  const submenu = page.getByRole("navigation", { name: "Visões da dashboard" });
  await expect(submenu.getByRole("link")).toHaveCount(4);
  await expect(page.locator(".dashboard-tabs")).toHaveCount(0);
  await submenu.getByRole("link", { name: "Estoque", exact: true }).click();
  await expect(submenu.getByRole("link", { name: "Estoque", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Peças disponíveis por almoxarifado" })).toBeVisible();
  const response = await page.request.get("/api/operations?dashboard=estoque&metric=stock");
  const report: DashboardReport = await response.json();
  const rows = report.stockByItem.filter((row) => row.available > 0);
  expect(rows.length).toBeGreaterThan(0);
  const colors = await page.locator(".dashboard-piece-legend i").evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).backgroundColor));
  expect(new Set(colors).size).toBe(colors.length);
  const first = rows[0];
  const item = page.locator(".dashboard-piece-legend button").filter({ hasText: first.code });
  const color = await item.locator("i").evaluate((element) => getComputedStyle(element).backgroundColor);
  await item.click();
  await expect(page.locator(".dashboard-piece-legend button")).toHaveCount(1);
  await expect(page.locator(".dashboard-piece-legend button")).toContainText(first.code);
  expect(await page.locator(".dashboard-piece-legend i").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(color);
  await page.screenshot({ path: ".validation/dashboard-stock-pieces.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await expect(submenu).toBeVisible();
  await submenu.getByRole("link", { name: "Requisições", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard de requisições", exact: true })).toBeVisible();
  await expect(page.locator(".sidebar")).not.toHaveClass(/open/);
});

test("API real: quatro visões e saldos completos por local", async ({
  page,
}) => {
  for (const view of ["geral", "estoque", "bloco", "requisicoes"]) {
    const response = await page.request.get(
      `/api/operations?dashboard=${view}`,
    );
    expect(response.status(), await response.text()).toBe(200);
    const report: DashboardReport = await response.json();
    expect(report.view).toBe(view);
    expect(report.metrics.length).toBeGreaterThan(0);
    expect(
      report.stockByWarehouse.every(
        (row) => Math.abs(row.physical - row.available - row.reserved) < 0.001,
      ),
    ).toBeTruthy();
    if (report.rowTotal === report.rows.length) {
      for (const unit of new Set(report.rows.map((row) => row.unit))) {
        expect(
          report.stockByWarehouse
            .filter((row) => row.unit === unit)
            .reduce((sum, row) => sum + row.physical, 0),
        ).toBeCloseTo(
          report.rows
            .filter((row) => row.unit === unit)
            .reduce((sum, row) => sum + row.physical, 0),
        );
      }
    }
  }
});

test("dashboard real: atualização automática, filtro pelo gráfico e responsividade", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/warehouse/dashboard");
  await expect(page.locator(".dashboard-live-bar")).toContainText(
    "Dados conectados",
  );
  await expect(
    page.getByRole("heading", {
      name: "Estoque por almoxarifado",
      exact: true,
    }),
  ).toBeVisible();
  const initialLocations = await page
    .locator(".dashboard-chart-choice")
    .count();
  const nextResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/operations?") && response.status() === 200,
  );
  await nextResponse;
  await expect(page.locator(".dashboard-live-bar")).toContainText(
    "Dados conectados",
  );
  const choice = page.locator(".dashboard-chart-choice").first();
  const warehouse = await choice.locator("span").first().innerText();
  const filtered = page.waitForResponse(
    (response) =>
      response.url().includes("/api/operations?") &&
      new URL(response.url()).searchParams.get("warehouse") === warehouse &&
      response.status() === 200,
  );
  await choice.click();
  await filtered;
  await expect(page.locator(".dashboard-chart-choice")).toHaveCount(1);
  await page.locator(".dashboard-filters > summary").click();
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await expect(page.locator(".dashboard-chart-choice")).toHaveCount(
    initialLocations,
  );
  await page.locator(".dashboard-filters > summary").click();
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".dashboard-inventory-chart")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.screenshot({
    path: ".validation/dashboard-real-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".validation/dashboard-real-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("dashboard real: falha de atualização preserva os dados carregados", async ({
  page,
}) => {
  await page.goto("/warehouse/dashboard");
  await expect(page.locator(".dashboard-live-bar")).toContainText(
    "Dados conectados",
  );
  const previous = await page.locator(".dashboard-chart-choice").count();
  await page.route("**/api/operations?**", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Conexão temporariamente indisponível." },
    }),
  );
  await page.getByRole("button", { name: "Atualizar agora" }).click();
  await expect(page.locator(".dashboard-suite [role=alert]")).toContainText(
    "Os últimos dados carregados permanecem disponíveis.",
  );
  await expect(page.locator(".dashboard-chart-choice")).toHaveCount(previous);
  await page.unroute("**/api/operations?**");
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.locator(".dashboard-suite [role=alert]")).toHaveCount(0);
  await expect(page.locator(".dashboard-live-bar")).toContainText(
    "Dados conectados",
  );
});

test("gráfico interativo: seleção de dias por teclado com série controlada", async ({
  page,
}) => {
  const response = await page.request.get("/api/operations?dashboard=geral");
  const report: DashboardReport = await response.json();
  report.daily = [
    { date: report.filters.from, kind: "saida", unit: "un", quantity: 5 },
    { date: report.filters.to, kind: "saida", unit: "un", quantity: 9 },
  ];
  await page.route("**/api/operations?**", (route) =>
    route.fulfill({ json: report }),
  );
  await page.goto("/warehouse/dashboard");
  const slider = page.getByRole("slider", { name: "Consultar um dia" });
  await expect(slider).toBeVisible();
  await expect(page.locator(".dashboard-chart-inspector output")).toContainText(
    "5 un",
  );
  await slider.focus();
  await page.keyboard.press("End");
  await expect(page.locator(".dashboard-chart-inspector output")).toContainText(
    "9 un",
  );
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    `${report.filters.to.split("-").reverse().join("/")}: 9 un`,
  );
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
