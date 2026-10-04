import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { FacilityGraph } from "../../lib/routing";

test("perfis integrados: planta, caixas, análise, retirada dupla, entrega, materiais e reposição", async ({
  playwright,
  page,
}) => {
  page.setDefaultTimeout(20_000);
  const origin = "http://localhost:3101";
  const contexts: APIRequestContext[] = [];
  async function login(identity: string) {
    const ctx = await playwright.request.newContext({
      baseURL: origin,
      extraHTTPHeaders: { origin },
    });
    contexts.push(ctx);
    const r = await ctx.post("/api/login", {
      data: { identity, password: process.env.SEED_PASSWORD },
    });
    expect(r.status(), await r.text()).toBe(200);
    return ctx;
  }
  async function action(ctx: APIRequestContext, data: object, status = 200) {
    const r = await ctx.post("/api/workspace", {
      data: { requestKey: randomUUID(), ...data },
    });
    expect(r.status(), await r.text()).toBe(status);
    return r.json();
  }
  async function snapshot(ctx: APIRequestContext) {
    const r = await ctx.get("/api/workspace");
    expect(r.status(), await r.text()).toBe(200);
    return r.json();
  }
  const code = "WF-" + Date.now();
  try {
    const [employee, leader, keeper, admin] = await Promise.all(
      ["1001", "1002", "1003", "1004"].map(login),
    );
    const metadata = await (await admin.get("/api/maps")).json();
    const central = metadata.warehouses.find(
      (w: { name: string }) => w.name === "Central",
    ).id;
    const local = metadata.warehouses.find(
      (w: { name: string }) => w.name === "Almoxarifado 1",
    ).id;
    const block = metadata.blocks.find(
      (b: { name: string }) => b.name === "Bloco A",
    ).id;
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
          label: "Central",
          kind: "warehouse",
          warehouseId: central,
          x: 0.1,
          y: 0.1,
        },
        {
          id: "local",
          label: "Almoxarifado A",
          kind: "warehouse",
          warehouseId: local,
          x: 0.5,
          y: 0.8,
        },
        {
          id: "delivery",
          label: "Entrega Bloco A",
          kind: "delivery",
          blockId: block,
          x: 0.8,
          y: 0.8,
        },
      ],
      edges: [
        { from: "central", to: "local", blocked: false },
        { from: "local", to: "delivery", blocked: false },
      ],
    };
    const image = await sharp({
      create: { width: 300, height: 200, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const saved = await admin.post("/api/maps", {
      multipart: {
        title: "Planta de teste isolado",
        graph: JSON.stringify(graph),
        image: { name: "map.png", mimeType: "image/png", buffer: image },
      },
    });
    expect(saved.status(), await saved.text()).toBe(200);
    const published = await admin.post("/api/maps", {
      data: { action: "publish", id: (await saved.json()).id },
    });
    expect(published.status(), await published.text()).toBe(200);
    await action(admin, {
      type: "savePart",
      warehouse: "Central",
      localQuantity: 100,
      part: {
        code,
        qrCode: code,
        name: "Material de teste " + code,
        location: "C1",
        packSize: 5,
        minimum: 1,
        leadDays: 3,
        estimatedCost: 2,
      },
    });
    await action(keeper, {
      type: "replenishStock",
      code,
      warehouse: "Almoxarifado 1",
      quantity: 50,
      qrCode: code,
      reason: "Reposição recebida do fornecedor",
    });
    const created = await action(employee, {
      type: "createRequests",
      entries: [
        {
          code,
          quantity: 2,
          requestedUnit: "box",
          priority: "Leve",
          justification: "Material necessário para atividade de teste",
        },
      ],
    });
    const id = created.ids[0];
    const getRequest = async (ctx: APIRequestContext) =>
      (await snapshot(ctx)).requests.find((r: { id: number }) => r.id === id);
    expect(await getRequest(leader)).toMatchObject({
      quantity: 10,
      requestedAmount: 2,
      requestedUnit: "box",
      packSizeAtRequest: 5,
      status: "Pendente",
    });
    await action(
      employee,
      { type: "changeRequestStatus", id, status: "Aprovada" },
      403,
    );
    await action(leader, {
      type: "changeRequestStatus",
      id,
      status: "Em análise",
    });
    expect((await getRequest(employee)).status).toBe("Em análise");
    await action(leader, {
      type: "changeRequestStatus",
      id,
      status: "Aprovada",
    });
    expect((await getRequest(keeper)).allocations).toEqual([
      expect.objectContaining({ warehouse: "Almoxarifado 1", quantity: 10 }),
    ]);
    const balance = async () =>
      (await snapshot(keeper)).balances.find(
        (b: { warehouse: string; partCode: string }) =>
          b.warehouse === "Almoxarifado 1" && b.partCode === code,
      ).quantity;
    expect(await balance()).toBe(50);
    await action(
      keeper,
      { type: "changeRequestStatus", id, status: "Entregue" },
      409,
    );
    await action(keeper, { type: "claimRequest", id });
    await action(admin, { type: "claimRequest", id }, 409);
    await action(
      admin,
      { type: "preparePick", id, qrCode: code, confirmedQuantity: 10 },
      409,
    );
    await action(
      keeper,
      { type: "preparePick", id, qrCode: "wrong", confirmedQuantity: 10 },
      422,
    );
    await action(
      keeper,
      { type: "preparePick", id, qrCode: code, confirmedQuantity: 9 },
      422,
    );
    await action(
      keeper,
      { type: "confirmPick", id, qrCode: code, confirmedQuantity: 10 },
      409,
    );
    const ready = await action(keeper, {
      type: "preparePick",
      id,
      qrCode: code,
      confirmedQuantity: 10,
    });
    expect(await balance()).toBe(50);
    const key = randomUUID();
    const withdrawal = {
      type: "confirmPick",
      id,
      qrCode: code,
      confirmedQuantity: 10,
      confirmation: ready.confirmation,
      requestKey: key,
    };
    await action(keeper, withdrawal);
    await action(keeper, withdrawal);
    expect(await balance()).toBe(40);
    expect(await getRequest(employee)).toMatchObject({
      status: "Em entrega",
      deliveredQuantity: 10,
    });
    await action(
      admin,
      { type: "changeRequestStatus", id, status: "Entregue" },
      409,
    );
    await action(keeper, {
      type: "changeRequestStatus",
      id,
      status: "Entregue",
    });
    expect((await getRequest(leader)).status).toBe("Entregue");
    expect(await balance()).toBe(40);
    await action(
      keeper,
      { type: "changeRequestStatus", id, status: "Entregue" },
      409,
    );
    // Build contextual approved history; first-time and oversized orders require a reason.
    const recurringIds: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await action(employee, {
        type: "createRequests",
        entries: [
          {
            code,
            quantity: 2,
            priority: "Leve",
            justification: "Atividade recorrente do setor",
          },
        ],
      });
      await action(leader, {
        type: "changeRequestStatus",
        id: r.ids[0],
        status: "Aprovada",
      });
      recurringIds.push(r.ids[0]);
    }
    await action(
      employee,
      {
        type: "createRequests",
        entries: [{ code, quantity: 20, priority: "Leve" }],
      },
      400,
    );
    const abnormal = await action(employee, {
      type: "createRequests",
      entries: [
        {
          code,
          quantity: 20,
          priority: "Leve",
          justification: "Parada de manutenção exige quantidade extra",
        },
      ],
    });
    const anomaly = (await snapshot(leader)).requests.find(
      (r: { id: number }) => r.id === abnormal.ids[0],
    );
    expect(anomaly.anomaly.unusual).toBe(true);
    await action(leader, {
      type: "changeRequestStatus",
      id: abnormal.ids[0],
      status: "Rejeitada",
      reason: "Quantidade não autorizada para esta atividade",
    });
    expect(
      (await snapshot(employee)).requests.find(
        (r: { id: number }) => r.id === abnormal.ids[0],
      ).status,
    ).toBe("Rejeitada");
    const returned = await action(keeper, {
      type: "registerReturn",
      code,
      quantity: 3,
      block: "Bloco A",
      warehouse: "Almoxarifado 1",
      condition: "Apto",
      returnedBy: "Ana Souza",
      note: "Material excedente devolvido",
      requestId: id,
    });
    await action(keeper, {
      type: "inspectReturn",
      id: returned.id,
      condition: "Apto",
      reason: "Material íntegro conferido",
    });
    expect(await balance()).toBe(43);
    await action(keeper, {
      type: "replenishStock",
      code,
      warehouse: "Almoxarifado 1",
      quantity: 7,
      qrCode: code,
      reason: "Reposição direta do fornecedor",
    });
    expect(await balance()).toBe(50);
    await page.context().addCookies((await leader.storageState()).cookies);
    await page.goto("/department-head/requests");
    await expect(
      page.getByRole("heading", { name: "Solicitações do bloco", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator(`[data-request-id="${abnormal.ids[0]}"]`)
        .getByText("Parada de manutenção exige quantidade extra", {
          exact: false,
        }),
    ).toBeVisible();
    await page.goto("/department-head/materials");
    await expect(
      page.getByRole("heading", { name: "Materiais", exact: true }),
    ).toBeVisible();
    const row = page.locator("tbody tr").filter({ hasText: code });
    await expect(row).toContainText("10");
    await expect(row).toContainText("3");
    await expect(row).toContainText("7");
    await page.goto("/department-head/history");
    await expect(
      page.getByRole("heading", { name: "Histórico de entregas", exact: true }),
    ).toBeVisible();
    await expect(page.locator(`[data-request-id="${id}"]`)).toHaveCount(1);
    await expect(
      page.locator(`[data-request-id="${abnormal.ids[0]}"]`),
    ).toHaveCount(0);
    await page.context().clearCookies();
    await page.context().addCookies((await keeper.storageState()).cookies);
    await page.goto("/warehouse/requests");
    await expect(
      page.getByRole("heading", {
        name: "Requisições para atendimento",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(`[data-request-id="${id}"]`)).toHaveCount(0);
    const uiRequest = recurringIds[0];
    await page
      .locator(`[data-request-id="${uiRequest}"]`)
      .getByRole("button", { name: "Abrir atendimento" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: `Requisição #${uiRequest}`,
      exact: true,
    });
    await dialog.getByRole("button", { name: "Pegar para entrega" }).click();
    await dialog.getByLabel("Código conferido", { exact: true }).fill(code);
    await dialog.getByLabel("Quantidade separada", { exact: true }).fill("2");
    await dialog
      .getByRole("button", { name: "Confirmar retirada", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", {
        name: "Confirmar novamente e baixar estoque",
      }),
    ).toBeVisible();
    expect(await balance()).toBe(50);
    await dialog
      .getByRole("button", { name: "Confirmar novamente e baixar estoque" })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Confirmar entrega", exact: true }),
    ).toBeVisible();
    expect(await balance()).toBe(48);
    await dialog
      .getByRole("button", { name: "Confirmar entrega", exact: true })
      .click();
    await expect(dialog.getByText("Entregue", { exact: true })).toBeVisible();
    await dialog
      .getByRole("button", { name: `Fechar Requisição #${uiRequest}` })
      .click();
    await expect(page.locator(`[data-request-id="${uiRequest}"]`)).toHaveCount(
      0,
    );
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.screenshot({
      path: ".validation/workflow-results/warehouse-requests.png",
      fullPage: true,
    });
    await page.context().clearCookies();
    await page.context().addCookies((await employee.storageState()).cookies);
    await page.goto(`/catalogo/item/${code}`);
    await expect(page).toHaveURL(
      new RegExp(`/employee/request/material/${code}$`),
    );
    await page.getByRole("button", { name: "Requisitar este item" }).click();
    await page
      .getByRole("combobox", { name: "Requisitar por", exact: true })
      .selectOption("box");
    await page.getByLabel("Quantidade", { exact: true }).fill("2");
    await page.getByLabel("Confirme a quantidade", { exact: true }).fill("2");
    await page
      .getByLabel(/Justificativa/)
      .fill("Manutenção planejada para quantidade extraordinária");
    await page
      .getByRole("button", { name: "Confirmar requisição", exact: true })
      .click();
    await expect(page.getByText(/Requisição #\d+ registrada/)).toBeVisible();
    expect(
      (await snapshot(employee)).requests.filter(
        (r: { code: string }) => r.code === code,
      )[0],
    ).toMatchObject({ requestedUnit: "box", requestedAmount: 2, quantity: 10 });
    await page.getByRole("link", { name: "Ver minhas requisições" }).click();
    await expect(page).toHaveURL(/\/employee\/request#meus-pedidos$/);
    await expect(
      page.getByRole("heading", { name: "Meus pedidos", exact: true }),
    ).toBeVisible();

    const employeeNo = "00" + Date.now();
    await action(admin, {
      type: "saveUser",
      password: process.env.SEED_PASSWORD,
      user: {
        id: employeeNo,
        name: "Almoxarife com matrícula iniciada em zero",
        email: `${employeeNo}@workflow.example`,
        role: "Almoxarife",
        sector: "Logística",
        active: true,
      },
    });
    const zeroKeeper = await login(employeeNo);
    await action(zeroKeeper, { type: "claimRequest", id: recurringIds[1] });
    await page.context().clearCookies();
    await page.context().addCookies((await zeroKeeper.storageState()).cookies);
    await page.goto("/warehouse/requests");
    const ownRequest = page.locator(`[data-request-id="${recurringIds[1]}"]`);
    await expect(
      ownRequest.getByText("Atendimento assumido por você"),
    ).toBeVisible();
    await ownRequest.getByRole("button", { name: "Abrir atendimento" }).click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirmar retirada", exact: true }),
    ).toBeVisible();
  } finally {
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
  }
});

test("rotas REST seguem análise, reserva, retirada dupla, entrega e histórico", async ({
  playwright,
}) => {
  const contexts: APIRequestContext[] = [];
  const backend = "http://localhost:3106";
  async function login(identity: string) {
    const anonymous = await playwright.request.newContext({ baseURL: backend });
    contexts.push(anonymous);
    const response = await anonymous.post("/login", {
      data: { login: identity, password: process.env.SEED_PASSWORD },
    });
    expect(response.status(), await response.text()).toBe(200);
    const token = (await response.json()).data.token;
    const context = await playwright.request.newContext({
      baseURL: backend,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    contexts.push(context);
    return context;
  }
  async function post(
    context: APIRequestContext,
    path: string,
    payload: object = {},
    status = 200,
  ) {
    const response = await context.post(path, {
      data: { requestKey: randomUUID(), ...payload },
    });
    expect(response.status(), await response.text()).toBe(status);
    return (await response.json()).data;
  }
  try {
    const [employee, leader, keeper, admin] = await Promise.all(
      ["1001", "1002", "1003", "1004"].map(login),
    );
    const code = "REST-" + Date.now();
    const product = await post(
      admin,
      "/api/products",
      {
        code,
        name: code,
        qr_code: code,
        quantity: 20,
        location: "C1",
        pack_size: 2,
      },
      201,
    );
    const request = await post(
      employee,
      "/api/requests",
      {
        product_id: product.id,
        quantity: 2,
        requestedUnit: "box",
        description: "Atividade extraordinária autorizada",
      },
      201,
    );
    expect(request.quantity).toBe(4);
    const path = `/api/requests/${request.id}`;
    await post(employee, path + "/approve", {}, 403);
    expect((await post(leader, path + "/analyze")).status).toBe("Em análise");
    expect((await post(leader, path + "/approve")).status).toBe("Aprovada");
    await post(keeper, path + "/deliver", {}, 409);
    expect((await post(keeper, path + "/separate")).status).toBe(
      "Em separação",
    );
    await post(
      keeper,
      path + "/pickup/confirm",
      { qr_code: code, confirmed_quantity: 4, confirmation: randomUUID() },
      409,
    );
    const prepared = await post(keeper, path + "/pickup/prepare", {
      qr_code: code,
      confirmed_quantity: 4,
    });
    await post(keeper, path + "/pickup/confirm", {
      qr_code: code,
      confirmed_quantity: 4,
      confirmation: prepared.confirmation,
    });
    expect((await post(keeper, path + "/deliver")).status).toBe("Entregue");
    const history = await leader.get(
      "/department-head/history?status=Pendente",
    );
    expect(history.status()).toBe(200);
    const records = (await history.json()).data;
    expect(records.some((r: { id: number }) => r.id === request.id)).toBe(true);
    expect(
      records.every((r: { status: string }) => r.status === "Entregue"),
    ).toBe(true);
    const location = await keeper.get(`/api/products/${product.id}/location`);
    expect(location.status()).toBe(200);
    expect(
      (await location.json()).data.locations.reduce(
        (sum: number, r: { quantity: number }) => sum + Number(r.quantity),
        0,
      ),
    ).toBe(16);
    await post(keeper, path + "/deliver", {}, 409);
    const second = await post(
      employee,
      "/api/requests",
      {
        product_id: product.id,
        quantity: 1,
        description: "Requisição para análise de rejeição",
      },
      201,
    );
    expect(
      (
        await post(leader, `/api/requests/${second.id}/reject`, {
          notes: "Atividade não autorizada",
        })
      ).status,
    ).toBe("Rejeitada");
    const third = await post(
      employee,
      "/api/requests",
      {
        product_id: product.id,
        quantity: 1,
        description: "Retirada conferida pela rota de estoque",
      },
      201,
    );
    await post(leader, `/api/requests/${third.id}/approve`);
    await post(keeper, `/api/requests/${third.id}/separate`);
    const pick = await post(
      keeper,
      `/api/requests/${third.id}/pickup/prepare`,
      { qr_code: code, confirmed_quantity: 1 },
    );
    const locations = (await location.json()).data.locations;
    const source = locations.find(
      (r: { quantity: number }) => Number(r.quantity) > 0,
    ).warehouse_id;
    const out = {
      product_id: product.id,
      warehouse_id: source,
      request_id: third.id,
      qr_code: code,
      quantity: 1,
      confirmation: pick.confirmation,
    };
    const warehouses = (await (await keeper.get("/api/warehouses")).json())
      .data;
    const wrongSource = warehouses.find(
      (w: { id: number }) => w.id !== source,
    ).id;
    await post(
      keeper,
      "/api/stock/out",
      { ...out, warehouse_id: wrongSource },
      422,
    );
    await post(keeper, "/api/stock/out", out, 201);
    expect(
      (await post(keeper, `/api/requests/${third.id}/deliver`)).status,
    ).toBe("Entregue");
    const queue = await keeper.get("/warehouse/requests");
    expect(queue.status()).toBe(200);
    expect(
      (await queue.json()).data.every((r: { status: string }) =>
        [
          "Aprovada",
          "Em separação",
          "Em entrega",
          "Cancelamento solicitado",
        ].includes(r.status),
      ),
    ).toBe(true);
  } finally {
    await Promise.all(contexts.map((context) => context.dispose()));
  }
});
