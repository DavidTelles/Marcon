import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { expect } from "@playwright/test";

export async function checkRecommendationCards({
  page,
  origin,
  sql,
  part,
  near,
  far,
}) {
  // Only the calling runner's temporary schema is changed. Restore a controlled
  // imbalance after its audited transfer scenario to generate fresh proposals.
  await sql(
    "UPDATE inventory SET quantity=CASE WHEN warehouse_id=$2 THEN 200 ELSE 0 END WHERE part_id=$1 AND warehouse_id IN ($2,$3)",
    [part, far, near],
  );
  await page.goto(origin + "/admin/recommendations?code=TEST-PART");
  await page.getByText("Filtros do relatório", { exact: true }).click();
  await page
    .getByLabel("Horizonte de cobertura (dias)", { exact: true })
    .fill("10");
  await page
    .getByRole("button", { name: "Aplicar filtros", exact: true })
    .click();
  const region = page.getByRole("region", {
    name: "Recomendação de estoque",
    exact: true,
  });
  const card = region
    .locator(".decision-card")
    .filter({ hasText: "TEST-PART" })
    .first();
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(
    region.getByRole("heading", { name: "Test near warehouse", exact: true }),
  ).toBeVisible();
  await expect(card).toContainText("Receber");
  await expect(card.locator(".decision-route")).toContainText(
    "Retirar deTest far warehouse",
  );
  await expect(card.locator(".decision-route")).toContainText(
    "Entregar emTest near warehouse",
  );
  await expect(card.locator(".decision-receipt")).toContainText("Após receber");
  await expect(card.locator(".decision-impact")).toContainText(
    "Consumo próximo",
  );
  await expect(card.locator(".decision-impact")).toContainText(
    "Espaço após receber",
  );
  await expect(card.locator(".decision-impact")).toContainText(
    "Rota mais curta",
  );
  await expect(card.getByRole("meter")).toHaveAttribute("max", "500");
  await card.getByText("Ver cálculo e dados", { exact: true }).click();
  await expect(card.locator(".decision-calculation")).toContainText(
    "retiradas efetivas",
  );
  await card.getByRole("button", { name: "Ver rota", exact: true }).click();
  await expect(
    card.getByRole("img", { name: "Planta publicada e percurso", exact: true }),
  ).toBeVisible();
  await expect(card.getByRole("status")).toContainText("Mapa publicado");
  await card.getByText("Ver cálculo e dados", { exact: true }).click();
  const silenceHints = page.getByRole("button", { name: "Silenciar dicas", exact: true });
  if (await silenceHints.isVisible()) await silenceHints.click();
  await mkdir(".validation/recommendations", { recursive: true });
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Recommendations overflow at ${width}px`,
    );
    if (width === 375 || width === 1440)
      await card.screenshot({
        path: `.validation/recommendations/card-${width}.png`,
      });
  }
  const balances = () =>
    sql(
      "SELECT warehouse_id,quantity FROM inventory WHERE part_id=$1 ORDER BY warehouse_id",
      [part],
    );
  const before = (await balances()).rows;
  await card
    .getByRole("button", {
      name: "Solicitar transferência sugerida",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Confirmar operação", exact: true }),
  ).toBeVisible();
  assert.deepEqual(
    (await balances()).rows,
    before,
    "Reviewing a suggestion must not move stock",
  );
  await page
    .getByRole("dialog", { name: "Confirmar operação", exact: true })
    .getByRole("button", { name: "Voltar sem alterar", exact: true })
    .click();
  console.log(
    "PASS: receiving-warehouse cards, source/destination, consumption, capacity, projected balance, published route, mobile layout and review without stock movement",
  );
}
