import { expect, test } from "@playwright/test";
import mysql from "mysql2/promise";
import { databaseConfig } from "../../lib/db-config.mjs";
test("NVIDIA real: authenticated catalog, correction and unique request", async ({
  request,
}) => {
  test.skip(
    process.env.JAMES_LIVE_TEST !== "1",
    "Enable external provider test explicitly.",
  );
  test.setTimeout(180000);
  const pool = mysql.createPool(databaseConfig()),
    code = "JLIVE-" + Date.now().toString(36).toUpperCase();
  let id = 0,
    nutId = 0,
    token = "";
  const headers = { origin: "http://localhost:3101" };
  try {
    const [r] = await pool.execute<mysql.ResultSetHeader>(
      "INSERT INTO parts(code,qr_code,name,location,pack_size) VALUES(?,?,?,?,2)",
      [code, code, "Parafuso teste James real", "Teste"],
    );
    id = r.insertId;
    const [nut] = await pool.execute<mysql.ResultSetHeader>(
      "INSERT INTO parts(code,qr_code,name,location,pack_size) VALUES(?,?,?,?,1)",
      [code + "-N", code + "-N", "Porca teste James real", "Teste"],
    );
    nutId = nut.insertId;
    await pool.execute(
      "INSERT INTO inventory(part_id,warehouse_id,quantity) SELECT ?,id,100 FROM warehouses WHERE is_central=TRUE",
      [nutId],
    );
    await pool.execute(
      "INSERT INTO inventory(part_id,warehouse_id,quantity) SELECT ?,id,100 FROM warehouses WHERE is_central=TRUE",
      [id],
    );
    expect(
      (
        await request.post("/api/login", {
          data: { identity: "1001", password: process.env.SEED_PASSWORD },
          headers,
        })
      ).status(),
    ).toBe(200);
    const send = async (data: unknown) => {
      const response = await request.post("/api/james/chat", {
        data,
        headers,
        timeout: 60000,
      });
      expect(response.status(), await response.text()).toBe(200);
      return response.json();
    };
    let data = await send({
      message: `James, coloque 7 caixas dos parafusos código ${code} e 10 porcas código ${code}-N no carrinho, mostre o pedido e faça a requisição`,
      cart: [],
    });
    expect(
      data.cart,
      JSON.stringify({ reply: data.reply, choices: data.choices }),
    ).toHaveLength(2);
    expect(
      data.cart.find((e: { code: string }) => e.code === code).quantity,
    ).toBe(14);
    expect(
      data.cart.find((e: { code: string }) => e.code === code + "-N").quantity,
    ).toBe(10);
    expect(data.confirmationToken).toBeUndefined();
    data = await send({ message: "Troque as caixas para 5", cart: data.cart });
    expect(
      data.cart.find((e: { code: string }) => e.code === code).quantity,
      JSON.stringify({ reply: data.reply, choices: data.choices }),
    ).toBe(10);
    data = await send({ message: "Troque para 5 caixas", cart: data.cart });
    expect(
      data.cart.find((e: { code: string }) => e.code === code).quantity,
    ).toBe(10);
    data = await send({ message: "faca a requisicao", cart: data.cart });
    token = data.confirmationToken;
    expect(token).toBeTruthy();
    const body = {
        mode: "confirm",
        token,
        confirmation: "confirmar requisicao",
      },
      first = await send(body),
      again = await send(body);
    expect(first.submitted).toBe(true);
    expect(again.result.ids).toEqual(first.result.ids);
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      "SELECT quantity FROM inventory WHERE part_id=?",
      [id],
    );
    expect(rows[0].quantity).toBe(100);
  } finally {
    if (token) {
      const key = JSON.parse(
        Buffer.from(token.split(".")[0], "base64url").toString(),
      ).key;
      await pool.execute(
        "DELETE FROM request_submissions WHERE request_key=?",
        [key],
      );
    }
    for (const partId of [id, nutId].filter(Boolean)) {
      await pool.execute(
        "DELETE FROM audit_log WHERE entity_type='request' AND entity_id IN(SELECT id FROM requests WHERE part_id=?)",
        [partId],
      );
      await pool.execute("DELETE FROM requests WHERE part_id=?", [partId]);
      await pool.execute("DELETE FROM inventory WHERE part_id=?", [partId]);
      await pool.execute("DELETE FROM parts WHERE id=?", [partId]);
    }
    await pool.end();
  }
});
