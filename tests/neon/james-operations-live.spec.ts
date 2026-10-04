import { expect, test } from "@playwright/test";
import neon from "../neon-test-db";
import { jamesPlan } from "../../lib/james-model";

test("NVIDIA real: general conversation uses the chat schema", async () => {
  test.skip(
    process.env.JAMES_LIVE_TEST !== "1",
    "Requires NVIDIA credentials.",
  );
  const result = await jamesPlan(
    "Explique em uma frase por que o céu é azul",
    { role: "funcionario", cart: [], history: [] },
    AbortSignal.timeout(55000),
  );
  expect(result).toHaveLength(1);
  expect(result[0].action).toBe("chat");
  expect(result[0].answer?.length).toBeGreaterThan(5);
});

test("API/Neon real: conversation, all profiles, confirmed operations and persistent duplicate protection", async ({
  request,
}) => {
  test.skip(
    process.env.JAMES_LIVE_TEST !== "1",
    "Requires configured NVIDIA and isolated Neon test database.",
  );
  test.setTimeout(720000);
  const pool = neon.createPool();
  const headers = { origin: "http://localhost:3101" };
  const keys: string[] = [],
    ids: number[] = [],
    transferIds: number[] = [];
  const code = "JOPS-" + Date.now().toString(36).toUpperCase();
  let partId = 0;
  const login = async (identity: string) =>
    expect(
      (
        await request.post("/api/login", {
          headers,
          data: { identity, password: process.env.SEED_PASSWORD },
        })
      ).status(),
    ).toBe(200);
  const post = (data: unknown) =>
    request.post("/api/james/chat", { headers, data, timeout: 60000 });
  const send = async (message: string) => {
    const r = await post({ message, cart: [] });
    expect(r.status(), await r.text()).toBe(200);
    return r.json();
  };
  const preview = async (message: string) => {
    const data = await send(message);
    expect(data.confirmationKind, JSON.stringify(data)).toBe("operation");
    expect(data.confirmationToken).toBeTruthy();
    keys.push(
      JSON.parse(
        Buffer.from(
          data.confirmationToken.split(".")[0],
          "base64url",
        ).toString(),
      ).key,
    );
    return data.confirmationToken as string;
  };
  const confirm = async (token: string) => {
    const r = await post({
      mode: "confirm",
      token,
      confirmation: "confirmar acao",
    });
    expect(r.status(), await r.text()).toBe(200);
    const data = await r.json();
    expect(data.operationCompleted).toBe(true);
    return data;
  };
  const create = async () => {
    const r = await request.post("/api/workspace", {
      headers,
      data: {
        type: "createRequests",
        requestKey: crypto.randomUUID(),
        entries: [
          {
            code,
            quantity: 2,
            priority: "Leve",
            justification: "Atividade técnica de teste",
          },
        ],
      },
    });
    expect(r.status(), await r.text()).toBe(200);
    const data = await r.json();
    const id = data.ids[0] as number;
    ids.push(id);
    return id;
  };
  const row = async (id: number) =>
    (
      await pool.execute<neon.RowDataPacket[]>(
        "SELECT status,quantity,received_at FROM requests WHERE id=?",
        [id],
      )
    )[0][0];
  try {
    const [part] = await pool.execute<neon.ResultSetHeader>(
      "INSERT INTO parts(code,qr_code,name,location,pack_size) VALUES(?,?,?,?,2)",
      [code, code, "Material James operacional", "Teste"],
    );
    partId = part.insertId;
    await pool.execute(
      "INSERT INTO inventory(part_id,warehouse_id,quantity,minimum_quantity) SELECT ?,id,100,1 FROM warehouses WHERE is_central=TRUE",
      [partId],
    );
    await login("1001");
    for (const message of [
      "Bom dia, James. Como vai?",
      "James, como você está hoje?",
      "Obrigado",
    ]) {
      const data = await send(message);
      expect(data.reply.length).toBeGreaterThan(5);
      expect(data.confirmationToken).toBeUndefined();
      expect(data.cart).toEqual([]);
    }
    const id = await create();
    const correction = await post({
      message: "Troque para 5 caixas",
      cart: [
        {
          code,
          quantity: 6,
          priority: "Leve",
          justification: "Atividade técnica de teste",
        },
      ],
    });
    expect(correction.status(), await correction.text()).toBe(200);
    expect((await correction.json()).cart[0].quantity).toBe(10);
    const edit = await preview(
      `Altere a quantidade da requisição ${id} para 3 unidades`,
    );
    expect((await row(id)).quantity).toBe(2);
    await confirm(edit);
    await confirm(edit);
    expect((await row(id)).quantity).toBe(3);
    const stale = await preview(
      `Altere a quantidade da requisição ${id} para 4 unidades`,
    );
    await request.post("/api/workspace", {
      headers,
      data: { type: "editRequest", id, quantity: 5 },
    });
    expect(
      (
        await post({
          mode: "confirm",
          token: stale,
          confirmation: "confirmar acao",
        })
      ).status(),
    ).toBe(409);
    expect((await row(id)).quantity).toBe(5);
    const deletedId = await create();
    await confirm(await preview(`Exclua a requisição pendente ${deletedId}`));
    expect((await row(deletedId)).status).toBe("Cancelada");
    expect(
      (await post({ message: `Aprove a requisição ${id}`, cart: [] })).status(),
    ).toBe(403);
    await login("1002");
    expect(
      (
        await post({
          mode: "confirm",
          token: edit,
          confirmation: "confirmar acao",
        })
      ).status(),
    ).toBe(403);
    await confirm(await preview(`Coloque a requisição ${id} em análise`));
    expect((await row(id)).status).toBe("Em análise");
    const approval = await preview(`Aprove a requisição ${id}`);
    await confirm(approval);
    await confirm(approval);
    expect((await row(id)).status).toBe("Aprovada");
    const [reserved] = await pool.execute<neon.RowDataPacket[]>(
      "SELECT SUM(quantity) AS n FROM request_reservations WHERE request_id=?",
      [id],
    );
    expect(Number(reserved[0].n)).toBe(5);
    // A second-block request cannot be exposed or approved by the first-block leader.
    const [other] = await pool.execute<neon.ResultSetHeader>(
      "INSERT INTO requests(requester_id,block_id,part_id,quantity) SELECT u.id,b.id,?,1 FROM users u CROSS JOIN blocks b WHERE u.employee_no='1001' AND b.name='Bloco B'",
      [partId],
    );
    ids.push(other.insertId);
    expect(
      (
        await post({
          message: `Aprove a requisição ${other.insertId}`,
          cart: [],
        })
      ).status(),
    ).toBe(404);
    await login("1003");
    await confirm(await preview(`Calcule a rota da requisição ${id}`));
    const [history] = await pool.execute<neon.RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM delivery_route_history WHERE request_id=?",
      [id],
    );
    expect(Number(history[0].n)).toBe(1);
    const [warehouses] = await pool.query<neon.RowDataPacket[]>(
      "SELECT name FROM warehouses WHERE active=TRUE AND is_central=FALSE ORDER BY id LIMIT 1",
    );
    const transfer = await preview(
      `Solicite transferência de 3 unidades do código ${code}, de Central para ${warehouses[0].name}, motivo: reposição planejada`,
    );
    const transferred = await confirm(transfer);
    transferIds.push(transferred.result.id);
    expect((await confirm(transfer)).result.id).toBe(transferred.result.id);
    const [balance] = await pool.execute<neon.RowDataPacket[]>(
      "SELECT quantity FROM inventory WHERE part_id=?",
      [partId],
    );
    expect(Number(balance[0].quantity)).toBe(100);
    await confirm(
      await preview(
        `Cancele a transferência ${transferred.result.id}, motivo: programação alterada`,
      ),
    );
    const [t] = await pool.execute<neon.RowDataPacket[]>(
      "SELECT status FROM stock_transfers WHERE id=?",
      [transferred.result.id],
    );
    expect(t[0].status).toBe("Cancelada");
    const entry = await preview(
      `Registre entrada de 3 unidades do código ${code} em Central, motivo: recebimento conferido`,
    );
    await confirm(entry);
    await confirm(entry);
    const adjustment = await preview(
      `Ajuste o saldo do código ${code} em Central para 100 unidades, motivo: contagem conferida`,
    );
    await confirm(adjustment);
    await confirm(adjustment);
    const [ledger] = await pool.execute<neon.RowDataPacket[]>(
      "SELECT kind,quantity FROM stock_movements WHERE part_id=? ORDER BY id",
      [partId],
    );
    expect(ledger.map((r) => [r.kind, Number(r.quantity)])).toEqual([
      ["entrada", 3],
      ["ajuste_saida", 3],
    ]);
    await login("1001");
    await confirm(
      await preview(
        `Solicite cancelamento da requisição ${id}, motivo: material não necessário`,
      ),
    );
    expect((await row(id)).status).toBe("Cancelamento solicitado");
    const receiptId = await create();
    await login("1004");
    await confirm(await preview(`Aprove a requisição ${receiptId}`));
    // Withdrawal uses the official two-step confirmation before final delivery.
    const pickupInput = { id: receiptId, qrCode: code, confirmedQuantity: 2 };
    const claimed = await request.post("/api/workspace", {
      headers,
      data: { type: "claimRequest", id: receiptId },
    });
    expect(claimed.status(), await claimed.text()).toBe(200);
    const prepared = await request.post("/api/workspace", {
      headers,
      data: { type: "preparePick", ...pickupInput },
    });
    expect(prepared.status(), await prepared.text()).toBe(200);
    const picked = await request.post("/api/workspace", {
      headers,
      data: {
        type: "confirmPick",
        ...pickupInput,
        confirmation: (await prepared.json()).confirmation,
      },
    });
    expect(picked.status(), await picked.text()).toBe(200);
    const delivered = await request.post("/api/workspace", {
      headers,
      data: {
        type: "changeRequestStatus",
        id: receiptId,
        status: "Entregue",
        qrCode: code,
        confirmedQuantity: 2,
      },
    });
    expect(delivered.status(), await delivered.text()).toBe(200);
    await login("1001");
    await confirm(
      await preview(`Confirme meu recebimento da requisição ${receiptId}`),
    );
    expect((await row(receiptId)).received_at).toBeTruthy();
    await request.post("/api/logout", { headers });
    expect((await post({ message: "Bom dia", cart: [] })).status()).toBe(401);
  } finally {
    for (const key of keys)
      await pool.execute(
        "DELETE FROM request_submissions WHERE request_key=?",
        [key],
      );
    for (const id of ids) {
      await pool.execute("DELETE FROM stock_movements WHERE request_id=?", [
        id,
      ]);
      await pool.execute(
        "DELETE FROM delivery_route_history WHERE request_id=?",
        [id],
      );
      await pool.execute(
        "DELETE FROM request_reservations WHERE request_id=?",
        [id],
      );
      await pool.execute(
        "DELETE FROM audit_log WHERE entity_type='request' AND entity_id=?",
        [id],
      );
      await pool.execute("DELETE FROM requests WHERE id=?", [id]);
    }
    for (const id of transferIds) {
      await pool.execute(
        "DELETE FROM audit_log WHERE entity_type='transfer' AND entity_id=?",
        [id],
      );
      await pool.execute("DELETE FROM stock_transfers WHERE id=?", [id]);
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
