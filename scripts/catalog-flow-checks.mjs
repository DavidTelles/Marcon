import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importPartsCatalog } from "../lib/catalog-import.mjs";

export async function prepareCatalogFixture(domainDb) {
  const items = JSON.parse(await readFile("data/parts-catalog.json", "utf8"));
  await domainDb.transaction(async (db) => {
    const [before] = await db.query(
      "SELECT part_id,warehouse_id,quantity FROM inventory ORDER BY part_id,warehouse_id",
    );
    const first = await importPartsCatalog(db, items);
    assert.equal(first.added, items.length);
    const [imported] = await db.query(
      "SELECT part_id,warehouse_id,quantity FROM inventory ORDER BY part_id,warehouse_id",
    );
    assert.ok(
      imported
        .filter(
          (row) =>
            !before.some(
              (previous) =>
                previous.part_id === row.part_id &&
                previous.warehouse_id === row.warehouse_id,
            ),
        )
        .every((row) => row.quantity === 0),
    );
    const repeated = await importPartsCatalog(db, items);
    assert.equal(repeated.added, 0);
    const [after] = await db.query(
      "SELECT part_id,warehouse_id,quantity FROM inventory ORDER BY part_id,warehouse_id",
    );
    assert.deepEqual(after, imported);
    for (const previous of before)
      assert.deepEqual(
        after.find(
          (row) =>
            row.part_id === previous.part_id &&
            row.warehouse_id === previous.warehouse_id,
        ),
        previous,
      );
    await db.execute("UPDATE parts SET image_url=? WHERE code=?", [
      "/parts/custom-photo.webp",
      items[0].code,
    ]);
    await importPartsCatalog(db, [items[0]]);
    const [rows] = await db.query("SELECT image_url FROM parts WHERE code=?", [
      items[0].code,
    ]);
    assert.equal(
      rows[0].image_url,
      "/parts/custom-photo.webp",
      "A customized photo must not be overwritten by another import",
    );
    await db.execute("UPDATE parts SET image_url=? WHERE code=?", [
      items[0].image,
      items[0].code,
    ]);
  });
  return items;
}

