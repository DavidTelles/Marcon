export type MarcoMetrics = {
  modelFirstMs?: number | null;
  modelTotalMs?: number;
  loadMs?: number;
  tokens?: number;
  actionMs?: number;
  serverMs?: number;
};
export const marcoTelemetry: import("node:async_hooks").AsyncLocalStorage<{
  metrics: MarcoMetrics;
  progress?: (phase: string) => void;
}>;
export const planSchema: Record<string, unknown>;
export type OllamaConfig = {
  url: string;
  bridge: boolean;
  token?: string;
  model: string;
  timeout: number;
  context: number;
  predict: number;
  keepAlive: number;
};
export function boundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number;
export function ollamaConfig(env?: NodeJS.ProcessEnv): OllamaConfig;
export function chatBody(
  messages: { role: string; content: string }[],
  config?: OllamaConfig,
): Record<string, unknown>;
export function ollamaChat(
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
  config?: OllamaConfig,
): Promise<{ content: string; metrics: MarcoMetrics }>;
