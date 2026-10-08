import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect } from "@playwright/test";

export async function checkStockNeeds({
  page,
  browser,
  origin,
  sql,
  insert,
  actorId,
  testPassword,
}) {
  // This runner owns an isolated temporary schema. No production stock is seeded.
  const code = "TEST-SOURCE-NEED";
  const material = await insert(
    "parts",
    "code,qr_code,name,unit,category,location",
    [code, code, "Imported need material", "un", "Test", ""],
  );
  const branch = await insert("branches", "code,name", [
    "SRC-0101",
    "Source branch",
  ]);
  const run = await insert(
    "material_import_runs",
    "file_name,file_hash,mapping,actor_id",
    [
      "source.xlsx",
      randomBytes(32).toString("hex"),
      JSON.stringify({ columns: { description: 3 } }),
      actorId,
    ],
  );
  const line = await insert(
    "material_import_lines",
    "run_id,sheet,row_number,code,branch_code,material_id,raw_cells,parameters,consumption,conflicts",
    [
      run,
      "Resumo",
      3,
      code,
      "SRC-0101",
      material,
      JSON.stringify({ 3: { text: "Imported need material" } }),
      JSON.stringify({ minimum: "10" }),
      JSON.stringify({ aggregate: "42", period: null }),
      JSON.stringify(["Embalagem não informada."]),
    ],
  );
  await insert(
    "reported_balances",
    "source_line_id,material_id,branch_id,quantity,unit",
    [line, material, branch, 2, "un"],
  );
  await insert(
    "reported_purchases",
    "source_line_id,material_id,branch_id,directive,programme",
    [line, material, branch, "NÃO COMPRAR", "{}"],
  );
  const maps = (
    await sql(
      "UPDATE map_versions SET status='Rascunho' WHERE status='Publicada' RETURNING id",
    )
  ).rows;
  const query = new URLSearchParams({
    planning: "distribution",
    decision: "transfer",
    code,
  });
  const fetchReport = async (extra = {}) => {
    const params = new URLSearchParams(query);
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
    const response = await page.request.get(
      origin + "/api/operations?" + params,
    );
    assert.equal(response.status(), 200, await response.text());
    return response.json();
  };
  try {
    const before = (await sql("SELECT COUNT(*) AS n FROM stock_movements"))
      .rows;
    const report = await fetchReport();
    assert.equal(report.mapVersion, null);
    assert.equal(report.decisions.transfers, 0);
    assert.equal(report.decisions.needs.length, 1);
    assert.equal(report.decisions.needs[0].quantity, 8);
    assert.equal(report.decisions.needs[0].purchaseBlocked, true);
    assert.equal(
      (await fetchReport({ warehouse: "Test near warehouse" })).decisions.needs
        .length,
      0,
    );
    const employee = await browser.newContext();
    try {
      const login = await employee.request.post(origin + "/api/login", {
        headers: { origin },
        data: { identity: "test-worker", password: testPassword },
      });
      assert.equal(login.status(), 200, await login.text());
      assert.equal(
        (
          await employee.request.get(origin + "/api/operations?" + query)
        ).status(),
        403,
      );
    } finally {
      await employee.close();
    }
    await page.goto(origin + "/admin/recommendations?code=" + code);
    const region = page.getByRole("region", {
      name: "Necessidades de reposição",
      exact: true,
    });
    const card = region.locator(".stock-need");
    await expect(card).toHaveCount(1, { timeout: 30000 });
    await expect(card).toContainText("Filial SRC-0101");
    await expect(card.locator(".purchase-total")).toContainText("8 un");
    await expect(card).toContainText("Compra bloqueada na origem");
    await expect(
      card.getByRole("button", { name: /Solicitar transferência/ }),
    ).toHaveCount(0);
    await card
      .getByText("Ver dados e próximos passos", { exact: true })
      .click();
    await expect(card).toContainText(
      "42 un no relatório · período não informado",
    );
    await expect(card).toContainText("conciliar");
    await expect(card).toContainText("não foi convertido em retiradas diárias");
    await mkdir(".validation/stock-needs", { recursive: true });
    for (const width of [320, 375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      if (width !== 320)
        await card.screenshot({
          path: `.validation/stock-needs/card-${width}.png`,
        });
    }
    assert.deepEqual(
      (await sql("SELECT COUNT(*) AS n FROM stock_movements")).rows,
      before,
    );
    // Newer reconciled source must not revive an older outstanding snapshot.
    const nextRun = await insert(
      "material_import_runs",
      "file_name,file_hash,mapping,actor_id",
      [
        "source-next.xlsx",
        randomBytes(32).toString("hex"),
        JSON.stringify({ columns: { description: 3 } }),
        actorId,
      ],
    );
    const nextLine = await insert(
      "material_import_lines",
      "run_id,sheet,row_number,code,branch_code,material_id,raw_cells,parameters,consumption,conflicts",
      [
        nextRun,
        "Resumo",
        3,
        code,
        "SRC-0101",
        material,
        JSON.stringify({ 3: { text: "Imported need material" } }),
        JSON.stringify({ minimum: "10" }),
        JSON.stringify({ aggregate: "42", period: null }),
        "[]",
      ],
    );
    const movement = (
      await sql("SELECT id FROM stock_movements ORDER BY id LIMIT 1")
    ).rows[0].id;
    await insert(
      "reported_balances",
      "source_line_id,material_id,branch_id,quantity,unit,reconciliation_movement_id",
      [nextLine, material, branch, 2, "un", movement],
    );
    assert.equal((await fetchReport()).decisions.needs.length, 0);
    console.log(
      "PASS: imported deficits visible without a published map; filters, purchase restriction, employee scope, source evidence, latest reconciliation and mobile layout; no fake transfer or ledger write",
    );
  } finally {
    for (const map of maps)
      await sql("UPDATE map_versions SET status='Publicada' WHERE id=$1", [
        map.id,
      ]);
  }
}
