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
var request_actions_exports = {};
__export(request_actions_exports, {
  executeRequestAction: () => executeRequestAction,
  requestActions: () => requestActions
});
module.exports = __toCommonJS(request_actions_exports);
var import_node_crypto = require("node:crypto");
var import_delivery_planning = require("./delivery-planning");
var import_permissions = require("./permissions");
var import_stock_ledger = require("./stock-ledger");
var import_routing = require("./routing");
const requestActions = /* @__PURE__ */ new Set([
  "createRequests",
  "changeRequestStatus",
  "editRequest",
  "deleteRequest",
  "requestCancellation",
  "confirmReceipt"
]);
async function executeRequestAction(c, user, actor, a) {
  const actorId = Number(actor.id);
  if (a.type === "createRequests") {
    (0, import_permissions.demand)(user, "request");
    if (!Array.isArray(a.entries) || !a.entries.length || a.entries.length > 30 || a.entries.some((e) => !e || typeof e !== "object"))
      throw new import_permissions.ActionError("Carrinho inv\xE1lido.");
    const entries = a.entries;
    const requestKey = a.requestKey;
    if (requestKey !== void 0) {
      if (typeof requestKey !== "string" || !/^[a-zA-Z0-9_-]{16,64}$/.test(requestKey))
        throw new import_permissions.ActionError("Identificador de envio inv\xE1lido.");
      const hash = (0, import_node_crypto.createHash)("sha256").update(JSON.stringify(entries)).digest("hex");
      await c.execute(
        "INSERT IGNORE INTO request_submissions(actor_id,request_key,payload_hash) VALUES(?,?,?)",
        [actorId, requestKey, hash]
      );
      const submitted = await (0, import_stock_ledger.first)(
        c,
        "SELECT payload_hash,result FROM request_submissions WHERE actor_id=? AND request_key=? FOR UPDATE",
        [actorId, requestKey]
      );
      if (submitted.payload_hash !== hash)
        throw new import_permissions.ActionError("Este envio j\xE1 pertence a outro carrinho.", 409);
      if (submitted.result)
        return typeof submitted.result === "string" ? JSON.parse(submitted.result) : submitted.result;
    }
    if (new Set(entries.map((e) => (0, import_permissions.text)(e.code, 64).toUpperCase())).size !== entries.length)
      throw new import_permissions.ActionError("Agrupe os itens repetidos no carrinho.");
    const batch = (0, import_node_crypto.randomUUID)(), ids = [];
    for (const e of [...entries].sort(
      (x, y) => String(x.code).localeCompare(String(y.code))
    )) {
      const p2 = await (0, import_stock_ledger.partLock)(c, e.code), q = (0, import_permissions.integer)(e.quantity);
      if (!["Leve", "Moderado", "Urgente"].includes(String(e.priority)))
        throw new import_permissions.ActionError("Urg\xEAncia inv\xE1lida.");
      if ((q > 10 || e.priority === "Urgente") && !(0, import_permissions.text)(e.justification))
        throw new import_permissions.ActionError("Justifique o pedido fora do padr\xE3o.");
      if (q > (await (0, import_stock_ledger.stock)(c, Number(p2.id))).reduce((sum, r3) => sum + (0, import_stock_ledger.available)(r3), 0))
        throw new import_permissions.ActionError("Saldo dispon\xEDvel insuficiente.", 409);
      const [r2] = await c.execute(
        "INSERT INTO requests(requester_id,block_id,part_id,quantity,priority,justification,batch_id,sector) VALUES(?,?,?,?,?,?,?,?)",
        [
          actorId,
          actor.block_id,
          p2.id,
          q,
          e.priority,
          (0, import_permissions.text)(e.justification) || null,
          batch,
          actor.sector
        ]
      );
      ids.push(r2.insertId);
      await (0, import_stock_ledger.audit)(c, actorId, "request", r2.insertId, "create", {
        quantity: q,
        batch
      });
    }
    const result = { ids, batch };
    if (requestKey)
      await c.execute(
        "UPDATE request_submissions SET result=? WHERE actor_id=? AND request_key=?",
        [JSON.stringify(result), actorId, requestKey]
      );
    return result;
  }
  const id = (0, import_permissions.integer)(a.id), lookup = await (0, import_stock_ledger.first)(c, "SELECT part_id FROM requests WHERE id=?", [id]);
  if (!lookup) throw new import_permissions.ActionError("Requisi\xE7\xE3o n\xE3o encontrada.", 404);
  const p = await (0, import_stock_ledger.partLock)(c, null, lookup.part_id), r = await (0, import_stock_ledger.first)(c, "SELECT * FROM requests WHERE id=? FOR UPDATE", [id]);
  const owns = Number(r.requester_id) === actorId;
  if (user.role === "funcionario" && !owns || user.role === "lider" && Number(r.block_id) !== Number(actor.block_id))
    throw new import_permissions.ActionError("Requisi\xE7\xE3o fora do seu escopo.", 403);
  const pending = ["Pendente", "Em an\xE1lise"].includes(String(r.status));
  if (a.type === "editRequest" || a.type === "deleteRequest") {
    if (!owns || !pending)
      throw new import_permissions.ActionError(
        "Somente o requisitor pode editar/excluir antes da aprova\xE7\xE3o.",
        403
      );
    if (a.type === "editRequest") {
      const q = (0, import_permissions.integer)(a.quantity);
      if (q > (await (0, import_stock_ledger.stock)(c, Number(p.id))).reduce((s, v) => s + (0, import_stock_ledger.available)(v), 0))
        throw new import_permissions.ActionError("Saldo insuficiente.", 409);
      await c.execute("UPDATE requests SET quantity=? WHERE id=?", [q, id]);
    } else
      await c.execute(
        "UPDATE requests SET status='Cancelada',cancellation_reason='Exclu\xEDda pelo requisitor antes da aprova\xE7\xE3o' WHERE id=?",
        [id]
      );
  } else if (a.type === "confirmReceipt") {
    if (!owns || r.status !== "Entregue" || r.received_at)
      throw new import_permissions.ActionError("Recebimento indispon\xEDvel nesta etapa.", 409);
    await c.execute(
      "UPDATE requests SET received_at=UTC_TIMESTAMP(3) WHERE id=?",
      [id]
    );
  } else if (a.type === "requestCancellation") {
    if (!owns || r.status !== "Aprovada")
      throw new import_permissions.ActionError(
        "Cancelamento s\xF3 pode ser solicitado ap\xF3s aprova\xE7\xE3o e antes da entrega.",
        409
      );
    await c.execute(
      "UPDATE requests SET status='Cancelamento solicitado',cancellation_reason=? WHERE id=?",
      [(0, import_permissions.reason)(a.reason), id]
    );
  } else {
    const next = String(a.status);
    if (user.role === "funcionario")
      throw new import_permissions.ActionError("Aprova\xE7\xE3o/entrega exige outro perfil.", 403);
    if (next === "Em an\xE1lise" && r.status === "Pendente") {
      (0, import_permissions.demand)(user, "approve");
      await c.execute("UPDATE requests SET status='Em an\xE1lise' WHERE id=?", [
        id
      ]);
    } else if (next === "Aprovada" && (pending || r.status === "Aprovada")) {
      (0, import_permissions.demand)(user, "approve");
      const locations = await (0, import_stock_ledger.stock)(c, Number(p.id));
      const published = await (0, import_stock_ledger.first)(
        c,
        "SELECT graph FROM map_versions WHERE status='Publicada'"
      );
      const graph = published ? typeof published.graph === "string" ? JSON.parse(published.graph) : published.graph : null;
      const destination = graph?.nodes.find(
        (n) => n.blockId === Number(r.block_id) && (n.kind === "delivery" || n.kind === "block")
      );
      const ranked = locations.map((l) => {
        const node = graph?.nodes.find((n) => n.id === l.map_node_id) ?? graph?.nodes.find((n) => n.warehouseId === Number(l.warehouse_id));
        const path = graph && node && destination ? (0, import_routing.shortestPath)(graph, node.id, destination.id) : null;
        const factor = r.priority === "Urgente" ? 2 : r.priority === "Moderado" ? 1.5 : 1;
        return {
          l,
          score: path ? path.cost * factor + (Number(l.block_id) === Number(r.block_id) ? 0 : 30) : Number(l.block_id) === Number(r.block_id) ? 1e6 : Number(l.is_central) ? 2e6 : 3e6
        };
      }).sort((a2, b) => a2.score - b.score || (0, import_stock_ledger.available)(b.l) - (0, import_stock_ledger.available)(a2.l));
      const existing = await (0, import_stock_ledger.rows)(
        c,
        "SELECT warehouse_id,quantity FROM request_reservations WHERE request_id=? FOR UPDATE",
        [id]
      );
      let remaining = Number(r.quantity) - existing.reduce((sum, v) => sum + Number(v.quantity), 0);
      for (const { l } of ranked) {
        const q = Math.min(remaining, (0, import_stock_ledger.available)(l));
        if (q > 0) {
          await c.execute(
            "INSERT INTO request_reservations(request_id,part_id,warehouse_id,quantity) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)",
            [id, p.id, l.warehouse_id, q]
          );
          remaining -= q;
        }
      }
      if (remaining)
        throw new import_permissions.ActionError(
          "Saldo insuficiente para reservar. Nenhuma aprova\xE7\xE3o foi aplicada.",
          409
        );
      await c.execute(
        "UPDATE requests SET status='Aprovada',approved_by=?,approved_at=COALESCE(approved_at,UTC_TIMESTAMP(3)) WHERE id=?",
        [actorId, id]
      );
    } else if (next === "Cancelada" && [
      "Pendente",
      "Em an\xE1lise",
      "Aprovada",
      "Cancelamento solicitado"
    ].includes(String(r.status))) {
      if (user.role === "almoxarifado" && !["Aprovada", "Cancelamento solicitado"].includes(String(r.status)))
        throw new import_permissions.ActionError("Aguardando aprova\xE7\xE3o do gestor.", 403);
      await c.execute("DELETE FROM request_reservations WHERE request_id=?", [
        id
      ]);
      await c.execute(
        "UPDATE requests SET status='Cancelada',cancellation_reason=COALESCE(cancellation_reason,?) WHERE id=?",
        [(0, import_permissions.reason)(a.reason ?? "Cancelamento confirmado pelo respons\xE1vel"), id]
      );
    } else if (next === "Entregue" && r.status === "Aprovada") {
      (0, import_permissions.demand)(user, "stock");
      (0, import_stock_ledger.scan)(p, a.qrCode);
      if ((0, import_permissions.integer)(a.confirmedQuantity) !== Number(r.quantity))
        throw new import_permissions.ActionError("Confirme a quantidade exata separada.", 422);
      const departure = await (0, import_stock_ledger.first)(
        c,
        "SELECT id FROM delivery_route_history WHERE request_id=? AND event='Sa\xEDda' LIMIT 1",
        [id]
      );
      if (!departure)
        await (0, import_delivery_planning.recordDeliveryPlan)(
          c,
          user,
          { action: "planDelivery", atDelivery: true },
          id
        );
      const reserved = await (0, import_stock_ledger.rows)(
        c,
        "SELECT * FROM request_reservations WHERE request_id=? ORDER BY warehouse_id FOR UPDATE",
        [id]
      );
      if (reserved.reduce((s, v) => s + Number(v.quantity), 0) !== Number(r.quantity))
        throw new import_permissions.ActionError(
          "Reserva incompleta. Pe\xE7a revalida\xE7\xE3o ao gestor.",
          409
        );
      for (const v of reserved) {
        const [updated] = await c.execute(
          "UPDATE inventory SET quantity=quantity-? WHERE part_id=? AND warehouse_id=? AND quantity>=?",
          [v.quantity, p.id, v.warehouse_id, v.quantity]
        );
        if (updated.affectedRows !== 1)
          throw new import_permissions.ActionError("Saldo inconsistente. Entrega bloqueada.", 409);
        await (0, import_stock_ledger.movement)(
          c,
          actorId,
          Number(p.id),
          Number(v.warehouse_id),
          "saida",
          Number(v.quantity),
          "Entrega conferida",
          id,
          Number(r.block_id)
        );
      }
      await c.execute("DELETE FROM request_reservations WHERE request_id=?", [
        id
      ]);
      await c.execute(
        "UPDATE requests SET status='Entregue',fulfilled_by=?,fulfilled_from=?,delivered_at=UTC_TIMESTAMP(3) WHERE id=?",
        [actorId, reserved[0].warehouse_id, id]
      );
    } else throw new import_permissions.ActionError("Transi\xE7\xE3o de estado inv\xE1lida.", 409);
  }
  await (0, import_stock_ledger.audit)(c, actorId, "request", id, String(a.type), {
    status: a.status ?? null,
    quantity: a.quantity ?? null
  });
  return { id };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  executeRequestAction,
  requestActions
});
