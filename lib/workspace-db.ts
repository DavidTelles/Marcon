import type { Account } from "./accounts";
import type { Part, Request, Movement, ReturnRecord } from "./demo-data";
import type { InventoryBalance, Transfer } from "./inventory";
import type { StaffUser } from "./staff-data";
import { apiToken, BackendError, backendFetch } from "./backend-client";

export type WorkspaceSnapshot = {
  stock: Part[];
  balances: InventoryBalance[];
  requests: Request[];
  movements: Movement[];
  transfers: Transfer[];
  returns: ReturnRecord[];
  staff: StaffUser[];
};

// O snapshot do workspace passou a ser servido pela API do backend MARCON,
// que é a dona das regras de negócio sobre o banco unificado.
export async function workspaceSnapshot(
  user: Account,
  catalogOnly = false,
): Promise<WorkspaceSnapshot> {
  void user;
  const token = await apiToken();
  if (!token) {
    throw new BackendError(
      "Sessão sem vínculo com a API. Faça login novamente.",
      401,
    );
  }
  return backendFetch<WorkspaceSnapshot>(
    `/api/workspace/snapshot${catalogOnly ? "?catalogOnly=1" : ""}`,
    { token },
  );
}
