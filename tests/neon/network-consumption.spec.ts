import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import neon from "../neon-test-db";
import type { RowDataPacket, ResultSetHeader } from "../neon-test-db";
import type { FacilityGraph } from "../../lib/routing";

test("rede integrada: estoques menores, setores, Dijkstra, consumo, prioridade e histórico geral", async ({
  playwright,
  page,
}) => {
  page.setDefaultTimeout(20_000);
  const pool = neon.createPool();
  const contexts: APIRequestContext[] = [];
  const origin = "http://localhost:3101";
  const date = (ago: number) =>
    new Date(Date.now() - ago * 86400000).toISOString().slice(0, 10);
  const code = "NET-" + Date.now();
  const caioId = "caio-" + Date.now();
  const stock5Name = "Almoxarifado 5-" + Date.now();
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
    data: object,
    status = 200,
  ) {
    const response = await context.post("/api/workspace", {
      data: { requestKey: randomUUID(), ...data },
    });
    expect(response.status(), await response.text()).toBe(status);
    return response.json();
  }
  try {
    const [admin, employee, leader, keeper] = await Promise.all(
      ["1004", "1001", "1002", "1003"].map(login),
    );
    await action(admin, {
      type: "saveUser",
      password: process.env.SEED_PASSWORD,
      user: {
        id: caioId,
        name: "Caio da manutenção",
        email: `${caioId}@network.example`,
        sector: "Manutenção",
        block: "Bloco C",
        role: "Funcionário",
        active: true,
      },
    });
    const caio = await login(caioId);
    const metadata = await (await admin.get("/api/maps")).json();
    const blockA = metadata.blocks.find(
      (value: { name: string }) => value.name === "Bloco A",
    ).id;
    const blockC = metadata.blocks.find(
      (value: { name: string }) => value.name === "Bloco C",
    ).id;
    const stock2 = metadata.warehouses.find(
      (value: { name: string }) => value.name === "Almoxarifado 2",
    ).id;
    const central = metadata.warehouses.find(
      (value: { name: string }) => value.name === "Central",
    ).id;
    const smaller = await admin.post("/api/maps", {
      data: {
        action: "createWarehouse",
        name: stock5Name,
        blockId: blockA,
      },
    });
    expect(smaller.status(), await smaller.text()).toBe(201);
    const stock5 = (await smaller.json()).id;
    expect(
      (
        await leader.post("/api/maps", {
          data: { action: "createWarehouse", name: "Sem permissão" },
        })
      ).status(),
    ).toBe(403);
    const graph: FacilityGraph = {
      width: 300,
      height: 200,
      metersPerPixel: 1,
      scaleCalibrated: true,
      reviewed: true,
      walls: [],
      nodes: [
        {
          id: "central",
          kind: "warehouse",
          warehouseId: central,
          label: "Central",
          x: 0.05,
          y: 0.5,
        },
        {
          id: "stock2",
          kind: "warehouse",
          warehouseId: stock2,
          label: "Almoxarifado 2",
          x: 0.25,
          y: 0.5,
        },
        {
          id: "stock5",
          kind: "local_stock",
          warehouseId: stock5,
          label: stock5Name,
          x: 0.85,
          y: 0.5,
        },
        {
          id: "ana",
          kind: "sector",
          blockId: blockA,
          sector: "Usinagem",
          label: "Bloco A · Usinagem",
          x: 0.95,
          y: 0.5,
        },
        {
          id: "caio",
          kind: "sector",
          blockId: blockC,
          sector: "Manutenção",
          label: "Bloco C · Manutenção",
          x: 0.15,
          y: 0.5,
        },
      ],
      edges: [
        { from: "central", to: "stock2", blocked: false },
        { from: "stock2", to: "stock5", blocked: false },
        { from: "stock5", to: "ana", blocked: false },
        { from: "stock2", to: "caio", blocked: false },
      ],
    };
    const image = await sharp({
      create: { width: 300, height: 200, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const saved = await admin.post("/api/maps", {
      multipart: {
        title: "Rede de teste dos setores",
        graph: JSON.stringify(graph),
        image: { name: "map.png", mimeType: "image/png", buffer: image },
      },
    });
    expect(saved.status(), await saved.text()).toBe(200);
    const mapId = (await saved.json()).id;
    const published = await admin.post("/api/maps", {
      data: { action: "publish", id: mapId },
    });
    expect(published.status(), await published.text()).toBe(200);
    await action(admin, {
      type: "savePart",
      warehouse: "Almoxarifado 2",
      localQuantity: 220,
      part: {
        code,
        qrCode: code,
        name: "Parafuso da rede",
        location: "P1",
        packSize: 10,
        minimum: 1,
        leadDays: 1,
        estimatedCost: 2,
      },
    });
    const [parts] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM parts WHERE code=?",
      [code],
    );
    const partId = Number(parts[0].id);
    const [users] = await pool.query<RowDataPacket[]>(
      "SELECT id,employee_no FROM users",
    );
    const actor = (employeeNo: string) =>
      Number(users.find((user) => user.employee_no === employeeNo)!.id);
    const completed: number[] = [];
    for (const fixture of [
      {
        person: "1001",
        block: blockA,
        sector: "Usinagem",
        quantity: 90,
        ago: 2,
      },
      {
        person: caioId,
        block: blockC,
        sector: "Manutenção",
        quantity: 10,
        ago: 2,
      },
      {
        person: caioId,
        block: blockC,
        sector: "Manutenção",
        quantity: 20,
        ago: 45,
      },
    ]) {
      const [record] = await pool.execute<ResultSetHeader>(
        "INSERT INTO requests(requester_id,block_id,part_id,quantity,priority,sector,status,approved_by,approved_at,fulfilled_by,fulfilled_from,picked_at,delivered_at,created_at) VALUES(?,?,?,?,'Leve',?,'Entregue',?,?,?,?,?,?,?)",
        [
          actor(fixture.person),
          fixture.block,
          partId,
          fixture.quantity,
          fixture.sector,
          actor("1004"),
          date(fixture.ago),
          actor("1003"),
          stock2,
          date(fixture.ago),
          date(fixture.ago),
          date(fixture.ago),
        ],
      );
      completed.push(record.insertId);
      await pool.execute(
        "INSERT INTO stock_movements(part_id,warehouse_id,kind,quantity,reason,actor_id,block_id,request_id,created_at) VALUES(?,?,'saida',?,'Consumo histórico conferido',?,?,?,?)",
        [
          partId,
          stock2,
          fixture.quantity,
          actor("1003"),
          fixture.block,
          record.insertId,
          date(fixture.ago),
        ],
      );
    }
    await pool.execute(
      "UPDATE stock_movements SET created_at=? WHERE part_id=? AND kind='entrada'",
      [date(60), partId],
    );
    await pool.execute(
      "UPDATE inventory SET quantity=100 WHERE part_id=? AND warehouse_id=?",
      [partId, stock2],
    );
    const query = new URLSearchParams({ code, from: date(29), to: date(0) });
    const consumption = await admin.get("/api/parts-consumption?" + query);
    expect(consumption.status(), await consumption.text()).toBe(200);
    const report = await consumption.json();
    expect(report.items[0]).toMatchObject({
      code,
      quantity: 100,
      previousQuantity: 20,
      change: 400,
    });
    expect(
      report.blocks.map((block: { label: string; percentage: number }) => [
        block.label,
        block.percentage,
      ]),
    ).toEqual([
      ["Bloco A", 90],
      ["Bloco C", 10],
    ]);
    expect(report.sectors[0]).toMatchObject({
      label: "Bloco A · Usinagem",
      percentage: 90,
    });
    expect((await leader.get("/api/parts-consumption?" + query)).status()).toBe(
      403,
    );
    expect(
      (await employee.get("/api/parts-consumption?" + query)).status(),
    ).toBe(403);
    expect(
      (
        await admin.get("/api/parts-consumption?from=2027-01-01&to=2027-01-02")
      ).status(),
    ).toBe(400);
    const filtered = await (
      await keeper.get("/api/parts-consumption?" + query + "&block=Bloco%20C")
    ).json();
    expect(filtered.items[0].quantity).toBe(10);
    const recommendation = await admin.get(
      "/api/operations?planning=distribution&horizon=29&margin=0&" + query,
    );
    expect(recommendation.status(), await recommendation.text()).toBe(200);
    const planning = await recommendation.json();
    const transfer = planning.transfers.find(
      (value: { code: string; to: string }) =>
        value.code === code && value.to === stock5Name,
    );
    expect(transfer).toMatchObject({
      from: "Almoxarifado 2",
      to: stock5Name,
      quantity: 90,
    });
    expect(transfer.evidence.route.nodes).toEqual(["stock2", "stock5"]);
    expect(
      transfer.evidence.sourceAvailable - transfer.quantity,
    ).toBeGreaterThanOrEqual(transfer.evidence.sourceTarget);
    const pendingIds: Record<string, number> = {};
    for (const priority of ["Leve", "Urgente", "Moderado"]) {
      const created = await action(employee, {
        type: "createRequests",
        entries: [
          {
            code,
            quantity: 1,
            priority,
            justification: "Reposição para atividade programada",
          },
        ],
      });
      pendingIds[priority] = created.ids[0];
    }
    const foreignPending = await action(caio, {
      type: "createRequests",
      entries: [
        {
          code,
          quantity: 1,
          priority: "Leve",
          justification: "Reposição da manutenção",
        },
      ],
    });
    const employeeSnapshot = await (
      await employee.get("/api/workspace")
    ).json();
    expect(
      employeeSnapshot.requests.some(
        (request: { id: number }) => request.id === completed[1],
      ),
    ).toBe(true);
    expect(
      employeeSnapshot.requests.some(
        (request: { id: number }) => request.id === foreignPending.ids[0],
      ),
    ).toBe(false);
    const token = (await employee.storageState()).cookies.find(
      (cookie) => cookie.name === "marcon_api_token",
    )!.value;
    const history = await playwright.request.newContext({
      baseURL: "http://localhost:3106",
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    contexts.push(history);
    const restHistory = await (await history.get("/employee/history")).json();
    expect(
      restHistory.data.every(
        (request: { status: string }) => request.status === "Entregue",
      ),
    ).toBe(true);
    expect(
      restHistory.data.some(
        (request: { id: number }) => request.id === completed[1],
      ),
    ).toBe(true);
    await page.context().addCookies((await leader.storageState()).cookies);
    await page.goto("/department-head/requests");
    await page.getByRole("searchbox", { name: "Buscar pedido" }).fill(code);
    const order = await page
      .locator(`[data-request-id]`)
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-priority")),
      );
    expect(order.slice(0, 3)).toEqual(["Urgente", "Moderado", "Leve"]);
    await page.getByRole("button", { name: /Urgente.*pedidos/ }).click();
    await expect(
      page.locator(`[data-request-id="${pendingIds.Urgente}"]`),
    ).toBeVisible();
    await expect(
      page.locator(`[data-request-id="${pendingIds.Leve}"]`),
    ).toHaveCount(0);
    await page.goto("/department-head/history");
    await expect(
      page.getByRole("heading", {
        name: "Histórico geral de entregas",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.locator(`[data-request-id="${completed[1]}"]`),
    ).toBeVisible();
    await page.context().clearCookies();
    await page.context().addCookies((await admin.storageState()).cookies);
    for (const path of [
      "/admin/dashboard/parts",
      `/admin/dashboard/by-part?code=${code}`,
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", {
          name: path.includes("by-part") ? "Por peça" : "Peças",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByText("Consultando consumo no banco…")).toHaveCount(
        0,
      );
      for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    }
    await expect(
      page.getByRole("heading", { name: "Por bloco", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/90%/).first()).toBeVisible();
    await page.screenshot({
      path: ".validation/network-by-part.png",
      fullPage: true,
    });
    await page.goto("/admin/map");
    await expect(
      page.getByText("Vincular almoxarifados, blocos e setores"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: /Bloco C · Manutenção · \d+ funcionários/,
      }),
    ).toBeVisible();
    const versionButton = page.getByRole("button", {
      name: new RegExp(`.*${mapId}.*Rede de teste dos setores`),
    });
    if (await versionButton.count()) await versionButton.click();
    await page.screenshot({
      path: ".validation/network-map-editor.png",
      fullPage: true,
    });
    await page.context().clearCookies();
    await page.context().addCookies((await keeper.storageState()).cookies);
    await page.goto("/warehouse/dashboard/parts");
    await expect(
      page.getByRole("heading", { name: "Peças", exact: true }),
    ).toBeVisible();
    await page.goto(`/warehouse/dashboard/by-part?code=${code}`);
    await expect(
      page.getByRole("heading", { name: "Por setor", exact: true }),
    ).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.dispose()));
    await pool.end();
  }
});
