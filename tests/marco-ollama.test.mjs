import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { ollamaConfig, chatBody, ollamaChat } from "../lib/marco-ollama.mjs";
import { createMarcoBridge } from "../scripts/marco-bridge.mjs";

const message = [{ role: "user", content: "Abra estoque" }];
async function listening(handler) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
const stop = async (server) => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
};
test("produção rejeita localhost, HTTP, credencial ausente e origens com credenciais", () => {
  for (const env of [
    { VERCEL: "1" },
    { VERCEL: "1", MARCO_OLLAMA_URL: "http://pc.example" },
    { MARCO_MODE: "bridge", MARCO_OLLAMA_URL: "https://pc.example" },
    { MARCO_OLLAMA_URL: "http://user:pass@127.0.0.1:11434" },
  ])
    assert.throws(() => ollamaConfig(env));
  assert.equal(
    ollamaConfig({
      VERCEL: "1",
      MARCO_OLLAMA_URL: "https://pc.example",
      MARCO_BRIDGE_TOKEN: "x".repeat(32),
    }).bridge,
    true,
  );
  for (const host of ["127.0.0.2", "192.168.1.2", "localhost.", "0.0.0.0"])
    assert.throws(() =>
      ollamaConfig({
        VERCEL: "1",
        MARCO_OLLAMA_URL: `https://${host}`,
        MARCO_BRIDGE_TOKEN: "x".repeat(32),
      }),
    );
  assert.throws(() => chatBody([{ role: "tool", content: "sql" }]));
  assert.throws(() =>
    chatBody([{ role: "user", content: "x", images: ["encoded-image"] }]),
  );
  assert.throws(() => chatBody([{ role: "user", content: "x".repeat(30000) }]));
});
test("streaming medido, resposta inválida, cancelamento e timeout", async () => {
  let mode = "ok";
  const fixture = await listening((_req, res) => {
    res.setHeader("Content-Type", "application/x-ndjson");
    if (mode === "slow") return;
    if (mode === "invalid") {
      res.end("{garbage}\n");
      return;
    }
    if (mode === "incomplete") {
      res.end(JSON.stringify({ message: { content: "{}" } }) + "\n");
      return;
    }
    res.end(
      JSON.stringify({
        message: { content: '{"steps":[{"action":"cart"}]}' },
      }) +
        "\n" +
        JSON.stringify({ done: true, eval_count: 10, load_duration: 1000000 }) +
        "\n",
    );
  });
  const config = { ...ollamaConfig({}), url: fixture.url, timeout: 100 };
  try {
    const result = await ollamaChat(message, undefined, config);
    assert.equal(JSON.parse(result.content).steps[0].action, "cart");
    assert.ok(result.metrics.modelFirstMs >= 0);
    assert.ok(result.metrics.modelTotalMs >= result.metrics.modelFirstMs);
    mode = "invalid";
    await assert.rejects(ollamaChat(message, undefined, config));
    mode = "incomplete";
    await assert.rejects(ollamaChat(message, undefined, config), /incompleta/);
    mode = "slow";
    await assert.rejects(ollamaChat(message, undefined, config), {
      name: "TimeoutError",
    });
    const controller = new AbortController();
    const pending = ollamaChat(message, controller.signal, {
      ...config,
      timeout: 1000,
    });
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
  } finally {
    await stop(fixture.server);
  }
  await assert.rejects(ollamaChat(message, undefined, config));
});
test("ponte: autenticação, rotas fechadas, contrato, tamanho, concorrência, options fixas e streaming", async () => {
  let upstreamBody, release;
  const fixture = await listening(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    upstreamBody = JSON.parse(Buffer.concat(chunks).toString());
    await new Promise((resolve) => {
      release = resolve;
    });
    res.end(
      JSON.stringify({
        message: { content: '{"steps":[{"action":"cart"}]}' },
        done: true,
      }) + "\n",
    );
  });
  const token = randomBytes(32).toString("hex");
  const bridge = createMarcoBridge({
    MARCO_BRIDGE_TOKEN: token,
    MARCO_LOCAL_OLLAMA_URL: fixture.url,
    MARCO_TIMEOUT_MS: "2000",
  });
  bridge.listen(0, "127.0.0.1");
  await once(bridge, "listening");
  const url = `http://127.0.0.1:${bridge.address().port}`,
    headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  const send = (body, extra = {}) =>
    fetch(url + "/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...extra,
    });
  try {
    assert.equal((await fetch(url + "/health")).status, 401);
    assert.equal((await fetch(url + "/api/pull", { headers })).status, 404);
    assert.equal((await send({ messages: message, tools: [] })).status, 422);
    assert.equal(
      (await send({ ...chatBody(message), model: "other" })).status,
      422,
    );
    assert.equal(
      (
        await send({
          ...chatBody(message),
          messages: [{ role: "user", content: "x".repeat(41000) }],
        })
      ).status,
      413,
    );
    const pending = send({
      ...chatBody(message),
      options: { num_predict: 9999999, num_ctx: 9999999 },
    });
    for (let i = 0; i < 100 && !release; i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(release);
    assert.equal((await send(chatBody(message))).status, 429);
    assert.equal(upstreamBody.options.num_predict, 512);
    assert.equal(upstreamBody.options.num_ctx, 4096);
    release();
    const response = await pending;
    assert.equal(response.status, 200);
    assert.match(await response.text(), /steps/);
  } finally {
    release?.();
    await stop(bridge);
    await stop(fixture.server);
  }
});
