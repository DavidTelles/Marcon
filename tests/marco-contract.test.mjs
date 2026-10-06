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
const { parseJamesPlan } = require("../lib/james-model.ts");
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
    '{"steps":[{"action":"chat","answer":"oi","operation":{"name":"approve","id":1}}]}',
    '{"steps":[{"action":"chat","answer":"oi"},{"action":"navigate","view":"estoque"}]}',
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
test("leitura limitada do corpo e streaming incompleto/erro não viram sucesso", async () => {
  const controller = new AbortController();
  const cancelled = new Request("http://localhost", { method: "POST", body: "{}", signal: controller.signal });
  controller.abort();
  await assert.rejects(marcoBody(cancelled), error => error.status === 504);
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
    await page.addScriptTag({ content: "var exports = {};\n" + script });
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
    assert.match(
      await page.evaluate(() => window.review.confirm()),
      /já foi solicitado/,
    );
    assert.equal(await page.evaluate(() => window.submits), 1);
  } finally {
    await browser.close();
  }
});
