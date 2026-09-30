import { test, expect } from "@playwright/test";

const sizes = [
  [320, 740],
  [375, 812],
  [640, 360],
  [768, 1024],
  [1024, 768],
  [1440, 900],
  [1920, 1080],
];

test("James positions, short screens and keyboard", async ({ page }, info) => {
  expect(
    (
      await page.request.post("/api/login", {
        headers: { origin: "http://localhost:3101" },
        data: { identity: "1004", password: process.env.SEED_PASSWORD },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/admin/dashboard");
  for (const dock of ["left", "right", "inline"]) {
    await page.getByRole("button", { name: "Abrir James" }).click();
    const dialog = page.getByRole("dialog", { name: /James/ });
    await dialog.getByText("Preferências do James", { exact: true }).click();
    await dialog.getByLabel("Posição do James").selectOption(dock);
    for (const [width, height] of [
      [320, 740],
      [740, 320],
      [768, 1024],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(100);
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.y).toBeGreaterThanOrEqual(-1);
      expect(box!.width + box!.x).toBeLessThanOrEqual(width + 1);
      expect(box!.height + box!.y).toBeLessThanOrEqual(height + 1);
      await dialog
        .getByLabel("Sua pergunta ou correção")
        .fill("Como consultar minhas requisições?");
      await dialog
        .getByRole("button", { name: "Enviar", exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        dialog.getByRole("button", { name: "Enviar", exact: true }),
      ).toBeInViewport();
      await page.screenshot({
        path: info.outputPath(`james-${dock}-${width}.png`),
        animations: "disabled",
      });
    }
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Abrir James" }),
    ).toBeFocused();
  }
});
const groups = [
  {
    id: "1001",
    pages: [
      "/employee/request",
      "/employee/history",
      "/profile",
      "/catalogo",
      "/inicio/funcionario",
    ],
  },
  {
    id: "1002",
    pages: [
      "/department-head/dashboard",
      "/department-head/requests",
      "/department-head/history",
    ],
  },
  {
    id: "1003",
    pages: [
      "/warehouse/stock/all/all",
      "/warehouse/returns",
      "/warehouse/requests",
      "/warehouse/dashboard?view=recomendacoes",
      "/warehouse/dashboard?view=compra",
      "/warehouse/history",
    ],
  },
  {
    id: "1004",
    pages: [
      "/admin/dashboard",
      "/admin/create",
      "/admin/create/new",
      "/admin/map",
      "/admin/all-requests",
      "/admin/history",
    ],
  },
];

test.describe("touch navigation", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 375, height: 812 },
  });
  test("menu and warehouse chips remain usable by touch", async ({ page }) => {
    expect(
      (
        await page.request.post("/api/login", {
          headers: { origin: "http://localhost:3101" },
          data: { identity: "1001", password: process.env.SEED_PASSWORD },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/employee/request");
    await page.getByRole("button", { name: "Abrir menu", exact: true }).tap();
    await page.getByRole("button", { name: "Fechar menu", exact: true }).tap();
    const chips = page.getByRole("group", { name: "Filtrar por almoxarifado" });
    await chips.getByRole("button", { name: "Central", exact: true }).tap();
    await expect(
      chips.getByRole("button", { name: "Central", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    for (const button of await chips.getByRole("button").all())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole("button", { name: "Abrir James" }).tap();
    await expect(page.getByRole("dialog", { name: /James/ })).toBeVisible();
    await page.getByRole("button", { name: "Fechar James" }).tap();
  });
});

test("drawer, catalog detail, cart and reduced motion with real data", async ({
  page,
}, info) => {
  expect(
    (
      await page.request.post("/api/login", {
        headers: { origin: "http://localhost:3101" },
        data: { identity: "1001", password: process.env.SEED_PASSWORD },
      })
    ).status(),
  ).toBe(200);
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto("/employee/request");
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Fechar menu", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest(".sidebar")),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Abrir menu", exact: true }),
  ).toBeFocused();
  await page
    .getByPlaceholder("Busque por nome ou ID")
    .fill("SEM-PECA-UI-123456");
  await expect(
    page.getByRole("heading", { name: "Nenhuma peça encontrada" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page
    .getByRole("link", { name: /^Ver detalhes de/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Adicionar ao carrinho", exact: true })
    .click();
  await page.getByLabel("Quantidade", { exact: true }).fill("1");
  await page.getByLabel("Confirme a quantidade", { exact: true }).fill("1");
  for (const [width, height] of [
    [320, 740],
    [768, 1024],
    [1440, 900],
    [740, 320],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
    await page
      .getByRole("button", { name: "Adicionar ao carrinho", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`item-form-${width}.png`),
      animations: "disabled",
    });
  }
  await page
    .getByRole("button", { name: "Adicionar ao carrinho", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Carrinho · 1 item" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remover", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Carrinho · 0 itens" }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/employee/history");
  expect(
    await page
      .locator(".dashboard-dialog")
      .first()
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
});
for (const group of groups)
  test(`responsive authenticated pages ${group.id}`, async ({ page }, info) => {
    test.setTimeout(240000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    expect(
      (
        await page.request.post("/api/login", {
          headers: { origin: "http://localhost:3101" },
          data: { identity: group.id, password: process.env.SEED_PASSWORD },
        })
      ).status(),
    ).toBe(200);
    for (const path of group.pages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(page.url()).not.toContain("/login");
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(70);
        const dimensions = await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        expect
          .soft(dimensions.scroll, `${path} ${width}x${height}`)
          .toBeLessThanOrEqual(dimensions.width + 1);
        if ([375, 768, 1440].includes(width))
          await page.screenshot({
            path: info.outputPath(`${path.replace(/\W/g, "_")}-${width}.png`),
            animations: "disabled",
          });
      }
    }
    expect(errors).toEqual([]);
  });

test("login reflow and keyboard navigation", async ({ page }, info) => {
  await page.goto("/login");
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
    await page.screenshot({
      path: info.outputPath(`login-${width}.png`),
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    "BODY",
  );
  await expect(page.getByRole("button", { name: "Abrir James" })).toHaveCount(
    0,
  );
});

test("dashboard dialog stays inside the visual viewport when keyboard reduces space", async ({
  page,
}, info) => {
  expect(
    (
      await page.request.post("/api/login", {
        headers: { origin: "http://localhost:3101" },
        data: { identity: "1004", password: process.env.SEED_PASSWORD },
      })
    ).status(),
  ).toBe(200);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin/dashboard");
  await page.locator(".dashboard-metric-button").first().click();
  const dialog = page.getByRole("dialog", { name: "Registros do indicador" });
  await expect(dialog).toBeVisible();
  // Controlled keyboard geometry, not proof of a physical iOS/Android keyboard.
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, "height", {
      configurable: true,
      get: () => 360,
    });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(300);
  const box = await dialog.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(11);
  expect(box!.y + box!.height).toBeLessThanOrEqual(349);
  await expect(
    dialog.getByRole("button", { name: "Fechar Registros do indicador" }),
  ).toBeInViewport();
  await page.screenshot({
    path: info.outputPath("dialog-keyboard.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
