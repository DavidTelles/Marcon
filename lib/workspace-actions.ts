import type { PoolConnection } from "./db-types";
import type { Account } from "./accounts";
import { ActionError, demand } from "./permissions";
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
  void _connection; // Compatibility signature; transactions belong to the backend.
  if (!input || typeof input !== "object" || !("type" in input))
    throw new ActionError("Ação inválida.");
  const action = input as Record<string, unknown>;
  if (["transfer", "rejectRecommendation"].includes(String(action.type)) && action.proposal) {
    demand(user, "planning");
    const proposal = action.proposal as Record<string, unknown>;
    if (!proposal || typeof proposal !== "object" || typeof proposal.key !== "string" || !/^[a-f0-9]{64}$/.test(proposal.key)) throw new ActionError("Recomendação inválida.");
    const { operationsReport } = await import("./operations-report");
    const report = await operationsReport(user, {
      purpose: proposal.purpose === "purchase" ? "purchase" : "distribution",
      code: typeof action.code === "string" ? action.code : undefined,
      from: typeof proposal.from === "string" ? proposal.from : undefined,
      to: typeof proposal.to === "string" ? proposal.to : undefined,
      horizon: proposal.horizon as number | undefined,
      margin: proposal.margin as number | undefined,
    });
    const current = report.transfers.find((t) => t.key === proposal.key);
    if (!current) throw new ActionError("A recomendação mudou ou já foi decidida. Atualize o relatório.", 409);
    if (action.type === "transfer" && (action.from !== current.from || action.to !== current.to || action.code !== current.code || action.quantity !== current.quantity))
      throw new ActionError("Revise a quantidade e os locais da recomendação atual.", 409);
    input = { ...action, recommendation: { ...current.evidence, key: current.key, mapVersion: Number(report.mapVersion), quantity: current.quantity } };
    if (action.type === "rejectRecommendation") input = { ...action, code: current.code, recommendation: { key: current.key, period: report.period, from: current.from, to: current.to, quantity: current.quantity } };
  } else if (action.type === "rejectRecommendation") throw new ActionError("Informe a recomendação a rejeitar.");
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
