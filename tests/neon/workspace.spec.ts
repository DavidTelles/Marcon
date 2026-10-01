import { expect, test, type APIRequestContext } from "@playwright/test";
import neon from "../neon-test-db";
import type { RowDataPacket } from "../neon-test-db";

test("Neon: perfis, operações e concorrência de saldo", async ({
  playwright,
}) => {
  const origin = "http://localhost:3101";
  const contexts: APIRequestContext[] = [];
  const pool = neon.createPool();
  const suffix = Date.now().toString(36);
  const code = `TEST-${suffix}`;
  const employee = `test_${suffix}`;
  async function login(identity: string) {
    const context = await playwright.request.newContext({
      baseURL: origin,
      extraHTTPHeaders: { origin },
    });
    contexts.push(context);
    const response = await context.post("/api/login", {
      data: { identity, password: process.env.SEED_PASSWORD },
    });
    expect(response.status(), await response.text()).toBe(200);
    return context;
  }
  async function action(
    context: APIRequestContext,
    data: unknown,
    status = 200,
  ) {
    const response = await context.post("/api/workspace", { data });
    expect(response.status(), await response.text()).toBe(status);
    return response.json();
  }
  try {
    const [staff, leader, warehouse, admin] = await Promise.all(
      ["1001", "1002", "1003", "1004"].map(login),
    );
    for (const [context, role] of [
      [staff, "funcionario"],
      [leader, "lider"],
      [warehouse, "almoxarifado"],
      [admin, "admin"],
    ] as const) {
      expect((await context.get(`/inicio/${role}`)).status()).toBe(200);
      expect((await context.get("/api/workspace")).status()).toBe(200);
    }
    const denied = await staff.get("/admin/dashboard", { maxRedirects: 0 });
    if (denied.status() === 200) {
      const body = await denied.text();
      expect(body).toContain("NEXT_REDIRECT");
      expect(body).toContain("/inicio/funcionario");
    } else expect([303, 307, 308, 403]).toContain(denied.status());
    await action(staff, { type: "updatePrice", code, price: 1 }, 403);
    await action(admin, { type: "toggleUser", id: "1004", active: false }, 400);
    await action(
      admin,
      { type: "toggleUser", id: "1001", active: "false" },
      400,
    );
    await action(admin, {
      type: "saveUser",
      password: process.env.SEED_PASSWORD,
      user: {
        id: employee,
        name: "Teste integração",
        email: `${employee}@example.test`,
        sector: "Teste",
        role: "Funcionário",
        block: "Bloco A",
        active: true,
      },
    });
    const createdUser = await login(employee);
    const newPassword = `NewPassword@${suffix}`;
    expect(
      (
        await createdUser.patch("/api/profile", {
          data: {
            name: "Teste integração",
            email: `${employee}@example.test`,
            currentPassword: "senha-incorreta",
            newPassword,
          },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await createdUser.patch("/api/profile", {
          data: {
            name: "Teste Perfil",
            email: `${employee}.novo@example.test`,
            currentPassword: process.env.SEED_PASSWORD,
            newPassword,
          },
        })
      ).status(),
    ).toBe(200);
    const [profileRows] = await pool.query<RowDataPacket[]>(
      "SELECT name, email FROM users WHERE employee_no = ?",
      [employee],
    );
    expect(profileRows[0].name).toBe("Teste Perfil");
    expect(profileRows[0].email).toBe(`${employee}.novo@example.test`);
    expect((await createdUser.get("/api/profile")).status()).toBe(401);
    expect(
      (
        await createdUser.post("/api/login", {
          data: { identity: employee, password: process.env.SEED_PASSWORD },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await createdUser.post("/api/login", {
          data: { identity: employee, password: newPassword },
        })
      ).status(),
    ).toBe(200);
    await action(admin, { type: "toggleUser", id: employee, active: false });
    expect((await createdUser.get("/api/workspace")).status()).toBe(401);
    expect(
      (
        await createdUser.post("/api/login", {
          data: { identity: employee, password: process.env.SEED_PASSWORD },
        })
      ).status(),
    ).toBe(401);
    await action(warehouse, {
      type: "savePart",
      warehouse: "Central",
      localQuantity: 10,
      part: {
        name: code,
        code,
        qrCode: code,
        location: "TEST",
        packSize: 1,
        minimum: 1,
        leadDays: 1,
        estimatedCost: 2,
      },
    });
    await action(staff, { type: "createRequests", entries: [null] }, 400);
    const { ids } = await action(staff, {
      type: "createRequests",
      entries: [{ code, quantity: 2, priority: "Leve" }],
    });
    await action(leader, {
      type: "changeRequestStatus",
      id: ids[0],
      status: "Aprovada",
    });
    await action(
      warehouse,
      {
        type: "changeRequestStatus",
        id: ids[0],
        status: "Entregue",
        qrCode: "ERRADO",
      },
      422,
    );
    await action(warehouse, {
      type: "changeRequestStatus",
      id: ids[0],
      status: "Entregue",
      qrCode: code,
      confirmedQuantity: 2,
    });
    await action(
      warehouse,
      {
        type: "changeRequestStatus",
        id: ids[0],
        status: "Entregue",
        qrCode: code,
        confirmedQuantity: 2,
      },
      409,
    );
    const ret = await action(warehouse, {
      type: "registerReturn",
      code,
      block: "Bloco A",
      quantity: 1,
      condition: "Apto",
      returnedBy: "Teste",
      note: "Sobra devolvida",
      requestId: ids[0],
    });
    await action(warehouse, {
      type: "inspectReturn",
      id: ret.id,
      condition: "Apto",
      reason: "Material conferido",
    });
    await action(warehouse, {
      type: "registerReturn",
      code,
      block: "Bloco A",
      quantity: 1,
      condition: "Danificado",
      returnedBy: "Teste",
      note: "Material danificado",
      requestId: ids[0],
    });
    await action(warehouse, {
      type: "transfer",
      code,
      to: "Almoxarifado 1",
      quantity: 1,
      qrCode: code,
      reason: "Reposicao local",
    });
    await action(warehouse, { type: "updatePrice", code, price: 12.34 });
    const responses = await Promise.all(
      [1, 2].map(() =>
        staff.post("/api/workspace", {
          data: {
            type: "createRequests",
            entries: [{ code, quantity: 6, priority: "Leve" }],
          },
        }),
      ),
    );
    expect(responses.map((response) => response.status())).toEqual([200, 200]);
    const pending = await Promise.all(responses.map((r) => r.json()));
    const approved = await Promise.all(
      pending.map((r) =>
        leader.post("/api/workspace", {
          data: {
            type: "changeRequestStatus",
            id: r.ids[0],
            status: "Aprovada",
          },
        }),
      ),
    );
    expect(approved.map((r) => r.status()).sort()).toEqual([200, 409]);
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT (SELECT SUM(quantity) FROM inventory WHERE part_id = p.id) AS stock, (SELECT SUM(quantity) FROM request_reservations WHERE part_id = p.id) AS reserved, reference_unit_price AS price FROM parts p WHERE code = ?",
      [code],
    );
    expect(Number(rows[0].stock)).toBe(9);
    expect(Number(rows[0].reserved)).toBe(6);
    expect(
      Number(rows[0].stock) - Number(rows[0].reserved),
    ).toBeGreaterThanOrEqual(0);
    expect(Number(rows[0].price)).toBe(12.34);
  } finally {
    await pool.end();
    await Promise.all(contexts.map((context) => context.dispose()));
  }
});
