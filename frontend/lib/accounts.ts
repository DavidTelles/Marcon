import type { RowDataPacket } from "mysql2";
import { getPool } from "./db";

export type AccountRole = "admin" | "lider" | "almoxarifado" | "funcionario";
export type Account = {
  id: string;
  name: string;
  email: string;
  role: AccountRole;
  label: string;
  block?: string;
  sector?: string;
};
type AccountRow = RowDataPacket & {
  id: string;
  name: string;
  email: string;
  role: AccountRole;
  sector: string;
  block: string | null;
  password_hash: string;
  active: number;
};
const labels: Record<AccountRole, string> = {
  admin: "Admin",
  lider: "Líder de bloco",
  almoxarifado: "Almoxarifado",
  funcionario: "Funcionário",
};
function accountFromRow(row: AccountRow): Account {
  return { id: row.id, name: row.name, email: row.email, role: row.role, label: labels[row.role], block: row.block ?? undefined, sector: row.sector };
}
export async function accountByIdentity(identity: string) {
  const [rows] = await getPool().execute<AccountRow[]>(
    "SELECT u.employee_no AS id, u.name, u.email, u.role, u.sector, u.password_hash, u.active, b.name AS block FROM users u LEFT JOIN blocks b ON b.id = u.block_id WHERE u.employee_no = ? OR u.email = ? LIMIT 1",
    [identity, identity],
  );
  const row = rows[0];
  return row?.active ? { account: accountFromRow(row), passwordHash: row.password_hash } : null;
}
export async function accountByEmployeeNo(id: string): Promise<Account | null> {
  const [rows] = await getPool().execute<AccountRow[]>(
    "SELECT u.employee_no AS id, u.name, u.email, u.role, u.sector, u.password_hash, u.active, b.name AS block FROM users u LEFT JOIN blocks b ON b.id = u.block_id WHERE u.employee_no = ? LIMIT 1",
    [id],
  );
  return rows[0]?.active ? accountFromRow(rows[0]) : null;
}
