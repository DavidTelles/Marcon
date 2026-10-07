import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import QRCode from "qrcode";
import sharp from "sharp";
import { expect } from "@playwright/test";

async function installCamera(page, png) {
  await page.evaluate(async (encoded) => {
    if (window.qrTestCamera) clearInterval(window.qrTestCamera.timer);
    navigator.mediaDevices.getUserMedia = async () => {
      const picture = new Image(); picture.src = encoded; await picture.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 900;
      const draw = () => {
        const c = canvas.getContext("2d"); c.fillStyle = "white";
        c.fillRect(0, 0, 900, 900); c.drawImage(picture, 150, 150, 600, 600);
      };
      draw();
      const timer = setInterval(draw, 80), stream = canvas.captureStream(12);
      window.qrTestCamera = { stream, timer }; return stream;
    };
  }, "data:image/png;base64," + png.toString("base64"));
}

export async function checkQrWorkflow({
  browser,
  origin,
  sql,
  action,
  insert,
  part,
  near,
  far,
  testPassword,
}) {
  const sheet = await readFile("tests/fixtures/qr/printed-labels.png");
  const { labels } = JSON.parse(await readFile("tests/fixtures/qr/labels.json", "utf8"));
  const realLabels = [];
  for (const { id, payload, left, top, width, height } of labels) {
    let material = (await sql("SELECT id FROM parts WHERE code=$1", [id])).rows[0]?.id;
    if (!material) material = await insert("parts", "code,qr_code,name,location", [id, payload.replace(/[\r\n]+$/, ""), `Printed label ${id}`, "Test location"]);
    await sql("UPDATE parts SET qr_code=$1 WHERE id=$2", [payload.replace(/[\r\n]+$/, ""), material]);
    realLabels.push({ id, payload, material, png: await sharp(sheet).extract({ left, top, width, height }).png().toBuffer() });
  }
  const raw = "QR-Test-Part-Mixed";
  await sql("UPDATE parts SET qr_code=$1 WHERE id=$2", [raw, part]);
  await action({
    type: "stockEntry",
    requestKey: crypto.randomUUID(),
    code: "TEST-PART",
    warehouse: "Test near warehouse",
    quantity: 30,
    reason: "QR delivery fixture",
  });
  const wrongPart = await insert("parts", "code,qr_code,name,location", [
    "QR-OTHER",
    "QR-OTHER-RAW",
    "Other QR test part",
    "Test location",
  ]);
  await sql(
    "INSERT INTO inventory(part_id,warehouse_id,quantity) VALUES($1,$2,$3)",
    [wrongPart, near, 5],
  );
  const png = await QRCode.toBuffer(raw, { width: 600, margin: 4 });
  const wrongPng = await QRCode.toBuffer("QR-OTHER-RAW", {
    width: 600,
    margin: 4,
  });
  const unknownPng = await QRCode.toBuffer("UNKNOWN-QR-TEST", {
    width: 600,
    margin: 4,
  });
  const physical = async () =>
    (
      await sql(
        "SELECT warehouse_id,quantity FROM inventory WHERE part_id=$1 ORDER BY warehouse_id",
        [part],
      )
    ).rows;
  const beforeSearch = await physical();
  const allBeforeSearch = (await sql("SELECT part_id,warehouse_id,quantity FROM inventory ORDER BY part_id,warehouse_id")).rows;
  const accounts = [
    ["test-admin", "/admin/dashboard", "/admin/pcp"],
    ["test-leader", "/department-head/dashboard", "/department-head/pcp"],
    ["test-worker", "/employee/request", "/employee/pcp"],
    ["test-keeper", "/warehouse/dashboard", "/warehouse/pcp"],
  ];
  await mkdir(".validation/qr", { recursive: true });
  for (const [identity, landing, oldPath] of accounts) {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
    });
    try {
      const login = await context.request.post(origin + "/api/login", {
        headers: { origin },
        data: { identity, password: testPassword },
      });
      assert.equal(login.status(), 200, await login.text());
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin + oldPath);
      await expect(page).toHaveURL(origin + landing);
      await expect(page.getByText(/PCP/i)).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Escanear QR / barras" }),
      ).toHaveCount(0);
      await page
        .getByRole("button", {
          name: "Pesquisar peça por QR ou ID",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Pesquisar peça por QR ou ID",
      });
      await dialog
        .getByLabel("Ler código de uma imagem")
        .setInputFiles({ name: "qr.png", mimeType: "image/png", buffer: png });
      await expect(dialog.getByRole("heading", { level: 3 })).toContainText(
        "TEST-PART",
      );
      const resolved = await context.request.post(
        origin + "/api/items/resolve",
        { headers: { origin }, data: { code: raw } },
      );
      assert.equal(resolved.status(), 200, await resolved.text());
      const data = await resolved.json();
      assert.equal(data.material.code, "TEST-PART");
      if (identity === "test-worker" || identity === "test-leader") {
        assert.ok(
          data.balances.every((b) => [near, far].includes(b.warehouseId)),
        );
      }
      await dialog.getByLabel("QR ou ID da peça").fill("UNKNOWN-QR-TEST");
      await expect(dialog.getByRole("heading", { level: 3 })).toHaveCount(0);
      await dialog
        .getByRole("button", { name: "Pesquisar peça", exact: true })
        .click();
      await expect(dialog.getByRole("alert")).toContainText(
        "Código desconhecido",
      );
      await dialog.getByLabel("QR ou ID da peça").fill("TEST-PART");
      await dialog
        .getByRole("button", { name: "Pesquisar peça", exact: true })
        .click();
      await expect(dialog.getByRole("heading", { level: 3 })).toContainText(
        "TEST-PART",
      );
      for (const width of [320, 768]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(dialog).toBeVisible();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        const overflow = await dialog.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        );
        assert.equal(overflow, false, `QR dialog overflow at ${width}`);
      }
      await page.screenshot({
        path: `.validation/qr/${identity}-mobile.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 1366, height: 900 });
      if (identity === "test-admin") {
        for (const label of realLabels) {
          for (const code of [label.id, label.payload]) {
            const response = await context.request.post(origin + "/api/items/resolve", { headers: { origin }, data: { code } });
            assert.equal(response.status(), 200, await response.text());
            assert.equal((await response.json()).material.code, label.id);
          }
          await dialog.getByLabel("Ler código de uma imagem").setInputFiles({ name: "original-label.png", mimeType: "image/png", buffer: label.png });
          await expect(dialog.getByRole("heading", { level: 3 })).toContainText(label.id, { timeout: 30000 });
        }
        console.log("QR: all ten original label images and QR/ID associations verified");
        for (const angle of [0, 90]) {
          await dialog.getByLabel("Ler código de uma imagem").setInputFiles({ name: "original-sheet.png", mimeType: "image/png", buffer: await sharp(sheet).rotate(angle).toBuffer() });
          const group = dialog.getByRole("group", { name: "Peças encontradas na imagem" });
          await expect(group.getByRole("button")).toHaveCount(10, { timeout: 60000 });
          await expect(dialog.getByRole("heading", { level: 3 })).toHaveCount(0);
          await group.getByRole("button", { name: /^ID 120 ·/ }).click();
          await expect(dialog.getByRole("heading", { level: 3 })).toContainText("120");
        }
        console.log("QR: complete original sheet and rotated sheet require explicit piece selection");
        for (const angle of [90, 180, 270]) {
          await dialog.getByLabel("Ler código de uma imagem").setInputFiles({
            name: "rotated.png",
            mimeType: "image/png",
            buffer: await sharp(png).rotate(angle).toBuffer(),
          });
          await expect(dialog.getByRole("heading", { level: 3 })).toContainText(
            "TEST-PART",
          );
        }
        await dialog.getByLabel("Ler código de uma imagem").setInputFiles({
          name: "unknown.png",
          mimeType: "image/png",
          buffer: unknownPng,
        });
        await expect(dialog.getByRole("alert")).toContainText(
          "Código desconhecido",
        );
        await expect(dialog.getByRole("heading", { level: 3 })).toHaveCount(0);
        // Real decoder with a controlled video stream.
        await page.evaluate(
          (encoded) => {
            navigator.mediaDevices.getUserMedia = async () => {
              const picture = new Image();
              picture.src = encoded;
              await picture.decode();
              const canvas = document.createElement("canvas");
              canvas.width = canvas.height = 900;
              const draw = () => {
                const c = canvas.getContext("2d");
                c.fillStyle = "white";
                c.fillRect(0, 0, 900, 900);
                c.drawImage(picture, 150, 150, 600, 600);
              };
              draw();
              const timer = setInterval(draw, 80);
              const stream = canvas.captureStream(12);
              window.qrTestCamera = { stream, timer };
              return stream;
            };
          },
          "data:image/png;base64," + png.toString("base64"),
        );
        await dialog
          .getByRole("button", { name: "Escanear QR / barras" })
          .click();
        await expect(dialog.getByRole("heading", { level: 3 })).toContainText(
          "TEST-PART",
        );
        await expect(
          dialog.getByRole("button", { name: "Escanear QR / barras" }),
        ).toBeVisible();
        assert.ok(
          await page.evaluate(() =>
            window.qrTestCamera.stream
              .getTracks()
              .every((t) => t.readyState === "ended"),
          ),
        );
        for (const label of realLabels) {
          await dialog.getByLabel("QR ou ID da peça").fill("");
          await installCamera(page, label.png);
          await dialog.getByRole("button", { name: "Escanear QR / barras" }).click();
          await expect(dialog.getByRole("heading", { level: 3 })).toContainText(label.id, { timeout: 30000 });
          await expect(dialog.getByRole("button", { name: "Escanear QR / barras" })).toBeVisible();
          assert.ok(await page.evaluate(() => window.qrTestCamera.stream.getTracks().every(t => t.readyState === "ended")), `Camera must stop for ID ${label.id}`);
        }
        console.log("QR: all ten original labels decoded from controlled video; camera tracks released");
        await page.evaluate(() => {
          clearInterval(window.qrTestCamera.timer);
          navigator.mediaDevices.getUserMedia = async () => {
            throw new DOMException("Denied", "NotAllowedError");
          };
        });
        await dialog
          .getByRole("button", { name: "Escanear QR / barras" })
          .click();
        await expect(dialog.getByRole("alert")).toContainText(
          "permissão negada",
        );
      }
      await dialog
        .getByRole("button", { name: "Fechar Pesquisar peça por QR ou ID" })
        .click();
      await page.setViewportSize({ width: 320, height: 900 });
      await page
        .getByRole("button", {
          name: "Pesquisar peça por QR ou ID",
          exact: true,
        })
        .click();
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole("button", { name: "Fechar Pesquisar peça por QR ou ID" })
        .click();
      await page.setViewportSize({ width: 1366, height: 900 });
      if (identity === "test-keeper") {
        await page.goto(origin + "/warehouse/stock/all/all");
        await page.getByRole("heading", { name: "Estoque de peças" }).waitFor();
        await expect(
          page.getByRole("button", { name: "Escanear QR / barras" }),
        ).toHaveCount(0);
        await page
          .getByRole("button", { name: "Nova peça", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Escanear QR / barras" }),
        ).toHaveCount(0);
      }
      assert.deepEqual(errors, []);
    } catch (error) {
      await context
        .pages()[0]
        ?.screenshot({
          path: `.validation/qr/failure-${identity}.png`,
          fullPage: true,
        });
      throw error;
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(
    await physical(),
    beforeSearch,
    "Lookup must not change stock",
  );
  assert.deepEqual((await sql("SELECT part_id,warehouse_id,quantity FROM inventory ORDER BY part_id,warehouse_id")).rows, allBeforeSearch, "Original label lookups must not change any stock");
  const created = await action(
    {
      type: "createRequests",
      requestKey: crypto.randomUUID(),
      entries: [
        {
          code: "TEST-PART",
          quantity: 2,
          requestedUnit: "piece",
          priority: "Leve",
          justification: "QR delivery test",
        },
      ],
    },
    "test-worker",
  );
  const id = created.ids[0];
  await action(
    { type: "changeRequestStatus", id, status: "Aprovada" },
    "test-leader",
  );
  const beforePick = await physical();
  const context = await browser.newContext();
  try {
    const login = await context.request.post(origin + "/api/login", {
      headers: { origin },
      data: { identity: "test-keeper", password: testPassword },
    });
    assert.equal(login.status(), 200);
    const page = await context.newPage();
    await page.goto(origin + "/warehouse/requests");
    await page
      .locator(`[data-request-id="${id}"]`)
      .getByRole("button", { name: "Abrir atendimento" })
      .click();
    const dialog = page.getByRole("dialog", { name: `Requisição #${id}` });
    await expect(
      dialog.getByRole("button", { name: "Escanear QR / barras" }),
    ).toHaveCount(0);
    await dialog.getByRole("button", { name: "Pegar para entrega" }).click();
    const upload = dialog.getByLabel("Ler código de uma imagem");
    await upload.setInputFiles({
      name: "wrong.png",
      mimeType: "image/png",
      buffer: wrongPng,
    });
    await expect(dialog.getByRole("alert")).toContainText("não corresponde");
    await expect(dialog.getByLabel("Código conferido")).toHaveValue("");
    await upload.setInputFiles({
      name: "right.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(dialog.getByLabel("Código conferido")).toHaveValue(
      "TEST-PART",
    );
    await dialog.getByLabel("Quantidade separada").fill("1");
    await expect(
      dialog.getByRole("button", { name: "Confirmar retirada", exact: true }),
    ).toBeDisabled();
    await dialog.getByLabel("Quantidade separada").fill("2");
    await dialog
      .getByRole("button", { name: "Confirmar retirada", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Confirmar novamente e baixar estoque" })
      .waitFor();
    assert.deepEqual(
      await physical(),
      beforePick,
      "Preview must not change stock",
    );
    await dialog
      .getByRole("button", { name: "Confirmar novamente e baixar estoque" })
      .click();
    await dialog
      .getByRole("button", { name: "Confirmar entrega", exact: true })
      .waitFor();
    await dialog
      .getByRole("button", { name: "Confirmar entrega", exact: true })
      .click();
    await expect(dialog.getByText("Etapa atual:")).toContainText("Entregue");
    await expect(
      dialog.getByRole("button", { name: "Escanear QR / barras" }),
    ).toHaveCount(0);
    const final = (await sql("SELECT status FROM requests WHERE id=$1", [id]))
      .rows[0];
    assert.equal(final.status, "Entregue");
    const movements = (
      await sql(
        "SELECT quantity FROM stock_movements WHERE request_id=$1 AND kind='saida'",
        [id],
      )
    ).rows;
    assert.equal(
      movements.reduce((sum, r) => sum + Number(r.quantity), 0),
      2,
    );
    const sum = (rows) => rows.reduce((s, r) => s + Number(r.quantity), 0);
    assert.equal(sum(beforePick) - sum(await physical()), 2);
    const repeated = await context.request.post(origin + "/api/workspace", {
      headers: { origin },
      data: {
        type: "confirmPick",
        id,
        qrCode: raw,
        confirmedQuantity: 2,
        requestKey: crypto.randomUUID(),
      },
    });
    assert.equal(repeated.status(), 409);
    assert.equal(sum(beforePick) - sum(await physical()), 2);
    await page.screenshot({
      path: ".validation/qr/delivery-completed.png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
  // Deliver the discrepant printed ID 120 using its actual photographed QR 128.
  await action({ type: "stockEntry", requestKey: crypto.randomUUID(), code: "120", warehouse: "Test near warehouse", quantity: 3, reason: "Original QR fixture" });
  const actual = await action({ type: "createRequests", requestKey: crypto.randomUUID(), entries: [{ code: "120", quantity: 1, requestedUnit: "piece", priority: "Leve", justification: "Original printed QR delivery" }] }, "test-worker");
  const actualId = actual.ids[0];
  await action({ type: "changeRequestStatus", id: actualId, status: "Aprovada" }, "test-leader");
  const realBefore = (await sql("SELECT quantity FROM inventory WHERE part_id=$1 AND warehouse_id=$2", [realLabels.find(l => l.id === "120").material, near])).rows[0].quantity;
  const realContext = await browser.newContext();
  try {
    const login = await realContext.request.post(origin + "/api/login", { headers: { origin }, data: { identity: "test-keeper", password: testPassword } });
    assert.equal(login.status(), 200);
    const page = await realContext.newPage();
    await page.goto(origin + "/warehouse/requests");
    await page.locator(`[data-request-id="${actualId}"]`).getByRole("button", { name: "Abrir atendimento" }).click();
    const dialog = page.getByRole("dialog", { name: `Requisição #${actualId}` });
    await dialog.getByRole("button", { name: "Pegar para entrega" }).click();
    await dialog.getByLabel("Ler código de uma imagem").setInputFiles({ name: "wrong-original.png", mimeType: "image/png", buffer: realLabels.find(l => l.id === "129").png });
    await expect(dialog.getByRole("alert")).toContainText("não corresponde", { timeout: 30000 });
    await expect(dialog.getByLabel("Código conferido")).toHaveValue("");
    await dialog.getByLabel("Ler código de uma imagem").setInputFiles({ name: "right-original.png", mimeType: "image/png", buffer: realLabels.find(l => l.id === "120").png });
    await expect(dialog.getByLabel("Código conferido")).toHaveValue("120", { timeout: 30000 });
    await dialog.getByLabel("Quantidade separada").fill("1");
    await dialog.getByRole("button", { name: "Confirmar retirada", exact: true }).click();
    await dialog.getByRole("button", { name: "Confirmar novamente e baixar estoque" }).click();
    await dialog.getByRole("button", { name: "Confirmar entrega", exact: true }).click();
    await expect(dialog.getByText("Etapa atual:")).toContainText("Entregue");
    const realAfter = (await sql("SELECT quantity FROM inventory WHERE part_id=$1 AND warehouse_id=$2", [realLabels.find(l => l.id === "120").material, near])).rows[0].quantity;
    assert.equal(Number(realBefore) - Number(realAfter), 1);
    await page.screenshot({ path: ".validation/qr/original-label-delivery.png", fullPage: true });
  } finally { await realContext.close(); }
}
