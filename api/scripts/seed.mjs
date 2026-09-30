// Seed do banco unificado MARCON: blocos, almoxarifados, usuários, peças e saldos.
// Requer SEED_PASSWORD (mínimo 12 caracteres). Opcional: ADMIN_RFID (crachá do admin).
import dotenv from "dotenv";
import { randomBytes, scryptSync } from "node:crypto";
import mysql from "mysql2/promise";

dotenv.config();

const password = process.env.SEED_PASSWORD;
if (!password) throw new Error("Defina SEED_PASSWORD antes de executar o seed.");
if (password.length < 12) throw new Error("SEED_PASSWORD deve ter pelo menos 12 caracteres.");

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "marcon",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "marcon",
});

const blocks = ["Bloco A", "Bloco B", "Bloco C", "Bloco D"];
const warehouses = ["Central", "Almoxarifado 1", "Almoxarifado 2", "Almoxarifado 3", "Almoxarifado 4"];
const accounts = [
  ["1001", "Ana Souza", "ana@marcon.demo", "funcionario", "Usinagem", "Bloco A"],
  ["1002", "Carlos Oliveira", "carlos@marcon.demo", "lider", "Montagem", "Bloco A"],
  ["1003", "Mariana Lima", "mariana@marcon.demo", "almoxarifado", "Almoxarifado", null],
  ["1004", "Rafael Santos", "rafael@marcon.demo", "admin", "Administração", null],
];
const parts = [
  ["ROL-6205-ZZ", "Rolamento 6205 ZZ", 10, 50, 68, 51, 12, 38.9, "A-03", [26, 4, 4, 4, 4]],
  ["PAR-M12-040", "Parafuso sextavado M12", 100, 20, 42, 35, 7, 2.4, "B-11", [20, 4, 4, 4, 4]],
  ["COR-A42", "Correia industrial A-42", 5, 25, 27, 18, 15, 79.5, "C-04", [10, 2, 2, 2, 2]],
  ["RET-35527", "Retentor 35×52×7", 25, 20, 19, 25, 10, 24.8, "A-09", [15, 3, 3, 3, 3]],
];

const hash = (value) => {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(value, salt, 64).toString("hex")}`;
};

try {
  await connection.beginTransaction();
  for (const name of blocks) {
    await connection.execute("INSERT IGNORE INTO blocks (code, name) VALUES (?, ?)", [name.slice(-1), name]);
  }
  for (let index = 0; index < warehouses.length; index++) {
    await connection.execute(
      "INSERT IGNORE INTO warehouses (code, name, block_id, is_central) VALUES (?, ?, (SELECT id FROM blocks WHERE name = ?), ?)",
      [index === 0 ? "CENTRAL" : `ALM-${index}`, warehouses[index], blocks[index - 1] ?? null, index === 0],
    );
  }
  for (const [employeeNo, name, email, role, sector, block] of accounts) {
    await connection.execute(
      "INSERT IGNORE INTO users (employee_no, name, email, password_hash, role, sector, block_id, rfid_tag) VALUES (?, ?, ?, ?, ?, ?, (SELECT id FROM blocks WHERE name = ?), ?)",
      [employeeNo, name, email, hash(password), role, sector, block, role === "admin" ? process.env.ADMIN_RFID || null : role === "funcionario" ? process.env.EMPLOYEE_RFID || "0A1B2C3D4E" : null],
    );
  }
  for (const [code, name, pack, minimum, consumed, previous, lead, price, location, amounts] of parts) {
    await connection.execute(
      "INSERT IGNORE INTO parts (code, qr_code, name, pack_size, minimum_total, consumed_30, previous_30, lead_days, reference_unit_price, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [code, code, name, pack, minimum, consumed, previous, lead, price, location],
    );
    for (let index = 0; index < warehouses.length; index++) {
      await connection.execute(
        "INSERT IGNORE INTO inventory (part_id, warehouse_id, quantity, minimum_quantity) VALUES ((SELECT id FROM parts WHERE code = ?), (SELECT id FROM warehouses WHERE name = ?), ?, ?)",
        [code, warehouses[index], amounts[index], Math.max(2, Math.ceil(minimum / (index === 0 ? 4 : 8)))],
      );
    }
  }
  await connection.commit();
  console.log("Dados de exemplo inseridos. Contas: ana, carlos, mariana e rafael @marcon.demo.");
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
