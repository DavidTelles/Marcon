import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { once } from "node:events";
import {
  boundedInteger,
  chatBody,
  ollamaConfig,
  planSchema,
} from "../lib/marco-ollama.mjs";

// This is a constrained chat endpoint, never a transparent Ollama proxy.
export function createMarcoBridge(env = process.env) {
  const token = env.MARCO_BRIDGE_TOKEN || "";
  if (token.length < 32 || token.length > 512)
    throw new Error(
      "Defina MARCO_BRIDGE_TOKEN com 32–512 caracteres aleatórios.",
    );
  const expected = Buffer.from(`Bearer ${token}`);
  const config = ollamaConfig({
    ...env,
    VERCEL: "",
    MARCO_MODE: "local",
    MARCO_OLLAMA_URL: env.MARCO_LOCAL_OLLAMA_URL || "http://127.0.0.1:11434",
  });
  const limit = boundedInteger(env.MARCO_BRIDGE_CONCURRENCY, 1, 1, 2);
  let active = 0;
  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const fail = (status, error) => {
      if (!res.headersSent) {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error }));
      } else res.destroy();
    };
    const supplied = Buffer.from(req.headers.authorization || "");
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      fail(401, "Não autorizado.");
      req.resume();
      return;
    }
    if (req.method === "GET" && req.url === "/health") {
      res.end(JSON.stringify({ bridge: true, model: config.model, active }));
      return;
    }
    if (req.method !== "POST" || req.url !== "/api/chat") {
      fail(404, "Operação não disponível.");
      req.resume();
      return;
    }
    if (!req.headers["content-type"]?.startsWith("application/json")) {
      fail(415, "Use JSON.");
      req.resume();
      return;
    }
    if (active >= limit) {
      fail(429, "Ollama ocupado.");
      req.resume();
      return;
    }
    if (Number(req.headers["content-length"]) > 40000) {
      fail(413, "Requisição longa demais.");
      req.resume();
      return;
    }
    active++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeout);
    const disconnected = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", disconnected);
    req.on("aborted", disconnected);
    let upstreamReader;
    try {
      const chunks = [];
      let size = 0;
      // The deadline also bounds a slow client that never finishes its body.
      const abortRead = () => req.destroy();
      controller.signal.addEventListener("abort", abortRead, { once: true });
      try {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 40000) {
            fail(413, "Requisição longa demais.");
            req.resume();
            return;
          }
          chunks.push(chunk);
        }
      } finally {
        controller.signal.removeEventListener("abort", abortRead);
      }
      let input;
      try {
        input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        fail(422, "JSON inválido.");
        return;
      }
      const allowed = [
        "model",
        "messages",
        "format",
        "stream",
        "think",
        "keep_alive",
        "options",
      ];
      if (
        !input ||
        Array.isArray(input) ||
        Object.keys(input).some((k) => !allowed.includes(k)) ||
        input.model !== config.model ||
        input.stream !== true ||
        input.think !== false ||
        JSON.stringify(input.format) !== JSON.stringify(planSchema)
      ) {
        fail(422, "Contrato de chat inválido.");
        return;
      }
      let body;
      try {
        body = chatBody(input.messages, config);
      } catch {
        fail(422, "Mensagens inválidas ou longas demais.");
        return;
      }
      // Ignore client options: only this PC's configured resource limits apply.
      const upstream = await fetch(`${config.url}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
        redirect: "error",
      });
      if (!upstream.ok || !upstream.body) {
        fail(503, "Ollama local indisponível.");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      upstreamReader = upstream.body.getReader();
      let bytes = 0;
      while (true) {
        const { value, done } = await upstreamReader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 200000) throw new Error("Resposta longa.");
        if (!res.write(value))
          await Promise.race([
            once(res, "drain"),
            once(res, "close").then(() => {
              throw new Error("Desconectado.");
            }),
          ]);
      }
      res.end();
    } catch {
      fail(
        controller.signal.aborted ? 504 : 503,
        controller.signal.aborted
          ? "Tempo limite ou cancelamento."
          : "Ponte indisponível.",
      );
    } finally {
      clearTimeout(timer);
      controller.abort();
      await upstreamReader?.cancel().catch(() => {});
      active--;
      res.removeListener("close", disconnected);
      req.removeListener("aborted", disconnected);
    }
  });
  server.requestTimeout = 45000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 30;
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = boundedInteger(
    process.env.MARCO_BRIDGE_PORT,
    11435,
    1024,
    65535,
  );
  createMarcoBridge().listen(port, "127.0.0.1", () =>
    console.log(
      `Ponte Marco em http://127.0.0.1:${port}; somente loopback. Nenhum túnel iniciado.`,
    ),
  );
}
