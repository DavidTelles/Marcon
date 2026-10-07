import nextEnv from "@next/env";
import {
  groqConfig,
  GROQ_BASE_URL,
  groqStatusError,
} from "../lib/marco-groq.mjs";
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
try {
  const config = groqConfig();
  const response = await fetch(`${GROQ_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!response.ok) throw groqStatusError(response.status);
  const models = await response.json();
  if (
    !models.data?.some(
      (model) => model.id === config.model && model.active !== false,
    )
  )
    throw new Error("GROQ_MODEL não está disponível para esta credencial.");
  console.log(
    JSON.stringify(
      {
        provider: "groq",
        model: config.model,
        configured: true,
        available: true,
        execution:
          "Conversa via Groq; operações usam validação e confirmação no servidor.",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    error.name === "TypeError"
      ? "Não foi possível conectar à Groq."
      : error.message,
  );
  process.exitCode = 1;
}
