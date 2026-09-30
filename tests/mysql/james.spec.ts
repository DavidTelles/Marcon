import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import mysql from "mysql2/promise";
import { databaseConfig } from "../../lib/db-config.mjs";
import {
  wakeCommand,
  explicitConfirmation,
  speechText,
  choiceIndex,
} from "../../lib/james-voice";
import { jamesPlan } from "../../lib/james-model";
let server: Server;
let mode = "ok";
let lastModel = "";
const pool = mysql.createPool(databaseConfig());
const suffix = Date.now().toString(36),
  a = "JA-" + suffix,
  b = "JB-" + suffix;
const ids: number[] = [];
const tokens: string[] = [];
test.beforeAll(async () => {
  for (const [code, name, pack] of [
    [a, "Parafuso James " + suffix, 2],
    [b, "Porca James " + suffix, 1],
  ] as const) {
    const [r] = await pool.execute<mysql.ResultSetHeader>(
      "INSERT INTO parts(code,qr_code,name,location,pack_size) VALUES(?,?,?,?,?)",
      [code, code, name, "Teste James", pack],
    );
    ids.push(r.insertId);
    await pool.execute(
      "INSERT INTO inventory(part_id,warehouse_id,quantity) SELECT ?,id,200 FROM warehouses WHERE is_central=TRUE",
      [r.insertId],
    );
  }
  server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    lastModel = raw;
    const msg = JSON.parse(
      JSON.parse(raw).messages.at(-1).content,
    ).message.toLowerCase();
    if (mode === "timeout") return;
    if (mode === "slow") await new Promise((r) => setTimeout(r, 1500));
    if (mode === "error") {
      res.writeHead(503);
      res.end();
      return;
    }
    let steps: unknown[] = [{ action: "help" }];
    if (msg.includes("7 caixas"))
      steps = [
        { action: "add", query: a, quantity: 7, unit: "package" },
        { action: "add", query: b, quantity: 10, unit: "unit" },
        { action: "cart" },
        ...(msg.includes("faça") ? [{ action: "review" }] : []),
      ];
    else if (msg.includes("troque"))
      steps = [{ action: "set", query: a, quantity: 5, unit: "package" }];
    else if (msg.includes("ambiguo"))
      steps = [{ action: "add", query: "James", quantity: 1, unit: "unit" }];
    else if (msg.includes("exportar"))
      steps = [
        {
          action: "export",
          view: msg.includes("estoque") ? "estoque" : "requisicoes",
          format: msg.includes("planilha") ? "xlsx" : "pdf",
        },
      ];
    else if (msg.includes("acompanhe"))
      steps = [
        {
          action: "requests",
          filters: msg.includes("outro bloco")
            ? { block: "Bloco B" }
            : undefined,
        },
      ];
    else if (msg.includes("abra recomendações"))
      steps = [{ action: "navigate", view: "recomendacoes" }];
    else if (msg.includes("dashboard"))
      steps = [
        {
          action: "dashboard",
          view: msg.includes("geral") ? "geral" : undefined,
          filters: msg.includes("fora do bloco")
            ? { block: "Bloco B" }
            : msg.includes("filtrado")
              ? { priority: "Urgente" }
              : undefined,
        },
      ];
    else if (msg.includes("procure")) steps = [{ action: "find", query: a }];
    else if (msg.includes("modelo malicioso"))
      steps = [{ action: "executeSQL", query: "DELETE FROM inventory" }];
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        message: {
          content: JSON.stringify({ steps }),
          thinking: "SEGREDO_INTERNO",
        },
      }),
    );
  });
  await new Promise<void>((r) => server.listen(11435, "127.0.0.1", r));
});
test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  for (const token of tokens) {
    const key = JSON.parse(
      Buffer.from(token.split(".")[0], "base64url").toString(),
    ).key;
    await pool.execute("DELETE FROM request_submissions WHERE request_key=?", [
      key,
    ]);
  }
  for (const id of ids) {
    await pool.execute(
      "DELETE FROM audit_log WHERE entity_type='request' AND entity_id IN (SELECT id FROM requests WHERE part_id=?)",
      [id],
    );
    await pool.execute("DELETE FROM requests WHERE part_id=?", [id]);
    await pool.execute("DELETE FROM inventory WHERE part_id=?", [id]);
    await pool.execute("DELETE FROM parts WHERE id=?", [id]);
  }
  await pool.end();
});
test("OpenAI adapter: secret stays in backend, fixed endpoint/model and no reasoning output", async () => {
  const oldModel = process.env.OPENAI_MODEL,
    oldKey = process.env.OPENAI_API_KEY,
    original = global.fetch;
  try {
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_API_KEY;
    await expect(
      jamesPlan("oi", {}, new AbortController().signal),
    ).rejects.toThrow("OPENAI_API_KEY");
    process.env.OPENAI_API_KEY = "test-only-key";
    global.fetch = async (url, options) => {
      expect(String(url)).toBe(
        "https://api.openai.com/v1/chat/completions",
      );
      expect(new Headers(options?.headers).get("Authorization")).toBe(
        "Bearer test-only-key",
      );
      expect(JSON.parse(String(options?.body)).model).toBe("gpt-4.1-mini");
      expect(JSON.parse(String(options?.body)).response_format).toEqual({ type: "json_object" });
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                steps: [{ action: "find", query: "parafuso" }],
              }),
              reasoning_content: "NEVER_SHOW_REASONING",
            },
          },
        ],
      });
    };
    expect(
      await jamesPlan("procure parafuso", {}, new AbortController().signal),
    ).toEqual([{ action: "find", query: "parafuso" }]);
  } finally {
    global.fetch = original;
    if (oldModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = oldModel;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});
