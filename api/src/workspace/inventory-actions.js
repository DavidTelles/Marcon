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
var inventory_actions_exports = {};
__export(inventory_actions_exports, {
  executeInventoryAction: () => executeInventoryAction,
  inventoryActions: () => inventoryActions
});
module.exports = __toCommonJS(inventory_actions_exports);
var import_db = require("./db");
var import_permissions = require("./permissions");
var import_stock_ledger = require("./stock-ledger");
var import_transfer_actions = require("./transfer-actions");
var import_request_actions = require("./request-actions");
const inventoryActions = /* @__PURE__ */ new Set([
  ...import_request_actions.requestActions,
  "transfer",
  "dispatchTransfer",
  "receiveTransfer",
  "cancelTransfer",
  "savePart",
  "deletePart",
  "stockEntry",
  "adjustStock",
  "registerReturn",
  "inspectReturn",
  "confirmInbound",
  "receiveInbound",
  "cancelInbound"
]);
async function executeInventoryAction(user, a, connection) {
  const work = async (c) => {
    const actor = await (0, import_stock_ledger.first)(
      c,
      "SELECT id,block_id,sector FROM users WHERE employee_no=? AND active=TRUE",
      [user.id]
    );
    if (!actor) throw new import_permissions.ActionError("Sess\xE3o inv\xE1lida.", 401);
    const actorId = Number(actor.id);
    if (import_request_actions.requestActions.has(String(a.type)))
      return (0, import_request_actions.executeRequestAction)(c, user, actor, a);
    (0, import_permissions.demand)(user, "stock");
    if ([
      "transfer",
      "dispatchTransfer",
      "receiveTransfer",
      "cancelTransfer"
    ].includes(String(a.type)))
      return (0, import_transfer_actions.transferAction)(c, actorId, a);
    if (a.type === "savePart") {
      const d = a.part;
      if (!d || typeof d !== "object")
        throw new import_permissions.ActionError("Dados inv\xE1lidos.");
      const code = (0, import_permissions.text)(d.code, 64).toUpperCase(), name = (0, import_permissions.text)(d.name, 160), qr = (0, import_permissions.text)(d.qrCode, 128).toUpperCase();
      if (!code || !name || !qr || !(0, import_permissions.text)(d.location, 80))
        throw new import_permissions.ActionError("Preencha c\xF3digo, nome, QR e localiza\xE7\xE3o.");
      const cost = Number(d.estimatedCost);
      if (!Number.isFinite(cost) || cost < 0 || cost > 9999999999)
        throw new import_permissions.ActionError("Custo inv\xE1lido.");
      const id = d.id ? (0, import_permissions.integer)(d.id) : null, w2 = await (0, import_stock_ledger.place)(c, a.warehouse), pack = (0, import_permissions.integer)(d.packSize), minimum = (0, import_permissions.integer)(d.minimum), lead = (0, import_permissions.integer)(d.leadDays), criticality = d.criticality === void 0 ? 1 : (0, import_permissions.integer)(d.criticality);
      if (criticality > 3)
        throw new import_permissions.ActionError("Criticidade deve ser 1, 2 ou 3.");
      const unit = (0, import_permissions.text)(d.unit, 24) || "un", category = (0, import_permissions.text)(d.category, 80) || "Pe\xE7as";
      const aliases = Array.isArray(d.approvedAliases) ? d.approvedAliases : [];
      if (aliases.length > 12 || aliases.some((alias) => typeof alias !== "string" || !alias.trim() || alias.length > 80))
        throw new import_permissions.ActionError("Use at\xE9 12 apelidos revisados de 80 caracteres.");
      const approvedAliases = [...new Set(aliases.map((alias) => String(alias).trim()))];
      const description = (0, import_permissions.text)(d.description, 1e3), purpose = (0, import_permissions.text)(d.purpose, 500), material = (0, import_permissions.text)(d.material, 120), dimensions = (0, import_permissions.text)(d.dimensions, 120);
      const image = typeof d.image === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(d.image) && d.image.length <= 15e5 ? d.image : null;
      let pId = id;
      if (id) {
        const old = await (0, import_stock_ledger.partLock)(c, null, id);
        await c.execute(
          "UPDATE parts SET name=?,code=?,qr_code=?,pack_size=?,minimum_total=?,lead_days=?,reference_unit_price=?,location=?,image_url=?,unit=?,category=?,criticality=?,description=?,purpose=?,material=?,dimensions=?,approved_aliases=? WHERE id=?",
          [
            name,
            code,
            qr,
            pack,
            minimum,
            lead,
            cost,
            (0, import_permissions.text)(d.location, 80),
            image ?? old.image_url,
            unit,
            category,
            criticality,
            description,
            purpose,
            material,
            dimensions,
            JSON.stringify(approvedAliases),
            id
          ]
        );
      } else {
        const [r] = await c.execute(
          "INSERT INTO parts(name,code,qr_code,pack_size,minimum_total,lead_days,reference_unit_price,location,image_url,unit,category,criticality,description,purpose,material,dimensions,approved_aliases) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [
            name,
            code,
            qr,
            pack,
            minimum,
            lead,
            cost,
            (0, import_permissions.text)(d.location, 80),
            image,
            unit,
            category,
            criticality,
            description,
            purpose,
            material,
            dimensions,
            JSON.stringify(approvedAliases)
          ]
        );
        pId = r.insertId;
      }
      await c.execute(
        "INSERT IGNORE INTO inventory(part_id,warehouse_id) VALUES(?,?)",
        [pId, w2.id]
      );
      const b = (await (0, import_stock_ledger.stock)(c, pId)).find(
        (v) => Number(v.warehouse_id) === Number(w2.id)
      ), q = (0, import_permissions.integer)(a.localQuantity, 0), delta = q - Number(b.quantity);
      if (q < Number(b.reserved))
        throw new import_permissions.ActionError("O saldo n\xE3o pode ficar abaixo da reserva.", 409);
      const cap = d.capacity === null || d.capacity === void 0 || d.capacity === "" ? null : (0, import_permissions.integer)(Number(d.capacity));
      if (cap !== null && q > cap)
        throw new import_permissions.ActionError("Saldo maior que a capacidade.");
      const note = delta ? id ? (0, import_permissions.reason)(a.reason) : (0, import_permissions.text)(a.reason) || "Cadastro inicial do saldo" : "Atualiza\xE7\xE3o cadastral";
      await c.execute(
        "UPDATE inventory SET quantity=?,minimum_quantity=?,aisle=?,shelf=?,capacity=?,map_node_id=? WHERE part_id=? AND warehouse_id=?",
        [
          q,
          d.localMinimum === void 0 ? Number(b.minimum_quantity) || Math.max(1, Math.ceil(minimum / 4)) : (0, import_permissions.integer)(Number(d.localMinimum), 0),
          (0, import_permissions.text)(d.aisle, 80),
          (0, import_permissions.text)(d.shelf, 80) || (0, import_permissions.text)(d.location, 80),
          cap,
          (0, import_permissions.text)(d.mapNodeId, 64) || null,
          pId,
          w2.id
        ]
      );
      await (0, import_stock_ledger.movement)(
        c,
        actorId,
        pId,
        Number(w2.id),
        delta > 0 ? "ajuste_entrada" : "ajuste_saida",
        Math.abs(delta),
        note
      );
      await (0, import_stock_ledger.audit)(c, actorId, "part", pId, id ? "update" : "create", {
        note,
        quantity: q,
        code,
        referenceUnitPrice: cost
      });
      return { id: pId };
    }
    if (a.type === "registerReturn") {
      const p2 = await (0, import_stock_ledger.partLock)(c, a.code), q = (0, import_permissions.integer)(a.quantity), w2 = await (0, import_stock_ledger.place)(c, a.warehouse ?? "Central"), b = await (0, import_stock_ledger.first)(c, "SELECT id FROM blocks WHERE name=?", [
        (0, import_permissions.text)(a.block, 80)
      ]);
      if (!b || !["Apto", "Danificado"].includes(String(a.condition)))
        throw new import_permissions.ActionError("Bloco ou condi\xE7\xE3o inv\xE1lidos.");
      const reqId = a.requestId ? (0, import_permissions.integer)(a.requestId) : null;
      if (reqId) {
        const r2 = await (0, import_stock_ledger.first)(
          c,
          "SELECT quantity,block_id,part_id FROM requests WHERE id=? AND status='Entregue' FOR UPDATE",
          [reqId]
        );
        const total = await (0, import_stock_ledger.first)(
          c,
          "SELECT COALESCE(SUM(quantity),0) AS total FROM return_records WHERE request_id=? FOR UPDATE",
          [reqId]
        );
        if (!r2 || Number(r2.part_id) !== Number(p2.id) || Number(r2.block_id) !== Number(b.id) || Number(total.total) + q > Number(r2.quantity))
          throw new import_permissions.ActionError(
            "Devolu\xE7\xE3o excede ou n\xE3o corresponde \xE0 entrega.",
            409
          );
      }
      const [r] = await c.execute(
        "INSERT INTO return_records(part_id,block_id,warehouse_id,quantity,condition_type,returned_by,note,received_by,request_id,inspection_status) VALUES(?,?,?,?,?,?,?,?,?,'Pendente')",
        [
          p2.id,
          b.id,
          w2.id,
          q,
          a.condition,
          (0, import_permissions.reason)(a.returnedBy),
          (0, import_permissions.reason)(a.note),
          actorId,
          reqId
        ]
      );
      await (0, import_stock_ledger.audit)(c, actorId, "return", r.insertId, "pending", { quantity: q });
      return { id: r.insertId };
    }
    if (a.type === "inspectReturn") {
      const id = (0, import_permissions.integer)(a.id), lookup = await (0, import_stock_ledger.first)(
        c,
        "SELECT part_id FROM return_records WHERE id=?",
        [id]
      );
      if (!lookup) throw new import_permissions.ActionError("Devolu\xE7\xE3o n\xE3o encontrada.", 404);
      await (0, import_stock_ledger.partLock)(c, null, lookup.part_id);
      const r = await (0, import_stock_ledger.first)(
        c,
        "SELECT * FROM return_records WHERE id=? FOR UPDATE",
        [id]
      );
      if (r.inspection_status !== "Pendente")
        throw new import_permissions.ActionError("Devolu\xE7\xE3o j\xE1 conferida.", 409);
      if (!["Apto", "Danificado"].includes(String(a.condition)))
        throw new import_permissions.ActionError("Condi\xE7\xE3o inv\xE1lida.");
      const note = (0, import_permissions.reason)(a.reason);
      if (a.condition === "Apto") {
        await c.execute(
          "INSERT IGNORE INTO inventory(part_id,warehouse_id) VALUES(?,?)",
          [r.part_id, r.warehouse_id]
        );
        const b = (await (0, import_stock_ledger.stock)(c, Number(r.part_id))).find(
          (v) => Number(v.warehouse_id) === Number(r.warehouse_id)
        );
        (0, import_stock_ledger.capacity)(b, Number(b.quantity) + Number(r.quantity));
        await c.execute(
          "UPDATE inventory SET quantity=quantity+? WHERE part_id=? AND warehouse_id=?",
          [r.quantity, r.part_id, r.warehouse_id]
        );
        await (0, import_stock_ledger.movement)(
          c,
          actorId,
          Number(r.part_id),
          Number(r.warehouse_id),
          "devolucao",
          Number(r.quantity),
          note,
          r.request_id ? Number(r.request_id) : null,
          Number(r.block_id),
          id
        );
      }
      await c.execute(
        "UPDATE return_records SET condition_type=?,inspection_status='Conferida',inspected_at=UTC_TIMESTAMP(3),received_by=? WHERE id=?",
        [String(a.condition), actorId, id]
      );
      await (0, import_stock_ledger.audit)(c, actorId, "return", id, "inspect", {
        condition: a.condition,
        reason: note
      });
      return { id };
    }
    if (a.type === "receiveInbound" || a.type === "cancelInbound") {
      const id = (0, import_permissions.integer)(a.id), lookup = await (0, import_stock_ledger.first)(
        c,
        "SELECT part_id FROM expected_receipts WHERE id=?",
        [id]
      );
      if (!lookup)
        throw new import_permissions.ActionError("Entrada prevista n\xE3o encontrada.", 404);
      const p2 = await (0, import_stock_ledger.partLock)(c, null, lookup.part_id), r = await (0, import_stock_ledger.first)(
        c,
        "SELECT * FROM expected_receipts WHERE id=? FOR UPDATE",
        [id]
      );
      if (r.status !== "Confirmada")
        throw new import_permissions.ActionError("Entrada j\xE1 encerrada.", 409);
      if (a.type === "receiveInbound") {
        (0, import_stock_ledger.scan)(p2, a.qrCode);
        if ((0, import_permissions.integer)(a.quantity) !== Number(r.quantity))
          throw new import_permissions.ActionError("Confira a quantidade recebida.");
        await c.execute(
          "INSERT IGNORE INTO inventory(part_id,warehouse_id) VALUES(?,?)",
          [p2.id, r.warehouse_id]
        );
        const b = (await (0, import_stock_ledger.stock)(c, Number(p2.id))).find(
          (v) => Number(v.warehouse_id) === Number(r.warehouse_id)
        );
        (0, import_stock_ledger.capacity)(b, Number(b.quantity) + Number(r.quantity));
        await c.execute(
          "UPDATE inventory SET quantity=quantity+? WHERE part_id=? AND warehouse_id=?",
          [r.quantity, p2.id, r.warehouse_id]
        );
        await (0, import_stock_ledger.movement)(
          c,
          actorId,
          Number(p2.id),
          Number(r.warehouse_id),
          "entrada",
          Number(r.quantity),
          `Recebimento ${r.reference}`
        );
      }
      await c.execute("UPDATE expected_receipts SET status=? WHERE id=?", [
        a.type === "receiveInbound" ? "Recebida" : "Cancelada",
        id
      ]);
      await (0, import_stock_ledger.audit)(c, actorId, "inbound", id, String(a.type), {});
      return { id };
    }
    const p = await (0, import_stock_ledger.partLock)(
      c,
      a.code,
      a.type === "deletePart" ? (0, import_permissions.integer)(a.id) : void 0
    );
    if (a.type === "deletePart") {
      const pending = await (0, import_stock_ledger.first)(
        c,
        "SELECT id FROM requests WHERE part_id=? AND status NOT IN ('Cancelada','Entregue') LIMIT 1",
        [p.id]
      );
      if (pending || await (0, import_stock_ledger.first)(
        c,
        "SELECT id FROM stock_transfers WHERE part_id=? AND status IN ('Solicitada','Em tr\xE2nsito') LIMIT 1",
        [p.id]
      ) || (await (0, import_stock_ledger.stock)(c, Number(p.id))).some((b) => Number(b.quantity) > 0))
        throw new import_permissions.ActionError(
          "Zere o saldo e conclua pedidos antes de desativar.",
          409
        );
      await c.execute("UPDATE parts SET active=FALSE WHERE id=?", [p.id]);
      await (0, import_stock_ledger.audit)(c, actorId, "part", Number(p.id), "deactivate", {});
      return { id: p.id };
    }
    if (a.type === "confirmInbound") {
      const w2 = await (0, import_stock_ledger.place)(c, a.warehouse), q = (0, import_permissions.integer)(a.quantity), due = (0, import_permissions.text)(a.dueDate, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due)))
        throw new import_permissions.ActionError("Data prevista inv\xE1lida.");
      const [r] = await c.execute(
        "INSERT INTO expected_receipts(part_id,warehouse_id,quantity,due_date,supplier,reference,created_by) VALUES(?,?,?,?,?,?,?)",
        [p.id, w2.id, q, due, (0, import_permissions.reason)(a.supplier), (0, import_permissions.reason)(a.reference), actorId]
      );
      await (0, import_stock_ledger.audit)(c, actorId, "inbound", r.insertId, "confirm", {
        quantity: q
      });
      return { id: r.insertId };
    }
    const w = await (0, import_stock_ledger.place)(
      c,
      a.type === "transfer" ? a.from ?? "Central" : a.warehouse
    );
    await c.execute(
      "INSERT IGNORE INTO inventory(part_id,warehouse_id) VALUES(?,?)",
      [p.id, w.id]
    );
    if (a.type === "stockEntry" || a.type === "adjustStock") {
      const b = (await (0, import_stock_ledger.stock)(c, Number(p.id))).find(
        (b2) => Number(b2.warehouse_id) === Number(w.id)
      ), q = (0, import_permissions.integer)(a.quantity, a.type === "adjustStock" ? 0 : 1), next = a.type === "stockEntry" ? Number(b.quantity) + q : q, delta = next - Number(b.quantity), note = (0, import_permissions.reason)(a.reason);
      if (next < Number(b.reserved))
        throw new import_permissions.ActionError(
          "O saldo n\xE3o pode ficar abaixo do reservado.",
          409
        );
      (0, import_stock_ledger.capacity)(b, next);
      await c.execute(
        "UPDATE inventory SET quantity=? WHERE part_id=? AND warehouse_id=?",
        [next, p.id, w.id]
      );
      await (0, import_stock_ledger.movement)(
        c,
        actorId,
        Number(p.id),
        Number(w.id),
        a.type === "stockEntry" ? "entrada" : delta > 0 ? "ajuste_entrada" : "ajuste_saida",
        Math.abs(delta),
        note
      );
      await (0, import_stock_ledger.audit)(c, actorId, "part", Number(p.id), String(a.type), {
        warehouse: w.id,
        old: b.quantity,
        next,
        reason: note
      });
      return { ok: true };
    }
    throw new import_permissions.ActionError("A\xE7\xE3o inv\xE1lida.");
  };
  return connection ? work(connection) : (0, import_db.transaction)(work);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  executeInventoryAction,
  inventoryActions
});
