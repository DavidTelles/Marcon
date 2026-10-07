import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
const require = createRequire(import.meta.url);
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
const original = Module._resolveFilename;
Module._resolveFilename = function (id, ...args) {
  return original.call(
    this,
    id.startsWith("@/") ? resolve(id.slice(2)) : id,
    ...args,
  );
};
const {
  parseJamesPlan,
  validateJamesIntent,
} = require("../lib/james-model.ts");
const { beginJamesForm, advanceJamesForm } = require("../lib/james-forms.ts");
const { parseJamesOperation } = require("../lib/james-operations.ts");
const { explicitOperation } = require("../lib/james-intents.ts");
const { explicitCartPlan } = require("../lib/james-commands.ts");
const { readMarcoReply } = require("../lib/marco-stream.ts");
const { marcoBody } = require("../lib/marco-body.ts");
test("contratos rejeitam código arbitrário, parâmetros inválidos, falsa execução e conversa misturada", () => {
  for (const value of [
    "bad",
    "null",
    '{"steps":[]}',
    '{"steps":[{"action":"sql","query":"DELETE"}]}',
    '{"steps":[{"action":"chat","answer":"Salvei tudo no banco"}]}',
    '{"steps":[{"action":"chat","answer":"Sua requisição foi enviada"}]}',
    '{"steps":[{"action":"chat","answer":"oi","operation":{"name":"approve","id":1}}]}',
    '{"steps":[{"action":"chat","answer":"oi"},{"action":"navigate","view":"estoque"}]}',
    '{"steps":[{"action":"navigate","view":"estoque","answer":"Abri o estoque"}]}',
    '{"steps":[{"action":"operation","operation":{"name":"approve","id":1}},{"action":"review"}]}',
    '{"steps":[{"action":"add","query":"A","quantity":2,"unit":"kg"}]}',
  ])
    assert.throws(() => parseJamesPlan(value));
  for (const operation of [
    { name: "sql" },
    { name: "approve", id: -1 },
    { name: "stockEntry", quantity: 0, code: "A" },
  ])
    assert.throws(() => parseJamesOperation(operation));
  assert.deepEqual(explicitOperation("Aprove a requisição 123"), {
    name: "approve",
    id: 123,
  });
  assert.ok(explicitCartPlan("Procure parafuso e mostre meu carrinho"));
});
test("interpretação natural respeita capacidades e não inventa argumentos de operações", () => {
  const context = {
    capabilities: ["navigate", "find", "add", "operation", "form"],
    destinations: ["pcp"],
    operations: ["stockEntry"],
    forms: ["stockEntry"],
  };
  const plan = parseJamesPlan(
    JSON.stringify({
      steps: [
        {
          action: "operation",
          operation: {
            name: "stockEntry",
            code: "A",
            quantity: 3,
            warehouse: "Central",
            reason: "contagem conferida",
          },
        },
      ],
    }),
  );
  const message =
    "Pode registrar três unidades do código A em Central? Motivo: contagem conferida";
  assert.doesNotThrow(() => validateJamesIntent(plan, message, context));
  const encoded = parseJamesPlan(
    JSON.stringify({
      steps: [
        {
          action: "operation",
          operation: {
            name: "stockEntry",
            code: "A",
            quantity: "3",
            warehouse: "Central",
            reason: "contagem conferida",
          },
        },
      ],
    }),
  );
  assert.equal(encoded[0].operation.quantity, 3);
  assert.deepEqual(
    parseJamesPlan(
      JSON.stringify({
        steps: [
          {
            action: "operation",
            operation: {
              name: "receiveTransfer",
              id: 9,
              quantity: 3,
              qrCode: "inventado",
            },
          },
        ],
      }),
    ),
    [{ action: "form", view: "receiveTransfer" }],
  );
  const shortName = parseJamesPlan(
    JSON.stringify({
      steps: [
        {
          action: "operation",
          operation: {
            name: "stockEntry",
            code: "A",
            quantity: 3,
            warehouse: "Central",
            reason: "contagem conferida",
          },
        },
      ],
    }),
  );
  validateJamesIntent(
    shortName,
    "registre 3 unidades de A em Central Principal, motivo: contagem conferida",
    { ...context, warehouses: ["Central Principal", "Central Reserva"] },
  );
  assert.equal(shortName[0].operation.warehouse, "Central Principal");
  assert.throws(
    () => validateJamesIntent(plan, message, { ...context, operations: [] }),
    /perfil/,
  );
  assert.throws(
    () =>
      validateJamesIntent(
        plan,
        "registre 30 unidades de A em Central por contagem conferida",
        context,
      ),
    /quantidade/,
  );
  assert.throws(
    () =>
      validateJamesIntent(
        plan,
        "registre 3 unidades de A em outro local por contagem conferida",
        context,
      ),
    /correspondem/,
  );
  assert.throws(
    () =>
      validateJamesIntent(
        [{ action: "navigate", view: "funcionarios" }],
        "abra funcionários",
        context,
      ),
    /perfil/,
  );
  assert.throws(
    () =>
      validateJamesIntent(
        [{ action: "form", view: "approve" }],
        "aprovar",
        context,
      ),
    /perfil/,
  );
  assert.throws(
    () =>
      validateJamesIntent(
        [{ action: "add", query: "A", quantity: 3, unit: "unit" }],
        "adicione 3 unidades de A",
        {},
      ),
    /perfil/,
  );
  assert.doesNotThrow(() =>
    validateJamesIntent(
      [{ action: "find", query: "" }],
      "quais itens estão disponíveis",
      context,
    ),
  );
  const initial = advanceJamesForm(beginJamesForm("approve"));
  assert.equal(initial.field, "id");
  assert.deepEqual(advanceJamesForm(initial, "77").operation, {
    name: "approve",
    id: 77,
  });
});
test("leitura limitada do corpo e streaming incompleto/erro não viram sucesso", async () => {
  const controller = new AbortController();
  const cancelled = new Request("http://localhost", {
    method: "POST",
    body: "{}",
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(marcoBody(cancelled), (error) => error.status === 504);
  await assert.rejects(
    marcoBody(
      new Request("http://localhost", { method: "POST", body: "x".repeat(50) }),
      40,
    ),
  );
  await assert.rejects(
    marcoBody(new Request("http://localhost", { method: "POST", body: "{" })),
  );
  const make = (data) =>
    new Response(data, { headers: { "Content-Type": "application/x-ndjson" } });
  await assert.rejects(
    readMarcoReply(make('{"type":"status","phase":"executando"}\n'), () => {}),
    /interrompida/,
  );
  await assert.rejects(
    readMarcoReply(
      make('{"type":"error","error":"Não executado"}\n'),
      () => {},
    ),
    /Não executado/,
  );
  assert.equal(
    (
      await readMarcoReply(
        make('{"type":"result","data":{"reply":"ok"}}\n'),
        () => {},
      )
    ).reply,
    "ok",
  );
});
test("navegador real: campos, seleção, revisão exata, cancelamento e duplicação", async () => {
  const { chromium } = require("@playwright/test");
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<main><form onsubmit="event.preventDefault(); window.submits=(window.submits||0)+1"><label>Nome<input name="nome" required></label><label>Local<select name="local"><option>Almoxarifado A</option><option>Almoxarifado B</option></select></label><label>Senha<input type="password" name="senha"></label><button>Salvar</button></form></main>',
    );
    const script = ts.transpileModule(readFileSync("lib/marco-ui.ts", "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText;
    const commands = ts.transpileModule(
      readFileSync("lib/james-commands.ts", "utf8"),
      {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
        },
      },
    ).outputText;
    await page.addScriptTag({
      content: `var require = () => window.marcoCommands; window.marcoCommands = (() => { const exports = {}; ${commands}; return exports; })(); var exports = {};\n${script}`,
    });
    const fill = await page.evaluate(() =>
      exports.marcoUICommand("preencha Nome com Teste"),
    );
    assert.match(fill.reply, /preenchido/);
    assert.equal(await page.locator("input[name=nome]").inputValue(), "Teste");
    await page.evaluate(() =>
      exports.marcoUICommand("selecione Local como Almoxarifado B"),
    );
    assert.equal(await page.locator("select").inputValue(), "Almoxarifado B");
    assert.match(
      (
        await page.evaluate(() =>
          exports.marcoUICommand("preencha Senha com secret"),
        )
      ).reply,
      /Não encontrei/,
    );
    assert.match(
      (await page.evaluate(() => exports.marcoUICommand("salvar"))).reply,
      /senha ou arquivo/,
    );
    await page
      .locator("input[type=password]")
      .evaluate((element) => element.remove());
    await page.evaluate(() => {
      window.review = exports.marcoUICommand("salvar");
    });
    assert.equal(await page.evaluate(() => window.submits || 0), 0);
    await page.evaluate(() =>
      exports.marcoUICommand("corrija Nome para Outro"),
    );
    assert.match(await page.evaluate(() => window.review.confirm()), /mudou/);
    assert.equal(await page.evaluate(() => window.submits || 0), 0);
    await page.evaluate(() => {
      window.review = exports.marcoUICommand("salvar");
    });
    assert.match(
      await page.evaluate(() => window.review.confirm()),
      /Ainda não há confirmação/,
    );
    assert.equal(await page.evaluate(() => window.submits), 1);
    await page.setContent(
      '<main><label>Nome<input value="atrás"></label><button disabled>Indisponível</button><article data-marco-record-kind="recebimento" data-marco-record-id="1">Recebimento 1<button onclick="window.pcpClicks=(window.pcpClicks||0)+1">Conferir</button></article><article data-marco-record-kind="recebimento" data-marco-record-id="2">Recebimento 2<button>Conferir</button></article><section role="dialog" aria-modal="true"><form onsubmit="event.preventDefault();window.pcpSaves=(window.pcpSaves||0)+1"><label>Quantidade física conferida<input name="q" required type="number" value="98"></label><label>Conferência concluída<input type="checkbox"></label><button>Confirmar operação</button></form></section></main>',
    );
    assert.match(
      (await page.evaluate(() => exports.marcoUICommand("preencha Nome com X")))
        .reply,
      /Não encontrei/,
    );
    await page.evaluate(() => {
      window.pcpReview = exports.marcoUICommand(
        "Marco, clique em Confirmar operação",
      );
    });
    assert.match(await page.evaluate(() => window.pcpReview.reply), /98/);
    assert.equal(await page.evaluate(() => window.pcpSaves || 0), 0);
    await page.evaluate(() =>
      exports.marcoUICommand(
        "preencha Quantidade física conferida com noventa e sete",
      ),
    );
    assert.equal(await page.locator('input[name="q"]').inputValue(), "97");
    await page.evaluate(() =>
      exports.marcoUICommand("marque Conferência concluída"),
    );
    assert.equal(
      await page.locator('input[type="checkbox"]').isChecked(),
      true,
    );
    assert.match(
      await page.evaluate(() => window.pcpReview.confirm()),
      /mudou/,
    );
    assert.equal(await page.evaluate(() => window.pcpSaves || 0), 0);
    await page.evaluate(() => {
      window.pcpReview = exports.marcoUICommand("salvar");
    });
    assert.match(
      await page.evaluate(() => window.pcpReview.confirm()),
      /enviado/,
    );
    assert.equal(await page.evaluate(() => window.pcpSaves), 1);
    assert.match(
      await page.evaluate(() => window.pcpReview.confirm()),
      /já foi solicitado/,
    );
    await page
      .locator('[role="dialog"]')
      .evaluate((element) => element.remove());
    assert.match(
      (await page.evaluate(() => exports.marcoUICommand("clique em Conferir")))
        .reply,
      /mais de um/,
    );
    await page.evaluate(() => {
      window.recordReview = exports.marcoUICommand(
        "clique em Conferir do recebimento 1",
      );
    });
    assert.match(
      await page.evaluate(() => window.recordReview.reply),
      /Recebimento 1/,
    );
    assert.equal(await page.evaluate(() => window.pcpClicks || 0), 0);
    await page.evaluate(() => window.recordReview.confirm());
    assert.equal(await page.evaluate(() => window.pcpClicks), 1);
    assert.match(
      (
        await page.evaluate(() =>
          exports.marcoUICommand("clique em Indisponível"),
        )
      ).reply,
      /Não encontrei/,
    );
    assert.match(
      await page.evaluate(() => window.review.confirm()),
      /já foi solicitado/,
    );
    assert.equal(await page.evaluate(() => window.submits), 1);
  } finally {
    await browser.close();
  }
});
