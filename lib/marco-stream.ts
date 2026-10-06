export async function readMarcoReply<T>(
  response: Response,
  status: (phase: string) => void,
): Promise<T> {
  if (!response.headers.get("content-type")?.includes("application/x-ndjson"))
    return response.json();
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Resposta vazia.");
  const decoder = new TextDecoder();
  let buffer = "",
    bytes = 0,
    result: T | undefined;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 300000) throw new Error("Resposta longa demais.");
      buffer += decoder.decode(value, { stream: true });
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (
          event.type === "status" &&
          ["interpretando", "executando", "respondendo"].includes(event.phase)
        )
          status(event.phase);
        else if (event.type === "error")
          throw new Error(event.error || "Marco indisponível.");
        else if (event.type === "result") {
          if (result !== undefined) throw new Error("Resposta duplicada.");
          result = event.data;
        } else throw new Error("Resposta inválida.");
      }
    }
    if (result === undefined || buffer.trim())
      throw new Error(
        "Resposta interrompida. Consulte o resultado antes de reenviar uma ação.",
      );
    return result;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
