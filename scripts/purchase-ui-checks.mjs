import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { expect } from "@playwright/test";

export async function checkPurchaseCards({
  page,
  origin,
  sql,
  insert,
  near,
  far,
}) {
  const code = "TEST-PURCHASE-GROUP";
  const sameNameCode = "TEST-PURCHASE-OTHER";
  for (const material of [code, sameNameCode]) {
    const id = await insert(
      "parts",
      "code,name,category,unit,minimum_total,lead_days,pack_size,qr_code,location",
      [
        material,
        "Grouped test material",
        "Test",
        "un",
        0,
        3,
        1,
        material,
        "Test shelf",
      ],
    );
    await sql(
      "INSERT INTO inventory(part_id,warehouse_id,quantity,minimum_quantity,capacity) VALUES($1,$2,0,11,200),($1,$3,0,7,200)",
      [id, far, near],
    );
  }
  const report = async (query) => {
    const response = await page.request.get(
      origin +
        "/api/operations?planning=purchase&decision=buy&" +
        new URLSearchParams(query),
    );
    assert.equal(response.status(), 200, await response.text());
    return response.json();
  };
  const grouped = await report({ code, pageSize: "1" });
  assert.equal(
    grouped.decisions.total,
    1,
    "Pagination counts materials, not warehouse positions",
  );
  assert.equal(grouped.decisions.purchaseGroups.length, 1);
  const group = grouped.decisions.purchaseGroups[0];
  assert.equal(group.quantity, 18);
  assert.equal(
    group.rows.length,
    2,
    "One-card pages must retain every warehouse of the material",
  );
  assert.deepEqual(
    group.rows.map((row) => row.buy).sort((a, b) => a - b),
    [7, 11],
  );
  const secondPage = await report({ code, pageSize: "1", decisionPage: "2" });
  assert.equal(secondPage.decisions.purchaseGroups.length, 0);
  const all = await report({ pageSize: "50" });
  assert.ok(all.decisions.purchaseGroups.some((g) => g.code === code));
  assert.ok(
    all.decisions.purchaseGroups.some((g) => g.code === sameNameCode),
    "Same descriptions with different codes remain separate materials",
  );
  const filtered = await report({
    code,
    warehouse: "Test near warehouse",
    pageSize: "1",
  });
  assert.equal(filtered.decisions.purchaseGroups[0].quantity, 7);
  assert.equal(filtered.decisions.purchaseGroups[0].rows.length, 1);
  await page.goto(
    origin + "/admin/purchases?" + new URLSearchParams({ code, pageSize: "1" }),
  );
  const region = page.getByRole("region", {
    name: "Compras sugeridas",
    exact: true,
  });
  const card = region.locator(".purchase-card");
  try {
    await expect(card).toHaveCount(1, { timeout: 30000 });
  } catch (error) {
    console.log("Purchase page diagnostic:", page.url(), (await page.locator("body").innerText()).slice(-5000));
    throw error;
  }
  await expect(card.locator(".purchase-total")).toContainText("18 un");
  await expect(card).not.toHaveAttribute("open");
  await expect(
    card.getByRole("region", { name: "Necessidade em Test near warehouse" }),
  ).not.toBeVisible();
  await mkdir(".validation/purchases", { recursive: true });
  for (const width of [320, 375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Purchase cards overflow at ${width}px`,
    );
    if (width !== 320)
      await card.screenshot({
        path: `.validation/purchases/closed-${width}.png`,
      });
  }
  await card.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(card).toHaveAttribute("open", "");
  for (const [warehouse, amount] of [
    ["Test near warehouse", 7],
    ["Test far warehouse", 11],
  ]) {
    const detail = card.getByRole("region", {
      name: `Necessidade em ${warehouse}`,
      exact: true,
    });
    await expect(detail).toBeVisible();
    await expect(detail.locator(".purchase-warehouse-heading")).toContainText(
      `${amount} un a comprar`,
    );
  }
  for (const width of [320, 375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Expanded purchase cards overflow at ${width}px`,
    );
    if (width !== 320)
      await card.screenshot({
        path: `.validation/purchases/open-${width}.png`,
      });
  }
  await card
    .getByText("Ver cálculo e dados de Test near warehouse", { exact: true })
    .click();
  await expect(
    card.getByRole("region", {
      name: "Necessidade em Test near warehouse",
      exact: true,
    }),
  ).toContainText("limitada a zero = 7 un");
  await card.locator(":scope > summary").click();
  await expect(card).not.toHaveAttribute("open");
  console.log(
    "PASS: predictive purchases consolidate identical codes before pagination; closed total, per-warehouse detail, filters, distinct codes, keyboard and mobile layout",
  );
}
