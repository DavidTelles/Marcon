import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, user = "ana@marcon.demo") {
  await page.goto("/login");
  await page.getByLabel("E-mail ou matrícula").fill(user);
  await page.getByLabel("Senha", { exact: true }).fill("Marcon@123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/inicio\//);
}

test("catalog search finds names and IDs; detail starts a request", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/catalogo");
  await expect(page).toHaveURL("/catalogo");
  await expect(page.getByText("42 unidades disponíveis")).toBeVisible();

  const search = page.getByRole("searchbox", {
    name: "Buscar item por nome ou ID",
  });
  await search.fill("capacete");
  await expect(
    page.getByRole("link", { name: "Ver detalhes de Capacete de segurança" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Ver detalhes de Luva/ }),
  ).toHaveCount(0);
  await search.fill("FER-014");
  await expect(
    page.getByRole("link", { name: "Ver detalhes de Parafusadeira a bateria" }),
  ).toBeVisible();
  await search.fill("");

  await page
    .getByRole("link", { name: "Ver detalhes de Capacete de segurança" })
    .click();
  await expect(page).toHaveURL("/catalogo/item/EPI-001");
  await expect(
    page.getByRole("heading", { name: "Capacete de segurança" }),
  ).toBeVisible();
  await expect(page.getByText("42", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/item-detail-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Requisitar este item" }).click();
  await page.getByRole("button", { name: "Aumentar quantidade" }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Quantidade" }),
  ).toHaveValue("2");
  await page.getByRole("button", { name: "Confirmar requisição" }).click();
  await expect(page.getByRole("status")).toContainText("Requisição iniciada!");
  await expect(page.getByRole("status")).toContainText(/REQ-[A-F0-9]{8}/);
  const saved = await page.request.get("/api/requisicoes");
  expect(saved.status()).toBe(200);
  const { requests } = await saved.json();
  expect(requests).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ itemId: "EPI-001", quantity: 2 }),
    ]),
  );
});

test("empty state, availability filter and out-of-stock detail", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/catalogo");
  const search = page.getByRole("searchbox", {
    name: "Buscar item por nome ou ID",
  });
  await search.fill("item inexistente");
  await expect(
    page.getByRole("heading", { name: "Nenhum item encontrado" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.getByLabel("Somente disponíveis").check();
  await expect(
    page.getByRole("link", { name: "Ver detalhes de Extensão elétrica 10 m" }),
  ).toHaveCount(0);
  await page.getByLabel("Somente disponíveis").uncheck();
  await page
    .getByRole("link", { name: "Ver detalhes de Extensão elétrica 10 m" })
    .click();
  await expect(page.getByText("Sem saldo no momento")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Indisponível no momento" }),
  ).toBeDisabled();
});

test("catalog and detail show errors with a working retry", async ({
  page,
}) => {
  await signIn(page);
  await page.route("**/api/items", (route) => route.abort());
  await page.goto("/catalogo");
  await expect(
    page.getByRole("heading", {
      name: "Não foi possível carregar o catálogo.",
    }),
  ).toBeVisible();
  await page.unroute("**/api/items");
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(
    page.getByRole("heading", { name: "Catálogo de materiais" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ver detalhes de Capacete de segurança" }),
  ).toBeVisible();

  await page.route("**/api/items/EPI-001", (route) => route.abort());
  await page.goto("/catalogo/item/EPI-001");
  await expect(
    page.getByRole("heading", { name: "Não foi possível carregar o item." }),
  ).toBeVisible();
  await page.unroute("**/api/items/EPI-001");
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(
    page.getByRole("heading", { name: "Capacete de segurança" }),
  ).toBeVisible();
});

test("request validates stock and restricts creation to employees", async ({
  page,
  request,
  baseURL,
}) => {
  await signIn(page);
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find(
    (cookie) => cookie.name === "marcon_session",
  );
  expect(sessionCookie).toBeDefined();
  const headers = {
    Origin: baseURL!,
    Cookie: `marcon_session=${sessionCookie!.value}`,
  };
  const excess = await request.post("/api/requisicoes", {
    headers,
    data: { itemId: "EPI-001", quantity: 43 },
  });
  expect(excess.status()).toBe(422);
  const missing = await request.post("/api/requisicoes", {
    headers,
    data: { itemId: "XXX-000", quantity: 1 },
  });
  expect(missing.status()).toBe(404);

  await page.goto("/catalogo/item/XXX-000");
  await expect(
    page.getByRole("heading", { name: "Item não encontrado" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sair da conta" }).click();
  await signIn(page, "rafael@marcon.demo");
  await page.goto("/catalogo/item/EPI-001");
  await expect(
    page.getByText("Este perfil pode consultar o catálogo."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Requisitar este item" }),
  ).toHaveCount(0);
});

test("catalog remains readable on narrow screens", async ({ page }) => {
  await signIn(page);
  await page.goto("/catalogo");
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("searchbox", { name: "Buscar item por nome ou ID" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: "test-results/catalog-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: "test-results/catalog-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
});
