import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import neon, { type RowDataPacket } from "../neon-test-db";

// Uses real HTTP and the disposable PostgreSQL database enforced by the config.
test("entrada e requisição idempotentes, baixa única e conservação em trânsito", async ({
  playwright,
}) => {
  const pool = neon.createPool(),
    contexts: APIRequestContext[] = [];
  const code = `LED-${Date.now()}`;
  async function login(id: string) {
    const context = await playwright.request.newContext({
      baseURL: "http://localhost:3101",
      extraHTTPHeaders: { origin: "http://localhost:3101" },
    });
    contexts.push(context);
    const response = await context.post("/api/login", {
      data: { identity: id, password: process.env.SEED_PASSWORD },
    });
    expect(response.status(), await response.text()).toBe(200);
    return context;
  }
  async function act(context: APIRequestContext, data: object, status = 200) {
    const response = await context.post("/api/workspace", {
      data: { requestKey: randomUUID(), ...data },
    });
    expect(response.status(), await response.text()).toBe(status);
    return response.json();
  }
  async function total() {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT (SELECT COALESCE(SUM(i.quantity),0) FROM inventory i WHERE i.part_id=p.id) AS physical,(SELECT COALESCE(SUM(t.quantity),0) FROM stock_transfers t WHERE t.part_id=p.id AND t.status='Em trânsito') AS transit FROM parts p WHERE p.code=?",
      [code],
    );
    return Number(rows[0].physical) + Number(rows[0].transit);
  }
  try {
    const [admin, warehouse, employee] = await Promise.all(
      ["1004", "1003", "1001"].map(login),
    );
    await act(warehouse, {
      type: "savePart",
      warehouse: "Central",
      localQuantity: 0,
      part: {
        code,
        qrCode: code,
        name: code,
        location: "Teste",
        packSize: 1,
        minimum: 2,
        localMinimum: 2,
        leadDays: 2,
        estimatedCost: 1,
      },
    });
    const entry = {
      type: "stockEntry",
      code,
      warehouse: "Central",
      quantity: 20,
      reason: "Entrada conferida de teste",
      requestKey: randomUUID(),
    };
    expect(
      await Promise.all([act(warehouse, entry), act(warehouse, entry)]),
    ).toEqual([{ ok: true }, { ok: true }]);
    expect(await total()).toBe(20);
    await act(warehouse, { ...entry, quantity: 21 }, 409);
    const request = {
      type: "createRequests",
      requestKey: randomUUID(),
      entries: [
        {
          code,
          quantity: 2,
          priority: "Leve",
          justification: "Atividade técnica de teste",
        },
      ],
    };
    const [first, repeat] = await Promise.all([
      act(employee, request),
      act(employee, request),
    ]);
    expect(first.ids).toEqual(repeat.ids);
    await act(admin, {
      type: "changeRequestStatus",
      id: first.ids[0],
      status: "Aprovada",
    });
    expect(await total()).toBe(20);
    await act(warehouse, { type: "claimRequest", id: first.ids[0] });
    const prepared = await act(warehouse, {
      type: "preparePick",
      id: first.ids[0],
      qrCode: code,
      confirmedQuantity: 2,
    });
    await act(warehouse, {
      type: "confirmPick",
      id: first.ids[0],
      qrCode: code,
      confirmedQuantity: 2,
      confirmation: prepared.confirmation,
    });
    await act(warehouse, {
      type: "changeRequestStatus",
      id: first.ids[0],
      status: "Entregue",
      qrCode: code,
      confirmedQuantity: 2,
    });
    await act(
      warehouse,
      {
        type: "changeRequestStatus",
        id: first.ids[0],
        status: "Entregue",
        qrCode: code,
        confirmedQuantity: 2,
      },
      409,
    );
    expect(await total()).toBe(18);
    const snapshot = await (await employee.get("/api/workspace")).json();
    expect(
      snapshot.requests.find((r: { id: number }) => r.id === first.ids[0]),
    ).toMatchObject({
      requestedQuantity: 2,
      approvedQuantity: 2,
      deliveredQuantity: 2,
    });
    const returned = await act(warehouse, {
      type: "registerReturn",
      code,
      requestId: first.ids[0],
      block: "Bloco A",
      warehouse: "Central",
      quantity: 1,
      condition: "Apto",
      returnedBy: "Teste",
      note: "Sobra vinculada ao documento",
    });
    expect(await total()).toBe(18);
    await act(warehouse, {
      type: "inspectReturn",
      id: returned.id,
      condition: "Apto",
      reason: "Material conferido",
    });
    expect(await total()).toBe(19);
    const transfer = await act(warehouse, {
      type: "transfer",
      code,
      from: "Central",
      to: "Almoxarifado 1",
      quantity: 9,
      reason: "Transferência de teste",
    });
    for (const type of ["dispatchTransfer", "receiveTransfer"]) {
      await act(warehouse, {
        type,
        id: transfer.id,
        qrCode: code,
        confirmedQuantity: 9,
      });
      expect(await total()).toBe(19);
    }
    const [events] = await pool.query<RowDataPacket[]>(
      "SELECT m.kind,COUNT(*) AS events,SUM(m.quantity) AS quantity FROM stock_movements m JOIN parts p ON p.id=m.part_id WHERE p.code=? GROUP BY m.kind",
      [code],
    );
    const entryEvent = events.find((e) => e.kind === "entrada")!,
      withdrawal = events.find((e) => e.kind === "saida")!;
    expect([Number(entryEvent.events), Number(entryEvent.quantity)]).toEqual([
      1, 20,
    ]);
    expect([Number(withdrawal.events), Number(withdrawal.quantity)]).toEqual([
      1, 2,
    ]);
  } finally {
    await Promise.all(contexts.map((c) => c.dispose()));
    await pool.end();
  }
});
