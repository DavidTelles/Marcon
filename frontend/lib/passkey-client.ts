export async function passkeyRequest<T>(body: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/passkey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.");
  }
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("O servidor retornou uma resposta inválida. Tente novamente em instantes.");
  }
  if (!response.ok) {
    const message = "error" in data && typeof data.error === "string" ? data.error : "O serviço de passkeys está indisponível. Tente novamente em instantes.";
    throw new Error(message);
  }
  return data as T;
}

export function passkeyError(cause: unknown): string {
  if (cause instanceof Error) {
    if (cause.name === "NotAllowedError") return "A verificação foi cancelada ou expirou. Tente novamente e confirme no dispositivo.";
    if (cause.name === "InvalidStateError") return "Este dispositivo já possui uma passkey cadastrada para esta conta. Use-a para entrar.";
    return cause.message;
  }
  return "Não foi possível concluir a verificação da passkey.";
}
