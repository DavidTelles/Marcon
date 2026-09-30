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
var transfer_actions_exports = {};
__export(transfer_actions_exports, {
  transferAction: () => transferAction
});
module.exports = __toCommonJS(transfer_actions_exports);
var import_permissions = require("./permissions");
var import_stock_ledger = require("./stock-ledger");
async function transferAction(c, actor, a) {
  if (a.type === "transfer") {
    const p2 = await (0, import_stock_ledger.partLock)(c, a.code), source = await (0, import_stock_ledger.place)(c, a.from ?? "Central"), dest = await (0, import_stock_ledger.place)(c, a.to);
    const q2 = (0, import_permissions.integer)(a.quantity), note = (0, import_permissions.reason)(a.reason), key = (0, import_permissions.text)(a.requestKey, 64);
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(key))
      throw new import_permissions.ActionError(
        "Identificador de solicita\xE7\xE3o ausente. Atualize e tente novamente."
      );
    if (Number(source.id) === Number(dest.id))
      throw new import_permissions.ActionError("Escolha locais diferentes.");
    const existing = await (0, import_stock_ledger.first)(
      c,
      "SELECT id FROM stock_transfers WHERE request_key=? FOR UPDATE",
      [key]
    );
    if (existing) throw new import_permissions.ActionError("Solicita\xE7\xE3o j\xE1 registrada.", 409);
    const b2 = (await (0, import_stock_ledger.stock)(c, Number(p2.id))).find(
      (b3) => Number(b3.warehouse_id) === Number(source.id)
    );
    if (!b2 || (0, import_stock_ledger.available)(b2) - Number(b2.minimum_quantity) < q2)
      throw new import_permissions.ActionError(
        "Saldo insuficiente acima das reservas e do m\xEDnimo da origem.",
        409
      );
    const [r] = await c.execute(
      "INSERT INTO stock_transfers(part_id,source_warehouse_id,destination_warehouse_id,quantity,qr_code_scanned,performed_by,status,reason,request_key) VALUES(?,?,?,?,?,?,'Solicitada',?,?)",
      [p2.id, source.id, dest.id, q2, "", actor, note, key]
    );
    await (0, import_stock_ledger.audit)(c, actor, "transfer", r.insertId, "request", {
      quantity: q2,
      reason: note
    });
    return { id: r.insertId };
  }
  const id = (0, import_permissions.integer)(a.id);
  const ref = await (0, import_stock_ledger.first)(c, "SELECT part_id FROM stock_transfers WHERE id=?", [
    id
  ]);
  if (!ref) throw new import_permissions.ActionError("Transfer\xEAncia inexistente.", 404);
  const p = await (0, import_stock_ledger.partLock)(c, null, ref.part_id);
  const t = await (0, import_stock_ledger.first)(
    c,
    "SELECT * FROM stock_transfers WHERE id=? FOR UPDATE",
    [id]
  );
  const dispatch = a.type === "dispatchTransfer";
  if (a.type === "cancelTransfer") {
    if (t.status !== "Solicitada")
      throw new import_permissions.ActionError(
        "Somente solicita\xE7\xF5es sem sa\xEDda podem ser canceladas.",
        409
      );
    await c.execute(
      "UPDATE stock_transfers SET status='Cancelada' WHERE id=?",
      [id]
    );
    await (0, import_stock_ledger.audit)(c, actor, "transfer", id, "cancel", {
      reason: (0, import_permissions.reason)(a.reason)
    });
    return { id };
  }
  if (t.status !== (dispatch ? "Solicitada" : "Em tr\xE2nsito"))
    throw new import_permissions.ActionError("Etapa j\xE1 confirmada ou inv\xE1lida.", 409);
  (0, import_stock_ledger.scan)(p, a.qrCode);
  const q = Number(t.quantity);
  if ((0, import_permissions.integer)(a.confirmedQuantity) !== q)
    throw new import_permissions.ActionError("Confirme a quantidade exata conferida.", 422);
  const warehouse = Number(
    dispatch ? t.source_warehouse_id : t.destination_warehouse_id
  );
  await c.execute(
    "INSERT IGNORE INTO inventory(part_id,warehouse_id) VALUES(?,?)",
    [p.id, warehouse]
  );
  const b = (await (0, import_stock_ledger.stock)(c, Number(p.id))).find(
    (b2) => Number(b2.warehouse_id) === warehouse
  );
  if (!b)
    throw new import_permissions.ActionError(
      "Local inativo. Regularize o almoxarifado antes de confirmar.",
      409
    );
  if (dispatch) {
    if ((0, import_stock_ledger.available)(b) - Number(b.minimum_quantity) < q)
      throw new import_permissions.ActionError(
        "Sa\xEDda consumiria reservas ou m\xEDnimo da origem.",
        409
      );
    await c.execute(
      "UPDATE inventory SET quantity=quantity-? WHERE part_id=? AND warehouse_id=?",
      [q, p.id, warehouse]
    );
    await c.execute(
      "UPDATE stock_transfers SET status='Em tr\xE2nsito',shipped_by=?,shipped_at=UTC_TIMESTAMP(3),qr_code_scanned=? WHERE id=?",
      [actor, (0, import_permissions.text)(a.qrCode, 128), id]
    );
  } else {
    (0, import_stock_ledger.capacity)(b, Number(b.quantity) + q);
    await c.execute(
      "UPDATE inventory SET quantity=quantity+? WHERE part_id=? AND warehouse_id=?",
      [q, p.id, warehouse]
    );
    await c.execute(
      "UPDATE stock_transfers SET status='Recebida',received_by=?,received_at=UTC_TIMESTAMP(3) WHERE id=?",
      [actor, id]
    );
  }
  await (0, import_stock_ledger.movement)(
    c,
    actor,
    Number(p.id),
    warehouse,
    dispatch ? "transferencia_saida" : "transferencia_entrada",
    q,
    String(t.reason),
    null,
    null,
    null,
    id
  );
  await (0, import_stock_ledger.audit)(c, actor, "transfer", id, dispatch ? "dispatch" : "receive", {
    quantity: q
  });
  return { id };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  transferAction
});
