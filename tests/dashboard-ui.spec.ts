import { expect, test } from "@playwright/test";

const dashboards = [
  {
    identity: "1004",
    path: "/admin/dashboard",
    title: "Evolução das solicitações",
  },
  {
    identity: "1002",
    path: "/department-head/dashboard",
    title: "Evolução das solicitações",
  },
  {
    identity: "1003",
    path: "/warehouse/dashboard",
    title: "Evolução das retiradas",
  },
];

for (const dashboard of dashboards) {
  test(`${dashboard.path}: gráficos, navegação e ausência de overflow`, async ({
    page,
    baseURL,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const login = await page.request.post("/api/login", {
      headers: { origin: baseURL! },
      data: { identity: dashboard.identity, password: "Marcon@12345" },
    });
    expect(login.status()).toBe(200);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(dashboard.path);
    const chart = page.getByRole("region", {
      name: dashboard.title,
      exact: true,
    });
    await expect(chart).toBeVisible();
    await chart.getByRole("button", { name: "30 dias" }).click();
    await expect(
      chart.getByRole("button", { name: "30 dias" }),
    ).toHaveAttribute("aria-pressed", "true");
    await chart.getByText("Ver valores por dia", { exact: true }).click();
    await expect(chart.locator("tbody tr")).toHaveCount(30);
    await chart.getByRole("button", { name: "7 dias" }).click();
    await expect(chart.locator("tbody tr")).toHaveCount(7);
    await chart.getByText("Ver valores por dia", { exact: true }).click();

    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(chart).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBeTruthy();
      if (width < 800) {
        await page.getByRole("button", { name: "Abrir menu" }).click();
        await expect(
          page.getByRole("navigation", { name: "Navegação principal" }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(
          page.getByRole("button", { name: "Abrir menu" }),
        ).toBeFocused();
      }
    }
    await page.screenshot({
      path: test.info().outputPath("desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: test.info().outputPath("mobile.png"),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}

test("almoxarifado: filtros recolhidos e recuperação do estado vazio", async ({
  page,
  baseURL,
}) => {
  await page.request.post("/api/login", {
    headers: { origin: baseURL! },
    data: { identity: "1003", password: "Marcon@12345" },
  });
  await page.goto("/warehouse/dashboard");
  const filters = page.locator(".warehouse-filters");
  await expect(filters).not.toHaveAttribute("open", "");
  await filters.locator("summary").click();
  await filters.getByLabel("Data inicial", { exact: true }).fill("2099-01-01");
  await expect(
    page
      .getByRole("region", { name: "Evolução das retiradas", exact: true })
      .getByText("Nenhum registro para este gráfico."),
  ).toBeVisible();
  await expect(filters.locator("summary")).toContainText("Filtros ativos");
  await filters.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(
    page.getByRole("heading", { name: "Evolução das retiradas" }),
  ).toBeVisible();
  await expect(filters.locator("summary")).not.toContainText("Filtros ativos");
});