test("wake words and explicit confirmation never infer consent", () => {
  for (const name of ["James", "Jhames", "Jeimes", "Djeimes"])
    expect(wakeCommand(name + ", procure porcas")).toBe("procure porcas");
  expect(wakeCommand("conversa qualquer")).toBeNull();
  expect(wakeCommand("James")).toBe("");
  expect(wakeCommand("Bom dia, Jhames")).toBe("Bom dia");
  expect(wakeCommand("conversa ambiente, James, procure porcas")).toBe(
    "procure porcas",
  );
  expect(choiceIndex("escolha a segunda")).toBe(1);
  expect(choiceIndex("quero a terceira opção")).toBe(2);
  expect(choiceIndex("não escolha a segunda")).toBeNull();
  expect(explicitConfirmation("Confirmar requisição")).toBe(true);
  expect(explicitConfirmation("sim")).toBe(false);
  expect(explicitConfirmation("não confirmar requisição")).toBe(false);
  expect(speechText("14 un. 1 kg; 2 m. UN-001")).toBe(
    "14 unidades. 1 quilograma; 2 metros. UN-001",
  );
});
test("real cart, packages, correction, ambiguity, signed confirmation and single submission", async ({
  request,
}) => {
  const headers = { origin: "http://localhost:3101" };
  const post = (data: unknown) =>
    request.post("/api/james/chat", { data, headers });
  expect((await post({ message: "oi", cart: [] })).status()).toBe(401);
  await request.post("/api/login", {
    data: { identity: "1001", password: process.env.SEED_PASSWORD },
    headers,
  });
  let r = await post({
    message: `adicione 7 caixas do c?digo ${a} e 10 unidades do c?digo ${b}; mostre meu carrinho`,
    cart: [],
  });
  expect(r.status(), await r.text()).toBe(200);
  let data = await r.json();
  expect(data.cart.map((e: { quantity: number }) => e.quantity)).toEqual([
    14, 10,
  ]);
  expect(data.confirmationToken).toBeUndefined();
  expect(JSON.stringify(data)).not.toContain("SEGREDO_INTERNO");
  r = await post({ message: "troque as caixas para 5", cart: data.cart });
  data = await r.json();
  expect(data.cart.find((e: { code: string }) => e.code === a).quantity).toBe(
    10,
  );
  const ambiguous = await (
    await post({ message: "item ambiguo", cart: data.cart })
  ).json();
  expect(ambiguous.choices.length).toBe(2);
  expect(ambiguous.cart).toEqual(data.cart);
  const review = await (
    await post({ message: "faca a requisicao", cart: data.cart })
  ).json();
  expect(review.confirmationToken).toBeTruthy();
  tokens.push(review.confirmationToken);
  const confirm = {
    mode: "confirm",
    token: review.confirmationToken,
    confirmation: "confirmar requisicao",
  };
  expect((await post({ ...confirm, confirmation: "sim" })).status()).toBe(400);
  expect(
    (
      await post({ ...confirm, token: review.confirmationToken + "tamper" })
    ).status(),
  ).toBe(403);
  const first = await (await post(confirm)).json();
  const again = await (await post(confirm)).json();
  expect(first.submitted).toBe(true);
  expect(again.result.ids).toEqual(first.result.ids);
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) total FROM requests WHERE part_id IN (?,?)",
    ids,
  );
  expect(Number(rows[0].total)).toBe(2);
  const [balances] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT quantity FROM inventory WHERE part_id IN (?,?)",
    ids,
  );
  expect(balances.map((r) => r.quantity)).toEqual([200, 200]);
  expect((await post({ message: "modelo malicioso", cart: [] })).status()).toBe(
    502,
  );
  mode = "error";
  expect((await post({ message: "procure", cart: [] })).status()).toBe(503);
  mode = "ok";
  for (const identity of ["1002", "1003", "1004"]) {
    await request.post("/api/login", {
      data: { identity, password: process.env.SEED_PASSWORD },
      headers,
    });
    expect(
      (await post({ message: "adicione 7 caixas", cart: [] })).status(),
    ).toBe(403);
    expect((await post(confirm)).status()).toBe(403);
    const dashboard = await post({ message: "dashboard", cart: [] });
    expect(dashboard.status()).toBe(200);
    const navigation = await (
      await post({ message: "abra dashboard", cart: [] })
    ).json();
    expect(navigation.navigate).toBe(true);
    expect(navigation.href).toMatch(
      /^\/(admin|warehouse|department-head)\/dashboard(?:\?|$)/,
    );
    const filtered = await (
      await post({ message: "abra dashboard filtrado", cart: [] })
    ).json();
    expect(
      new URL(filtered.href, "http://localhost:3101").searchParams.get(
        "priority",
      ),
    ).toBe("Urgente");
    if (identity === "1002") {
      expect(
        (await post({ message: "dashboard fora do bloco", cart: [] })).status(),
      ).toBe(403);
      expect((await dashboard.json()).dashboard.scope).toContain("A");
      expect(
        (await post({ message: "dashboard geral", cart: [] })).status(),
      ).toBe(403);
    }
  }
  expect(lastModel).not.toContain("NVIDIA_API_KEY");
  await request.post("/api/logout", { headers });
  expect((await post({ message: "oi", cart: [] })).status()).toBe(401);
});

