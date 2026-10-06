import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import nextEnv from "@next/env";

// Maintains catalog relationships only. Physical points and stock quantities are untouched.
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const require = createRequire(resolve("backend/package.json"));
const { rows, insert, audit } = require("./src/workspace/stock-ledger");
const { demand } = require("./src/workspace/permissions");
const repository = require("./src/repositories/userRepository");
const db = await import("../lib/neon-db.mjs");
const apply = process.argv.includes("--apply");
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const branchCode = argument("--branch-code");
const branchName = argument("--branch-name") || branchCode;
if (apply)
  assert.ok(
    branchCode && branchCode.length <= 64,
    "Informe --branch-code explicitamente.",
  );
const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
const sectorCode = (block, name) =>
  "CAD-" +
  createHash("sha256")
    .update(`${block}:${normalize(name)}`)
    .digest("hex")
    .slice(0, 20);

try {
  const result = await db.transaction(async (c) => {
    await c.execute("SELECT pg_advisory_xact_lock(734901231)");
    const users = await rows(
      c,
      "SELECT id,employee_no,role,active,sector,branch_id,block_id,sector_id,workplace_id FROM users ORDER BY id FOR UPDATE",
    );
    const blocks = await rows(
      c,
      "SELECT id,code,name,branch_id FROM blocks ORDER BY id FOR UPDATE",
    );
    const warehouses = await rows(
      c,
      "SELECT id,code,name,branch_id,block_id FROM warehouses ORDER BY id FOR UPDATE",
    );
    const requests = await rows(
      c,
      "SELECT id,requester_id,block_id,sector,sector_id,workplace_id,destination_point_id FROM requests ORDER BY id FOR UPDATE",
    );
    const branches = await rows(
      c,
      "SELECT * FROM branches ORDER BY id FOR UPDATE",
    );
    const sectors = await rows(
      c,
      "SELECT * FROM sectors ORDER BY id FOR UPDATE",
    );
    const workplaces = await rows(
      c,
      "SELECT * FROM workplaces ORDER BY id FOR UPDATE",
    );
    if (!apply)
      return {
        mode: "preview",
        branches: branches.length,
        blocksWithoutBranch: blocks.filter((b) => !b.branch_id).length,
        warehousesWithoutBranch: warehouses.filter((w) => !w.branch_id).length,
        usersWithoutSector: users.filter((u) => u.block_id && !u.sector_id)
          .length,
        requestsWithoutSector: requests.filter((r) => !r.sector_id).length,
        existingSectorNames: [
          ...new Set(users.filter((u) => u.block_id).map((u) => u.sector)),
        ],
      };
    let branch = branches.find((b) => b.code === branchCode);
    assert.ok(
      branch || !branches.length,
      "Há outras unidades cadastradas. Não é seguro atribuir todos os registros a uma nova unidade.",
    );
    const actors = users.filter(
      (u) =>
        u.active &&
        u.role === "admin" &&
        (!argument("--actor") || u.employee_no === argument("--actor")),
    );
    assert.equal(
      actors.length,
      1,
      "Selecione um administrador autorizado com --actor.",
    );
    const actor = actors[0];
    const account = {
      id: actor.employee_no,
      role: actor.role,
      permissionOverrides: await repository.getPermissionOverridesForUser(
        actor.id,
      ),
    };
    demand(account, "people");
    demand(account, "stock");
    const stamp = new Date().toISOString().replaceAll(":", "-");
    await mkdir(".validation/integrated-logistics", { recursive: true });
    const backup = `.validation/integrated-logistics/links-before-${stamp}.json`;
    await writeFile(
      backup,
      JSON.stringify(
        { users, blocks, warehouses, requests, branches, sectors, workplaces },
        null,
        2,
      ),
    );
    const counts = {
      branches: 0,
      blocks: 0,
      warehouses: 0,
      sectors: 0,
      workplaces: 0,
      users: 0,
      requests: 0,
    };
    if (!branch) {
      const saved = await insert(
        c,
        "INSERT INTO branches(code,name) VALUES(?,?) RETURNING id",
        [branchCode, branchName],
      );
      branch = { id: Number(saved.id), code: branchCode, name: branchName };
      counts.branches++;
    }
    for (const [table, catalog] of [
      ["blocks", blocks],
      ["warehouses", warehouses],
    ]) {
      for (const row of catalog) {
        assert.ok(
          !row.branch_id || Number(row.branch_id) === Number(branch.id),
          "Um cadastro pertence a outra unidade.",
        );
        if (row.branch_id) continue;
        await c.execute(
          `UPDATE ${table} SET branch_id=? WHERE id=? AND branch_id IS NULL`,
          [branch.id, row.id],
        );
        row.branch_id = branch.id;
        counts[table]++;
      }
    }
    // Source names and blocks come from captured records, including request snapshots.
    const contexts = [
      ...users.filter((u) => u.active && u.block_id),
      ...requests,
    ];
    for (const context of contexts) {
      if (!context.block_id || !normalize(context.sector)) continue;
      const block = blocks.find(
        (b) => Number(b.id) === Number(context.block_id),
      );
      assert.ok(block, "Contexto sem bloco válido.");
      const matches = sectors.filter(
        (s) =>
          Number(s.block_id) === Number(block.id) &&
          Number(s.branch_id) === Number(branch.id) &&
          normalize(s.name) === normalize(context.sector),
      );
      assert.ok(
        matches.length <= 1,
        "Nome de setor ambíguo; a operação foi revertida.",
      );
      if (!matches.length) {
        const code = sectorCode(block.id, context.sector);
        const saved = await insert(
          c,
          "INSERT INTO sectors(code,name,branch_id,block_id) VALUES(?,?,?,?) RETURNING id",
          [code, String(context.sector).trim(), branch.id, block.id],
        );
        sectors.push({
          id: Number(saved.id),
          code,
          name: String(context.sector).trim(),
          branch_id: branch.id,
          block_id: block.id,
        });
        counts.sectors++;
      }
    }
    const logicalWorkplaces = new Map();
    for (const s of sectors.filter(
      (s) => Number(s.branch_id) === Number(branch.id),
    )) {
      const code = `SETOR-${s.id}`;
      let workplace = workplaces.find((w) => w.code === code);
      if (!workplace) {
        const block = blocks.find((b) => Number(b.id) === Number(s.block_id));
        const saved = await insert(
          c,
          "INSERT INTO workplaces(code,name,branch_id,block_id,sector_id,point_id) VALUES(?,?,?,?,?,NULL) RETURNING id",
          [
            code,
            `${block.name} — ${s.name}`.slice(0, 160),
            s.branch_id,
            s.block_id,
            s.id,
          ],
        );
        workplace = {
          id: Number(saved.id),
          code,
          branch_id: s.branch_id,
          block_id: s.block_id,
          sector_id: s.id,
          point_id: null,
        };
        workplaces.push(workplace);
        counts.workplaces++;
      }
      assert.ok(
        Number(workplace.sector_id) === Number(s.id) &&
          Number(workplace.branch_id) === Number(s.branch_id) &&
          Number(workplace.block_id) === Number(s.block_id),
        "Local lógico incompatível; a operação foi revertida.",
      );
      logicalWorkplaces.set(Number(s.id), workplace);
    }
    for (const u of users.filter((u) => u.active)) {
      assert.ok(
        !u.branch_id || Number(u.branch_id) === Number(branch.id),
        "Usuário pertence a outra unidade.",
      );
      if (!u.block_id) {
        if (!u.branch_id) {
          await c.execute("UPDATE users SET branch_id=? WHERE id=?", [
            branch.id,
            u.id,
          ]);
          counts.users++;
        }
        continue;
      }
      const matches = sectors.filter(
        (s) =>
          Number(s.block_id) === Number(u.block_id) &&
          normalize(s.name) === normalize(u.sector),
      );
      assert.equal(
        matches.length,
        1,
        "Funcionário sem setor inequívoco; a operação foi revertida.",
      );
      const s = matches[0];
      assert.ok(
        !u.sector_id || Number(u.sector_id) === Number(s.id),
        "Setor existente incompatível.",
      );
      const wp = u.workplace_id
        ? workplaces.find((w) => Number(w.id) === Number(u.workplace_id))
        : logicalWorkplaces.get(Number(s.id));
      assert.ok(
        wp && Number(wp.sector_id) === Number(s.id),
        "Local existente incompatível.",
      );
      if (
        Number(u.branch_id) === Number(s.branch_id) &&
        Number(u.sector_id) === Number(s.id) &&
        Number(u.workplace_id) === Number(wp.id)
      )
        continue;
      await c.execute(
        "UPDATE users SET branch_id=?,sector_id=?,workplace_id=? WHERE id=?",
        [s.branch_id, s.id, wp.id, u.id],
      );
      counts.users++;
    }
    for (const r of requests) {
      const matches = sectors.filter(
        (s) =>
          Number(s.block_id) === Number(r.block_id) &&
          normalize(s.name) === normalize(r.sector),
      );
      if (matches.length !== 1) continue;
      const s = matches[0];
      if (r.sector_id && Number(r.sector_id) !== Number(s.id)) continue;
      const sector = r.sector_id || s.id;
      // A historical request may acquire a logical sector-level location, never a guessed point.
      const wp = logicalWorkplaces.get(Number(s.id));
      const workplace =
        r.workplace_id ||
        (!r.destination_point_id && !wp.point_id ? wp.id : null);
      if (
        Number(r.sector_id) === Number(sector) &&
        Number(r.workplace_id) === Number(workplace)
      )
        continue;
      await c.execute(
        "UPDATE requests SET sector_id=?,workplace_id=? WHERE id=?",
        [sector, workplace, r.id],
      );
      counts.requests++;
    }
    await c.execute(
      "ALTER TABLE inventory VALIDATE CONSTRAINT fk_inventory_point",
    );
    const [mismatch] = await c.execute(
      "SELECT COUNT(*) AS total FROM users u JOIN workplaces w ON w.id=u.workplace_id WHERE u.block_id<>w.block_id OR u.branch_id<>w.branch_id OR u.sector_id<>w.sector_id",
    );
    assert.equal(Number(mismatch[0].total), 0);
    await audit(
      c,
      Number(actor.id),
      "industrial_link",
      Number(branch.id),
      "initialize_catalog",
      {
        counts,
        branchCode,
        basis: "existing_sector_and_block_records",
        scope: "logical_sector_locations_without_physical_points",
        backup,
      },
    );
    return {
      mode: "applied",
      branchCode,
      counts,
      backup,
      physicalPoints: "pending_real_plant_configuration",
    };
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await db.closeDatabase();
}
