import { expect, test } from "@playwright/test";

const comparison =
  "/admin/dashboard/parts?from=2026-09-21&to=2026-09-24&unit=un";
const share =
  "/admin/dashboard/by-part?from=2026-09-21&to=2026-09-24&unit=un&code=P1";

test("API incompatível não quebra as duas telas e permite tentar novamente", async ({
  page,
}) => {
  const crashes: string[] = [];
  page.on("pageerror", (error) => crashes.push(error.message));
  for (const url of [comparison, share]) {
    await page.route("**/api/parts-consumption?**", async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      delete data.quality; // Reproduce the reported legacyWithoutLedger crash.
      await route.fulfill({ response, json: data });
    });
    await page.goto(url);
    await expect(
      page.getByRole("alert").filter({ hasText: "resposta incompatível" }),
    ).toBeVisible();
    await page.unrouteAll({ behavior: "wait" });
    await page
      .getByRole("button", { name: "Tentar novamente", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Alternativa tabular ao ranking" }),
    ).toBeVisible();

    await page.route("**/api/parts-consumption?**", async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      if (new URL(route.request().url()).searchParams.has("details"))
        delete data.quality;
      await route.fulfill({ response, json: data });
    });
    await page
      .getByRole("region", { name: "Alternativa tabular ao ranking" })
      .getByRole("button")
      .first()
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "resposta incompatível" }),
    ).toBeVisible();
    await page.unrouteAll({ behavior: "wait" });
    await page.getByRole("button", { name: "Voltar à visão anterior" }).click();
  }
  expect(crashes).toEqual([]);
});
test("painéis reais: responsividade, registros de origem, evolução e filtros preservados", async ({
  page,
}) => {
  for (const url of [comparison, share]) {
    await page.goto(url);
    await expect(
      page.getByRole("region", { name: "Alternativa tabular ao ranking" }),
    ).toBeVisible();
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/parts-consumption/${url.includes("by-part") ? "por-peca" : "peca"}-${width}.png`,
        fullPage: true,
      });
    }
  }
  const table = page.getByRole("region", {
    name: "Alternativa tabular ao ranking",
  });
  await expect(table).toContainText("Sem bloco identificado");
  await expect(table).toContainText("Sem base percentual");
  await page
    .getByRole("button", { name: "Registros de Bloco A", exact: true })
    .click();
  const origins = page.getByRole("region", {
    name: "Registros que compõem o resultado",
  });
  await expect(origins).toContainText("2 registros");
  await expect(origins).toContainText("Origem 1");
  await expect(origins).toContainText("Origem 2");
  await page.getByRole("button", { name: "Voltar à visão anterior" }).click();
  await page
    .getByText("Evolução temporal · até 4 séries", { exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: /Evolução das entregas/ }),
  ).toBeVisible();
  await page
    .getByText("Tabela diária · alternativa acessível e registros de origem", {
      exact: true,
    })
    .click();
  const day = page.getByRole("button", {
    name: "Registros de Bloco A em 2026-09-21",
    exact: true,
  });
  await day.focus();
  await page.keyboard.press("Enter");
  await expect(origins).toContainText("2 registros");
  await page.getByRole("button", { name: "Voltar à visão anterior" }).click();
  await page
    .getByLabel("Almoxarifado de origem da retirada")
    .selectOption("Origem 2");
  await expect(table).toContainText("2 un");
  await expect(page.getByRole("navigation", { name: "Painéis de peças" })).toHaveCount(0);
  await page.goto(comparison);
  await expect(page.getByRole("heading", { name: "Consumos", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "P1", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Almoxarifado de origem da retirada")).toHaveValue("");

});

test("respostas antigas, falha/repetição, unidade e exportação", async ({
  page,
}) => {
  await page.goto(comparison);
  await expect(
    page.getByRole("region", { name: "Alternativa tabular ao ranking" }),
  ).toBeVisible();
  let slowStarted = false;
  await page.route("**/api/parts-consumption?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("block") === "Bloco A") {
      slowStarted = true;
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 900));
      try {
        await route.fulfill({ response });
      } catch {
        /* aborted on newer filter */
      }
    } else await route.continue();
  });
  await page.getByLabel("Bloco de destino").selectOption("Bloco A");
  await expect.poll(() => slowStarted).toBe(true);
  await page.getByLabel("Bloco de destino").selectOption("Bloco B");
  await expect(
    page.getByRole("region", { name: "Alternativa tabular ao ranking" }),
  ).toContainText("4");
  await page.waitForTimeout(1100);
  await expect(page.getByLabel("Bloco de destino")).toHaveValue("Bloco B");
  const table = page.getByRole("region", {
    name: "Alternativa tabular ao ranking",
  });
  await expect(table.getByRole("row").filter({ hasText: "P1" })).toContainText(
    "4 un",
  );
  await page.unrouteAll({ behavior: "wait" });
  await page.route("**/api/parts-consumption?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Consulta temporariamente indisponível" }),
    }),
  );
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Consulta temporariamente indisponível" }),
  ).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expect(table).toBeVisible();
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.getByLabel("Peça selecionada").selectOption("P3");
  await expect(page.getByLabel("Unidade compatível")).toHaveValue("kg");
  await expect(table).toContainText("kg");
  await expect(table).not.toContainText("Parafuso");
  for (const [label, format, mime] of [
    ["Exportar planilha", "xlsx", "spreadsheetml"],
    ["Exportar PDF", "pdf", "application/pdf"],
  ]) {
    const requestPromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/parts-consumption" && url.searchParams.get("format") === format;
    });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const response = await requestPromise;
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain(mime);
    expect(new URL(response.url()).searchParams.get("code")).toBe("P3");
    expect(new URL(response.url()).searchParams.get("export")).toBe("all");
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
    expect(await download.failure()).toBeNull();
  }
  await page.route("**/api/parts-consumption?**", async (route) => {
    if (new URL(route.request().url()).searchParams.has("format"))
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({error: "Exportação indisponível para teste"}) });
    else await route.continue();
  });
  await page.getByRole("button", {name: "Exportar PDF", exact: true}).click();
  await expect(page.getByRole("alert")).toContainText("Exportação indisponível para teste");
  await page.unrouteAll({behavior: "wait"});
  const retryDownload = page.waitForEvent("download");
  await page.getByRole("button", {name: "Exportar PDF", exact: true}).click();
  expect(await (await retryDownload).failure()).toBeNull();

});

test("blocos selecionados, dados ausentes e permissão de recomendações", async ({
  page,
}) => {
  await page.goto(share);
  const table = page.getByRole("region", {
    name: "Alternativa tabular ao ranking",
  });
  await expect(table).toBeVisible();
  await page.getByText("Selecionar vários blocos", { exact: true }).click();
  await page.getByLabel("Bloco A", { exact: true }).check();
  await expect(table).toContainText("5 un");
  await page.getByLabel("Bloco B", { exact: true }).check();
  await expect(table).toContainText("44,44%");
  await expect(table).not.toContainText("Sem bloco identificado");
  await expect(page.getByText(/Denominador: 9 un entregues/)).toBeVisible();
  const row = table.getByRole("row").filter({ hasText: "Bloco A" });
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("region", { name: "Registros que compõem o resultado" }),
  ).toContainText("2 registros");
  await page.getByRole("button", { name: "Voltar à visão anterior" }).click();
  await page
    .getByRole("button", { name: "Ver registros de Bloco A", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Registros que compõem o resultado" }),
  ).toContainText("2026-09-21 00:00:00.000");
  await page.getByRole("button", { name: "Voltar à visão anterior" }).click();
  await page
    .getByText("Pedidos solicitados, entregues e pendentes", { exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Indisponível", exact: true }).first(),
  ).toBeVisible();
  await page.route("**/api/operations?**", (route) => {
    expect(new URL(route.request().url()).searchParams.get("planning")).toBe(
      "purchase",
    );
    return route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: "Perfil sem permissão para planejamento" }),
    });
  });
  await page
    .getByText("Saldos atuais e recomendação de estoque", { exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Perfil sem permissão para planejamento" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reconsultar sugestões" }),
  ).toBeVisible();
});
