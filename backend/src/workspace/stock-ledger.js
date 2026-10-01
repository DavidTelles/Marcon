"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var stock_ledger_exports = {};
__export(stock_ledger_exports, {
  audit: () => audit,
  available: () => available,
  capacity: () => capacity,
  first: () => first,
  movement: () => movement,
  partLock: () => partLock,
  place: () => place,
  rows: () => rows,
  scan: () => scan,
  stock: () => stock
});
module.exports = __toCommonJS(stock_ledger_exports);
var import_permissions = require("./permissions");
async function rows(c, sql, args = []) {
  const [r] = await c.execute(sql, args);
  return r;
}
const first = async (c, sql, args = []) => (await rows(c, sql, args))[0];
async function audit(c, actor, entity, id, event, data) {
  await c.execute(
    "INSERT INTO audit_log(actor_id,entity_type,entity_id,action,details) VALUES(?,?,?,?,?)",
    [actor, entity, id, event, JSON.stringify(data)]
  );
}
async function movement(c, actor, part, warehouse, kind, quantity, note, request = null, block = null, returned = null, transfer = null) {
  if (quantity)
    await c.execute(
      "INSERT INTO stock_movements(part_id,warehouse_id,kind,quantity,actor_id,reason,request_id,block_id,return_id,transfer_id) VALUES(?,?,?,?,?,?,?,?,?,?)",
      [
        part,
        warehouse,
        kind,
        quantity,
        actor,
        note,
        request,
        block,
        returned,
        transfer
      ]
    );
}
async function stock(c, part) {
  const balances = await rows(
    c,
    "SELECT i.*, w.name, w.block_id, w.is_central FROM inventory i JOIN warehouses w ON w.id=i.warehouse_id WHERE i.part_id=? AND w.active=TRUE ORDER BY i.warehouse_id FOR UPDATE",
    [part]
  );
  const reservations = await rows(
    c,
    "SELECT warehouse_id,quantity FROM request_reservations WHERE part_id=? FOR UPDATE",
    [part]
  );
  return balances.map((b) => ({
    ...b,
    reserved: reservations.filter((r) => Number(r.warehouse_id) === Number(b.warehouse_id)).reduce((sum, r) => sum + Number(r.quantity), 0)
  }));
}
const available = (r) => Number(r.quantity) - Number(r.reserved);
async function partLock(c, code, id) {
  const p = await first(
    c,
    `SELECT * FROM parts WHERE ${id ? "id" : "code"}=? AND active=TRUE FOR UPDATE`,
    [id ?? (0, import_permissions.text)(code, 64)]
  );
  if (!p) throw new import_permissions.ActionError("Pe\xE7a n\xE3o encontrada.", 404);
  return p;
}
async function place(c, value) {
  const w = await first(
    c,
    "SELECT * FROM warehouses WHERE name=? AND active=TRUE",
    [(0, import_permissions.text)(value, 80)]
  );
  if (!w) throw new import_permissions.ActionError("Almoxarifado inv\xE1lido.");
  return w;
}
function scan(p, code) {
  if (![p.code, p.qr_code].some(
    (v) => String(v).toUpperCase() === (0, import_permissions.text)(code, 128).toUpperCase()
  ))
    throw new import_permissions.ActionError("C\xF3digo lido n\xE3o corresponde \xE0 pe\xE7a.", 422);
}
function capacity(row, quantity) {
  if (row.capacity !== null && row.capacity !== void 0 && quantity > Number(row.capacity))
    throw new import_permissions.ActionError("Capacidade do local excedida.", 409);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  audit,
  available,
  capacity,
  first,
  movement,
  partLock,
  place,
  rows,
  scan,
  stock
});
