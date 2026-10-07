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
export const DEFAULT_GROQ_MODEL: string;
export const GROQ_BASE_URL: string;
export class GroqError extends Error {
  status: number;
  constructor(message: string, status?: number);
}
export type GroqConfig = {
  apiKey: string;
  model: string;
  timeout: number;
  predict: number;
};
export function groqConfig(env?: NodeJS.ProcessEnv): GroqConfig;
export function groqStatusError(status: number): GroqError;
export function chatBody(
  messages: { role: string; content: string }[],
  config?: GroqConfig,
): Record<string, unknown>;
export function groqChat(
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
  config?: GroqConfig,
  fetcher?: typeof fetch,
): Promise<{ content: string; metrics: MarcoMetrics }>;
