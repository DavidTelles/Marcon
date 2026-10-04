import { test, expect, type APIRequestContext } from "@playwright/test";
import neon, { type RowDataPacket } from "../neon-test-db";
import sharp from "sharp";
import type { FacilityGraph } from "../../lib/routing";
import { randomUUID } from "node:crypto";

test("logística real: sugestões, etapas concorrentes, rotas versionadas e saída recalculada", async ({
  playwright,
  page,
}) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(12000);
  const origin = "http://localhost:3101",
    contexts: APIRequestContext[] = [],
    pool = neon.createPool();
  const code = `LOG-${Date.now()}`;
  async function login(identity: string) {
    const ctx = await playwright.request.newContext({
      baseURL: origin,
      extraHTTPHeaders: { origin },
    });
    contexts.push(ctx);
    expect(
      (
        await ctx.post("/api/login", {
          data: { identity, password: process.env.SEED_PASSWORD },
        })
      ).status(),
    ).toBe(200);
    return ctx;
  }
  async function act(ctx: APIRequestContext, data: object, status = 200) {
    const r = await ctx.post("/api/workspace", {
      data: { requestKey: randomUUID(), ...data },
    });
    expect(r.status(), await r.text()).toBe(status);
    return r.json();
  }
  async function map(ctx: APIRequestContext, data: object, status = 200) {
    const r = await ctx.post("/api/maps", { data });
    expect(r.status(), await r.text()).toBe(status);
    return r.json();
  }
  async function balances() {
    const [r] = await pool.query<RowDataPacket[]>(
      "SELECT w.name,i.quantity FROM inventory i JOIN parts p ON p.id=i.part_id JOIN warehouses w ON w.id=i.warehouse_id WHERE p.code=? ORDER BY w.id",
      [code],
    );
    return Object.fromEntries(r.map((v) => [v.name, Number(v.quantity)]));
  }
  try {
    const [admin, staff, employee] = await Promise.all(
      ["1004", "1003", "1001"].map(login),
    );
    await act(staff, {
      type: "savePart",
      warehouse: "Central",
      localQuantity: 1000,
      part: {
        code,
        qrCode: code,
        name: code,
        location: "C1",
        packSize: 1,
        minimum: 2,
        localMinimum: 2,
        leadDays: 7,
        estimatedCost: 1,
      },
    });
    const [parts] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM parts WHERE code=?",
      [code],
    );
    const part = parts[0].id;
    const data = await (await admin.get("/api/maps")).json();
    const central = data.warehouses.find(
      (w: { name: string }) => w.name === "Central",
    ).id;
    const local = data.warehouses.find(
      (w: { name: string }) => w.name === "Almoxarifado 1",
    ).id;
    const block = data.blocks.find(
      (b: { name: string }) => b.name === "Bloco A",
    ).id;
    const [actors] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE employee_no='1003'",
    );
    await pool.execute(
      "INSERT INTO inventory(part_id,warehouse_id,quantity,minimum_quantity,capacity) VALUES(?,?,0,2,100)",
      [part, local],
    );
    // Historical fixture: actual withdrawal kind, distinct from request creation and returns.
    for (let day = 1; day <= 70; day++)
      await pool.execute(
        "INSERT INTO stock_movements(part_id,warehouse_id,kind,quantity,block_id,actor_id,created_at,reason) VALUES(?,?,'saida',1,?,?,UTC_TIMESTAMP()-(? * INTERVAL '1 day'),'Histórico de teste')",
        [part, central, block, actors[0].id, day],
      );
    const graph: FacilityGraph = {
      width: 100,
      height: 100,
      metersPerPixel: 0.1,
      scaleCalibrated: true,
      reviewed: true,
      walls: [],
      nodes: [
        {
          id: "a",
          label: "Central",
          kind: "warehouse",
          x: 0.1,
          y: 0.1,
          warehouseId: central,
        },
        {
          id: "b",
          label: "Local A",
          kind: "warehouse",
          x: 0.1,
          y: 0.9,
          warehouseId: local,
        },
        {
          id: "d",
          label: "Entrega A",
          kind: "delivery",
          x: 0.9,
          y: 0.9,
          blockId: block,
        },
        { id: "e", label: "Entrega extra", kind: "delivery", x: 0.9, y: 0.1 },
      ],
      edges: [
        { from: "a", to: "b", blocked: false },
        { from: "b", to: "d", blocked: false },
        { from: "a", to: "e", blocked: false },
        { from: "e", to: "d", blocked: false },
      ],
    };
    const image = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const saved = await admin.post("/api/maps", {
      multipart: {
        title: code,
        graph: JSON.stringify(graph),
        image: { name: "map.png", mimeType: "image/png", buffer: image },
      },
    });
    expect(saved.status(), await saved.text()).toBe(200);
    const version1 = (await saved.json()).id;
    await map(admin, { action: "publish", id: version1 });
    const from = new Date(Date.now() - 60 * 86400000)
        .toISOString()
        .slice(0, 10),
      to = new Date().toISOString().slice(0, 10);
    const response = await staff.get(
      `/api/operations?code=${code}&from=${from}&to=${to}`,
    );
    expect(response.status(), await response.text()).toBe(200);
    const report = await response.json(),
      suggestion = report.transfers.find(
        (t: { to: string }) => t.to === "Almoxarifado 1",
      );
    expect(suggestion).toBeTruthy();
    expect(suggestion.evidence.period).toEqual({ from, to });
    expect(suggestion.evidence.consumption[0].quantity).toBeGreaterThan(0);
    expect(suggestion.benefit).toContain("estimada");
    expect(suggestion.confidence).toBeTruthy();
    const planningQuery = `code=${code}&from=${from}&to=${to}`;
    const distribution = await (
      await staff.get(`/api/operations?planning=distribution&${planningQuery}`)
    ).json();
    const purchase = await (
      await staff.get(`/api/operations?planning=purchase&${planningQuery}`)
    ).json();
    expect(distribution.title).toBe("Recomendação de estoque");
    expect(purchase.title).toBe("Compra preditiva");
    expect(
      distribution.rows.find(
        (r: { warehouse: string }) => r.warehouse === "Almoxarifado 1",
      ).forecast,
    ).toBeGreaterThan(0);
    expect(
      purchase.rows.find(
        (r: { warehouse: string }) => r.warehouse === "Almoxarifado 1",
      ).forecast,
    ).toBe(0);
    expect(
      purchase.rows.find(
        (r: { warehouse: string }) => r.warehouse === "Central",
      ).forecast,
    ).toBeGreaterThan(0);
    expect(
      distribution.decisions.cards.every(
        (c: { action: string }) => c.action === "transfer",
      ),
    ).toBe(true);
    for (const purpose of ["purchase", "distribution"]) {
      expect(
        (
          await employee.get(`/api/operations?planning=${purpose}&format=xlsx`)
        ).status(),
      ).toBe(403);
      for (const format of ["pdf", "xlsx"])
        expect(
          (
            await staff.get(
              `/api/operations?planning=${purpose}&${planningQuery}&format=${format}`,
            )
          ).status(),
        ).toBe(200);
    }
    // Neither an unreviewed map nor blocked accesses may silently fall back to Central.
    try {
      for (const unavailable of [
        { ...graph, reviewed: false },
        { ...graph, edges: graph.edges.map((e) => ({ ...e, blocked: true })) },
      ]) {
        await pool.execute("UPDATE map_versions SET graph=? WHERE id=?", [
          JSON.stringify(unavailable),
          version1,
        ]);
        const missing = await (
          await staff.get(
            `/api/operations?planning=distribution&${planningQuery}`,
          )
        ).json();
        expect(missing.transfers).toEqual([]);
        const sameConsumption = await (
          await staff.get(`/api/operations?planning=purchase&${planningQuery}`)
        ).json();
        expect(
          sameConsumption.rows.map((r: { forecast: number }) => r.forecast),
        ).toEqual(purchase.rows.map((r: { forecast: number }) => r.forecast));
      }
    } finally {
      await pool.execute("UPDATE map_versions SET graph=? WHERE id=?", [
        JSON.stringify(graph),
        version1,
      ]);
    }
    const noHistory = await (
      await staff.get(
        `/api/operations?planning=distribution&code=${code}&from=2000-01-01&to=2000-01-02`,
      )
    ).json();
    expect(noHistory.transfers).toEqual([]);
    try {
      await pool.execute("UPDATE inventory SET quantity=0 WHERE part_id=?", [
        part,
      ]);
      const shortage = await (
        await staff.get(`/api/operations?planning=purchase&${planningQuery}`)
      ).json();
      expect(
        shortage.rows.find(
          (r: { warehouse: string }) => r.warehouse === "Central",
        ).buy,
      ).toBeGreaterThan(0);
      const minimumOnly = await (
        await staff.get(
          `/api/operations?planning=purchase&code=${code}&from=2000-01-01&to=2000-01-02`,
        )
      ).json();
      expect(
        minimumOnly.rows.every(
          (r: { buy: number; configuredMinimum: number; forecast: number }) =>
            r.buy >= r.configuredMinimum && r.forecast === 0,
        ),
      ).toBe(true);
    } finally {
      await pool.execute(
        "UPDATE inventory SET quantity=1000 WHERE part_id=? AND warehouse_id=?",
        [part, central],
      );
    }
    const shortFrom = new Date(Date.now() - 5 * 86400000)
      .toISOString()
      .slice(0, 10);
    const shortReport = await (
      await staff.get(`/api/operations?code=${code}&from=${shortFrom}&to=${to}`)
    ).json();
    expect(
      shortReport.rows.every(
        (r: { analysis: { days: number; confidence: string } }) =>
          r.analysis.days <= 6 &&
          r.analysis.confidence === "Dados insuficientes",
      ),
    ).toBeTruthy();
    const before = await balances(),
      transfer = {
        type: "transfer",
        code,
        from: "Central",
        to: "Almoxarifado 1",
        quantity: 5,
        reason: "Redistribuir conforme demanda",
        requestKey: crypto.randomUUID(),
      };
    await page.request.post("/api/login", {
      headers: { origin },
      data: { identity: "1003", password: process.env.SEED_PASSWORD },
    });
    await page.goto("/warehouse/dashboard?view=recomendacoes");
    await expect(page).toHaveURL(/\/warehouse\/recommendations/);
    await expect(
      page.getByRole("navigation", { name: "Dashboards", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", {
        name: "Recomendação de estoque",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByText("Filtros do relatório", { exact: true }).click();
    await page.getByLabel("Código do item", { exact: true }).fill(code);
    await page
      .getByRole("button", { name: "Aplicar filtros", exact: true })
      .click();
    const recommendations = page.getByRole("region", {
      name: "Recomendação de estoque",
      exact: true,
    });
    const filter = recommendations.getByRole("combobox", {
      name: "Filtrar sugestões",
      exact: true,
    });
    await expect(filter.locator('option[value="buy"]')).toHaveCount(0);
    await filter.selectOption("insufficient");
    await expect(
      recommendations.locator(".decision-card").first(),
    ).toContainText("Dados insuficientes");
    await filter.selectOption("transfer");
    const decision = recommendations
      .locator(".decision-card")
      .filter({ hasText: code })
      .first();
    await decision.getByText("Ver cálculo e dados", { exact: true }).click();
    await expect(decision.locator(".decision-calculation")).toContainText(
      "retiradas efetivas",
    );
    await expect(decision.locator(".decision-balance")).toContainText(
      "Após transferência",
    );
    await decision
      .getByRole("button", { name: "Ver rota", exact: true })
      .click();
    await expect(
      decision.getByRole("img", { name: "Planta publicada e percurso" }),
    ).toBeVisible();
    await expect(decision.getByRole("status")).toContainText("Mapa publicado");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await decision
        .locator(".decision-arrow")
        .first()
        .evaluate((e) => getComputedStyle(e).animationName),
    ).toBe("none");
    for (const width of [320, 375, 640, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBeTruthy();
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await decision.screenshot({
      path: "test-results-neon/recommendation-mobile.png",
      animations: "disabled",
    });
    const suggested = decision.getByRole("button", {
      name: "Solicitar transferência sugerida",
      exact: true,
    });
    await expect(suggested).toBeEnabled();
    await suggested.click();
    const submitted = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/workspace") && r.request().method() === "POST",
    );
    await page
      .getByRole("dialog", { name: "Confirmar operação", exact: true })
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    const result = await submitted;
    expect(result.status(), await result.text()).toBe(200);
    expect(await balances()).toEqual(before);
    await filter.selectOption("analysis");
    await expect(
      recommendations
        .locator(".ops-suggestion")
        .filter({ hasText: code })
        .first(),
    ).toContainText("Solicitada");
    await act(staff, {
      type: "cancelTransfer",
      id: (await result.json()).id,
      reason: "Fim do teste de solicitação sem scanner",
    });
    await filter.selectOption("history");
    await expect(
      recommendations
        .locator(".ops-suggestion")
        .filter({ hasText: code })
        .first(),
    ).toContainText("Cancelada");
    expect(
      (await employee.get("/api/workspace?transfers=1&mode=history")).status(),
    ).toBe(403);
    expect(
      (
        await staff.get("/api/operations?dashboard=estoque&decision=invalid")
      ).status(),
    ).toBe(400);
    await act(employee, transfer, 403);
    const { id } = await act(staff, transfer);
    await act(staff, transfer, 409);
    expect(await balances()).toEqual(before);
    await act(
      staff,
      { type: "receiveTransfer", id, qrCode: code, confirmedQuantity: 5 },
      409,
    );
    await act(
      staff,
      {
        type: "dispatchTransfer",
        id,
        qrCode: "INCORRETO",
        confirmedQuantity: 5,
      },
      422,
    );
    // Real UI performs the first dispatch and receipt, including explicit physical counts.
    await page.request.post("/api/login", {
      headers: { origin },
      data: { identity: "1003", password: process.env.SEED_PASSWORD },
    });
    await page.goto("/warehouse/stock/all/all");
    const card = page
      .locator(".ops-suggestion")
      .filter({ hasText: `#${id} · ${code}` });
    await card.getByRole("button", { name: "Conferir saída" }).click();
    const dialog = page.getByRole("dialog", { name: "Conferir transferência" });
    await dialog.getByLabel("Código conferido", { exact: true }).fill(code);
    await dialog.getByLabel("Quantidade conferida").fill("5");
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBeTruthy();
    }
    await dialog
      .getByRole("button", { name: "Confirmar saída", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    expect((await balances()).Central).toBe(995);
    expect((await balances())["Almoxarifado 1"]).toBe(0);
    await act(
      staff,
      { type: "dispatchTransfer", id, qrCode: code, confirmedQuantity: 5 },
      409,
    );
    await card.getByRole("button", { name: "Conferir recebimento" }).click();
    await dialog.getByLabel("Código conferido", { exact: true }).fill(code);
    await dialog.getByLabel("Quantidade conferida").fill("5");
    await dialog
      .getByRole("button", { name: "Confirmar recebimento", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    expect((await balances())["Almoxarifado 1"]).toBe(5);
    await act(
      staff,
      { type: "receiveTransfer", id, qrCode: code, confirmedQuantity: 5 },
      409,
    );
    const second = await act(staff, {
      ...transfer,
      requestKey: crypto.randomUUID(),
      quantity: 2,
    });
    const concurrent = await Promise.all(
      [1, 2].map(() =>
        staff.post("/api/workspace", {
          data: {
            type: "dispatchTransfer",
            id: second.id,
            qrCode: code,
            confirmedQuantity: 2,
          },
        }),
      ),
    );
    expect(concurrent.map((r) => r.status()).sort()).toEqual([200, 409]);
    const receive = await Promise.all(
      [1, 2].map(() =>
        staff.post("/api/workspace", {
          data: {
            type: "receiveTransfer",
            id: second.id,
            qrCode: code,
            confirmedQuantity: 2,
          },
        }),
      ),
    );
    expect(receive.map((r) => r.status()).sort()).toEqual([200, 409]);
    await act(
      staff,
      { ...transfer, requestKey: crypto.randomUUID(), quantity: 1000 },
      409,
    );
    const created = await act(employee, {
      type: "createRequests",
      entries: [
        {
          code,
          quantity: 2,
          priority: "Leve",
          justification: "Atividade técnica de teste",
        },
      ],
    });
    const requestId = created.ids[0];
    await act(admin, {
      type: "changeRequestStatus",
      id: requestId,
      status: "Aprovada",
    });
    const physical = await balances();
    await map(employee, { action: "planDelivery", requestId }, 403);
    const allocated = (
      await (await staff.get("/api/workspace")).json()
    ).requests.find((r: { id: number }) => r.id === requestId).allocations[0]
      .warehouse;
    const pickupId = data.warehouses.find(
      (w: { name: string }) => w.name === allocated,
    ).id;
    const pickupNode = graph.nodes.find((n) => n.warehouseId === pickupId)!;
    const plan = await map(staff, {
      action: "planDelivery",
      requestId,
      start: pickupNode.id,
      destinations: ["e"],
    });
    expect(plan.metric).toBe("m");
    expect(plan.route.stops).toContain("d");
    expect(plan.route.stops).toContain("e");
    const version2 = await map(admin, {
      action: "save",
      title: code + " bloqueio",
      baseId: version1,
      graph: {
        ...graph,
        edges: graph.edges.map((e) => ({
          ...e,
          blocked: e.from === "b" && e.to === "d",
        })),
      },
    });
    await map(admin, { action: "publish", id: version2.id });
    const departed = await map(staff, { action: "departDelivery", requestId });
    expect(departed.mapVersion).toBe(version2.id);
    expect(departed.route).toBeTruthy();
    expect(await balances()).toEqual(physical);
    expect(
      departed.route.nodes.some(
        (n: string, i: number, arr: string[]) =>
          (n === "b" && arr[i + 1] === "d") ||
          (n === "d" && arr[i + 1] === "b"),
      ),
    ).toBeFalsy();
    await map(staff, { action: "departDelivery", requestId }, 409);
    const history = await (
      await staff.get(`/api/maps?delivery=${requestId}`)
    ).json();
    expect(history.history).toHaveLength(2);
    expect(history.history[1].map_version_id).toBe(version1);
    expect(history.history[0].event).toBe("Saída");
    expect(
      (await employee.get(`/api/maps?delivery=${requestId}`)).status(),
    ).toBe(403);
    await act(staff, { type: "claimRequest", id: requestId });
    const prepared = await act(staff, {
      type: "preparePick",
      id: requestId,
      qrCode: code,
      confirmedQuantity: 2,
    });
    await act(staff, {
      type: "confirmPick",
      id: requestId,
      qrCode: code,
      confirmedQuantity: 2,
      confirmation: prepared.confirmation,
    });
    await act(staff, {
      type: "changeRequestStatus",
      id: requestId,
      status: "Entregue",
      qrCode: code,
      confirmedQuantity: 2,
    });
    const [audit] = await pool.query<RowDataPacket[]>(
      "SELECT action FROM audit_log WHERE entity_type='transfer' AND entity_id=? ORDER BY id",
      [id],
    );
    expect(audit.map((r) => r.action)).toEqual([
      "request",
      "dispatch",
      "receive",
    ]);
    const manualRequest = await act(employee, {
      type: "createRequests",
      entries: [
        {
          code,
          quantity: 1,
          priority: "Leve",
          justification: "Atividade técnica de teste",
        },
      ],
    });
    const manualId = manualRequest.ids[0];
    await act(admin, {
      type: "changeRequestStatus",
      id: manualId,
      status: "Aprovada",
    });
    // Isolated test DB fixture: no published map. Manual operation stays explicit.
    await pool.query(
      "UPDATE map_versions SET status='Arquivada' WHERE status='Publicada'",
    );
    const noMap = await map(staff, {
      action: "planDelivery",
      requestId: manualId,
    });
    expect(noMap.route).toBeNull();
    expect(noMap.reason).toContain("Operação manual");
    await map(staff, { action: "departDelivery", requestId: manualId }, 409);
    const manual = await map(staff, {
      action: "departDelivery",
      requestId: manualId,
      manual: true,
    });
    expect(manual.mapVersion).toBeNull();
    expect(manual.route).toBeNull();
  } finally {
    await Promise.all(contexts.map((c) => c.dispose()));
    await pool.end();
  }
});
