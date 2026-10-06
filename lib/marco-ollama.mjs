import { AsyncLocalStorage } from "node:async_hooks";

export const marcoTelemetry = new AsyncLocalStorage();
export const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["steps"],
  properties: {
    steps: {
      type: "array",
      minItems: 1,
      maxItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "answer"],
        properties: {
          action: { type: "string", enum: ["chat"] },
          answer: { type: "string", minLength: 1, maxLength: 1200 },
        },
      },
    },
  },
};

export function boundedInteger(value, fallback, min, max) {
  const n = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new Error("Configuração numérica do Marco inválida.");
  return n;
}

export function ollamaConfig(env = process.env) {
  const production = Boolean(env.VERCEL) || env.MARCO_MODE === "bridge";
  const url = new URL(env.MARCO_OLLAMA_URL || "http://127.0.0.1:11434");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const privateHost =
    /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(
      url.hostname,
    ) ||
    ["localhost", "localhost.", "[::1]", "[::]"].includes(url.hostname) ||
    url.hostname.endsWith(".localhost");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error(
      "MARCO_OLLAMA_URL deve conter apenas a origem do servidor.",
    );
  if (
    production &&
    (url.protocol !== "https:" ||
      privateHost ||
      (env.MARCO_BRIDGE_TOKEN || "").length < 32)
  )
    throw new Error(
      "Na Vercel configure uma ponte HTTPS externa e MARCO_BRIDGE_TOKEN com pelo menos 32 caracteres.",
    );
  if (!production && (!local || url.protocol !== "http:"))
    throw new Error(
      "O modo local permite somente Ollama HTTP no loopback; use MARCO_MODE=bridge para HTTPS.",
    );
  const model = env.MARCO_OLLAMA_MODEL?.trim() || "qwen3.5:0.8b";
  if (model.length > 120 || !/^[\w.:-]+$/.test(model))
    throw new Error("Nome do modelo Ollama inválido.");
  return {
    url: url.origin,
    bridge: production,
    token: production ? env.MARCO_BRIDGE_TOKEN : undefined,
    model,
    timeout: boundedInteger(env.MARCO_TIMEOUT_MS, 45000, 100, 45000),
    context: boundedInteger(env.MARCO_CONTEXT_TOKENS, 4096, 2048, 8192),
    predict: boundedInteger(env.MARCO_MAX_TOKENS, 512, 64, 768),
    keepAlive: boundedInteger(env.MARCO_KEEP_ALIVE_SECONDS, 300, 0, 1800),
  };
}

export function chatBody(messages, config = ollamaConfig()) {
  if (
    !Array.isArray(messages) ||
    messages.length < 1 ||
    messages.length > 8 ||
    messages.some(
      (m) =>
        !m ||
        Object.keys(m).some((key) => !["role", "content"].includes(key)) ||
        !["system", "user", "assistant"].includes(m.role) ||
        typeof m.content !== "string" ||
        m.content.length > 20000,
    ) ||
    JSON.stringify(messages).length > 28000
  )
    throw new Error("Contexto do Marco excedeu o limite.");
  return {
    model: config.model,
    messages,
    format: planSchema,
    stream: true,
    think: false,
    keep_alive: `${config.keepAlive}s`,
    options: {
      temperature: 0,
      num_ctx: config.context,
      num_predict: config.predict,
    },
  };
}

export async function ollamaChat(messages, signal, config = ollamaConfig()) {
  const started = performance.now(),
    scope = marcoTelemetry.getStore();
  const abort = AbortSignal.any([
    signal || new AbortController().signal,
    AbortSignal.timeout(config.timeout),
  ]);
  const headers = { "Content-Type": "application/json" };
  if (config.bridge) headers.Authorization = `Bearer ${config.token}`;
  const response = await fetch(`${config.url}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(chatBody(messages, config)),
    signal: abort,
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok || !response.body)
    throw new Error(
      response.status === 429
        ? "Ollama ocupado. Aguarde e tente novamente."
        : "Ollama indisponível. Verifique o PC, o modelo e a ponte.",
    );
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    content = "",
    size = 0,
    done = false,
    firstMs = null,
    stats = {};
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 200000)
        throw new Error("Resposta do Ollama excedeu o limite.");
      buffer += decoder.decode(chunk.value, { stream: true });
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        let data;
        try {
          data = JSON.parse(line);
        } catch {
          throw new Error("Resposta inválida do Ollama. Reformule o pedido.");
        }
        if (data.error)
          throw new Error("Ollama não conseguiu gerar a resposta.");
        if (done) throw new Error("Resposta extra após finalização.");
        const part = data.message?.content;
        if (part !== undefined && typeof part !== "string")
          throw new Error("Resposta inválida do Ollama.");
        if (part) {
          if (firstMs === null) {
            firstMs = Math.round(performance.now() - started);
            scope?.progress?.("respondendo");
          }
          content += part;
          if (content.length > 16000) throw new Error("Resposta longa demais.");
        }
        if (data.done === true) {
          if (data.done_reason === "length")
            throw new Error(
              "O modelo atingiu o limite de resposta. Reformule o pedido.",
            );
          done = true;
          stats = {
            loadMs: Math.round((data.load_duration || 0) / 1e6),
            tokens: data.eval_count || 0,
          };
        }
      }
    }
    if (!done || buffer.trim() || !content.trim())
      throw new Error("Resposta incompleta do Ollama. Reformule o pedido.");
    const metrics = {
      modelFirstMs: firstMs,
      modelTotalMs: Math.round(performance.now() - started),
      ...stats,
    };
    if (scope) Object.assign(scope.metrics, metrics);
    return { content, metrics };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
