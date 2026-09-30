export async function faceRequest<T>(
  body?: object,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(
    "/api/login/face",
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal,
        }
      : { cache: "no-store", signal },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || typeof result !== "object")
    throw new Error(result?.error || "Não foi possível concluir a captura.");
  return result as T;
}
