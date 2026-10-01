import { randomBytes, scryptSync } from "node:crypto";
import nextEnv from "@next/env";
import { closeDatabase, transaction } from "../lib/neon-db.mjs";
import { databaseConfigured } from "../lib/db-config.mjs";

nextEnv.loadEnvConfig(process.cwd());
if (!databaseConfigured()) throw new Error("Configure DATABASE_URL do Neon no .env da raiz.");
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 12) throw new Error("Defina SEED_PASSWORD com pelo menos 12 caracteres.");
const hash = (plain) => {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(plain, salt, 64).toString("hex")}`;
};
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
try {
  await transaction(async (db) => {
    for (const name of blocks) await db.execute("INSERT IGNORE INTO blocks(code,name) VALUES(?,?)", [name.slice(-1), name]);
    for (let i = 0; i < warehouses.length; i++) {
      await db.execute("INSERT IGNORE INTO warehouses(code,name,block_id,is_central) VALUES(?,?,(SELECT id FROM blocks WHERE name=?),?)", [i ? `ALM-${i}` : "CENTRAL", warehouses[i], blocks[i - 1] ?? null, i === 0]);
    }
    for (const [employeeNo, name, email, role, sector, block] of accounts) {
      const passwordHash = hash(password);
      await db.execute("INSERT IGNORE INTO users(employee_no,name,email,password_hash,role,sector,block_id) VALUES(?,?,?,?,?,?,(SELECT id FROM blocks WHERE name=?))", [employeeNo, name, email, passwordHash, role, sector, block]);
      await db.execute("UPDATE users SET password_hash=? WHERE employee_no=?", [passwordHash, employeeNo]);
    }
    for (const [code, name, pack, minimum, consumed, previous, lead, price, location, amounts] of parts) {
      await db.execute("INSERT IGNORE INTO parts(code,qr_code,name,pack_size,minimum_total,consumed_30,previous_30,lead_days,reference_unit_price,location) VALUES(?,?,?,?,?,?,?,?,?,?)", [code, code, name, pack, minimum, consumed, previous, lead, price, location]);
      for (let i = 0; i < warehouses.length; i++) {
        await db.execute("INSERT IGNORE INTO inventory(part_id,warehouse_id,quantity,minimum_quantity) VALUES((SELECT id FROM parts WHERE code=?),(SELECT id FROM warehouses WHERE name=?),?,?)", [code, warehouses[i], amounts[i], Math.max(2, Math.ceil(minimum / (i ? 8 : 4)))]);
      }
    }
  });
  console.log("Contas e estoque de demonstração inseridos/atualizados no Neon.");
} finally {
  await closeDatabase();
}