test("operational tools: resolve ambiguity, chained review, authorized requests and real exports", async ({
  request,
}) => {
  const headers = { origin: "http://localhost:3101" };
  const post = (data: unknown) =>
    request.post("/api/james/chat", { headers, data });
  await request.post("/api/login", {
    headers,
    data: { identity: "1001", password: process.env.SEED_PASSWORD },
  });
  const ambiguous = await (
    await post({ message: "item ambiguo", cart: [] })
  ).json();
  expect(ambiguous.clarificationToken).toBeTruthy();
  expect(
    (
      await post({
        mode: "confirm",
        token: ambiguous.clarificationToken,
        confirmation: "confirmar requisicao",
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await post({
        message: "inventado",
        cart: [],
        clarificationToken: ambiguous.clarificationToken,
      })
    ).status(),
  ).toBe(422);
  const resolved = await (
    await post({
      message: a,
      cart: [],
      clarificationToken: ambiguous.clarificationToken,
    })
  ).json();
  expect(resolved.cart[0]).toMatchObject({ code: a, quantity: 1 });
  const ordinal = await (
    await post({
      message: "escolha a segunda",
      cart: [],
      clarificationToken: ambiguous.clarificationToken,
    })
  ).json();
  expect(ordinal.cart[0].code).toBe(ambiguous.choices[1].code);
  const chained = await (
    await post({
      message:
        "James, coloque 7 caixas de parafusos e 10 porcas no carrinho, mostre o pedido e faça a requisição",
      cart: [],
    })
  ).json();
  expect(chained.cart.map((e: { quantity: number }) => e.quantity)).toEqual([
    14, 10,
  ]);
  expect(chained.reply).toContain("justificativa");
  expect(chained.confirmationToken).toBeUndefined();
  const cancelled = await (
    await post({ message: "cancele", cart: chained.cart })
  ).json();
  expect(cancelled.cancelled).toBe(true);
  expect(cancelled.cart).toEqual(chained.cart);
  const tracking = await (
    await post({ message: "acompanhe minhas requisições", cart: [] })
  ).json();
  expect(Array.isArray(tracking.records)).toBe(true);
  expect(tracking.dashboard.scope).toContain("1001");
  const exported = await (
    await post({ message: "exportar requisições", cart: [] })
  ).json();
  const file = await request.get(exported.exportHref);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toContain("application/pdf");
  expect((await post({ message: "exportar estoque", cart: [] })).status()).toBe(
    403,
  );
  expect(
    (await post({ message: "abra recomendações", cart: [] })).status(),
  ).toBe(403);
  await request.post("/api/login", {
    headers,
    data: { identity: "1002", password: process.env.SEED_PASSWORD },
  });
  expect(
    (await post({ message: "acompanhe outro bloco", cart: [] })).status(),
  ).toBe(403);
  expect(
    (
      await post({
        message: a,
        cart: [],
        clarificationToken: ambiguous.clarificationToken,
      })
    ).status(),
  ).toBe(403);
  await request.post("/api/login", {
    headers,
    data: { identity: "1003", password: process.env.SEED_PASSWORD },
  });
  expect(
    (await (await post({ message: "abra recomendações", cart: [] })).json())
      .href,
  ).toBe("/warehouse/recommendations");
  const spreadsheet = await (
    await post({ message: "exportar estoque em planilha", cart: [] })
  ).json();
  const xlsx = await request.get(spreadsheet.exportHref);
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
});

test("pet preferences, contextual highlighting and safe placement", async ({
  page,
}) => {
  await page.request.post("/api/login", {
    data: { identity: "1001", password: process.env.SEED_PASSWORD },
    headers: { origin: "http://localhost:3101" },
  });
  await page.goto("/employee/request");
  await page.getByRole("button", { name: "Mostrar onde", exact: true }).click();
  await expect(page.locator("[data-james-highlight=true]")).toHaveCount(1);
  await expect(page.locator("[data-james-highlight=true]")).toHaveValue("");
  await page.getByRole("button", { name: "Abrir James" }).click();
  await page.getByText("Preferências do James", { exact: true }).click();
  await page.getByLabel("Ficar parado", { exact: true }).check();
  await page.getByLabel("Silenciar dicas", { exact: true }).check();
  await page.getByLabel("Posição do James").selectOption("left");
  await page.getByRole("button", { name: "Fechar James" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Abrir James" }).click();
  await page.getByText("Preferências do James", { exact: true }).click();
  await expect(
    page.getByLabel("Silenciar dicas", { exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("Posição do James")).toHaveValue("left");
  await page.getByRole("button", { name: "Fechar James" }).click();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator("[data-james-pet]").scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    await expect(
      page.getByRole("button", { name: "Abrir James" }),
    ).toBeInViewport();
    expect(
      await page.evaluate(() => {
        const p = document
          .querySelector("[data-james-pet]")!
          .getBoundingClientRect();
        return [...document.querySelectorAll("input,button,select,table,form")]
          .filter(
            (e) => !e.closest("[data-james-pet]") && e.getClientRects().length,
          )
          .every((e) => {
            const b = e.getBoundingClientRect();
            return (
              b.right <= p.left ||
              b.left >= p.right ||
              b.bottom <= p.top ||
              b.top >= p.bottom
            );
          });
      }),
    ).toBe(true);
    await page.screenshot({
      path: `test-results-mysql/james-pet-${width}.png`,
      animations: "disabled",
    });
  }
  await page.request.post("/api/login", {
    data: { identity: "1002", password: process.env.SEED_PASSWORD },
    headers: { origin: "http://localhost:3101" },
  });
  await page.goto("/department-head/dashboard");
  await page.getByRole("button", { name: "Abrir James" }).click();
  await page.getByText("Preferências do James", { exact: true }).click();
  await expect(
    page.getByLabel("Silenciar dicas", { exact: true }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Fechar James" }).click();
  const reportResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/api/operations?") &&
      r.url().includes("priority=Urgente") &&
      r.status() === 200,
  );
  await page.goto(
    "/department-head/dashboard?james=1&dashboard=bloco&priority=Urgente",
  );
  await reportResponse;
});
test("voice UI, wake, chained requests, cancel, local microphone cleanup and responsive controls", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class Recognition {
      processLocally = true;
      lang = "";
      continuous = true;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      static available() {
        return Promise.resolve("available");
      }
      start() {
        (
          window as unknown as { jamesRecognition: Recognition }
        ).jamesRecognition = this;
        (this as unknown as { onstart?: () => void }).onstart?.();
      }
      abort() {
        document.documentElement.dataset.micStopped = "true";
      }
    }
    Object.defineProperty(Recognition.prototype, "processLocally", {
      value: true,
      writable: true,
    });
    Object.defineProperty(window, "SpeechRecognition", {
      value: Recognition,
      configurable: true,
    });
  });
  const errors: string[] = [];
  page.on("response", async (response) => {
    if (
      response.url().endsWith("/api/james/chat") &&
      response.request().method() === "POST"
    ) {
      try {
        const data = await response.json();
        if (data.confirmationToken) tokens.push(data.confirmationToken);
      } catch {
        /* Aborted requests have no body. */
      }
    }
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Abrir James" })).toHaveCount(
    0,
  );
  await page.request.post("/api/login", {
    data: { identity: "1001", password: process.env.SEED_PASSWORD },
    headers: { origin: "http://localhost:3101" },
  });
  await page.goto("/employee/request");
  await page.getByRole("button", { name: "Abrir James" }).click();
  await page.getByLabel("Ler respostas com voz local").uncheck();
  for (const width of [320, 375, 640, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    const box = await page.getByRole("dialog").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    if ([768, 1440].includes(width))
      await page.screenshot({
        path: `test-results-mysql/james-${width}.png`,
        animations: "disabled",
      });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Ativar escuta" }).click();
  await expect(page.getByRole("status")).toContainText("Ouvindo localmente");
  await page.evaluate(() => {
    const r = (
      window as unknown as {
        jamesRecognition: {
          onsoundstart: () => void;
          onresult: (e: unknown) => void;
        };
      }
    ).jamesRecognition;
    r.onsoundstart();
    r.onresult({
      resultIndex: 0,
      results: {
        length: 1,
        0: { isFinal: false, 0: { transcript: "James, coloque sete caixas" } },
      },
    });
  });
  await expect(page.locator("[data-james-pet]")).toHaveAttribute(
    "data-hearing",
    "true",
  );
  await expect(
    page.getByText("Transcrição parcial: James, coloque sete caixas"),
  ).toBeVisible();
  const say = async (text: string) =>
    page.evaluate((text) => {
      const r = (
        window as unknown as {
          jamesRecognition: { onresult: (e: unknown) => void };
        }
      ).jamesRecognition;
      r.onresult({
        resultIndex: 0,
        results: { length: 1, 0: { isFinal: true, 0: { transcript: text } } },
      });
    }, text);
  await say(
    `Jhames, adicione 7 caixas do c?digo ${a} e 10 unidades do c?digo ${b}; mostre meu carrinho`,
  );
  await expect(page.getByText("Carrinho revisado")).toBeVisible();
  await say("troque as caixas para 5");
  await expect(
    page.getByText("Carrinho revisado", { exact: true }),
  ).toHaveCount(2);
  await say("faca a requisicao");
  await expect(
    page.getByRole("button", { name: "Confirmar requisição", exact: true }),
  ).toBeVisible();
  await say("cancelar");
  await expect(
    page.getByRole("button", { name: "Confirmar requisição", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("log")).toContainText("Envio cancelado");
  await say("faca a requisicao");
  await expect(
    page.getByRole("button", { name: "Confirmar requisição", exact: true }),
  ).toBeVisible();
  await say("confirmar requisição");
  await expect(page.getByRole("log")).toContainText("Protocolos:");
  await say("cancelar");
  await expect(page.getByRole("log")).toContainText(
    "Não há envio aguardando confirmação",
  );
  await page.evaluate(() => {
    Object.defineProperty(window.speechSynthesis, "getVoices", {
      configurable: true,
      value: () => [{ localService: true, lang: "pt-BR" }],
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: class {
        onend: (() => void) | null = null;
      },
    });
    Object.defineProperty(window.speechSynthesis, "speak", {
      configurable: true,
      value: (u: unknown) => {
        (window as unknown as { testUtterance: unknown }).testUtterance = u;
      },
    });
  });
  await page.getByLabel("Ler respostas com voz local").check();
  await say("James, procure parafusos");
  await expect(page.getByRole("status")).toContainText("Falando");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { jamesRecognition: { onresult: unknown } })
          .jamesRecognition.onresult,
    ),
  ).toBeNull();
  await page.getByRole("button", { name: "Interromper fala" }).click();
  await page.getByLabel("Ler respostas com voz local").uncheck();
  await page
    .getByRole("button", { name: "Minimizar e manter escuta nesta aba" })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Abrir James" }).click();
  await expect(page.getByRole("status")).toContainText("Ouvindo localmente");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: "test-results-mysql/james-voice-mobile.png" });
  await page
    .getByRole("button", { name: "Desligar escuta", exact: true })
    .click();
  expect(
    await page.evaluate(() => document.documentElement.dataset.micStopped),
  ).toBe("true");
  await page.getByRole("button", { name: "Ativar escuta" }).click();
  await page.evaluate(() =>
    (
      window as unknown as {
        jamesRecognition: { onerror: (e: { error: string }) => void };
      }
    ).jamesRecognition.onerror({ error: "not-allowed" }),
  );
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "not-allowed",
  );
  await page.evaluate(() => {
    Object.defineProperty(window, "SpeechRecognition", { value: undefined });
    Object.defineProperty(window, "webkitSpeechRecognition", {
      value: undefined,
      configurable: true,
    });
  });
  await page.getByRole("button", { name: "Ativar escuta" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "local indisponível",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Abrir James" })).toBeFocused();
  await page.request.post("/api/logout", {
    headers: { origin: "http://localhost:3101" },
  });
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Abrir James" })).toHaveCount(
    0,
  );
  expect(errors).toEqual([]);
});
test("chat buttons resolve ambiguity and download the real authorized report", async ({
  page,
}, info) => {
  await page.request.post("/api/login", {
    headers: { origin: "http://localhost:3101" },
    data: { identity: "1001", password: process.env.SEED_PASSWORD },
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/employee/request");
  await page.getByRole("button", { name: "Abrir James" }).click();
  await page.getByLabel("Ler respostas com voz local").uncheck();
  const input = page.getByLabel("Sua pergunta ou correção");
  mode = "slow";
  try {
    await input.fill("item ambiguo");
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Pedido recebido");
    await page.screenshot({ path: info.outputPath("processing-mobile.png") });
    await page
      .getByRole("button", {
        name: `1. ${a} · Parafuso James ${suffix}`,
        exact: true,
      })
      .click();
    await expect(page.getByRole("log")).toContainText("1 un no carrinho");
  } finally {
    mode = "ok";
  }
  await input.fill("exportar requisições");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar relatório", exact: true })
    .click();
  expect(await (await downloaded).failure()).toBeNull();
  const voiceEquivalentDownload = page.waitForEvent("download");
  await input.fill("baixar relatório");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  expect(await (await voiceEquivalentDownload).failure()).toBeNull();
  await input.fill("faca a requisicao");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirmar requisição", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("confirmation-mobile.png") });
  await page.getByRole("button", { name: "Cancelar envio" }).click();
  await expect(page.getByRole("log")).toContainText("Envio cancelado");
});

test("slow model timeout and simultaneous command protection", async ({
  request,
}) => {
  const headers = { origin: "http://localhost:3101" };
  await request.post("/api/login", {
    data: { identity: "1001", password: process.env.SEED_PASSWORD },
    headers,
  });
  mode = "timeout";
  const options = {
    data: { message: "procure", cart: [] },
    headers,
    timeout: 60000,
  };
  const first = request.post("/api/james/chat", options);
  await new Promise((r) => setTimeout(r, 1000));
  expect((await request.post("/api/james/chat", options)).status()).toBe(429);
  expect((await first).status()).toBe(504);
  mode = "ok";
});
