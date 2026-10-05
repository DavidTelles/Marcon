import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
import { translateSql } from "../lib/neon-db.mjs";

// Runs PostgreSQL locally in WASM, with disk persistence. Never reads DATABASE_URL or .env.
// Install test tooling only: npm install --prefix .validation --no-save --package-lock=false @electric-sql/pglite
const require = createRequire(import.meta.url);
const { PGlite } = require(
  resolve(".validation/node_modules/@electric-sql/pglite"),
);
const {
  buildPartsReport,
  variation,
} = require("../backend/src/workspace/parts-consumption.js");
const {
  isPartsConsumptionReport,
  PARTS_REPORT_VERSION,
} = require("../backend/src/workspace/parts-consumption-contract.js");
const root = resolve(".validation/parts-consumption");
await mkdir(root, { recursive: true });
const directory = resolve(root, `postgres-${Date.now()}`);
let pg = new PGlite(directory);
const files = (await readdir("db/neon"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
for (const file of files)
  await pg.exec(await readFile(`db/neon/${file}`, "utf8"));
const execute = async (sql, args = []) => {
  let i = 0;
  const translated = translateSql(sql).replace(/\?/g, () => `$${++i}`);
  assert.equal(i, args.length, "SQL parameter count");
  const result = await pg.query(translated, args);
  return [result.rows];
};
const db = { execute, query: execute };
const insert = async (table, fields, values) => {
  const r = await pg.query(
    `INSERT INTO ${table}(${fields}) VALUES(${values.map((_, i) => `$${i + 1}`).join(",")}) RETURNING id`,
    values,
  );
  return Number(r.rows[0].id);
};
const blockA = await insert("blocks", "code,name", ["TA", "Bloco A"]),
  blockB = await insert("blocks", "code,name", ["TB", "Bloco B"]);
const w1 = await insert("warehouses", "code,name,block_id", [
    "W1",
    "Origem 1",
    blockA,
  ]),
  w2 = await insert("warehouses", "code,name,block_id", [
    "W2",
    "Origem 2",
    blockB,
  ]);
const userId = await insert(
  "users",
  "employee_no,name,email,password_hash,role,sector,block_id",
  [
    "test-admin",
    "Operador teste",
    "test@example.invalid",
    "unused",
    "admin",
    "Montagem",
    blockA,
  ],
);
const p1 = await insert(
  "parts",
  "code,qr_code,name,location,unit,reference_unit_price",
  ["P1", "P1", "Parafuso", "Teste", "un", 0],
);
const p2 = await insert(
  "parts",
  "code,qr_code,name,location,unit,reference_unit_price",
  ["P2", "P2", "Porca", "Teste", "un", 2],
);
const p3 = await insert(
  "parts",
  "code,qr_code,name,location,unit,reference_unit_price",
  ["P3", "P3", "Óleo", "Teste", "kg", 10],
);
// Simulates a legacy imported request missing a block, only in this isolated database.
await pg.exec("ALTER TABLE requests ALTER COLUMN block_id DROP NOT NULL");
async function request(
  part,
  block,
  quantity,
  deliveredAt,
  status = "Entregue",
  createdAt = "2026-09-21 00:00:00",
) {
  return insert(
    "requests",
    "requester_id,part_id,block_id,quantity,status,delivered_at,created_at,sector",
    [userId, part, block, quantity, status, deliveredAt, createdAt, "Montagem"],
  );
}
async function movement(
  part,
  block,
  quantity,
  req,
  warehouse = w1,
  kind = "saida",
  transfer = null,
) {
  return insert(
    "stock_movements",
    "part_id,warehouse_id,kind,quantity,actor_id,request_id,block_id,transfer_id,created_at",
    [
      part,
      warehouse,
      kind,
      quantity,
      userId,
      req,
      block,
      transfer,
      "2026-09-21 01:00:00",
    ],
  );
}
const partial = await request(p1, blockA, 10, "2026-09-21 00:00:00");
await movement(p1, blockA, 3, partial);
await movement(p1, blockA, 2, partial, w2);
const second = await request(p1, blockB, 4, "2026-09-24 23:59:59.999");
await movement(p1, blockB, 4, second);
const missing = await request(p1, null, 2, "2026-09-22 12:00:00");
await movement(p1, null, 2, missing);
const cancelled = await request(
  p1,
  blockA,
  100,
  "2026-09-23 00:00:00",
  "Cancelada",
);
await movement(p1, blockA, 100, cancelled);
const outside = await request(p1, blockA, 77, "2026-09-25 00:00:00");
await movement(p1, blockA, 77, outside);
const transfer = await insert(
  "stock_transfers",
  "part_id,source_warehouse_id,destination_warehouse_id,quantity,qr_code_scanned,performed_by",
  [p1, w1, w2, 999, "P1", userId],
);
await movement(p1, blockA, 999, null, w1, "transferencia_saida", transfer);
await movement(p1, blockA, 999, partial, w1, "saida", transfer);
await request(p1, blockA, 50, "2026-09-22 10:00:00"); // Legacy without ledger: quality only.
const pending = await request(p1, blockB, 6, null, "Aprovada");
await pg.query(
  "INSERT INTO request_reservations(request_id,part_id,warehouse_id,quantity) VALUES($1,$2,$3,6)",
  [pending, p1, w1],
);
const ret1 = await insert(
  "return_records",
  "part_id,block_id,warehouse_id,quantity,condition_type,returned_by,received_by,request_id,inspection_status,inspected_at,created_at",
  [
    p1,
    blockA,
    w2,
    1,
    "Apto",
    "Teste",
    userId,
    partial,
    "Conferida",
    "2026-09-23 12:00:00",
    "2026-09-22 12:00:00",
  ],
);
await insert(
  "return_records",
  "part_id,block_id,warehouse_id,quantity,condition_type,returned_by,received_by,request_id,inspection_status,inspected_at,created_at",
  [
    p1,
    blockB,
    w2,
    2,
    "Danificado",
    "Teste",
    userId,
    second,
    "Conferida",
    "2026-09-24 12:00:00",
    "2026-09-22 12:00:00",
  ],
);
await insert(
  "return_records",
  "part_id,block_id,warehouse_id,quantity,condition_type,returned_by,received_by,request_id,inspection_status,inspected_at,created_at",
  [
    p1,
    blockA,
    w2,
    2,
    "Apto",
    "Teste",
    userId,
    partial,
    "Conferida",
    "2026-09-25 12:00:00",
    "2026-09-22 12:00:00",
  ],
);
await insert(
  "return_records",
  "part_id,block_id,warehouse_id,quantity,condition_type,returned_by,received_by,request_id,inspection_status,inspected_at,created_at",
  [
    p1,
    blockA,
    w2,
    9,
    "Apto",
    "Teste",
    userId,
    partial,
    "Pendente",
    null,
    "2026-09-22 12:00:00",
  ],
);
for (const [quantity, at] of [
  [20, "2026-09-23 13:00:00"],
  [2, "2026-09-20 23:59:59.999"],
  [2, "2026-09-16 12:00:00"],
  [2, "2026-09-12 12:00:00"],
]) {
  const id = await request(p2, blockA, quantity, at);
  await movement(p2, blockA, quantity, id);
}
const kg = await request(p3, blockB, 80, "2026-09-23 10:00:00");
await movement(p3, blockB, 80, kg);
await pg.query(
  "INSERT INTO inventory(part_id,warehouse_id,quantity,minimum_quantity) VALUES($1,$2,30,5),($1,$3,20,3)",
  [p1, w1, w2],
);
await pg.close();
pg = new PGlite(directory); // Prove records survive reopening the test database.
const admin = {
  id: "test-admin",
  name: "Teste",
  email: "test@example.invalid",
  role: "admin",
  label: "Admin",
};
const base = { from: "2026-09-21", to: "2026-09-24", unit: "un" };
const query = (changes) => new URLSearchParams({ ...base, ...changes });
const report = await buildPartsReport(admin, query({}), db);
assert.equal(report.schemaVersion, PARTS_REPORT_VERSION);
assert.equal(isPartsConsumptionReport(report), true);
assert.equal(
  isPartsConsumptionReport({ ...report, quality: undefined }),
  false,
);
assert.equal(
  isPartsConsumptionReport({ ...report, schemaVersion: undefined }),
  false,
);
assert.equal(isPartsConsumptionReport({ ...report, schemaVersion: 0 }), false);
assert.equal(
  isPartsConsumptionReport({
    ...report,
    quality: { ...report.quality, legacyWithoutLedger: undefined },
  }),
  false,
);
assert.equal(isPartsConsumptionReport(null), false);
assert.equal(report.total.quantity, 31);
assert.equal(report.total.withdrawals, 4);
assert.equal(report.items.find((p) => p.code === "P1").quantity, 11);
assert.equal(report.items.find((p) => p.code === "P1").previousQuantity, 0);
assert.equal(report.items.find((p) => p.code === "P1").change, null);
assert.equal(report.items.find((p) => p.code === "P2").alert.baseline, 2);
assert.equal(report.quality.missingBlock, 1);
assert.equal(report.quality.legacyWithoutLedger, 1);
assert.equal(report.quality.nonConvertible, 1);
assert.equal(report.quality.missingCost, 2);
assert.equal(report.quality.missingReferencePrice, 1);
assert.deepEqual(variation(7, 0), { difference: 7, change: null });
// Independent PostgreSQL reconciliation (no domain CTE or JS aggregation helper reused).
const independent = await pg.query(
  `SELECT p.code,SUM(m.quantity)::int AS quantity,COUNT(DISTINCT r.id)::int AS withdrawals FROM stock_movements m JOIN requests r ON r.id=m.request_id JOIN parts p ON p.id=m.part_id WHERE r.status='Entregue' AND m.kind='saida' AND m.transfer_id IS NULL AND m.return_id IS NULL AND r.part_id=m.part_id AND p.unit='un' AND r.delivered_at BETWEEN '2026-09-21 00:00:00' AND '2026-09-24 23:59:59.999' GROUP BY p.code`,
);
for (const row of independent.rows) {
  const item = report.items.find((p) => p.code === row.code);
  assert.equal(item.quantity, row.quantity);
  assert.equal(item.withdrawals, row.withdrawals);
}
assert.equal(
  report.items.reduce((sum, p) => sum + p.quantity, 0),
  report.total.quantity,
);
assert.equal(
  report.ranking.reduce((sum, p) => sum + p.quantity, 0),
  report.total.quantity,
);
const share = await buildPartsReport(
  admin,
  query({ code: "P1", details: "1", detailCode: "P1" }),
  db,
);
assert.equal(share.total.quantity, 11);
assert.equal(share.total.withdrawals, 3);
assert.equal(share.details.total, 4);
assert.equal(share.details.records[0].date, "2026-09-24 23:59:59.999");
assert.equal(
  share.details.records.reduce((sum, r) => sum + r.quantity, 0),
  11,
);
assert.equal(
  share.blocks.reduce((sum, r) => sum + r.quantity, 0),
  11,
);
assert.ok(
  Math.abs(share.blocks.reduce((sum, r) => sum + r.percentage, 0) - 100) < 1e-9,
);
assert.equal(
  share.daily.reduce((sum, r) => sum + r.quantity, 0),
  11,
);
assert.equal(
  share.distribution.reduce((sum, r) => sum + r.quantity, 0),
  11,
);
assert.equal(
  share.returns.reduce((sum, r) => sum + r.quantity, 0),
  3,
);
assert.equal(
  share.stocks.find((s) => s.warehouse === "Origem 1").available,
  24,
);
const origin = await buildPartsReport(
  // origin filter must constrain the ledger quantity, not include an entire multi-warehouse order.
  admin,
  query({ code: "P1", warehouse: "Origem 2", details: "1" }),
  db,
);
assert.equal(origin.total.quantity, 2);
assert.equal(origin.total.withdrawals, 1);
assert.equal(
  origin.returns.reduce((sum, r) => sum + r.quantity, 0),
  1,
);
const block = await buildPartsReport(
  admin,
  query({ code: "P1", block: "Bloco A" }),
  db,
);
assert.equal(block.total.quantity, 5);
assert.equal(block.blocks[0].percentage, 100);
const multi = await buildPartsReport(
  admin,
  query({ code: "P1", blocks: JSON.stringify(["Bloco A", "Bloco B"]) }),
  db,
);
assert.equal(multi.total.quantity, 9);
assert.equal(multi.blocks.length, 2);
assert.ok(
  Math.abs(multi.blocks.reduce((sum, b) => sum + b.percentage, 0) - 100) < 1e-9,
);
const retDetail = await buildPartsReport(
  admin,
  query({
    code: "P1",
    details: "1",
    detailKind: "return",
    detailCondition: "Apto",
  }),
  db,
);
assert.equal(retDetail.details.total, 1);
assert.equal(retDetail.details.records[0].id, ret1);
const kgReport = await buildPartsReport(
  admin,
  query({ code: "P3", unit: "kg" }),
  db,
);
assert.equal(kgReport.total.quantity, 80);
assert.equal(kgReport.items.length, 1);
for (const role of ["funcionario", "lider"])
  await assert.rejects(
    buildPartsReport(
      { ...admin, role },
      query({ details: "1", export: "all" }),
      db,
    ),
    (e) => e.status === 403,
  );
await assert.rejects(
  buildPartsReport(
    { ...admin, permissionOverrides: { "stock.manage": false } },
    query({}),
    db,
  ),
  (e) => e.status === 403,
);
for (const changes of [
  { from: "2026-02-30" },
  { unit: "kg", code: "P1" },
  { detailDate: "2026-09-25" },
  { threshold: "NaN" },
])
  await assert.rejects(
    buildPartsReport(admin, query(changes), db),
    (e) => e.status === 400,
  );
const keeper = await buildPartsReport(
  { ...admin, role: "almoxarifado" },
  query({}),
  db,
);
assert.equal(keeper.total.quantity, 31);
assert.equal(share.cohort.find((c) => c.block === "Bloco A").delivered, null);
assert.equal(share.cohort.find((c) => c.block === "Bloco A").pending, null);
assert.equal(share.cohort.find((c) => c.block === "Bloco B").pending, 6);
// Real Express route and JWT middleware with test-only DB/config adapters.
const backendRequire = createRequire(resolve("backend/package.json"));
const configPath = backendRequire.resolve("./src/config/env");
const testSecret = "parts-local-test-only-secret-123456789";
require.cache[configPath] = {
  id: configPath,
  filename: configPath,
  loaded: true,
  exports: {
    nodeEnv: "test",
    jwt: { secret: testSecret, expiresIn: "1h" },
    corsOrigin: "*",
    rfid: {},
  },
};
const databaseModule = backendRequire("./src/config/db");
const isolatedTransaction = async (work) =>
  pg.transaction(async (tx) => {
    const run = async (sql, args = []) => {
      let i = 0;
      const r = await tx.query(
        translateSql(sql).replace(/\?/g, () => `$${++i}`),
        args,
      );
      return [r.rows];
    };
    return work({ execute: run, query: run });
  });
databaseModule.getPool = () => db;
databaseModule.query = async (sql, params) => (await execute(sql, params))[0];
databaseModule.withTransaction = isolatedTransaction;
const workspaceDb = backendRequire("./src/workspace/db");
workspaceDb.getPool = () => db;
workspaceDb.transaction = isolatedTransaction;
delete require.cache[
  backendRequire.resolve("./src/workspace/parts-consumption")
];
const express = backendRequire("express"),
  http = backendRequire("supertest"),
  jwt = backendRequire("jsonwebtoken");
const app = express();
app.use(backendRequire("./src/routes/workspace.routes"));
app.use((error, _req, res, _next) => {
  void _next;
  res
    .status(error.statusCode || error.status || 500)
    .json({ error: error.message });
});
const endpoint =
  "/api/parts/consumption?" +
  query({ code: "P1", details: "1", export: "all" });
assert.equal((await http(app).get(endpoint)).status, 401);
for (const role of ["funcionario", "lider", "almoxarifado", "admin"]) {
  const uid = await insert(
    "users",
    "employee_no,name,email,password_hash,role,sector,block_id",
    [
      `api-${role}`,
      `Teste ${role}`,
      `api-${role}@example.invalid`,
      "unused",
      role,
      "Montagem",
      blockB,
    ],
  );
  const token = jwt.sign({ sub: String(uid) }, testSecret, { expiresIn: "1h" });
  const response = await http(app)
    .get(endpoint)
    .set("Authorization", "Bearer " + token);
  assert.equal(
    response.status,
    ["admin", "almoxarifado"].includes(role) ? 200 : 403,
    response.text,
  );
  if (response.status === 200) {
    assert.equal(response.body.total.quantity, 11);
    assert.equal(response.body.details.total, 4);
  }
  if (role === "almoxarifado") {
    await pg.query(
      "INSERT INTO user_permission_overrides(user_id,permission,allowed) VALUES($1,'stock.manage',0)",
      [uid],
    );
    assert.equal(
      (
        await http(app)
          .get(endpoint)
          .set("Authorization", "Bearer " + token)
      ).status,
      403,
    );
  }
}
// Use the production export implementation against reconciled persisted data.
const exportPath = resolve(root, "parts-export.cjs");
await writeFile(
  exportPath,
  ts.transpileModule(await readFile("lib/parts-export.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
);
const { exportPartsReport } = require(exportPath),
  ExcelJS = require("exceljs");
// Actual Next proxy: an old backend contract must fail before JSON/export delivery.
let proxyUser = admin;
let proxyData = report;
let proxyExports = 0;
const contract = require("../backend/src/workspace/parts-consumption-contract.js");
const proxyDependencies = {
  "@/lib/auth": { currentUser: async () => proxyUser },
  "@/lib/backend-client": {
    apiToken: async () => "isolated-test-token",
    backendFetch: async () => proxyData,
    BackendError: class extends Error {},
  },
  "@/lib/permissions": require("../backend/src/workspace/permissions.js"),
  "@/lib/parts-consumption-contract": contract,
  "@/lib/parts-export": {
    exportPartsReport: async (...args) => {
      proxyExports++;
      return exportPartsReport(...args);
    },
  },
};
const proxyModule = new Module(resolve(root, "parts-proxy.cjs"));
proxyModule.require = (name) =>
  Object.hasOwn(proxyDependencies, name)
    ? proxyDependencies[name]
    : require(name);
proxyModule._compile(
  ts.transpileModule(
    await readFile("app/api/parts-consumption/route.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  proxyModule.id,
);
const { NextRequest } = require("next/server");
const callProxy = (format = "") =>
  proxyModule.exports.GET(
    new NextRequest(
      "http://parts-test.invalid/api/parts-consumption?" +
        query(format ? { format } : {}),
    ),
  );
for (const format of ["", "xlsx", "pdf"]) {
  proxyData = { ...report, quality: undefined };
  const response = await callProxy(format);
  assert.equal(response.status, 503);
  assert.equal(
    (await response.json()).error,
    contract.PARTS_REPORT_INCOMPATIBLE,
  );
}
assert.equal(proxyExports, 0, "Incompatible reports must never reach exports");
proxyData = report;
const validProxy = await callProxy();
assert.equal(validProxy.status, 200);
assert.equal((await validProxy.json()).total.quantity, 31);
proxyUser = null;
assert.equal((await callProxy()).status, 401);
proxyUser = admin;
assert.equal((await callProxy("xlsx")).status, 200);
assert.equal(proxyExports, 1);
const all = await buildPartsReport(
  admin,
  query({ export: "all", code: "P1" }),
  db,
);
const book = new ExcelJS.Workbook();
await book.xlsx.load(await exportPartsReport(all, "xlsx"));
assert.equal(book.getWorksheet("Materiais").getCell("D2").value, 11);
assert.equal(book.getWorksheet("Materiais").getCell("G2").value, null);
assert.equal(
  book
    .getWorksheet("Blocos")
    .getColumn(3)
    .values.slice(2)
    .reduce((sum, v) => sum + v, 0),
  11,
);
const { PDFDocument, PDFRawStream, decodePDFRawStream } = require("pdf-lib");
const pdf = await PDFDocument.load(await exportPartsReport(all, "pdf"));
assert.ok(pdf.getPageCount() > 0);
const text = pdf.context
  .enumerateIndirectObjects()
  .flatMap(([, object]) => {
    if (!(object instanceof PDFRawStream)) return [];
    const content = Buffer.from(decodePDFRawStream(object).decode()).toString(
      "latin1",
    );
    return [...content.matchAll(/<([a-f0-9]+)>\s*Tj/gi)].map((match) =>
      Buffer.from(match[1], "hex").toString("latin1"),
    );
  })
  .join(" ");
assert.match(text, /Código: P1.*?Entregue: 11/);
assert.match(text, /Danificado.*?Quantidade: 2/);
// Voice/report parser uses backend filters and clears stale units when changing material.
for (const name of ["james-reports", "james-commands", "permissions"])
  await writeFile(
    resolve(root, `${name}.js`),
    ts.transpileModule(await readFile(`lib/${name}.ts`, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  );
const { explicitReportPlan, reportContext } = require(
  resolve(root, "james-reports.js"),
);
assert.equal(
  explicitReportPlan("consulte dashboard por peça")[0].view,
  "por-peca",
);
const context = reportContext({
  view: "por-peca",
  action: "dashboard",
  filters: { unit: "un", code: "P1" },
});
assert.equal(
  explicitReportPlan("filtre por código P3", context)[0].filters.unit,
  undefined,
);
assert.equal(
  explicitReportPlan("filtre por unidade kg", context)[0].filters.unit,
  "kg",
);
assert.equal(
  explicitReportPlan("exporte em planilha", context)[0].format,
  "xlsx",
);
assert.throws(() => explicitReportPlan("filtre por status Cancelada", context));
// Saved snapshots are strictly test artifacts for the browser harness.
await writeFile(resolve(root, "comparison.json"), JSON.stringify(report));
await writeFile(resolve(root, "share.json"), JSON.stringify(share));
await writeFile(resolve(root, "kg.json"), JSON.stringify(kgReport));
await writeFile(resolve(root, "block.json"), JSON.stringify(block));
await writeFile(resolve(root, "origin.json"), JSON.stringify(origin));
await writeFile(
  resolve(root, "reconciliation.json"),
  JSON.stringify(
    {
      engine: "PostgreSQL PGlite, persisted and reopened",
      productionAccess: false,
      independent: independent.rows,
      quantity: 31,
      share: 11,
      returns: 3,
      dates: base,
      assertions: "passed",
    },
    null,
    2,
  ),
);
await pg.close();
console.log(
  "PASS: PostgreSQL persistido; entregas=31 un, P1=11 un (4 linhas/3 retiradas), P3=80 kg; devoluções=3 un; cancelamento/transferência/limites UTC/perfis/exportações reconciliados.",
);
