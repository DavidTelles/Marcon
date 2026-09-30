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
var delivery_planning_exports = {};
__export(delivery_planning_exports, {
  deliveryHistory: () => deliveryHistory,
  planDelivery: () => planDelivery,
  recordDeliveryPlan: () => recordDeliveryPlan
});
module.exports = __toCommonJS(delivery_planning_exports);
var import_db = require("./db");
var import_permissions = require("./permissions");
var import_stock_ledger = require("./stock-ledger");
var import_routing = require("./routing");
async function deliveryHistory(id, page = 1) {
  const [history] = await (0, import_db.getPool)().execute(
    `SELECT h.id,h.map_version_id,h.event,h.payload,h.created_at,u.name AS actor FROM delivery_route_history h JOIN users u ON u.id=h.actor_id WHERE h.request_id=? ORDER BY h.id DESC LIMIT 20 OFFSET ${(page - 1) * 20}`,
    [id]
  );
  return history.map((h) => ({
    ...h,
    payload: typeof h.payload === "string" ? JSON.parse(h.payload) : h.payload
  }));
}
async function planDelivery(user, a) {
  (0, import_permissions.demand)(user, "stock");
  const id = (0, import_permissions.integer)(a.requestId);
  return (0, import_db.transaction)((c) => recordDeliveryPlan(c, user, a, id));
}
async function recordDeliveryPlan(c, user, a, id) {
  const actor = await (0, import_stock_ledger.first)(
    c,
    "SELECT id FROM users WHERE employee_no=? AND active=TRUE",
    [user.id]
  );
  if (!actor) throw new import_permissions.ActionError("Sess\xE3o inv\xE1lida.", 401);
  const r = await (0, import_stock_ledger.first)(c, "SELECT * FROM requests WHERE id=? FOR UPDATE", [
    id
  ]);
  if (!r || r.status !== "Aprovada")
    throw new import_permissions.ActionError(
      "Rota dispon\xEDvel somente para requisi\xE7\xE3o aprovada.",
      409
    );
  const previous = await (0, import_stock_ledger.first)(
    c,
    "SELECT * FROM delivery_route_history WHERE request_id=? ORDER BY id DESC LIMIT 1 FOR UPDATE",
    [id]
  );
  if (previous?.event === "Sa\xEDda")
    throw new import_permissions.ActionError("Sa\xEDda j\xE1 registrada. Hist\xF3rico preservado.", 409);
  const map = await (0, import_stock_ledger.first)(
    c,
    "SELECT id,graph FROM map_versions WHERE status='Publicada' LOCK IN SHARE MODE"
  );
  const graph = map ? typeof map.graph === "string" ? JSON.parse(map.graph) : map.graph : null;
  const old = previous ? typeof previous.payload === "string" ? JSON.parse(previous.payload) : previous.payload : null;
  const depart = a.action === "departDelivery";
  const destinations = depart ? old?.destinations ?? [] : a.destinations ?? [];
  if (!Array.isArray(destinations) || destinations.length > 20 || !destinations.every((s) => typeof s === "string"))
    throw new import_permissions.ActionError("Destinos inv\xE1lidos.");
  let route = null;
  let start = depart ? old?.start ?? "" : (0, import_permissions.text)(a.start, 64);
  let reason = "Rota indispon\xEDvel: nenhum mapa publicado v\xE1lido. Opera\xE7\xE3o manual.";
  if (graph && graph.reviewed && !(0, import_routing.graphProblems)(graph).length) {
    graph.scaleCalibrated = graph.scaleCalibrated === true;
    const reservations = await (0, import_stock_ledger.rows)(
      c,
      "SELECT rr.warehouse_id,i.map_node_id FROM request_reservations rr JOIN inventory i ON i.part_id=rr.part_id AND i.warehouse_id=rr.warehouse_id WHERE rr.request_id=? ORDER BY rr.warehouse_id",
      [id]
    );
    const pickups = reservations.map(
      (v) => graph.nodes.find((n) => n.id === v.map_node_id)?.id ?? graph.nodes.find((n) => n.warehouseId === Number(v.warehouse_id))?.id
    );
    const end = graph.nodes.find(
      (n) => n.blockId === Number(r.block_id) && n.kind === "delivery"
    ) ?? graph.nodes.find((n) => n.blockId === Number(r.block_id));
    if (destinations.some(
      (d) => !graph.nodes.some((n) => n.id === d && n.kind === "delivery")
    ))
      throw new import_permissions.ActionError(
        "Destino adicional n\xE3o \xE9 um ponto de entrega do mapa atual."
      );
    start ||= pickups[0] ?? "";
    if (start && !graph.nodes.some((n) => n.id === start))
      start = pickups[0] ?? "";
    reason = "Rota indispon\xEDvel: falta liga\xE7\xE3o transit\xE1vel ou v\xEDnculo de origem/destino. Opera\xE7\xE3o manual.";
    if (pickups.length && pickups.every(Boolean) && end) {
      const collection = (0, import_routing.planStops)(graph, start, pickups);
      const delivery = collection && (0, import_routing.planStops)(graph, collection.nodes.at(-1), [end.id, ...destinations]);
      if (collection && delivery) {
        route = {
          nodes: [...collection.nodes, ...delivery.nodes.slice(1)],
          cost: collection.cost + delivery.cost,
          stops: [
            ...collection.stops ?? [],
            ...(delivery.stops ?? []).slice(1)
          ]
        };
        reason = "Dijkstra e ordena\xE7\xE3o heur\xEDstica das paradas; coletas antes das entregas. Sem movimenta\xE7\xE3o de saldo.";
      }
    }
  }
  if (depart && !route && a.manual !== true)
    throw new import_permissions.ActionError(
      reason + " Confirme a sa\xEDda manual explicitamente.",
      409
    );
  const payload = {
    route,
    metric: graph?.scaleCalibrated === true ? "m" : "pixels estimados",
    reason,
    labels: route?.nodes.map((id2) => graph.nodes.find((n) => n.id === id2).label) ?? [],
    destinations,
    start
  };
  if (a.atDelivery === true) payload.reason += " C\xE1lculo registrado na confirma\xE7\xE3o da entrega; hor\xE1rio de sa\xEDda n\xE3o informado.";
  const event = depart ? "Sa\xEDda" : previous ? "Recalculada" : "Planejada";
  const [saved] = await c.execute(
    "INSERT INTO delivery_route_history(request_id,map_version_id,actor_id,event,payload) VALUES(?,?,?,?,?)",
    [id, map?.id ?? null, actor.id, event, JSON.stringify(payload)]
  );
  await (0, import_stock_ledger.audit)(c, Number(actor.id), "request", id, "route", {
    routeId: saved.insertId,
    mapVersion: map?.id ?? null,
    event
  });
  return {
    id: saved.insertId,
    mapVersion: map?.id ?? null,
    graph,
    ...payload,
    event
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  deliveryHistory,
  planDelivery,
  recordDeliveryPlan
});
