import { expect, test } from "@playwright/test";

const accounts = [
  { id: "1001", role: "funcionario", panel: "/employee/request" },
  { id: "1002", role: "lider", panel: "/department-head/dashboard" },
  { id: "1003", role: "almoxarifado", panel: "/warehouse/dashboard" },
  { id: "1004", role: "admin", panel: "/admin/dashboard" },
];

for (const account of accounts) {
  test(`${account.role}: conta fixa, voltar, restrição de perfil e sair`, async ({ page, baseURL }) => {
    const login = await page.request.post("/api/login", {
      headers: { origin: baseURL! },
      data: { identity: account.id, password: "Marcon@123" },
    });
    expect(login.status()).toBe(200);
    await page.goto(account.panel);
    await expect(page.getByRole("link", { name: "Voltar", exact: true })).toBeVisible();
    await expect(page.getByText(/trocar (usuário|perfil|conta)/i)).toHaveCount(0);
    if (account.role === "almoxarifado") {
      await page.goto("/warehouse/stock/all/all");
      await page.getByRole("link", { name: "Voltar", exact: true }).click();
      await expect(page).toHaveURL(account.panel);
    }
    await page.getByRole("link", { name: "Voltar", exact: true }).click();
    await expect(page).toHaveURL(`/inicio/${account.role}`);
    const other = accounts.find((item) => item.role !== account.role)!;
    await page.goto(other.panel);
    await expect(page).toHaveURL(`/inicio/${account.role}`);
    await page.goto(account.panel);
    await page.getByRole("button", { name: "Sair da conta" }).click();
    await expect(page).toHaveURL("/login");
    await page.goto(account.panel);
    await expect(page).toHaveURL("/login");
  });
}

test("solicitações do líder não ampliam a página em tablet", async ({ page, baseURL }) => {
  const login = await page.request.post("/api/login", {
    headers: { origin: baseURL! },
    data: { identity: "1002", password: "Marcon@123" },
  });
  expect(login.status()).toBe(200);
  for (const width of [768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/department-head/requests");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
});

test("perfil exige login e informa quando o MySQL não está configurado", async ({ page, baseURL }) => {
  await page.goto("/profile");
  await expect(page).toHaveURL("/login");
  const login = await page.request.post("/api/login", {
    headers: { origin: baseURL! },
    data: { identity: "1001", password: "Marcon@123" },
  });
  expect(login.status()).toBe(200);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Editar perfil" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar perfil" })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  const response = await page.request.patch("/api/profile", {
    headers: { origin: baseURL! },
    data: { name: "Ana Souza", email: "ana@marcon.demo", currentPassword: "Marcon@123" },
  });
  expect(response.status()).toBe(503);
});
