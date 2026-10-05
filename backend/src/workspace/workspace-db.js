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
var workspace_db_exports = {};
__export(workspace_db_exports, {
  workspaceSnapshot: () => workspaceSnapshot
});
module.exports = __toCommonJS(workspace_db_exports);
var import_db = require("./db");
const { requestPattern } = require('./request-policy');
const { ActionError } = require('./permissions');
const roles = {
  admin: "Administrador",
  lider: "L\xEDder de bloco",
  almoxarifado: "Almoxarife",
  funcionario: "Funcion\xE1rio"
};
async function workspaceSnapshot(user, catalogOnly = false) {
  return (0, import_db.transaction)(async (c) => {
    const [actors] = await c.execute("SELECT block_id,sector FROM users WHERE employee_no=?", [user.id]);
    const actor = actors[0];
    if (user.role === "lider" && (!actor || !Number.isSafeInteger(Number(actor.block_id)) || Number(actor.block_id) < 1))
      throw new ActionError("Configure o vínculo do líder com um bloco antes de consultar o painel.", 403);
    const scope = user.role === "funcionario" ? "u.employee_no=?" : user.role === "lider" ? "b.id=?" : "1=1";
    const params = user.role === "funcionario" ? [user.id] : user.role === "lider" ? [Number(actor.block_id)] : [];
    const requestScope = scope;
    const [patterns] = actor ? await c.execute("SELECT part_id,block_id,sector,quantity FROM requests WHERE (block_id=? OR sector=?) AND approved_at IS NOT NULL AND status NOT IN ('Cancelada','Rejeitada') AND created_at>=DATE_SUB(NOW(),INTERVAL 90 DAY)", [actor.block_id, actor.sector]) : [[]];
    const [rr] = await c.execute(
      `SELECT r.*,COALESCE((SELECT SUM(m.quantity) FROM stock_movements m WHERE m.request_id=r.id AND m.kind='saida'),0) AS delivered_quantity,p.name AS material,p.code,p.unit,fu.employee_no AS fulfilled_no,u.employee_no,u.name AS person,b.name AS block,DATE_FORMAT(r.created_at,'%d/%m/%Y') AS date FROM requests r JOIN parts p ON p.id=r.part_id JOIN users u ON u.id=r.requester_id JOIN blocks b ON b.id=r.block_id LEFT JOIN users fu ON fu.id=r.fulfilled_by WHERE ${requestScope} ${catalogOnly ? "AND FALSE" : ""} ORDER BY r.created_at DESC,r.id DESC`,
      params
    );
    const [br] = await c.query(
      "SELECT p.code,w.id AS warehouse_id,COALESCE(i.quantity,0) AS quantity,COALESCE(i.minimum_quantity,0) AS minimum_quantity,COALESCE(i.aisle,'') AS aisle,COALESCE(i.shelf,p.location) AS shelf,i.capacity,i.map_node_id,w.name AS warehouse,COALESCE((SELECT SUM(r.quantity) FROM request_reservations r WHERE r.part_id=p.id AND r.warehouse_id=w.id),0) AS reserved,COALESCE((SELECT SUM(t.quantity) FROM stock_transfers t WHERE t.part_id=p.id AND t.source_warehouse_id=w.id AND t.status='Solicitada'),0) AS committed FROM parts p CROSS JOIN warehouses w LEFT JOIN inventory i ON i.part_id=p.id AND i.warehouse_id=w.id WHERE p.active=TRUE AND w.active=TRUE ORDER BY p.id,w.id"
    );
    const balances = br.map((b) => ({
      partCode: String(b.code),
      warehouse: String(b.warehouse),
      quantity: Number(b.quantity),
      reserved: Number(b.reserved),
      available: Number(b.quantity) - Number(b.reserved) - Number(b.committed),
      committed: Number(b.committed),
      minimum: Number(b.minimum_quantity),
      aisle: String(b.aisle),
      shelf: String(b.shelf),
      capacity: b.capacity === null ? null : Number(b.capacity),
      warehouseId: Number(b.warehouse_id),
      nodeId: b.map_node_id ? String(b.map_node_id) : void 0
    }));
    const [ar] = await c.execute(
      `SELECT a.request_id,a.quantity,w.name,CONCAT(i.aisle,' / ',i.shelf) AS location,i.map_node_id FROM request_reservations a JOIN requests r ON r.id=a.request_id JOIN users u ON u.id=r.requester_id JOIN blocks b ON b.id=r.block_id JOIN warehouses w ON w.id=a.warehouse_id JOIN inventory i ON i.part_id=a.part_id AND i.warehouse_id=a.warehouse_id WHERE ${requestScope} ${catalogOnly ? "AND FALSE" : ""}`,
      params
    );
    const [collected] = await c.execute(
      `SELECT m.request_id,SUM(m.quantity) AS quantity,w.name,CONCAT(i.aisle,' / ',i.shelf) AS location,i.map_node_id FROM stock_movements m JOIN requests r ON r.id=m.request_id JOIN users u ON u.id=r.requester_id JOIN blocks b ON b.id=r.block_id JOIN warehouses w ON w.id=m.warehouse_id LEFT JOIN inventory i ON i.part_id=m.part_id AND i.warehouse_id=m.warehouse_id WHERE ${requestScope} AND m.kind='saida' ${catalogOnly ? "AND FALSE" : ""} GROUP BY m.request_id,w.id,w.name,i.aisle,i.shelf,i.map_node_id`,
      params
    );
    const requests = rr.map((r) => ({
      unit: String(r.unit),
      requestedUnit: r.requested_unit || 'piece',
      requestedAmount: Number(r.requested_amount ?? r.quantity),
      packSizeAtRequest: Number(r.pack_size_at_request ?? 1),
      anomaly: typeof r.anomaly === 'string' ? JSON.parse(r.anomaly) : r.anomaly ?? undefined,
      pickedAt: r.picked_at || undefined,
      fulfilledBy: r.fulfilled_no || undefined,
      id: Number(r.id),
      material: String(r.material),
      code: String(r.code),
      quantity: Number(r.quantity),
      requestedQuantity: Number(r.quantity),
      approvedQuantity: r.approved_at ? Number(r.quantity) : 0,
      deliveredQuantity: Number(r.delivered_quantity),
      person: String(r.person),
      requesterId: String(r.employee_no),
      block: String(r.block),
      sector: String(r.sector),
      batchId: r.batch_id ? String(r.batch_id) : void 0,
      createdAt: String(r.created_at),
      date: String(r.date),
      status: r.status,
      priority: r.priority,
      justification: r.justification ? String(r.justification) : void 0,
      receivedAt: r.received_at ? String(r.received_at) : void 0,
      deliveredAt: r.delivered_at ? String(r.delivered_at) : void 0,
      cancellationReason: r.cancellation_reason ? String(r.cancellation_reason) : void 0,
      reserved: ar.filter((a) => Number(a.request_id) === Number(r.id)).reduce((sum, a) => sum + Number(a.quantity), 0),
      allocations: (r.picked_at ? collected : ar).filter((a) => Number(a.request_id) === Number(r.id)).map((a) => ({
        warehouse: String(a.name),
        quantity: Number(a.quantity),
        location: String(a.location),
        nodeId: a.map_node_id ? String(a.map_node_id) : void 0
      }))
    }));
    const [mr] = await c.execute(
      `SELECT m.*,p.code,w.name AS warehouse,b.name AS block,COALESCE(u.name,au.name) AS requester,au.name AS actor,DATE_FORMAT(m.created_at,'%Y-%m-%d') AS date FROM stock_movements m JOIN parts p ON p.id=m.part_id JOIN warehouses w ON w.id=m.warehouse_id LEFT JOIN requests r ON r.id=m.request_id LEFT JOIN users u ON u.id=r.requester_id LEFT JOIN blocks b ON b.id=m.block_id JOIN users au ON au.id=m.actor_id WHERE ${scope} ${catalogOnly ? "AND FALSE" : ""} ORDER BY m.created_at DESC,m.id DESC LIMIT 10000`,
      params
    );
    const movements = mr.map((m) => ({
      id: Number(m.id),
      partCode: String(m.code),
      type: [
        "entrada",
        "transferencia_entrada",
        "devolucao",
        "ajuste_entrada"
      ].includes(String(m.kind)) ? "entrada" : "saida",
      kind: String(m.kind),
      quantity: Number(m.quantity),
      date: String(m.date),
      warehouse: String(m.warehouse),
      block: m.block ? String(m.block) : void 0,
      requester: String(m.requester),
      actor: String(m.actor),
      reason: String(m.reason),
      transferId: m.transfer_id ? Number(m.transfer_id) : void 0
    }));
    const [pr] = await c.query(
      "SELECT * FROM parts WHERE active=TRUE ORDER BY name"
    );
    const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), previous = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
    const stock = pr.map((p) => {
      let approvedAliases = [];
      try {
        const aliases = typeof p.approved_aliases === "string" ? JSON.parse(p.approved_aliases) : p.approved_aliases;
        if (Array.isArray(aliases)) approvedAliases = aliases.filter((alias) => typeof alias === "string");
      } catch {
      }
      const loc = balances.filter((b) => b.partCode === p.code), withdrawals = movements.filter(
        (m) => m.partCode === p.code && m.kind === "saida"
      );
      return {
        requestPattern: actor ? requestPattern(patterns, Number(p.id), Number(actor.block_id), String(actor.sector)) : undefined,
        id: Number(p.id),
        name: String(p.name),
        description: p.description ? String(p.description) : void 0,
        purpose: p.purpose ? String(p.purpose) : void 0,
        material: p.material ? String(p.material) : void 0,
        dimensions: p.dimensions ? String(p.dimensions) : void 0,
        approvedAliases,
        code: String(p.code),
        qrCode: String(p.qr_code),
        quantity: loc.reduce((s, b) => s + b.quantity, 0),
        reserved: loc.reduce((s, b) => s + (b.reserved ?? 0), 0),
        available: loc.reduce((s, b) => s + (b.available ?? 0), 0),
        packSize: Number(p.pack_size),
        minimum: Number(p.minimum_total),
        leadDays: Number(p.lead_days),
        unit: String(p.unit),
        category: String(p.category),
        criticality: Number(p.criticality),
        estimatedCost: ["admin", "almoxarifado"].includes(user.role) ? Number(p.reference_unit_price) : 0,
        location: String(p.location),
        warehouse: loc.find((l) => l.quantity > 0)?.warehouse ?? "Central",
        image: p.image_url && p.image_verified_at && p.image_source && p.image_usage ? String(p.image_url) : void 0,
        consumed30: withdrawals.filter((m) => m.date >= cutoff).reduce((s, m) => s + m.quantity, 0),
        previous30: withdrawals.filter((m) => m.date >= previous && m.date < cutoff).reduce((s, m) => s + m.quantity, 0),
        locations: loc.map((l) => ({
          warehouse: l.warehouse,
          warehouseId: l.warehouseId,
          aisle: l.aisle ?? "",
          shelf: l.shelf ?? "",
          minimum: l.minimum ?? 0,
          capacity: l.capacity ?? null,
          nodeId: l.nodeId,
          quantity: l.quantity,
          available: l.available ?? l.quantity,
          reserved: l.reserved ?? 0
        }))
      };
    });
    const [ret] = await c.execute(
      `SELECT ret.*,p.code,p.pack_size,b.name AS block,w.name AS warehouse,DATE_FORMAT(ret.created_at,'%Y-%m-%d') AS date FROM return_records ret JOIN parts p ON p.id=ret.part_id JOIN warehouses w ON w.id=ret.warehouse_id JOIN blocks b ON b.id=ret.block_id LEFT JOIN requests r ON r.id=ret.request_id LEFT JOIN users u ON u.id=r.requester_id WHERE ${scope} ${catalogOnly ? "AND FALSE" : ""} ORDER BY ret.created_at DESC`,
      params
    );
    const returns = ret.map((r) => ({
      inspectedAt: r.inspected_at || undefined,
      id: Number(r.id),
      partCode: String(r.code),
      packSize: Number(r.pack_size),
      quantity: Number(r.quantity),
      boxes: Math.floor(Number(r.quantity) / Number(r.pack_size)),
      looseUnits: Number(r.quantity) % Number(r.pack_size),
      fromBlock: String(r.block),
      returnedBy: String(r.returned_by),
      date: String(r.date),
      condition: r.condition_type,
      note: String(r.note ?? ""),
      inspectionStatus: String(r.inspection_status),
      requestId: r.request_id ? Number(r.request_id) : void 0,
      warehouse: String(r.warehouse)
    }));
    let staff = [], transfers = [];
    if (!catalogOnly && ["admin", "almoxarifado"].includes(user.role)) {
      const [tr] = await c.query(
        "SELECT t.*,p.code,s.name AS source,d.name AS dest,DATE_FORMAT(t.created_at,'%Y-%m-%d') AS date FROM stock_transfers t JOIN parts p ON p.id=t.part_id JOIN warehouses s ON s.id=t.source_warehouse_id JOIN warehouses d ON d.id=t.destination_warehouse_id ORDER BY t.created_at DESC LIMIT 2000"
      );
      transfers = tr.map((t) => ({
        id: Number(t.id),
        partCode: String(t.code),
        from: String(t.source),
        to: String(t.dest),
        quantity: Number(t.quantity),
        date: String(t.date),
        qrCode: String(t.qr_code_scanned)
      }));
    }
    if (!catalogOnly && user.role === "admin") {
      const [sr] = await c.query(
        "SELECT u.*,b.name AS block FROM users u LEFT JOIN blocks b ON b.id=u.block_id ORDER BY u.name"
      );
      staff = sr.map((u) => ({
        id: String(u.employee_no),
        name: String(u.name),
        email: String(u.email),
        sector: String(u.sector),
        role: roles[u.role],
        active: Boolean(u.active),
        block: u.block ? String(u.block) : void 0
      }));
    }
    const [warehouses] = await c.query("SELECT id,name FROM warehouses WHERE active=TRUE ORDER BY is_central DESC,id");
    const [blocks] = await c.query("SELECT id,name FROM blocks ORDER BY id");
    return { stock, balances, requests, movements, returns, transfers, staff, warehouses, blocks };
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  workspaceSnapshot
});
