import { expect, test } from "@playwright/test";
import mysql from "mysql2/promise";
import { databaseConfig } from "../../lib/db-config.mjs";

test("pedido natural preserva quantidade, desambigua e confirma carrinho pelo catálogo", async ({
  request,
}) => {
  const pool = mysql.createPool(databaseConfig());
  const headers = { origin: "http://localhost:3101" };
  const suffix = Date.now().toString(36).toUpperCase();
  const codes = [0, 1, 2].map((n) => `JNAT-${suffix}-${n}`);
  const names = [
    `Parafuso Natural ${suffix} Allen M6 × 20`,
    `Parafuso Natural ${suffix} Allen M6 × 30`,
    `Parafuso Natural ${suffix} sextavado M8 × 30`,
  ];
  const ids: number[] = [];
  const post = async (data: unknown) => {
    const response = await request.post("/api/james/chat", { headers, data });
    expect(response.status(), await response.text()).toBe(200);
    return response.json();
  };
  try {
    for (let i = 0; i < codes.length; i++) {
      const [result] = await pool.execute<mysql.ResultSetHeader>(
        "INSERT INTO parts(code,qr_code,name,location,pack_size) VALUES(?,?,?,'Teste James',10)",
        [codes[i], codes[i], names[i]],
      );
      ids.push(result.insertId);
      await pool.execute(
        "INSERT INTO inventory(part_id,warehouse_id,quantity) SELECT ?,id,200 FROM warehouses WHERE is_central=TRUE",
        [result.insertId],
      );
    }
    await request.post("/api/login", {
      headers,
      data: { identity: "1001", password: process.env.SEED_PASSWORD },
    });
    const first = await post({
      message: `Quero 100 unidades de parafuso Natural ${suffix}`,
      cart: [],
    });
    expect(first.cart).toEqual([]);
    expect(first.choices).toHaveLength(3);
    expect(first.draft).toMatchObject({
      quantity: 100,
      unit: "unit",
      pending: "peça",
    });
    const corrected = await post({
      message: "na verdade, cinquenta",
      cart: [],
      clarificationToken: first.clarificationToken,
    });
    expect(corrected.reply).toContain("50 unidades");
    expect(corrected.draft.quantity).toBe(50);
    const allen = await post({
      message: "Allen de seis",
      cart: [],
      clarificationToken: corrected.clarificationToken,
    });
    expect(allen.choices.map((item: { code: string }) => item.code)).toEqual(
      codes.slice(0, 2),
    );
    const selected = await post({
      message: "o segundo",
      cart: [],
      clarificationToken: allen.clarificationToken,
    });
    expect(selected.cart).toEqual([]);
    expect(selected.proposedItems[0]).toMatchObject({
      code: codes[1],
      quantity: 50,
    });
    const stale = await request.post("/api/james/chat", {
      headers,
      data: {
        mode: "confirm",
        token: selected.confirmationToken,
        confirmation: "confirmar carrinho",
        cart: [
          { code: codes[0], quantity: 1, priority: "Leve", justification: "" },
        ],
      },
    });
    expect(stale.status()).toBe(409);
    const added = await post({
      mode: "confirm",
      token: selected.confirmationToken,
      confirmation: "confirmar carrinho",
      cart: [],
    });
    expect(added.cart[0]).toMatchObject({ code: codes[1], quantity: 50 });
    expect(
      (
        await post({
          mode: "confirm",
          token: selected.confirmationToken,
          confirmation: "confirmar carrinho",
          cart: [],
        })
      ).cart,
    ).toEqual(added.cart);
    for (let i = 0; i < ids.length; i++) {
      await pool.execute("UPDATE parts SET purpose=?,dimensions=?,approved_aliases=? WHERE id=?", [
        "prender a tampa de inspeção",
        i === 2 ? "M8 × 30 mm" : `M6 × ${i === 0 ? 20 : 30} mm`,
        JSON.stringify(i === 2 ? ["parafuso da tampa sextavado"] : []),
        ids[i],
      ]);
    }
    const purpose = await post({ message: "Preciso de cem parafusos para prender a tampa", cart: [] });
    expect(purpose.draft).toMatchObject({ quantity: 100, purpose: "prender a tampa" });
    expect(purpose.choices.map((item: { code: string }) => item.code)).toEqual(codes);
    expect(purpose.reply).toContain("M6");
    const measure = await post({ message: "aquele sextavado de oito", cart: [], clarificationToken: purpose.clarificationToken });
    expect(measure.reply).toContain("É essa medida?");
    const measureConfirmed = await post({ message: "sim", cart: [], clarificationToken: measure.clarificationToken });
    expect(measureConfirmed.proposedItems[0]).toMatchObject({ code: codes[2], quantity: 100 });
    await request.post("/api/login", {
      headers,
      data: { identity: "1002", password: process.env.SEED_PASSWORD },
    });
    const forbidden = await request.post("/api/james/chat", {
      headers,
      data: {
        mode: "confirm",
        token: selected.confirmationToken,
        confirmation: "confirmar carrinho",
        cart: [],
      },
    });
    expect(forbidden.status()).toBe(403);
  } finally {
    for (const id of ids) {
      await pool.execute("DELETE FROM inventory WHERE part_id=?", [id]);
      await pool.execute("DELETE FROM parts WHERE id=?", [id]);
    }
    await pool.end();
  }
});
