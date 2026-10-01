import { expect, test } from "@playwright/test";
import neon from "../neon-test-db";

// Real browser, authenticated API and Neon; no recognition/model mocks.
// Uses supported explicit text commands, so this does not certify physical voice recognition.
test("James real UI: greeting, cancellation, operation confirmation, responsive panel and logout", async ({
  page,
}, info) => {
  const pool = neon.createPool();
  const code = "JUI-" + Date.now().toString(36).toUpperCase();
  const headers = { origin: "http://localhost:3101" };
  let partId = 0,
    id = 0;
  const keys: string[] = [],
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const [p] = await pool.execute<neon.ResultSetHeader>(
      "INSERT INTO parts(code,qr_code,name,location) VALUES(?,?,?,?)",
      [code, code, "Material confirmação James", "Teste"],
    );
    partId = p.insertId;
    await pool.execute(
      "INSERT INTO inventory(part_id,warehouse_id,quantity) SELECT ?,id,100 FROM warehouses WHERE is_central=TRUE",
      [partId],
    );
    expect(
      (
        await page.request.post("/api/login", {
          headers,
          data: { identity: "1001", password: process.env.SEED_PASSWORD },
        })
      ).status(),
    ).toBe(200);
    const created = await page.request.post("/api/workspace", {
      headers,
      data: {
        type: "createRequests",
        entries: [{ code, quantity: 2, priority: "Leve", justification: "" }],
      },
    });
    expect(created.status(), await created.text()).toBe(200);
    id = (await created.json()).ids[0];
    await page.goto("/employee/history");
    await page.getByRole("button", { name: "Abrir James" }).click();
    const dialog = page.getByRole("dialog", { name: "James" });
    const ask = async (message: string) => {
      await dialog.getByLabel("Sua pergunta ou correção").fill(message);
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/james/chat") &&
          r.request().method() === "POST",
      );
      await dialog.getByRole("button", { name: "Enviar", exact: true }).click();
      const r = await response;
      expect(r.status(), await r.text()).toBe(200);
      const data = await r.json();
      if (data.confirmationToken)
        keys.push(
          JSON.parse(
            Buffer.from(
              data.confirmationToken.split(".")[0],
              "base64url",
            ).toString(),
          ).key,
        );
      return data;
    };
    await ask("Bom dia, James. Como vai?");
    await expect(dialog.getByText(/Estou pronto para ajudar/)).toBeVisible();
    const command = `Altere a quantidade da requisição ${id} para 3 unidades`;
    await ask(command);
    await expect(
      dialog.getByRole("button", { name: "Confirmar ação", exact: true }),
    ).toBeVisible();
    for (const [width, height] of [
      [320, 740],
      [740, 320],
      [768, 1024],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
      await dialog
        .getByRole("button", { name: "Confirmar ação", exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        dialog.getByRole("button", { name: "Confirmar ação", exact: true }),
      ).toBeInViewport();
      await page.screenshot({
        path: info.outputPath(`confirmation-${width}.png`),
        animations: "disabled",
      });
    }
    await dialog.getByRole("button", { name: "Cancelar envio" }).click();
    await expect(
      dialog.getByRole("button", { name: "Confirmar ação", exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await pool.execute<neon.RowDataPacket[]>(
          "SELECT quantity FROM requests WHERE id=?",
          [id],
        )
      )[0][0].quantity,
    ).toBe(2);
    await ask(command);
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/james/chat") && r.request().method() === "POST",
    );
    await dialog
      .getByRole("button", { name: "Confirmar ação", exact: true })
      .click();
    expect((await response).status()).toBe(200);
    await expect(dialog.getByText(/Concluído:/)).toBeVisible();
    expect(
      (
        await pool.execute<neon.RowDataPacket[]>(
          "SELECT quantity FROM requests WHERE id=?",
          [id],
        )
      )[0][0].quantity,
    ).toBe(3);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Abrir James" }),
    ).toBeFocused();
    await page.request.post("/api/logout", { headers });
    await page.reload();
    await expect(page.getByRole("button", { name: "Abrir James" })).toHaveCount(
      0,
    );
    // A guided form in the actual UI, through the same authenticated stock API.
    expect(
      (
        await page.request.post("/api/login", {
          headers,
          data: { identity: "1003", password: process.env.SEED_PASSWORD },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/warehouse/dashboard");
    await page.getByRole("button", { name: "Abrir James" }).click();
    await dialog.getByLabel("Ler respostas com voz local").uncheck();
    for (const text of [
      "registrar entrada",
      code,
      "Central",
      "duas unidades",
      "Conferência de teste",
    ])
      await ask(text);
    await expect(
      dialog.locator('[data-character-state="confirming"]'),
    ).toHaveCount(1);
    const stock = async () =>
      (
        await pool.execute<neon.RowDataPacket[]>(
          "SELECT SUM(quantity) AS quantity FROM inventory WHERE part_id=?",
          [partId],
        )
      )[0][0].quantity;
    expect(Number(await stock())).toBe(100);
    await ask("Confirmar ação");
    expect(Number(await stock())).toBe(102);
    await expect(
      dialog.locator('[data-character-state="success"]'),
    ).toHaveCount(1);
    await page.screenshot({
      path: info.outputPath("guided-success-desktop.png"),
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  } finally {
    for (const key of keys)
      await pool.execute(
        "DELETE FROM request_submissions WHERE request_key=?",
        [key],
      );
    if (id) {
      await pool.execute(
        "DELETE FROM audit_log WHERE entity_type='request' AND entity_id=?",
        [id],
      );
      await pool.execute("DELETE FROM requests WHERE id=?", [id]);
    }
    if (partId) {
      await pool.execute("DELETE FROM stock_movements WHERE part_id=?", [
        partId,
      ]);
      await pool.execute(
        "DELETE FROM audit_log WHERE entity_type='part' AND entity_id=?",
        [partId],
      );
      await pool.execute("DELETE FROM inventory WHERE part_id=?", [partId]);
      await pool.execute("DELETE FROM parts WHERE id=?", [partId]);
    }
    await pool.end();
  }
});
