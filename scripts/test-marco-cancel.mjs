import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { ollamaChat, ollamaConfig } from "../lib/marco-ollama.mjs";
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const config = ollamaConfig();
if (config.bridge) throw new Error("Este teste requer o Ollama real local.");
const messages = [
  {
    role: "system",
    content:
      "Responda em português como JSON steps com action chat e answer. Explique em detalhes.",
  },
  {
    role: "user",
    content:
      "Explique detalhadamente como organizar um almoxarifado industrial.",
  },
];
const checks = [];
for (const type of ["cancel", "timeout"]) {
  const controller = new AbortController(),
    started = performance.now();
  const timer =
    type === "cancel" ? setTimeout(() => controller.abort(), 100) : null;
  let name;
  try {
    await ollamaChat(messages, controller.signal, {
      ...config,
      timeout: type === "timeout" ? 100 : 45000,
    });
  } catch (error) {
    name = error.name;
  } finally {
    if (timer) clearTimeout(timer);
  }
  assert.equal(name, type === "cancel" ? "AbortError" : "TimeoutError");
  const elapsedMs = Math.round(performance.now() - started);
  assert.ok(
    elapsedMs < 3000,
    "O cancelamento do cliente demorou mais que o esperado.",
  );
  checks.push({ type, name, elapsedMs });
  console.log(`PASS real Ollama ${type}: ${elapsedMs} ms`);
}
await mkdir(".validation/marco", { recursive: true });
await writeFile(
  ".validation/marco/cancellation.json",
  JSON.stringify(
    {
      date: new Date().toISOString(),
      model: config.model,
      checks,
      note: "Cancellation/timeout of real HTTP inference. No business action or database mutation.",
    },
    null,
    2,
  ),
);
