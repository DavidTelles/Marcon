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
    await expect(page.getByRole("button", { name: "Entrar com passkey" })).toHaveCount(0);
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

test("retired authentication flows are absent", async ({page}) => {
 await page.goto("/login");
 await expect(page.getByRole("button",{name:/passkey|RFID/i})).toHaveCount(0);
 for(const path of ["/api/passkey","/api/login/rfid"]){const response=await page.request.post(path,{data:{}});expect(response.status()).toBe(404);}
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
  await page.getByLabel("Senha", { exact: true }).fill("Marcon@12345");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL("/admin/dashboard");
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await expect(page).toHaveURL("/login");
  await page.goto("/inicio/admin");
  await expect(page).toHaveURL("/login");
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
