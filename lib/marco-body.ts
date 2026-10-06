import { ActionError } from "./permissions";

export async function marcoBody(request: Request, limit = 40000) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new ActionError("Mensagem muito longa.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ActionError("Mensagem vazia.", 422);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10000)]);
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    if (signal.aborted) cancel();
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ActionError("Mensagem muito longa.", 413);
      }
      parts.push(value);
    }
    signal.throwIfAborted();
    return JSON.parse(Buffer.concat(parts, size).toString("utf8"));
  } catch (error) {
    if (error instanceof ActionError) throw error;
    if (signal.aborted)
      throw new ActionError(
        "Leitura da mensagem interrompida ou tempo limite excedido.",
        504,
      );
    throw new ActionError("Mensagem inválida.", 422);
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
