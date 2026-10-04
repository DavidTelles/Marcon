import type { RowDataPacket } from "./db-types";
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
  permissionOverrides?: Record<string, boolean>;
};
type AccountRow = RowDataPacket & {
  employee_no: string;
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
  return {
    id: String(row.employee_no),
    name: row.name,
    email: row.email,
    role: row.role,
    label: labels[row.role],
    block: row.block ?? undefined,
    sector: row.sector,
  };
}
async function withOverrides(row: AccountRow): Promise<Account> {
  const [overrides] = await getPool().execute<RowDataPacket[]>(
    "SELECT o.permission,o.allowed FROM user_permission_overrides o JOIN users u ON u.id=o.user_id WHERE u.employee_no=?",
    [row.employee_no],
  );
  return {
    ...accountFromRow(row),
    permissionOverrides: Object.fromEntries(
      overrides.map((o) => [String(o.permission), Boolean(o.allowed)]),
    ),
  };
}
export async function accountByIdentity(identity: string) {
  const [rows] = await getPool().execute<AccountRow[]>(
    "SELECT u.employee_no, u.name, u.email, u.role, u.sector, u.password_hash, u.active, b.name AS block FROM users u LEFT JOIN blocks b ON b.id = u.block_id WHERE u.employee_no = ? OR u.email = ? LIMIT 1",
    [identity, identity],
  );
  const row = rows[0];
  return row?.active
    ? { account: await withOverrides(row), passwordHash: row.password_hash }
    : null;
}
export async function accountByEmployeeNo(id: string): Promise<Account | null> {
  const [rows] = await getPool().execute<AccountRow[]>(
    "SELECT u.employee_no, u.name, u.email, u.role, u.sector, u.password_hash, u.active, b.name AS block FROM users u LEFT JOIN blocks b ON b.id = u.block_id WHERE u.employee_no = ? LIMIT 1",
    [id],
  );
  return rows[0]?.active ? withOverrides(rows[0]) : null;
}
