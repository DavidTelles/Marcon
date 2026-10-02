import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
  const response = await page.request.post("/api/login", {
    headers: { origin: baseURL! },
    data: { identity: "1004", password: "Marcon@12345" },
  });
  expect(response.status()).toBe(200);
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("admin: visão geral compacta, submenu e estoque integrado", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/admin/dashboard");
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main > .dashboard-suite > .panel")).toHaveCount(1);
  await expect(page.locator(".dashboard-charts")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Ver requisições", exact: true }),
  ).toHaveCount(0);
  const dashboard = page.getByRole("button", {
    name: "Dashboard",
    exact: true,
  });
  await expect(dashboard).toHaveAttribute("aria-expanded", "true");
  await dashboard.click();
  await expect(dashboard).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#dashboard-submenu")).toHaveCount(0);
  await dashboard.click();
  await page.getByRole("link", { name: "Estoque", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard de estoque", exact: true }),
  ).toBeVisible();
  const table = page
    .locator(".ops-scroll")
    .filter({
      has: page.getByRole("columnheader", {
        name: "Disponibilidade",
        exact: true,
      }),
    });
  await expect(
    table.getByRole("columnheader", { name: "Almoxarifado", exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole("columnheader", { name: "Disponibilidade" }),
  ).toBeVisible();
  await expect(table.locator("tbody tr").first()).toBeVisible();
  await page.getByRole("link", { name: "Requisições", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Acompanhamento das requisições",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Pedidos e pontos de atenção")).toHaveCount(0);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBeTruthy();
  }
  await page.screenshot({
    path: test.info().outputPath("requests-desktop.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("mobile: somente símbolo no topo, menu acessível e conta preservada", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/dashboard");
  const topbar = page.locator(".topbar");
  const trigger = topbar.getByRole("button", {
    name: "Abrir menu",
    exact: true,
  });
  await expect(trigger).toBeVisible();
  await expect(trigger.locator("img")).toHaveCount(1);
  await expect(topbar.getByRole("link")).toHaveCount(0);
  await expect(topbar.getByRole("button")).toHaveCount(1);
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("link", { name: "Editar perfil", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sair da conta", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("button", { name: "Abrir James", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".dashboard-metrics .ops-metric, .admin-summary .stat")
      .first(),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByRole("button", { name: "Abrir James", exact: true })
        .evaluate((node) => node.getBoundingClientRect().width),
    )
    .toBeLessThanOrEqual(181);
  await page.screenshot({
    path: test.info().outputPath("overview-mobile.png"),
    fullPage: true,
  });
});

test("histórico: tabelas com quantidade separada e detalhes funcionais", async ({
  page,
}) => {
  await page.goto("/admin/history");
  const requests = page
    .getByRole("table")
    .filter({
      has: page.locator("caption", { hasText: "Histórico de requisições" }),
    });
  await expect(
    requests.getByRole("columnheader", { name: "Número", exact: true }),
  ).toBeVisible();
  await expect(
    requests.getByRole("columnheader", { name: "Quantidade", exact: true }),
  ).toBeVisible();
  await requests
    .getByRole("button", { name: /Detalhes|Abrir registros #/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Fechar/ })
    .first()
    .click();
  const movements = page.getByRole("region", {
    name: "Histórico de movimentações de estoque",
    exact: true,
  });
  if (await movements.count())
    await expect(
      movements.getByRole("columnheader", {
        name: "Almoxarifado",
        exact: true,
      }),
    ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("history-desktop.png"),
    fullPage: true,
  });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBeTruthy();
  }
});

test("perfil e catálogo: menu pelo logo e responsividade", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/profile", "/catalogo"]) {
    await page.goto(path);
    const topbar = page.locator("header").first();
    await expect(
      topbar.getByRole("button", { name: "Abrir menu", exact: true }),
    ).toBeVisible();
    await topbar
      .getByRole("button", { name: "Abrir menu", exact: true })
      .click();
    const menu = page.getByRole("dialog", { name: "Menu Marcon", exact: true });
    if (await menu.count()) {
      await expect(menu).toBeVisible();
      await expect(
        menu.getByRole("link", { name: "Histórico", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).not.toBeVisible();
    } else {
      await page.keyboard.press("Escape");
    }
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBeTruthy();
    }
    await page.setViewportSize({ width: 390, height: 844 });
  }
});
