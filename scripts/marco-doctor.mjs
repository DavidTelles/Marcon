import nextEnv from "@next/env";
import { ollamaConfig } from "../lib/marco-ollama.mjs";
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const config = ollamaConfig();
if (config.bridge) {
  const response = await fetch(config.url + "/health", {
    headers: { Authorization: `Bearer ${config.token}` },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Ponte indisponível (${response.status}).`);
  console.log(JSON.stringify(await response.json(), null, 2));
} else {
  const get = async (path) => {
    const response = await fetch(config.url + path, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(`Ollama indisponível (${response.status}).`);
    return response.json();
  };
  const [version, tags, running] = await Promise.all([
    get("/api/version"),
    get("/api/tags"),
    get("/api/ps"),
  ]);
  if (!tags.models?.some((model) => model.name === config.model))
    throw new Error(
      `Modelo ${config.model} não instalado. Nenhum download foi iniciado.`,
    );
  const response = await fetch(config.url + "/api/show", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Não foi possível inspecionar o modelo.");
  const show = await response.json();
  console.log(
    JSON.stringify(
      {
        ollama: version.version,
        model: config.model,
        capabilities: show.capabilities,
        parameters: show.details?.parameter_size,
        quantization: show.details?.quantization_level,
        loaded: running.models?.some((model) => model.name === config.model),
        execution:
          "Intenções validadas; chamadas de ferramentas do modelo desativadas após avaliação.",
      },
      null,
      2,
    ),
  );
}
