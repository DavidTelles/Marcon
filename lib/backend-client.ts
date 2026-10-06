import { cookies } from "next/headers";
import { backendTarget } from "./backend-config.mjs";

// Cliente server-side do backend MARCON (integrado ou API Express externa).
// O JWT do usuário é emitido pelo backend no login e guardado em cookie httpOnly.
export const apiTokenCookie = "marcon_api_token";

export function backendUrl() {
  return backendTarget();
}

export async function apiToken(): Promise<string | undefined> {
  return (await cookies()).get(apiTokenCookie)?.value;
}

export class BackendError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type Options = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string;
};

export async function backendFetch<T = unknown>(
  path: string,
  { method = "GET", body, token }: Options = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  let response: Response;
  let target: string | null;
  try {
    target = backendUrl();
  } catch (error) {
    throw new BackendError((error as Error).message, 503);
  }
  try {
    if (target === null) {
      const { embeddedRequest } = await import("../backend/embedded.js");
      const result = await embeddedRequest(path, { method, body, token });
      response = Response.json(result.body, { status: result.status });
    } else
      response = await fetch(`${target}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(25000),
      });
  } catch {
    throw new BackendError(
      target === null
        ? "Backend integrado indisponível. Verifique DATABASE_URL, JWT_SECRET e as migrações."
        : "API do backend MARCON indisponível. Verifique BACKEND_URL e o backend publicado.",
      503,
    );
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    if (response.ok && response.status !== 204)
      throw new BackendError(
        "O backend respondeu sem JSON válido. BACKEND_URL deve apontar para a API, ou use embedded.",
        502,
      );
  }
  if (!response.ok) {
    const message =
      (data as { error?: string; message?: string } | null)?.error ||
      (data as { message?: string } | null)?.message ||
      "Falha na API MARCON.";
    throw new BackendError(message, response.status);
  }
  // Endpoints clássicos usam o envelope { ok, data }; os de workspace retornam o contrato cru.
  const envelope = data as { ok?: boolean; data?: unknown } | null;
  if (envelope && envelope.ok === true && "data" in envelope) {
    return envelope.data as T;
  }
  return data as T;
}
