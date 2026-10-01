import { test, expect } from "@playwright/test";
import neon from "../neon-test-db";
import { explicitCartPlan, quantityWords } from "../../lib/james-commands";

test("Command parsing: complete chains and quantity words never imply confirmation", () => {
  expect(quantityWords("troque para cinco caixas")).toBe(
    "troque para 5 caixas",
  );
  expect(
    explicitCartPlan(
      "James, adicione 7 caixas de parafusos e 10 porcas, leia meu carrinho e faça a requisição",
    )?.map((s) => s.action),
  ).toEqual(["add", "add", "cart", "review"]);
  expect(explicitCartPlan("retire as porcas")).toEqual([
    { action: "remove", query: "porcas" },
  ]);
  expect(explicitCartPlan("Bom dia James, como vai?")).toBeUndefined();
});

test("Real authenticated guided forms: transfers, returns, inbound, correction, duplicate protection and report filters", async ({
  request,
}, info) => {
  test.setTimeout(180000);
  const pool = neon.createPool();
  const headers = { origin: "http://localhost:3101" };
  const code = "JGUIDE-" + Date.now().toString(36).toUpperCase();
  let partId = 0;
  const keys: string[] = [],
    transfers: number[] = [],
    returns: number[] = [],
    inbounds: number[] = [],
    newParts: number[] = [];
  const timing: { command: string; ms: number }[] = [];
  const login = async (identity: string) =>
    expect(
      (
        await request.post("/api/login", {
          headers,
          data: { identity, password: process.env.SEED_PASSWORD },
        })
      ).status(),
    ).toBe(200);
  let formToken: string | undefined;
  const send = async (message: string, status = 200) => {
    const start = performance.now();
    const r = await request.post("/api/james/chat", {
      headers,
      data: { message, cart: [], formToken },
    });
    timing.push({
      command: message.startsWith(code) ? "código do item" : message,
      ms: Math.round(performance.now() - start),
    });
    expect(r.status(), await r.text()).toBe(status);
    const data = await r.json();
    if (r.ok()) formToken = data.formToken;
    return data;
  };
  const confirm = async (token: string) => {
    keys.push(
      JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString()).key,
    );
    const r = await request.post("/api/james/chat", {
      headers,
      data: { mode: "confirm", token, confirmation: "confirmar acao" },
    });
    expect(r.status(), await r.text()).toBe(200);
    formToken = undefined;
    return r.json();
  };
  const form = async (command: string, values: string[]) => {
    formToken = undefined;
    let d = await send(command);
    expect(d.formToken).toBeTruthy();
    for (const v of values) d = await send(v);
    expect(d.confirmationKind, JSON.stringify(d)).toBe("operation");
    expect(d.confirmationToken).toBeTruthy();
    return d;
  };
  const balance = async () =>
    (
      await pool.execute<neon.RowDataPacket[]>(
        "SELECT w.name,i.quantity FROM inventory i JOIN warehouses w ON w.id=i.warehouse_id WHERE part_id=? ORDER BY w.id",
        [partId],
      )
    )[0];
  try {
    const [p] = await pool.execute<neon.ResultSetHeader>(
      "INSERT INTO parts(code,qr_code,name,location) VALUES(?,?,?,'Teste')",
      [code, code, "Material formulários James"],
    );
    partId = p.insertId;
    await pool.execute(
      "INSERT INTO inventory(part_id,warehouse_id,quantity,minimum_quantity) SELECT ?,id,IF(is_central,100,0),0 FROM warehouses",
      [partId],
    );
    const [places] = await pool.query<neon.RowDataPacket[]>(
      "SELECT w.name,b.name blockName FROM warehouses w JOIN blocks b ON b.id=w.block_id WHERE w.active=TRUE ORDER BY w.id LIMIT 1",
    );
    const dest = places[0].name as string,
      block = places[0].blockName as string;
    for (const identity of ["1001", "1002"]) {
      await login(identity);
      await send("registrar devolução", 403);
    }
    await login("1003");
    let d = await form("solicitar transferência", [
      code,
      "três unidades",
      "Central",
      dest,
      "Repor local de teste",
    ]);
    // Reopen a completed form and change the quantity before committing.
    await send("corrigir quantidade");
    d = await send("duas unidades");
    expect(d.reply).toContain("2 un");
    const initial = await balance();
    let result = await confirm(d.confirmationToken);
    transfers.push(result.result.id);
    expect(await balance()).toEqual(initial);
    expect((await confirm(d.confirmationToken)).result.id).toBe(transfers[0]);
    d = await form("confirmar saída de transferência", [
      String(transfers[0]),
      "2",
      code,
    ]);
    await confirm(d.confirmationToken);
    await confirm(d.confirmationToken);
    expect((await balance()).find((r) => r.name === "Central")?.quantity).toBe(
      98,
    );
    d = await form("confirmar recebimento de transferência", [
      String(transfers[0]),
      "2",
      code,
    ]);
    await confirm(d.confirmationToken);
    await confirm(d.confirmationToken);
    expect((await balance()).find((r) => r.name === dest)?.quantity).toBe(2);
    d = await form("registrar devolução", [
      code,
      "1",
      "Central",
      block,
      "Funcionário teste",
      "Apto",
      "Peça não utilizada",
    ]);
    result = await confirm(d.confirmationToken);
    returns.push(result.result.id);
    expect((await balance()).find((r) => r.name === "Central")?.quantity).toBe(
      98,
    );
    d = await form("conferir devolução", [
      String(returns[0]),
      "Apto",
      "Material conferido",
    ]);
    await confirm(d.confirmationToken);
    await confirm(d.confirmationToken);
    expect((await balance()).find((r) => r.name === "Central")?.quantity).toBe(
      99,
    );
    d = await form("registrar entrada prevista", [
      code,
      "4",
      "Central",
      "2026-12-20",
      "Fornecedor de teste",
      "Pedido teste",
    ]);
    result = await confirm(d.confirmationToken);
    inbounds.push(result.result.id);
    formToken = undefined;
    await send("receber entrada prevista");
    await send(String(inbounds[0]));
    await send("4");
    await send("CODIGO-ERRADO", 422);
    // The failed field remains correctable without creating another receipt.
    d = await send(code);
    await confirm(d.confirmationToken);
    await confirm(d.confirmationToken);
    expect((await balance()).find((r) => r.name === "Central")?.quantity).toBe(
      103,
    );
    await login("1004");
    d = await form("registrar entrada prevista", [
      code,
      "5",
      "Central",
      "2026-12-20",
      "Fornecedor teste",
      "Cancelar teste",
    ]);
    result = await confirm(d.confirmationToken);
    inbounds.push(result.result.id);
    d = await form("cancelar entrada prevista", [String(inbounds[1])]);
    await confirm(d.confirmationToken);
    expect((await balance()).find((r) => r.name === "Central")?.quantity).toBe(
      103,
    );
    d = await form("cadastrar peça", [
      code + "-NEW",
      "Peça criada pelo James",
      code + "-NEW",
      "un",
      "Fixadores",
      "A1",
      "Central",
      "2",
      "5",
      "7",
      "12,50",
    ]);
    result = await confirm(d.confirmationToken);
    newParts.push(result.result.id);
    expect((await confirm(d.confirmationToken)).result.id).toBe(newParts[0]);
    const newPart = async () =>
      (
        await pool.execute<neon.RowDataPacket[]>(
          "SELECT name,pack_size,minimum_total,active FROM parts WHERE id=?",
          [newParts[0]],
        )
      )[0][0];
    expect((await newPart()).pack_size).toBe(2);
    d = await form("editar peça", [
      code + "-NEW",
      "Peça revisada pelo James",
      code + "-NEW",
      "un",
      "Fixadores",
      "A2",
      "Central",
      "3",
      "6",
      "8",
      "13,50",
    ]);
    await confirm(d.confirmationToken);
    expect((await newPart()).name).toBe("Peça revisada pelo James");
    expect((await newPart()).pack_size).toBe(3);
    expect(
      (
        await pool.execute<neon.RowDataPacket[]>(
          "SELECT SUM(quantity) AS quantity FROM inventory WHERE part_id=?",
          [newParts[0]],
        )
      )[0][0].quantity,
    ).toBe("0");
    d = await form("desativar peça", [code + "-NEW"]);
    await confirm(d.confirmationToken);
    expect((await newPart()).active).toBe(0);
    // Context is untrusted: every report call and exported file rechecks scope.
    await login("1001");
    const report = await send("acompanhe minhas requisições");
    expect(report.reportContext.view).toBe("requisicoes");
    const filtered = await request.post("/api/james/chat", {
      headers,
      data: {
        message: "filtre por status Pendente",
        cart: [],
        reportContext: report.reportContext,
      },
    });
    expect(filtered.status(), await filtered.text()).toBe(200);
    const context = (await filtered.json()).reportContext;
    expect(context.filters.status).toBe("Pendente");
    for (const format of ["PDF", "planilha"]) {
      const exported = await request.post("/api/james/chat", {
        headers,
        data: {
          message: `exporte em ${format}`,
          cart: [],
          reportContext: context,
        },
      });
      expect(exported.status(), await exported.text()).toBe(200);
      const file = await request.get((await exported.json()).exportHref);
      expect(file.status()).toBe(200);
      expect(
        (await file.body()).subarray(0, format === "PDF" ? 4 : 2).toString(),
      ).toBe(format === "PDF" ? "%PDF" : "PK");
    }
    const denied = await request.post("/api/james/chat", {
      headers,
      data: {
        message: "próxima página",
        cart: [],
        reportContext: { view: "geral", action: "dashboard", filters: {} },
      },
    });
    expect(denied.status()).toBe(403);
    await info.attach("real-api-latency-ms", {
      body: JSON.stringify(timing, null, 2),
      contentType: "application/json",
    });
  } finally {
    for (const key of new Set(keys))
      await pool.execute(
        "DELETE FROM request_submissions WHERE request_key=?",
        [key],
      );
    if (partId) {
      await pool.execute("DELETE FROM stock_movements WHERE part_id=?", [
        partId,
      ]);
      for (const [entity, ids] of [
        ["transfer", transfers],
        ["return", returns],
        ["inbound", inbounds],
      ] as const)
        for (const id of ids)
          await pool.execute(
            "DELETE FROM audit_log WHERE entity_type=? AND entity_id=?",
            [entity, id],
          );
      await pool.execute("DELETE FROM return_records WHERE part_id=?", [
        partId,
      ]);
      await pool.execute("DELETE FROM stock_transfers WHERE part_id=?", [
        partId,
      ]);
      await pool.execute("DELETE FROM expected_receipts WHERE part_id=?", [
        partId,
      ]);
      await pool.execute("DELETE FROM inventory WHERE part_id=?", [partId]);
      await pool.execute("DELETE FROM parts WHERE id=?", [partId]);
    }
    for (const id of newParts) {
      await pool.execute(
        "DELETE FROM audit_log WHERE entity_type='part' AND entity_id=?",
        [id],
      );
      await pool.execute("DELETE FROM inventory WHERE part_id=?", [id]);
      await pool.execute("DELETE FROM parts WHERE id=?", [id]);
    }
    await pool.end();
  }
});
