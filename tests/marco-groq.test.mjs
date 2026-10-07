import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import {
  groqConfig,
  chatBody,
  groqChat,
  marcoTelemetry,
  GROQ_BASE_URL,
} from "../lib/marco-groq.mjs";

const config = groqConfig({ GROQ_API_KEY: "gsk_fixture_not_a_real_secret" });
const messages = [
  { role: "system", content: "Responda em JSON." },
  { role: "user", content: "Olá" },
];
const answer = JSON.stringify({
  steps: [{ action: "chat", answer: "Olá, como posso ajudar?" }],
});
const event = (data) => `data: ${JSON.stringify(data)}\r\n\r\n`;
const stream =
  event({ choices: [{ delta: { content: answer.slice(0, 18) } }] }) +
  event({
    choices: [{ delta: { content: answer.slice(18) }, finish_reason: "stop" }],
    x_groq: { usage: { completion_tokens: 20 } },
  }) +
  "data: [DONE]\r\n\r\n";

test("Groq: configuração somente no servidor e contrato sem parâmetros Ollama", () => {
  assert.throws(() => groqConfig({}), /GROQ_API_KEY/);
  assert.throws(() =>
    groqConfig({ GROQ_API_KEY: "gsk_value\nAuthorization: bad" }),
  );
  assert.throws(() =>
    groqConfig({ GROQ_API_KEY: config.apiKey, GROQ_MODEL: "bad\nmodel" }),
  );
  assert.throws(() =>
    groqConfig({ GROQ_API_KEY: config.apiKey, MARCO_TIMEOUT_MS: "90000" }),
  );
  assert.equal(
    groqConfig({
      GROQ_API_KEY: config.apiKey,
      VERCEL: "1",
      MARCO_MODE: "bridge",
    }).model,
    config.model,
  );
  const body = chatBody(messages, config);
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.equal(body.max_completion_tokens, 1024);
  assert.equal(body.reasoning_effort, "low");
  assert.equal(
    "reasoning_effort" in
      chatBody(messages, { ...config, model: "other-model" }),
    false,
  );
  for (const key of [
    "format",
    "options",
    "think",
    "keep_alive",
    "apiKey",
    "tools",
  ])
    assert.equal(key in body, false);
  for (const bad of [
    [],
    [{ role: "tool", content: "sql" }],
    [{ role: "user", content: "x", images: ["file"] }],
    [{ role: "user", content: "x".repeat(30000) }],
  ])
    assert.throws(() => chatBody(bad, config));
});

test("Groq: SSE fragmentado/UTF-8, origem fixa, autenticação, progresso e métricas", async () => {
  const bytes = new TextEncoder().encode(stream);
  const metrics = {},
    phases = [];
  let cancelled = false;
  const result = await marcoTelemetry.run(
    { metrics, progress: (p) => phases.push(p) },
    () =>
      groqChat(messages, undefined, config, async (url, init) => {
        assert.equal(url, `${GROQ_BASE_URL}/chat/completions`);
        assert.equal(init.headers.Authorization, `Bearer ${config.apiKey}`);
        assert.equal(init.redirect, "error");
        assert.equal(
          JSON.stringify(JSON.parse(init.body)).includes(config.apiKey),
          false,
        );
        let offset = 0;
        return new Response(
          new ReadableStream({
            pull(controller) {
              if (offset === bytes.length) {
                controller.close();
                return;
              }
              const end = Math.min(offset + 3, bytes.length);
              controller.enqueue(bytes.slice(offset, end));
              offset = end;
            },
            cancel() {
              cancelled = true;
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        );
      }),
  );
  assert.equal(result.content, answer);
  assert.equal(result.metrics.tokens, 20);
  assert.ok(metrics.modelFirstMs >= 0);
  assert.ok(metrics.modelTotalMs >= metrics.modelFirstMs);
  assert.deepEqual(phases, ["respondendo"]);
  assert.equal(typeof cancelled, "boolean");
});

test("Groq: falhas não expõem credenciais e streams incompletos/truncados não viram sucesso", async () => {
  for (const status of [401, 403, 429, 404, 500]) {
    await assert.rejects(
      groqChat(
        messages,
        undefined,
        config,
        async () => new Response(config.apiKey, { status }),
      ),
      (e) => {
        assert.equal(e.status, status === 429 ? 429 : 503);
        assert.equal(e.message.includes(config.apiKey), false);
        return true;
      },
    );
  }
  const data = [
    event({ choices: [{ delta: { content: answer } }] }),
    event({
      choices: [{ delta: { content: answer }, finish_reason: "length" }],
    }) + "data: [DONE]\n\n",
    "data: {invalid}\n\n",
    event({ error: { message: config.apiKey } }),
    event({
      choices: [{ delta: { tool_calls: [{}] }, finish_reason: "tool_calls" }],
    }),
    stream + event({ choices: [{ delta: { content: "extra" } }] }),
    event({ choices: [{ delta: { content: "x".repeat(16001) } }] }),
    ":" + "x".repeat(200001),
  ];
  for (const body of data)
    await assert.rejects(
      groqChat(
        messages,
        undefined,
        config,
        async () =>
          new Response(body, {
            headers: { "Content-Type": "text/event-stream" },
          }),
      ),
      (e) => !e.message.includes(config.apiKey),
    );
  await assert.rejects(
    groqChat(messages, undefined, config, async () => new Response(answer)),
    /inválida/,
  );
});

test("Groq: cancelamento e timeout encerram conexão sem repetição automática", async () => {
  let requests = 0;
  const server = http.createServer(() => {
    requests++;
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const fetcher = (_url, init) =>
    fetch(`http://127.0.0.1:${server.address().port}`, init);
  try {
    await assert.rejects(
      groqChat(messages, undefined, { ...config, timeout: 100 }, fetcher),
      { name: "TimeoutError" },
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100);
    try {
      await assert.rejects(
        groqChat(messages, controller.signal, config, fetcher),
        { name: "AbortError" },
      );
    } finally {
      clearTimeout(timer);
    }
    assert.equal(requests, 2);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
