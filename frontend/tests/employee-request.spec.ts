import { expect, test, type Page } from "@playwright/test";

async function signInEmployee(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail ou matrícula").fill("ana@marcon.demo");
  await page.getByLabel("Senha", { exact: true }).fill("Marcon@123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/inicio\/funcionario/);
}

test("employee requests a stock part with confirmation, priority and justification", async ({
  page,
}) => {
  await signInEmployee(page);
  await page.getByRole("link", { name: "Explorar catálogo" }).click();
  await expect(page).toHaveURL("/employee/request");
  await expect(
    page.getByRole("heading", { name: "Catálogo de peças" }),
  ).toBeVisible();

  await page
    .getByRole("searchbox", { name: "Buscar peça por nome ou ID" })
    .fill("PAR-M12-040");
  await page
    .getByRole("link", { name: /Ver detalhes de Parafuso sextavado M12/ })
    .click();
  await expect(page).toHaveURL("/employee/request/peca/2");
  await expect(page.getByLabel("Confirme a quantidade")).toHaveCount(0);

  await page.getByRole("button", { name: "Requisitar este item" }).click();
  await page.getByLabel("Quantidade", { exact: true }).fill("11");
  await page.getByLabel("Confirme a quantidade").fill("11");
  await page.getByLabel("Prioridade").selectOption("Urgente");
  await page
    .getByLabel(/Justificativa/)
    .fill("Reposição necessária na montagem.");
  await page.getByRole("button", { name: "Confirmar requisição" }).click();
  await expect(page.getByRole("status")).toContainText("Requisição #");
  await page.getByRole("link", { name: "Ver minhas requisições" }).click();
  await expect(page).toHaveURL("/employee/history");
  await expect(page.getByText("Parafuso sextavado M12").first()).toBeVisible();
});

test("employee adds a part to cart and confirms the request", async ({
  page,
}) => {
  await signInEmployee(page);
  await page.goto("/employee/request/peca/1");
  await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();
  await page.getByLabel("Quantidade", { exact: true }).fill("2");
  await page.getByLabel("Confirme a quantidade").fill("2");
  await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();
  await expect(page).toHaveURL(/\/employee\/request#carrinho$/);
  await expect(
    page.getByRole("heading", { name: /Carrinho · 1 item/ }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /Carrinho · 1 item/ })).toBeVisible();
  await page.getByRole("button", { name: "Finalizar requisição" }).click();
  await expect(page).toHaveURL("/employee/history");
  await expect(page.getByText("Rolamento 6205 ZZ").first()).toBeVisible();
});

test("employee catalog and request form fit narrow screens", async ({
  page,
}) => {
  await signInEmployee(page);
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/employee/request");
    await expect(
      page.getByRole("searchbox", { name: "Buscar peça por nome ou ID" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await page.goto("/employee/request/peca/1");
    await page.getByRole("button", { name: "Requisitar este item" }).click();
    await expect(page.getByLabel("Confirme a quantidade")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  }
});

test("employee area requires an employee session", async ({ page }) => {
  await page.goto("/employee/request");
  await expect(page).toHaveURL("/login");
  await page.getByLabel("E-mail ou matrícula").fill("rafael@marcon.demo");
  await page.getByLabel("Senha", { exact: true }).fill("Marcon@123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL("/inicio/admin");
  await page.goto("/employee/request");
  await expect(page).toHaveURL("/inicio/admin");
});

