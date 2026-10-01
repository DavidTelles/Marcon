import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail ou matrícula").fill("mariana@marcon.demo");
  await page.getByLabel("Senha", { exact: true }).fill("Marcon@123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/inicio\//);
});
test("demonstração não simula transferências sem Neon", async ({
  page,
  baseURL,
}) => {
  await page.goto("/warehouse/dashboard?view=recomendacoes");
  await expect(page.getByRole("status")).toContainText(
    "Nenhum saldo é movimentado",
  );
  await expect(
    page.getByRole("button", { name: /Vou retirar|Confirmar transferência/ }),
  ).toHaveCount(0);
  const response = await page.request.post("/api/workspace", {
    headers: { origin: baseURL! },
    data: { type: "transfer" },
  });
  expect(response.status()).toBe(503);
});
test("catálogo e estado sem dados cabem em telas móveis", async ({ page }) => {
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/warehouse/dashboard",
      "/warehouse/dashboard?view=recomendacoes",
      "/warehouse/stock/all/all",
    ]) {
      await page.goto(route);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
    }
  }
});
