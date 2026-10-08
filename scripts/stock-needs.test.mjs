import assert from "node:assert/strict";
import { test } from "node:test";
import { importedNeed, operationalNeeds } from "../lib/stock-needs.ts";

const source = {
  id: 1,
  code: "P1",
  item: "Peça",
  unit: "un",
  branch: "0101",
  balance: "2",
  minimum: "10",
  consumption: "42",
  period: null,
  file: "real-source.xlsx",
  sheet: "Resumo",
  line: 3,
  importedAt: "2026-10-08",
  directive: null,
  conflicts: [],
  materialLinked: true,
};
test("a shortage uses confirmed amounts without generating a transfer or daily history", () => {
  const need = importedNeed(source);
  assert.equal(need.quantity, 8);
  assert.equal(need.available, 2);
  assert.match(need.consumption, /42 un.*período não informado/);
  assert.ok(
    need.issues.some((issue) => /não foi convertido em retiradas/.test(issue)),
  );
  assert.equal(need.source, "imported");
});
test("missing, invalid or fully covered source values do not invent deficits", () => {
  for (const change of [
    { balance: null },
    { minimum: null },
    { minimum: "" },
    { balance: "" },
    { balance: -1 },
    { minimum: "invalid" },
    { balance: 10 },
    { balance: 12 },
  ])
    assert.equal(importedNeed({ ...source, ...change }), null);
  assert.equal(importedNeed({ ...source, balance: 0 }).quantity, 10);
});
test("source purchase restrictions and unresolved material conflicts stay visible", () => {
  const need = importedNeed({
    ...source,
    directive: "NÃO COMPRAR",
    materialLinked: false,
  });
  assert.equal(need.purchaseBlocked, true);
  assert.ok(need.issues.some((issue) => /QR/.test(issue)));
  assert.ok(
    need.issues.some((issue) => /compra permanece bloqueada/.test(issue)),
  );
});
test("operational deficits account for reservations and every committed receipt once", () => {
  const row = {
    code: "P2",
    item: "Peça 2",
    unit: "un",
    warehouse: "Destino",
    available: 4,
    configuredMinimum: 10,
    target: 12,
    incoming: 3,
    transfer: 2,
    distribution: { pendingIncoming: 2 },
    capacity: null,
  };
  assert.equal(operationalNeeds([row], null)[0].quantity, 1);
  assert.equal(operationalNeeds([row], null)[0].incoming, 7);
  assert.equal(operationalNeeds([{ ...row, incoming: 4 }], null).length, 0);
  assert.ok(
    operationalNeeds([row], null)[0].issues.some((issue) =>
      /Publicar/.test(issue),
    ),
  );
  assert.ok(
    !operationalNeeds([row], 1)[0].issues.some((issue) =>
      /Publicar/.test(issue),
    ),
  );
});