export async function checkCatalogWorkflow({
  browser,
  origin,
  password,
  adminRequest,
  sql,
  items,
  warehouse,
  warehouseId,
}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const post = (request, url, data) =>
    request.post(origin + url, { headers: { origin }, data });
  try {
    const login = await post(context.request, "/api/login", {
      identity: "test-worker",
      password,
    });
    assert.equal(login.status(), 200, await login.text());
    const catalog = await context.request.get(origin + "/api/items");
    assert.equal(catalog.status(), 200);
    const { items: listed } = await catalog.json();
    for (const item of items)
      assert.equal(
        listed.find((row) => row.id === item.code)?.image,
        item.image,
      );
    const page = await context.newPage();
    await page.bringToFront();
    await page.goto(origin + "/employee/request");
    for (const item of items) {
      const photo = page.getByRole("img", {
        name: `Fotografia de ${item.name}`,
        exact: true,
      });
      await photo.scrollIntoViewIfNeeded();
      await photo.waitFor({ state: "visible" });
      try {
        await page.waitForFunction(
          (path) => {
            return Array.from(document.images).some(
              (img) =>
                new URL(img.src).pathname === path &&
                img.complete &&
                img.naturalWidth > 0,
            );
          },
          item.image,
          { timeout: 10000 },
        );
      } catch (error) {
        const state = await photo.evaluate((img) => ({
          src: img.getAttribute("src"),
          currentSrc: img.currentSrc,
          complete: img.complete,
          width: img.naturalWidth,
          hidden: document.hidden,
        }));
        const response = await context.request.get(origin + item.image);
        throw new Error(
          `Photo ${item.code} failed: ${JSON.stringify(state)}; HTTP ${response.status()} ${response.headers()["content-type"]}`,
          { cause: error },
        );
      }
    }
    await page.screenshot({
      path: ".validation/catalog/catalog-desktop.png",
      fullPage: true,
    });
    const search = page.getByRole("searchbox", {
      name: "Buscar peça por nome ou ID",
      exact: true,
    });
    await search.fill("FER-COMB-13");
    await page
      .getByRole("img", {
        name: "Fotografia de Chave combinada 13 mm",
        exact: true,
      })
      .waitFor({ state: "visible" });
    await page.getByLabel("Somente disponíveis").check();
    await page
      .getByRole("img", {
        name: "Fotografia de Chave combinada 13 mm",
        exact: true,
      })
      .waitFor({ state: "hidden" });
    assert.equal(
      await page
        .getByRole("img", {
          name: "Fotografia de Chave combinada 13 mm",
          exact: true,
        })
        .count(),
      0,
    );
    await page.goto(origin + "/catalogo/item/FER-COMB-13");
    await page.waitForURL("**/employee/request/material/FER-COMB-13");
    await page.getByText("Sem saldo no momento", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Requisitar este item", exact: true })
        .isDisabled(),
      true,
    );
    const detail = await context.request.get(origin + "/api/items/FER-COMB-13");
    assert.equal(detail.status(), 200);
    assert.equal((await detail.json()).item.image, "/parts/fer-comb-13.webp");
    // Only this disposable schema receives test stock, through the real entry API.
    const entry = await post(adminRequest, "/api/workspace", {
      type: "stockEntry",
      requestKey: crypto.randomUUID(),
      code: "FER-COMB-13",
      warehouse,
      quantity: 6,
      reason: "Entrada isolada para validar fotos e requisição",
    });
    assert.equal(entry.status(), 200, await entry.text());
    await sql(
      "UPDATE inventory SET map_node_id='near',aisle='TEST',shelf='CAT' WHERE part_id=(SELECT id FROM parts WHERE code='FER-COMB-13') AND warehouse_id=$1",
      [warehouseId],
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Requisitar este item", exact: true })
      .click();
    await page.getByLabel("Quantidade", { exact: true }).fill("2");
    await page.getByLabel("Confirme a quantidade", { exact: true }).fill("2");
    await page
      .getByLabel(/Justificativa/)
      .fill("Teste de requisição da nova peça do catálogo");
    await page
      .getByRole("button", { name: "Confirmar requisição", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: /Requisição #\d+ registrada/ })
      .waitFor();
    const saved = await sql(
      "SELECT r.id,r.quantity,p.code FROM requests r JOIN parts p ON p.id=r.part_id WHERE p.code='FER-COMB-13'",
    );
    assert.equal(saved.rows.length, 1);
    assert.equal(Number(saved.rows[0].quantity), 2);
    await page.getByRole("link", { name: "Ver minhas requisições" }).click();
    await page.waitForURL("**/employee/requests");
    await page.getByRole("heading", { name: "Meus pedidos", exact: true }).waitFor();
    await page.getByRole("heading", { name: "Chave combinada 13 mm", exact: true }).waitFor();
    const openOrder = page.getByRole("button", { name: "Ver meu pedido", exact: true });
    await openOrder.scrollIntoViewIfNeeded();
    const previousScroll = await page.evaluate(() => window.scrollY);
    await openOrder.click();
    await page.getByRole("dialog", { name: /^Requisição #/ }).waitFor();
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).position), "fixed");
    const frozenTop = await openOrder.evaluate((element) => element.getBoundingClientRect().top);
    await page.mouse.move(2, 2);
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(200);
    assert.equal(await openOrder.evaluate((element) => element.getBoundingClientRect().top), frozenTop);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => getComputedStyle(document.body).position !== "fixed");
    assert.equal(await page.evaluate(() => window.scrollY), previousScroll);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(origin + "/employee/request");
    assert.equal(await page.getByRole("heading", { name: "Meus pedidos", exact: true }).count(), 0);
    await page
      .getByRole("img", {
        name: "Fotografia de Chave combinada 13 mm",
        exact: true,
      })
      .scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: ".validation/catalog/catalog-mobile.png",
      fullPage: true,
    });
    // Personal history must stay scoped even when another account has a delivery.
    await sql("UPDATE requests SET status='Entregue',delivered_at=NOW() WHERE id=$1", [
      saved.rows[0].id,
    ]);
    await sql(
      "INSERT INTO requests(requester_id,block_id,part_id,quantity,priority,status,delivered_at) SELECT u.id,r.block_id,p.id,1,'Leve','Entregue',NOW() FROM users u CROSS JOIN requests r CROSS JOIN parts p WHERE u.employee_no<>'test-worker' AND r.part_id=(SELECT id FROM parts WHERE code='FER-COMB-13') AND p.code='ROL-6201-ZZ' LIMIT 1",
    );
    const personal = await context.request.get(origin + "/api/workspace");
    assert.equal(personal.status(), 200);
    assert.equal((await personal.json()).requests.every((r) => r.requesterId === "test-worker"), true);
    await page.goto(origin + "/employee/history");
    await page.getByRole("heading", { name: "Meu histórico", exact: true }).waitFor();
    await page.getByRole("heading", { name: "Chave combinada 13 mm", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Rolamento 6201 ZZ", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Ver entrega", exact: true }).click();
    await page.getByRole("dialog", { name: /^Requisição #/ }).waitFor();
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).position), "fixed");
    await page.getByRole("button", { name: /^Fechar Requisição #/ }).click();
    await page.waitForFunction(() => getComputedStyle(document.body).position !== "fixed");
    console.info("PASS: Request dialogs freeze the background and restore scrolling after Escape or close on desktop and mobile");
    const general = await adminRequest.get(origin + "/api/workspace");
    assert.equal(general.status(), 200);
    assert.equal((await general.json()).requests.some((r) => r.code === "ROL-6201-ZZ" && r.requesterId !== "test-worker"), true);
    console.info("PASS: Employee history displays only personal deliveries; administrator keeps general access");
  } finally {
    await context.close();
  }
}
