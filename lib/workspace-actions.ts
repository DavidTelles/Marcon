import type { PoolConnection } from "./db-types";
import type { Account } from "./accounts";
import { ActionError } from "./permissions";
export { ActionError } from "./permissions";
import { apiToken, BackendError, backendFetch } from "./backend-client";

// As ações de negócio (requisições, estoque, transferências, devoluções,
// cadastros) são executadas pela API do backend MARCON. A assinatura aceita o
// terceiro parâmetro legado (conexão de transação), hoje ignorado: a
// atomicidade é garantida dentro do backend.
export async function executeWorkspaceAction(
  user: Account,
  input: unknown,
  _connection?: PoolConnection,
): Promise<Record<string, unknown>> {
  void user;
  if (!input || typeof input !== "object" || !("type" in input))
    throw new ActionError("Ação inválida.");
  const token = await apiToken();
  if (!token)
    throw new ActionError("Sessão sem vínculo com a API. Faça login novamente.", 401);
  try {
    const result = await backendFetch<Record<string, unknown> | null>(
      "/api/workspace/actions",
      { method: "POST", body: input, token },
    );
    return result ?? { ok: true };
  } catch (error) {
    if (error instanceof BackendError)
      throw new ActionError(error.message, error.status);
    throw error;
  }
}
