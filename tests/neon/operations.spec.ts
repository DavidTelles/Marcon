import { test, expect, type APIRequestContext } from "@playwright/test";
import neon from "../neon-test-db";
import type { RowDataPacket } from "../neon-test-db";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
import type { FacilityGraph } from "../../lib/routing";
test("reservas concorrentes, cancelamento, entrega, devolução, escopos e relatórios", async ({
  playwright,
}) => {
  const pool = neon.createPool(),
    contexts: APIRequestContext[] = [],
    origin = "http://localhost:3101",
    suffix = Date.now().toString(36),
    code = ("OPS-" + suffix).toUpperCase();
  async function login(identity: string) {
    const c = await playwright.request.newContext({
      baseURL: origin,
      extraHTTPHeaders: { origin },
    });
    contexts.push(c);
    const r = await c.post("/api/login", {
      data: { identity, password: process.env.SEED_PASSWORD },
    });
    expect(r.status(), await r.text()).toBe(200);
    return c;
  }
  async function act(c: APIRequestContext, data: object, status = 200) {
    const r = await c.post("/api/workspace", { data });
    expect(r.status(), await r.text()).toBe(status);
    return r.json();
  }
  async function totals() {
    const [r] = await pool.query<RowDataPacket[]>(
      "SELECT (SELECT SUM(quantity) FROM inventory WHERE part_id=p.id) physical,(SELECT COALESCE(SUM(quantity),0) FROM request_reservations WHERE part_id=p.id) reserved FROM parts p WHERE code=?",
      [code],
    );
    return { physical: Number(r[0].physical), reserved: Number(r[0].reserved) };
  }
  try {
    const [employee, leader, warehouse, admin] = await Promise.all(
      ["1001", "1002", "1003", "1004"].map(login),
    );
    const otherId = "other_" + suffix;
    await act(admin, {
      type: "saveUser",
      password: process.env.SEED_PASSWORD,
      user: {
        id: otherId,
        name: "Outro bloco",
        email: otherId + "@example.test",
        sector: "Teste",
        role: "Funcionário",
        block: "Bloco B",
      },
    });
    const other = await login(otherId);
    await act(warehouse, {
      type: "savePart",
      warehouse: "Central",
      localQuantity: 10,
      part: {
        name: code,
        code,
        qrCode: code,
        location: "C-1",
        unit: "un",
        category: "Teste",
        criticality: 2,
        aisle: "C",
        shelf: "1",
        capacity: 20,
        localMinimum: 2,
        packSize: 1,
        minimum: 2,
        leadDays: 7,
        estimatedCost: 5,
      },
    });
    const first = await act(employee, {
      type: "createRequests",
      entries: [{ code, quantity: 6, priority: "Leve" }],
    });
    const second = await act(other, {
      type: "createRequests",
      entries: [{ code, quantity: 6, priority: "Leve" }],
    });
    expect(await totals()).toEqual({ physical: 10, reserved: 0 });
    await act(
      other,
      { type: "editRequest", id: first.ids[0], quantity: 1 },
      403,
    );
    await act(
      leader,
      { type: "changeRequestStatus", id: second.ids[0], status: "Aprovada" },
      403,
    );
    await act(employee, { type: "editRequest", id: first.ids[0], quantity: 5 });
    await act(employee, { type: "editRequest", id: first.ids[0], quantity: 6 });
    const approvals = await Promise.all(
      [first, second].map((r) =>
        admin.post("/api/workspace", {
          data: {
            type: "changeRequestStatus",
            id: r.ids[0],
            status: "Aprovada",
          },
        }),
      ),
    );
    expect(approvals.map((r) => r.status()).sort()).toEqual([200, 409]);
    expect(await totals()).toEqual({ physical: 10, reserved: 6 });
    const winner = approvals[0].status() === 200 ? first.ids[0] : second.ids[0],
      owner = winner === first.ids[0] ? employee : other;
    await act(
      warehouse,
      {
        type: "adjustStock",
        code,
        warehouse: "Central",
        quantity: 5,
        reason: "Contagem física",
      },
      409,
    );
    await act(
      warehouse,
      {
        type: "transfer",
        requestKey: crypto.randomUUID(),
        code,
        from: "Central",
        to: "Almoxarifado 1",
        quantity: 5,
        qrCode: code,
        reason: "Reposição",
      },
      409,
    );
    await act(owner, { type: "editRequest", id: winner, quantity: 1 }, 403);
    await act(owner, {
      type: "requestCancellation",
      id: winner,
      reason: "Pedido duplicado",
    });
    expect((await totals()).reserved).toBe(6);
    await act(
      warehouse,
      {
        type: "changeRequestStatus",
        id: winner,
        status: "Entregue",
        qrCode: code,
        confirmedQuantity: 6,
      },
      409,
    );
    await act(warehouse, {
      type: "changeRequestStatus",
      id: winner,
      status: "Cancelada",
      reason: "Cancelamento conferido",
    });
    expect(await totals()).toEqual({ physical: 10, reserved: 0 });
    const delivery = await act(employee, {
        type: "createRequests",
        entries: [{ code, quantity: 4, priority: "Moderado" }],
      }),
      id = delivery.ids[0];
    await act(leader, { type: "changeRequestStatus", id, status: "Aprovada" });
    await act(
      warehouse,
      {
        type: "changeRequestStatus",
        id,
        status: "Entregue",
        qrCode: "wrong",
        confirmedQuantity: 4,
      },
      422,
    );
    await act(
      warehouse,
      {
        type: "changeRequestStatus",
        id,
        status: "Entregue",
        qrCode: code,
        confirmedQuantity: 3,
      },
      422,
    );
    const deliveries = await Promise.all(
      [1, 2].map(() =>
        warehouse.post("/api/workspace", {
          data: {
            type: "changeRequestStatus",
            id,
            status: "Entregue",
            qrCode: code,
            confirmedQuantity: 4,
          },
        }),
      ),
    );
    expect(deliveries.map((r) => r.status()).sort()).toEqual([200, 409]);
    expect(await totals()).toEqual({ physical: 6, reserved: 0 });
    await act(employee, { type: "confirmReceipt", id });
    await act(employee, { type: "confirmReceipt", id }, 409);
    const returned = await act(warehouse, {
      type: "registerReturn",
      code,
      requestId: id,
      block: "Bloco A",
      warehouse: "Central",
      quantity: 2,
      condition: "Apto",
      returnedBy: "Ana Souza",
      note: "Sobra do serviço",
    });
    expect((await totals()).physical).toBe(6);
    await act(
      warehouse,
      {
        type: "registerReturn",
        code,
        requestId: id,
        block: "Bloco A",
        quantity: 3,
        condition: "Apto",
        returnedBy: "Ana Souza",
        note: "Excede entrega",
      },
      409,
    );
    const inspections = await Promise.all(
      [1, 2].map(() =>
        warehouse.post("/api/workspace", {
          data: {
            type: "inspectReturn",
            id: returned.id,
            condition: "Apto",
            reason: "Conferência física",
          },
        }),
      ),
    );
    expect(inspections.map((r) => r.status()).sort()).toEqual([200, 409]);
    expect((await totals()).physical).toBe(8);
    const damaged = await act(warehouse, {
      type: "registerReturn",
      code,
      requestId: id,
      block: "Bloco A",
      quantity: 2,
      condition: "Danificado",
      returnedBy: "Ana Souza",
      note: "Quebra identificada",
    });
    await act(warehouse, {
      type: "inspectReturn",
      id: damaged.id,
      condition: "Danificado",
      reason: "Material reprovado",
    });
    expect((await totals()).physical).toBe(8);
    const incoming = await act(warehouse, {
      type: "confirmInbound",
      code,
      warehouse: "Central",
      quantity: 3,
      dueDate: new Date().toISOString().slice(0, 10),
      supplier: "Fornecedor de teste",
      reference: "Pedido teste",
    });
    expect((await totals()).physical).toBe(8);
    await act(warehouse, {
      type: "receiveInbound",
      id: incoming.id,
      qrCode: code,
      quantity: 3,
    });
    await act(
      warehouse,
      { type: "receiveInbound", id: incoming.id, qrCode: code, quantity: 3 },
      409,
    );
    expect((await totals()).physical).toBe(11);
    await act(
      employee,
      {
        type: "stockEntry",
        code,
        warehouse: "Central",
        quantity: 1,
        reason: "Inválido",
      },
      403,
    );
    expect((await leader.get("/api/operations?block=Bloco%20B")).status()).toBe(
      403,
    );
    expect(
      (await employee.get("/api/operations?requester=" + otherId)).status(),
    ).toBe(403);
    const snapshot = await (await employee.get("/api/workspace")).json();
    expect(
      snapshot.requests.every(
        (r: { requesterId: string }) => r.requesterId === "1001",
      ),
    ).toBeTruthy();
    const response = await admin.get("/api/operations?code=" + code);
    expect(response.status(), await response.text()).toBe(200);
    const report = await response.json();
    expect(report.summary.withdrawals).toBe(4);
    expect(report.summary.returns).toBe(2);
    expect(report.summary.entries).toBe(3);
    expect(report.summary.averageDeliveryHours).toBeLessThan(0.1);
    expect(report.rows[0].analysis.confidence).toBe("Dados insuficientes");
    const pdfResponse = await admin.get(
      "/api/operations?code=" + code + "&format=pdf",
    );
    expect(pdfResponse.status(), await pdfResponse.text()).toBe(200);
    const pdf = await PDFDocument.load(await pdfResponse.body());
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    const xlsx = await admin.get(
      "/api/operations?code=" + code + "&format=xlsx",
    );
    expect(xlsx.status()).toBe(200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(new Uint8Array(await xlsx.body()).buffer);
    expect(book.worksheets[0].getCell("A5").value).toBe(code);
    expect(book.worksheets[0].getCell("G5").value).toBe(4);
  } finally {
    await pool.end();
    await Promise.all(contexts.map((c) => c.dispose()));
  }
});
test("planta: arquivo validado, versões preservadas, publicação restrita e rota bloqueada", async ({
  playwright,
  page,
}) => {
  const origin = "http://localhost:3101",
    admin = await playwright.request.newContext({
      baseURL: origin,
      extraHTTPHeaders: { origin },
    }),
    warehouse = await playwright.request.newContext({
      baseURL: origin,
      extraHTTPHeaders: { origin },
    });
  try {
    for (const [c, identity] of [
      [admin, "1004"],
      [warehouse, "1003"],
    ] as const)
      expect(
        (
          await c.post("/api/login", {
            data: { identity, password: process.env.SEED_PASSWORD },
          })
        ).status(),
      ).toBe(200);
    const image = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const graph: FacilityGraph = {
      width: 100,
      height: 100,
      metersPerPixel: 0.1,
      reviewed: true,
      nodes: [
        { id: "a", label: "Central", kind: "warehouse", x: 0.1, y: 0.1 },
        { id: "b", label: "Entrega", kind: "delivery", x: 0.9, y: 0.1 },
      ],
      edges: [{ from: "a", to: "b", seconds: 10, blocked: false }],
      walls: [],
    };
    const maps = await (await admin.get("/api/maps")).json();
    graph.nodes[0].warehouseId = maps.warehouses.find(
      (w: { name: string }) => w.name === "Central",
    ).id;
    graph.nodes[1].blockId = maps.blocks.find(
      (b: { name: string }) => b.name === "Bloco A",
    ).id;
    expect(
      (
        await warehouse.post("/api/maps", { data: { action: "save", graph } })
      ).status(),
    ).toBe(403);
    const invalid = await admin.post("/api/maps", {
      multipart: {
        title: "Teste",
        graph: JSON.stringify(graph),
        image: {
          name: "bad.png",
          mimeType: "image/png",
          buffer: Buffer.from("not an image"),
        },
      },
    });
    expect(invalid.status()).toBe(400);
    const saved = await admin.post("/api/maps", {
      multipart: {
        title: "Planta de teste",
        graph: JSON.stringify(graph),
        image: { name: "map.png", mimeType: "image/png", buffer: image },
      },
    });
    expect(saved.status(), await saved.text()).toBe(200);
    const { id } = await saved.json();
    expect(
      (
        await warehouse.post("/api/maps", { data: { action: "publish", id } })
      ).status(),
    ).toBe(403);
    expect(
      (
        await admin.post("/api/maps", { data: { action: "publish", id } })
      ).status(),
    ).toBe(200);
    const route = await warehouse.post("/api/maps", {
      data: { action: "test", start: "a", stops: ["b"] },
    });
    expect((await route.json()).route.cost).toBe(10);
    const blocked = await admin.post("/api/maps", {
      data: {
        action: "test",
        start: "a",
        stops: ["b"],
        graph: { ...graph, edges: [{ ...graph.edges[0], blocked: true }] },
      },
    });
    expect((await blocked.json()).route).toBeNull();
    const wall = await admin.post("/api/maps", {
      data: {
        action: "save",
        title: "Parede",
        baseId: id,
        graph: { ...graph, walls: [{ x1: 0.5, y1: 0, x2: 0.5, y2: 1 }] },
      },
    });
    expect(wall.status()).toBe(400);
    const v2 = await admin.post("/api/maps", {
      data: { action: "save", title: "Revisão", baseId: id, graph },
    });
    expect(v2.status()).toBe(200);
    const second = (await v2.json()).id;
    expect(
      (
        await admin.post("/api/maps", {
          data: { action: "publish", id: second },
        })
      ).status(),
    ).toBe(200);
    const history = await (await admin.get("/api/maps")).json();
    expect(history.maps.find((m: { id: number }) => m.id === id).status).toBe(
      "Arquivada",
    );
    expect(
      (await admin.get("/api/maps?image=" + id)).headers()["content-type"],
    ).toBe("image/png");
    await page.context().addCookies((await admin.storageState()).cookies);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/map");
    await expect(
      page.getByRole("heading", { name: "Planta e caminhos transitáveis" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Histórico de versões" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
  } finally {
    await admin.dispose();
    await warehouse.dispose();
  }
});

test("estoque e planejamento responsivos com Neon e leitor sem câmera", async ({
  page,
}, testInfo) => {
  const origin = "http://localhost:3101";
  const response = await page.request.post("/api/login", {
    headers: { origin },
    data: { identity: "1003", password: process.env.SEED_PASSWORD },
  });
  expect(response.status()).toBe(200);
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/warehouse/stock/all/all");
    await expect(
      page.getByRole("heading", { name: "Movimentar estoque" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
  }
  await page.getByRole("button", { name: "Nova peça" }).click();
  await expect(page.getByLabel("Unidade", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Prateleira", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Operação", exact: true })
    .selectOption("transfer");
  await page.getByRole("button", { name: "Escanear QR / barras" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Câmera indisponível" }),
  ).toContainText("Use leitor USB ou digite o código");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/warehouse/dashboard?view=compra");
  await expect(
    page.getByRole("heading", { name: "Consumo e planejamento" }),
  ).toBeVisible();
  await page.locator('.dashboard-popover summary').click();
  await expect(page.getByRole('button', {name:'Planilha', exact:true})).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await expect(page.getByRole('region',{name:'Estoque e previsão',exact:true}).locator('tbody td').first()).toBeVisible();
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: testInfo.outputPath("planning-" + width + ".png"),
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/warehouse/returns");
  await expect(
    page.getByRole("heading", { name: "Conferir devoluções pendentes" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
});
