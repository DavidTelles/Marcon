import type { Account } from "./accounts";
export class ActionError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type Permission =
  "request" | "approve" | "stock" | "people" | "map" | "planning" | "history";
export const permissions: Record<Account["role"], readonly Permission[]> = {
  admin: ["approve", "stock", "people", "map", "planning", "history"],
  lider: ["approve", "history"],
  almoxarifado: ["stock", "planning", "history"],
  funcionario: ["request", "history"],
};
export const can = (role: Account["role"], permission: Permission) =>
  permissions[role].includes(permission);
export function demand(user: Account, permission: Permission) {
  if (!can(user.role, permission))
    throw new ActionError("Perfil sem permissão para esta ação.", 403);
}
export function integer(value: unknown, min = 1) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > 1_000_000_000
  )
    throw new ActionError("Quantidade inválida.");
  return value;
}
export function text(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
export function reason(value: unknown) {
  const result = text(value);
  if (result.length < 3)
    throw new ActionError(
      "Informe uma justificativa com pelo menos 3 caracteres.",
    );
  return result;
}
