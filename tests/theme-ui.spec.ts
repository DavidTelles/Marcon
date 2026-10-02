import { expect, test, type Locator, type Page } from "@playwright/test";

async function login(page: Page, origin: string, identity = "ana@marcon.demo") {
  const response = await page.request.post("/api/login", {
    headers: { origin },
    data: { identity, password: process.env.SEED_PASSWORD || "Marcon@123" },
  });
  expect(response.status()).toBe(200);
}
async function appearance(element: Locator) {
  return element.evaluate((node) => {
    const style = getComputedStyle(node);
    return [style.color, style.backgroundColor, style.backgroundImage, style.borderColor, style.boxShadow, style.transform, style.filter, style.textDecoration];
  });
}
async function checkHover(page: Page, element: Locator) {
  await page.mouse.move(0, 0);
  await element.evaluate(async node => { await Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => undefined))); });
  const before = await appearance(element);
  await element.hover();
  await expect.poll(() => appearance(element)).toEqual(before);
}

test("themes span login, workspace, profile and reload; focus and buttons remain usable", async ({ page, baseURL }) => {
  await page.goto("/login");
  const theme = page.getByRole("button", { name: "Modo escuro", exact: true });
  await expect(theme).toHaveAttribute("aria-pressed", "false");
  await theme.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(25, 35, 56)");
  const submit = page.getByRole("button", { name: "Entrar", exact: true });
  await expect.poll(() => submit.evaluate(node => getComputedStyle(node).backgroundColor)).toBe("rgb(143, 179, 226)");
  await expect.poll(() => submit.evaluate(node => getComputedStyle(node).color)).toBe("rgb(25, 35, 56)");
  await checkHover(page, page.getByRole("button", { name: "Entrar", exact: true }));
  await login(page, baseURL!);
  await page.goto("/employee/history");
  await expect(page.getByRole("heading", { name: "Fila de requisições" })).toBeVisible();
  await expect(theme).toHaveAttribute("aria-pressed", "true");
  await checkHover(page, page.getByRole("button", { name: "Minhas requisições", exact: true }));
  await page.getByRole("link", { name: "Editar perfil" }).click();
  await expect(page.getByRole("heading", { name: "Editar perfil", exact: true })).toBeVisible();
  await expect(theme).toHaveAttribute("aria-pressed", "true");
  await theme.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => theme.evaluate(node => getComputedStyle(node).outlineStyle)).toBe("solid");
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(theme).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--palette-1").trim())).toBe("#005187");
});

test("employee queue filters, details and mobile cards work in both palettes", async ({ page, baseURL }) => {
  await login(page, baseURL!);
  await page.goto("/employee/history");
  const queue = page.getByRole("heading", { name: "Fila de requisições" });
  await expect(queue).toBeVisible();
  const reportFilters = page.getByText("Filtros do relatório", { exact: true });
  if (await reportFilters.count()) {
    await reportFilters.click();
    await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("Pendente");
    await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
    await expect(queue).toBeVisible();
    await expect(page.locator(".employee-queue-scroll tbody tr").first()).toContainText("Pendente");
    await page.getByRole("button", { name: /Abrir registros #/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await reportFilters.click();
  }
  for (const dark of [false, true]) {
    const theme = page.getByRole("button", { name: "Modo escuro", exact: true });
    if ((await theme.getAttribute("aria-pressed")) !== String(dark)) await theme.click();
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(theme).toBeInViewport();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    }
    await checkHover(page, theme);
  }
});

for (const [identity, path] of [
  ["carlos@marcon.demo", "/department-head/dashboard"],
  ["mariana@marcon.demo", "/warehouse/dashboard"],
  ["rafael@marcon.demo", "/admin/dashboard"],
]) {
  test(`${identity}: dashboard palettes and tablet/mobile navigation`, async ({ page, baseURL }) => {
    await login(page, baseURL!, identity);
    await page.goto(path);
    const theme = page.getByRole("button", { name: "Modo escuro", exact: true });
    await theme.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect.poll(() => page.locator(".shell").evaluate(node => getComputedStyle(node).backgroundColor)).toBe("rgb(25, 35, 56)");
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(theme).toBeInViewport();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    }
    await checkHover(page, page.getByRole("button", { name: "Dashboard", exact: true }));
    await theme.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
}
