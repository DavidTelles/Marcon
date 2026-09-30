import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
const origin = "http://localhost:3101";
test("dashboard: escopos, filtros, paginação e exportações coerentes", async ({
  playwright,
}) => {
  const contexts = [];
  try {
    for (const [identity, view] of [
      ["1001", "requisicoes"],
      ["1002", "bloco"],
      ["1003", "geral"],
      ["1004", "geral"],
    ]) {
      const c = await playwright.request.newContext({
        baseURL: origin,
        extraHTTPHeaders: { origin },
      });
      contexts.push(c);
      expect(
        (
          await c.post("/api/login", {
            data: { identity, password: process.env.SEED_PASSWORD },
          })
        ).status(),
      ).toBe(200);
      const path =
        "/api/operations?dashboard=" + view + "&metric=requests&pageSize=2";
      const response = await c.get(path);
      expect(response.status(), await response.text()).toBe(200);
      const r = await response.json();
      expect(r.details.records.length).toBeLessThanOrEqual(2);
      expect(
        r.metrics.find((m: { id: string }) => m.id === "requests").value,
      ).toBe(r.details.total);
      expect(r.methodology.source).toContain("MySQL");
      if (identity === "1004") {
        const block = await (
          await c.get("/api/operations?dashboard=bloco")
        ).json();
        expect(block.filters.block).toBe("Bloco A");
        const part = r.rows[0].code;
        const filtered = await (
          await c.get(
            "/api/operations?dashboard=estoque&part=" +
              encodeURIComponent(part),
          )
        ).json();
        expect(filtered.rows.length).toBeGreaterThan(0);
        expect(
          filtered.rows.every((v: { code: string }) => v.code === part),
        ).toBeTruthy();
        const sector = await (
          await c.get(
            "/api/operations?dashboard=requisicoes&sector=SETOR-SEM-REGISTROS",
          )
        ).json();
        expect(sector.details.total).toBe(0);
      }
      if (identity === "1001") {
        expect(r.rows).toEqual([]);
        expect(
          r.details.records.every(
            (v: { request: { requesterId: string } }) =>
              v.request.requesterId === "1001",
          ),
        ).toBeTruthy();
      }
      if (identity === "1002")
        expect(
          r.details.records.every(
            (v: { block: string }) => v.block === "Bloco A",
          ),
        ).toBeTruthy();
      if (["1001", "1002"].includes(identity))
        for (const params of [
          "dashboard=geral&format=pdf",
          "dashboard=" + view + "&block=Bloco%20B&format=xlsx",
          "dashboard=" + view + "&consolidated=1",
        ])
          expect((await c.get("/api/operations?" + params)).status()).toBe(403);
      for (const invalid of [
        "pageSize=999",
        "page=-1",
        "from=2026-02-30",
        "priority=invalida",
        "code=UNKNOWN-DASHBOARD-TEST",
      ])
        expect(
          (
            await c.get("/api/operations?dashboard=" + view + "&" + invalid)
          ).status(),
        ).toBe(400);
      const excel = await c.get(path + "&format=xlsx");
      expect(excel.status(), await excel.text()).toBe(200);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load((await excel.body()) as never);
      expect(book.getWorksheet("Registros")!.rowCount - 1).toBe(
        r.details.total,
      );
      expect(book.getWorksheet("Metodologia")!.rowCount).toBeGreaterThan(12);
      const row = book
        .getWorksheet("Indicadores")!
        .getRows(2, 20)!
        .find((v) => v.getCell(1).value === "Pedidos criados");
      expect(row!.getCell(2).value).toBe(r.details.total);
      const pdf = await c.get(path + "&format=pdf");
      expect(pdf.status()).toBe(200);
      expect(
        (await PDFDocument.load(await pdf.body())).getPageCount(),
      ).toBeGreaterThan(0);
      if (r.details.total > 2) {
        const p2 = await (await c.get(path + "&page=2")).json();
        expect(p2.details.records[0].id).not.toBe(r.details.records[0].id);
      }
    }
  } finally {
    await Promise.all(contexts.map((c) => c.dispose()));
  }
});
test("quatro dashboards: larguras, paisagem, zoom, filtros, detalhes e estados", async ({
  page,
}, info) => {
  test.setTimeout(240000);
  expect(
    (
      await page.request.post("/api/login", {
        headers: { origin },
        data: { identity: "1004", password: process.env.SEED_PASSWORD },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/admin/dashboard");
  await expect(page.locator(".dashboard-context")).toBeVisible();
  const names = ["Geral", "Por bloco", "Estoque", "Requisições"];
  for (const name of names) {
    await page
      .getByRole("navigation", { name: "Dashboards", exact: true })
      .getByRole("button", { name, exact: true })
      .click();
    await expect(page.locator(".dashboard-context")).toBeVisible();
    for (const width of [320, 375, 640, 768, 1024, 1440, 1920]) {
      for (const height of [900, 360]) {
        await page.setViewportSize({ width, height });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          name + " " + width + "x" + height,
        ).toBeTruthy();
        const buttons = page.locator(".dashboard-tabs button");
        for (let i = 0; i < (await buttons.count()); i++) {
          const b = await buttons.nth(i).boundingBox();
          expect(b!.width).toBeGreaterThan(43);
          expect(b!.x + b!.width).toBeLessThanOrEqual(width + 1);
        }
      }
    }
    await page.setViewportSize({ width: 640, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = "2";
    });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.getBoundingClientRect().width <=
          innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.evaluate(() => {
      document.documentElement.style.zoom = "";
    });
    await page.setViewportSize({ width: 320, height: 700 });
    await page.locator(".dashboard-filters > summary").click();
    await expect(
      page.getByRole("button", { name: "Aplicar filtros" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Aplicar filtros" }).click();
    await expect(page.locator(".dashboard-context")).toBeVisible();
    await page.locator(".dashboard-filters > summary").click();
    await page.locator(".dashboard-popover > summary").click();
    await expect(
      page.getByRole("button", { name: "PDF", exact: true }),
    ).toBeVisible();
    await page.locator(".dashboard-popover > summary").press("Escape");
    await page.locator(".dashboard-metric-button").first().click();
    const dialog = page.getByRole("dialog", { name: "Registros do indicador" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("status")).toHaveCount(0);
    expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(320);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    if (name === "Geral" || name === "Estoque")
      await page.screenshot({
        path: info.outputPath(name + "-320.png"),
        fullPage: true,
      });
  }
  await page.route("**/api/operations?**", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Falha controlada no relatório" },
    }),
  );
  await page
    .getByRole("navigation", { name: "Dashboards", exact: true })
    .getByRole("button", { name: "Geral", exact: true })
    .click();
  await expect(
    page.locator(".dashboard-suite [role=alert]:visible"),
  ).toContainText("Falha controlada");
  await page.unroute("**/api/operations?**");
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.locator(".dashboard-context")).toBeVisible();
  await page.route("**/api/operations?**", async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    await route.continue();
  });
  await page
    .getByRole("navigation", { name: "Dashboards", exact: true })
    .getByRole("button", { name: "Requisições", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Carregando indicadores" }),
  ).toBeVisible();
  await expect(page.locator(".dashboard-context")).toBeVisible();
  await page.unroute("**/api/operations?**");
  await page.locator(".dashboard-filters > summary").click();
  await page.locator("input[name=from]").fill("2000-01-01");
  await page.locator("input[name=to]").fill("2000-01-02");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(
    page.getByText("Nenhum registro corresponde aos filtros.", { exact: true }),
  ).toBeVisible();
});

test("gráficos: série longa, amostra única, texto longo e confirmação acessível", async ({
  page,
}) => {
  expect(
    (
      await page.request.post("/api/login", {
        headers: { origin },
        data: { identity: "1004", password: process.env.SEED_PASSWORD },
      })
    ).status(),
  ).toBe(200);
  const response = await page.request.get("/api/operations?dashboard=geral");
  expect(response.status()).toBe(200);
  const report = await response.json();
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 364 * 86400000).toISOString().slice(0, 10);
  report.filters.from = from;
  report.filters.to = to;
  report.methodology.period = from + " a " + to;
  report.daily = Array.from({ length: 365 }, (_, i) => ({
    date: new Date(Date.parse(from) + i * 86400000).toISOString().slice(0, 10),
    unit: "un",
    kind: "saida",
    quantity: i % 19,
  }));
  report.top = [
    {
      code: "LONGO".repeat(30),
      item: "Peça com descrição longa ".repeat(20),
      unit: "un",
      quantity: 18,
    },
  ];
  await page.route("**/api/operations?**", (route) =>
    route.fulfill({ json: report }),
  );
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/admin/dashboard");
  await expect(page.locator(".dashboard-chart")).toBeVisible();
  expect(
    (await page.locator(".dashboard-title").boundingBox())!.width,
  ).toBeGreaterThan(180);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page
    .getByText("Ver valores diários em tabela", { exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Dados do gráfico de linha" })
      .locator("tbody tr"),
  ).toHaveCount(365);
  await page.unroute("**/api/operations?**");
  report.filters.from = to;
  report.daily = [{ date: to, unit: "un", kind: "saida", quantity: 3 }];
  await page.route("**/api/operations?**", (route) =>
    route.fulfill({ json: report }),
  );
  await page
    .getByRole("navigation", { name: "Dashboards", exact: true })
    .getByRole("button", { name: "Geral", exact: true })
    .click();
  await expect(page.locator(".dashboard-chart circle")).toBeVisible();
  await page.unroute("**/api/operations?**");
  await page.goto("/admin/purchases");
  await expect(page.locator(".dashboard-context")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Confirmar recomendação para revisão",
      exact: true,
    })
    .click();
  const confirm = page.getByRole("dialog", { name: "Confirmar operação" });
  await expect(confirm).toBeVisible();
  expect(
    await page.evaluate(() => document.activeElement?.closest("dialog")?.open),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Voltar sem alterar" }).click();
  await expect(confirm).not.toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Confirmar recomendação para revisão",
      exact: true,
    }),
  ).toBeFocused();
});
