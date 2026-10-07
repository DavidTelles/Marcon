import { AsyncLocalStorage } from "node:async_hooks";

export const marcoTelemetry = new AsyncLocalStorage();
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export class GroqError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.name = "GroqError";
    this.status = status;
  }
}

function boundedInteger(value, fallback, min, max) {
  const n = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new Error("Configuração numérica do Marco inválida.");
  return n;
}

export function groqConfig(env = process.env) {
  const apiKey = env.GROQ_API_KEY?.trim();
  if (!apiKey || !/^gsk_[A-Za-z0-9_-]+$/.test(apiKey))
    throw new Error(
      "Configure GROQ_API_KEY no servidor para conversar com o Marco.",
    );
  const model = env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
  if (model.length > 120 || !/^[\w./:-]+$/.test(model))
    throw new Error("Nome do modelo Groq inválido.");
  return {
    apiKey,
    model,
    timeout: boundedInteger(env.MARCO_TIMEOUT_MS, 45000, 100, 45000),
    predict: boundedInteger(env.MARCO_MAX_TOKENS, 1024, 64, 4096),
  };
}

export function chatBody(messages, config = groqConfig()) {
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
    response_format: { type: "json_object" },
    stream: true,
    temperature: 0,
    max_completion_tokens: config.predict,
    ...(/^openai\/gpt-oss-(?:20b|120b)$/.test(config.model)
      ? { reasoning_effort: "low" }
      : {}),
  };
}

export function groqStatusError(status) {
  if (status === 401 || status === 403)
    return new GroqError(
      "A Groq recusou a credencial. Verifique GROQ_API_KEY e as permissões do projeto.",
    );
  if (status === 429)
    return new GroqError(
      "O limite de uso da Groq foi atingido. Aguarde e tente novamente.",
      429,
    );
  if (status === 400 || status === 404)
    return new GroqError(
      "A Groq recusou a configuração do modelo. Verifique GROQ_MODEL.",
    );
  return new GroqError("Groq indisponível. Tente novamente em instantes.");
}

// A origem é fixa: a credencial nunca é enviada a URLs vindas do navegador/env.
export async function groqChat(
  messages,
  signal,
  config = groqConfig(),
  fetcher = fetch,
) {
  const started = performance.now(),
    scope = marcoTelemetry.getStore();
  const abort = AbortSignal.any([
    signal || new AbortController().signal,
    AbortSignal.timeout(config.timeout),
  ]);
  const response = await fetcher(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(chatBody(messages, config)),
    signal: abort,
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw groqStatusError(response.status);
  }
  if (
    !response.body ||
    !response.headers.get("content-type")?.includes("text/event-stream")
  ) {
    await response.body?.cancel().catch(() => {});
    throw new GroqError("Resposta inválida da Groq. Reformule o pedido.");
  }
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    content = "",
    size = 0,
    done = false,
    finished = false;
  let firstMs = null,
    tokens = 0,
    eventData = [];
  const consumeEvent = () => {
    if (!eventData.length) return;
    const payload = eventData.join("\n");
    eventData = [];
    if (done) throw new GroqError("Resposta extra após finalização.");
    if (payload === "[DONE]") {
      done = true;
      return;
    }
    let data;
    try {
      data = JSON.parse(payload);
    } catch {
      throw new GroqError("Resposta inválida da Groq. Reformule o pedido.");
    }
    if (!data || typeof data !== "object" || data.error)
      throw new GroqError("Groq não conseguiu gerar a resposta.");
    const choice = data.choices?.[0];
    if (choice?.delta?.tool_calls || choice?.delta?.function_call)
      throw new GroqError("O modelo retornou uma operação não permitida.");
    const part = choice?.delta?.content;
    if (part !== undefined && part !== null && typeof part !== "string")
      throw new GroqError("Resposta inválida da Groq.");
    if (part) {
      if (finished) throw new GroqError("Resposta extra após finalização.");
      if (firstMs === null) {
        firstMs = Math.round(performance.now() - started);
        scope?.progress?.("respondendo");
      }
      content += part;
      if (content.length > 16000) throw new GroqError("Resposta longa demais.");
    }
    if (choice?.finish_reason) {
      if (choice.finish_reason !== "stop")
        throw new GroqError(
          choice.finish_reason === "length"
            ? "O modelo atingiu o limite de resposta. Reformule o pedido."
            : "A Groq não concluiu a resposta. Reformule o pedido.",
        );
      finished = true;
    }
    const usage = data.usage || data.x_groq?.usage;
    if (Number.isSafeInteger(usage?.completion_tokens))
      tokens = usage.completion_tokens;
  };
  const consumeLine = (line) => {
    if (!line) consumeEvent();
    else if (line.startsWith("data:"))
      eventData.push(line.slice(5).replace(/^ /, ""));
  };
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 200000)
        throw new GroqError("Resposta da Groq excedeu o limite.");
      buffer += decoder.decode(chunk.value, { stream: true });
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        consumeLine(buffer.slice(0, end).replace(/\r$/, ""));
        buffer = buffer.slice(end + 1);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consumeLine(buffer.replace(/\r$/, ""));
    consumeEvent();
    if (!done || !finished || !content.trim())
      throw new GroqError("Resposta incompleta da Groq. Reformule o pedido.");
    const metrics = {
      modelFirstMs: firstMs,
      modelTotalMs: Math.round(performance.now() - started),
      tokens,
    };
    if (scope) Object.assign(scope.metrics, metrics);
    return { content, metrics };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
