import { cookies } from "next/headers";

// Cliente server-side para a API REST do backend MARCON (Express).
// O JWT do usuário é emitido pelo backend no login e guardado em cookie httpOnly.
export const apiTokenCookie = "marcon_api_token";

export function backendUrl() {
  const url = new URL(process.env.BACKEND_URL || "http://localhost:3001");
  if (
    process.env.VERCEL &&
    (url.protocol !== "https:" ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  )
    throw new Error(
      "Configure BACKEND_URL HTTPS do backend publicado na Vercel.",
    );
  if (url.username || url.password || url.search || url.hash)
    throw new Error("BACKEND_URL inválida.");
  return url.href.replace(/\/+$/, "");
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
  try {
    response = await fetch(`${backendUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw new BackendError(
      "API do backend MARCON indisponível. Verifique se ela está em execução (BACKEND_URL).",
      503,
    );
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
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
