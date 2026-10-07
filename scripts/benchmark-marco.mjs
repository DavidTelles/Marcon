import { mkdir, writeFile, readFileSync } from "node:fs";
import { promisify } from "node:util";
import { createRequire, Module } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";
import nextEnv from "@next/env";
import { marcoTelemetry, groqConfig } from "../lib/marco-groq.mjs";
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
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
const { jamesPlan } = require("../lib/james-model.ts");
const config = groqConfig();
const cases = [
  [
    "Explique em uma frase o que é um almoxarifado",
    (s) => /material|armazen|estoque/i.test(s.answer),
  ],
  [
    "Quero aquele material do outro dia",
    (s) => /qual|código|nome|especif|identific/i.test(s.answer),
  ],
  [
    "Qual é o saldo do produto 1794?",
    (s) => !/\b\d+\s*(unidades|peças)\b/i.test(s.answer),
  ],
];
const results = [];
for (const [message, expected] of cases) {
  const metrics = {},
    started = performance.now();
  let steps, error;
  try {
    steps = await marcoTelemetry.run({ metrics }, () =>
      jamesPlan(message, { cart: [] }, new AbortController().signal),
    );
  } catch (failure) {
    error = failure.message;
  }
  const passed = Boolean(
    steps?.length === 1 && steps[0].action === "chat" && expected(steps[0]),
  );
  results.push({
    message,
    passed,
    steps,
    error,
    ...metrics,
    elapsedMs: Math.round(performance.now() - started),
  });
  console.log(
    `${passed ? "PASS" : "FAIL"}: ${message}; ${JSON.stringify(metrics)}${error ? "; " + error : ""}`,
  );
}
await promisify(mkdir)(".validation/marco", { recursive: true });
await promisify(writeFile)(
  ".validation/marco/groq-model.json",
  JSON.stringify(
    {
      date: new Date().toISOString(),
      provider: "groq",
      model: config.model,
      results,
      note: "Inferência real pelo contrato jamesPlan. Sem dados de produção, operação de negócio ou gravação no banco.",
    },
    null,
    2,
  ),
);
if (results.some((r) => !r.passed)) process.exitCode = 1;
