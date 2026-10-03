import { expect, test } from "@playwright/test";
import sharp from "sharp";

test("editor real: tipos industriais, caminho cadastrado, bloqueio e falha de persistência explícita", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/login");
  await page.getByLabel("E-mail ou matrícula").fill("rafael@marcon.demo");
  await page.getByLabel("Senha", { exact: true }).fill("Marcon@12345");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL("/admin/dashboard");
  await page.goto("/admin/map");
  const image = await sharp({ create: { width: 1000, height: 700, channels: 3, background: "white" } }).png().toBuffer();
  await page.getByLabel("Planta PNG, JPEG ou WebP").setInputFiles({ name: "planta-sintetica.png", mimeType: "image/png", buffer: image });
  const svg = page.getByRole("img", { name: "Editor visual da planta; pontos também editáveis nos campos abaixo" });
  await expect(svg).toBeVisible();
  await page.getByRole("combobox", { name: "Ferramenta", exact: true }).selectOption("point");
  await page.getByRole("combobox", { name: "Tipo do novo ponto", exact: true }).selectOption("local_stock");
  const bounds = (await svg.boundingBox())!;
  await svg.click({ position: { x: bounds.width * 0.2, y: bounds.height * 0.3 } });
  await page.getByLabel("Nome", { exact: true }).fill("Retirada real");
  await page.getByRole("combobox", { name: "Tipo do novo ponto", exact: true }).selectOption("replenishment");
  await svg.click({ position: { x: bounds.width * 0.8, y: bounds.height * 0.3 } });
  await page.getByLabel("Nome", { exact: true }).fill("Reposição do setor");
  await page.getByRole("combobox", { name: "Ligar ao ponto", exact: true }).selectOption({ label: "Retirada real" });
  await page.getByRole("button", { name: "Ligar pontos", exact: true }).click();
  await page.getByRole("combobox", { name: "Início", exact: true }).selectOption({ label: "Retirada real" });
  await page.getByLabel("Parada Reposição do setor", { exact: true }).check();
  await page.getByRole("button", { name: "Testar percurso", exact: true }).click();
  await expect(page.locator(".route-path")).toHaveCount(1);
  await expect(page.locator(".map-route-summary")).toContainText("unidades do mapa");
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 960 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/map-editor-${width}.png`, fullPage: true, animations: "disabled" });
  }
  await page.getByText("Caminhos e bloqueios (1)", { exact: true }).click();
  await page.getByLabel("Bloqueado", { exact: true }).check();
  await page.getByRole("button", { name: "Testar percurso", exact: true }).click();
  await expect(page.locator(".route-path")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Rota indisponível");
  const response = page.waitForResponse((r) => r.url().endsWith("/api/maps") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Salvar nova versão", exact: true }).click();
  expect((await response).status()).toBe(503);
  await expect(page.getByRole("status")).toContainText("Configure o Neon");
});
