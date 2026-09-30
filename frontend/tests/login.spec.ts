import { expect, test } from "@playwright/test";

test("layout remains usable from 320px to 1920px", async ({ page }) => {
  await page.goto("/login");
  for (const width of [320, 375, 640, 768, 1024, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("heading", { name: "Bom ter você aqui." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Entrar", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar com passkey" })).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByText("Experimentar com uma conta de demonstração").click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByText("Experimentar com uma conta de demonstração").click();
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.screenshot({
    path: "test-results/login-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: "test-results/login-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("passkey exige banco configurado", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Entrar com passkey" })).toBeDisabled();
  await expect(page.getByText("Disponível com MySQL configurado.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar com reconhecimento facial", exact: true })).toBeDisabled();
  await expect(page).toHaveURL("/login");
});

test("credentials, errors, password visibility and logout", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail ou matrícula").fill("rafael@marcon.demo");
  await page.getByLabel("Senha", { exact: true }).fill("incorreta");
  await page.getByRole("button", { name: "Mostrar senha" }).click();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator("#login-error")).toContainText("incorretos");
  await page.getByLabel("Senha", { exact: true }).fill("Marcon@123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL("/inicio/admin");
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await expect(page).toHaveURL("/login");
  await page.goto("/inicio/admin");
  await expect(page).toHaveURL("/login");
});

test("RFID waits five seconds and signs in without a password", async ({
  page,
}) => {
  await page.goto("/login");
  await page.clock.install();
  await page.getByRole("button", { name: "Ativar leitor RFID" }).click();
  await expect(
    page.getByRole("heading", { name: "Aproxime o cartão do leitor" }),
  ).toBeFocused();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("5 s");
  await page.clock.runFor(4000);
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("status")).toContainText("1 s");
  await page.clock.runFor(1000);
  await expect(page).toHaveURL("/inicio/funcionario");
});

test("canceling RFID stops the pending read and restores credentials", async ({
  page,
}) => {
  let reads = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/login/rfid")) reads++;
  });
  await page.goto("/login");
  await page.clock.install();
  await page.getByLabel("Senha", { exact: true }).fill("previous-password");
  await page.getByRole("button", { name: "Ativar leitor RFID" }).click();
  await page.clock.runFor(2000);
  await page
    .getByRole("button", { name: "Cancelar e usar credenciais" })
    .click();
  await expect(page.getByLabel("E-mail ou matrícula")).toBeFocused();
  await expect(page.getByLabel("Senha", { exact: true })).toBeEmpty();
  await page.clock.runFor(6000);
  expect(reads).toBe(0);
  await expect(page).toHaveURL("/login");
});

test("RFID failure allows another timed attempt", async ({ page }) => {
  await page.goto("/login");
  await page.clock.install();
  await page.route("**/api/login/rfid", (route) => route.abort());
  await page.getByRole("button", { name: "Ativar leitor RFID" }).click();
  await page.clock.runFor(5000);
  await expect(
    page.getByRole("alert").filter({ hasText: "Não foi possível concluir" }),
  ).toBeVisible();
  await page.unroute("**/api/login/rfid");
  await page.getByRole("button", { name: "Tentar leitura novamente" }).click();
  await expect(page.getByRole("status")).toContainText("5 s");
  await page.clock.runFor(5000);
  await expect(page).toHaveURL("/inicio/funcionario");
});

test("reduced motion disables animation and tilt; keyboard reaches form", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Ir para o login" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("E-mail ou matrícula")).toBeFocused();
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  const scene = page.locator('[class*="scene"]').first();
  await scene.hover();
  await expect(scene).not.toHaveAttribute("style", /pointer-x/);
});

test("network failure keeps credentials and allows retry", async ({ page }) => {
  await page.goto("/login");
  await page.route("**/api/login", (route) => route.abort());
  await page.getByLabel("E-mail ou matrícula").fill("1001");
  await page.getByLabel("Senha", { exact: true }).fill("Marcon@123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator("#login-error")).toContainText(
    "Não foi possível conectar",
  );
  await expect(page.getByLabel("E-mail ou matrícula")).toHaveValue("1001");
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeEnabled();
});

test("3D scene responds to the pointer and returns to its resting position", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  const scene = page.locator('[class*="scene"]').first();
  await scene.hover({ position: { x: 30, y: 30 } });
  await expect(scene).toHaveAttribute("style", /--pointer-x/);
  await page.getByRole("heading", { name: "Bom ter você aqui." }).hover();
  await expect(scene).not.toHaveAttribute("style", /--pointer-x/);
});
