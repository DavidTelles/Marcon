import type { Account } from "./accounts";
import { transaction } from "./db";
import { ActionError, demand, integer, text, reason } from "./permissions";
import {
  first,
  partLock,
  place,
  stock,
  scan,
  capacity,
  audit,
  movement,
  rows,
} from "./stock-ledger";
import { transferAction } from "./transfer-actions";
import { storageRoute } from "./delivery-planning";
import type { RouteOptions } from "./routing";
import { requestActions, executeRequestAction } from "./request-actions";
import type { ResultSetHeader, PoolConnection } from "./db-types";
export const inventoryActions = new Set([
  ...requestActions,
  "transfer",
  "dispatchTransfer",
  "receiveTransfer",
  "cancelTransfer",
  "savePart",
  "deletePart",
  "stockEntry",
  "replenishStock",
  "adjustStock",
  "registerReturn",
  "inspectReturn",
  "confirmInbound",
  "receiveInbound",
  "cancelInbound",
]);
export async function executeInventoryAction(
  user: Account,
  a: Record<string, unknown>,
  connection?: PoolConnection,
) {
  const work = async (c: PoolConnection) => {
    const actor = await first(
      c,
      "SELECT id,block_id,sector FROM users WHERE employee_no=? AND active=TRUE",
      [user.id],
    );
    if (!actor) throw new ActionError("Sessão inválida.", 401);
    const actorId = Number(actor.id);
    if (requestActions.has(String(a.type)))
      return executeRequestAction(c, user, actor, a);
    demand(user, "stock");
    if (
      [
        "transfer",
        "dispatchTransfer",
        "receiveTransfer",
        "cancelTransfer",
      ].includes(String(a.type))
    )
      return transferAction(c, actorId, a);
    if (a.type === "savePart") {
      const d = a.part as Record<string, unknown>;
      if (!d || typeof d !== "object")
        throw new ActionError("Dados inválidos.");
      const code = text(d.code, 64).toUpperCase(),
        name = text(d.name, 160),
        qr = text(d.qrCode, 128).toUpperCase();
      if (!code || !name || !qr || !text(d.location, 80))
        throw new ActionError("Preencha código, nome, QR e localização.");
      const cost = Number(d.estimatedCost);
      if (!Number.isFinite(cost) || cost < 0 || cost > 9999999999)
        throw new ActionError("Custo inválido.");
      const id = d.id ? integer(d.id) : null,
        w = await place(c, a.warehouse),
        pack = integer(d.packSize),
        minimum = integer(d.minimum),
        lead = integer(d.leadDays),
        criticality = d.criticality === undefined ? 1 : integer(d.criticality);
      if (criticality > 3)
        throw new ActionError("Criticidade deve ser 1, 2 ou 3.");
      const unit = text(d.unit, 24) || "un",
        category = text(d.category, 80) || "Peças";
      const aliases = Array.isArray(d.approvedAliases) ? d.approvedAliases : [];
      if (aliases.length > 12 || aliases.some((alias) => typeof alias !== "string" || !alias.trim() || alias.length > 80))
        throw new ActionError("Use até 12 apelidos revisados de 80 caracteres.");
      const approvedAliases = [...new Set(aliases.map((alias) => String(alias).trim()))];
      const description = text(d.description, 1000),
        purpose = text(d.purpose, 500),
        material = text(d.material, 120),
        dimensions = text(d.dimensions, 120);
      const image =
        typeof d.image === "string" &&
        /^data:image\/(png|jpeg|webp);base64,/.test(d.image) &&
        d.image.length <= 1_500_000
          ? d.image
          : null;
      let pId = id;
      if (id) {
        const old = await partLock(c, null, id);
        if (unit !== old.unit) {
          const records = await first(c, "SELECT id FROM stock_movements WHERE part_id=? LIMIT 1", [id]);
          const documents = await first(c, "SELECT id FROM requests WHERE part_id=? LIMIT 1", [id]);
          const inbound = await first(c, "SELECT id FROM expected_receipts WHERE part_id=? LIMIT 1", [id]);
          const hasStock = (await stock(c, id)).some((v) => Number(v.quantity) || Number(v.reserved) || Number(v.pending_outgoing));
          if (records || documents || inbound || hasStock) throw new ActionError("Unidade com saldo ou histórico não pode ser alterada sem conversão oficial.", 409);
        }
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
            text(d.location, 80),
            image ?? old.image_url,
            unit,
            category,
            criticality,
            d.description === undefined ? old.description : description,
            d.purpose === undefined ? old.purpose : purpose,
            d.material === undefined ? old.material : material,
            d.dimensions === undefined ? old.dimensions : dimensions,
            d.approvedAliases === undefined ? JSON.stringify(typeof old.approved_aliases === "string" ? JSON.parse(old.approved_aliases) : old.approved_aliases ?? []) : JSON.stringify(approvedAliases),
            id,
          ],
        );
      } else {
        const [r] = await c.execute<ResultSetHeader>(
          "INSERT INTO parts(name,code,qr_code,pack_size,minimum_total,lead_days,reference_unit_price,location,image_url,unit,category,criticality,description,purpose,material,dimensions,approved_aliases) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [
            name,
            code,
            qr,
            pack,
            minimum,
            lead,
            cost,
            text(d.location, 80),
            image,
            unit,
            category,
            criticality,
            description,
            purpose,
            material,
            dimensions,
            JSON.stringify(approvedAliases),
          ],
        );
        pId = r.insertId;
      }
      await c.execute(
        "INSERT IGNORE INTO inventory(part_id,warehouse_id) VALUES(?,?)",
        [pId, w.id],
      );
      const b = (await stock(c, pId!)).find(
          (v) => Number(v.warehouse_id) === Number(w.id),
        )!,
        q = a.preserveQuantity === true && id ? Number(b.quantity) : integer(a.localQuantity, 0),
        delta = q - Number(b.quantity);
      if (q < Number(b.reserved) + Number(b.pending_outgoing ?? 0))
        throw new ActionError("O saldo não pode ficar abaixo da reserva.", 409);
      const cap =
        d.capacity === undefined && id ? b.capacity == null ? null : Number(b.capacity) : d.capacity === null || d.capacity === undefined || d.capacity === ""
          ? null
          : integer(Number(d.capacity));
      if (cap !== null && q > cap)
        throw new ActionError("Saldo maior que a capacidade.");
      const note = delta
        ? id
          ? reason(a.reason)
          : text(a.reason) || "Cadastro inicial do saldo"
        : "Atualização cadastral";
      const mapNodeId = text(d.mapNodeId === undefined && id ? b.map_node_id : d.mapNodeId, 64);
      if (mapNodeId) {
        const map = await first(c, "SELECT graph FROM map_versions WHERE status='Publicada' FOR SHARE");
        const graph = map && (typeof map.graph === "string" ? JSON.parse(map.graph) : map.graph);
        if (!graph?.nodes?.some((n: { id: string; warehouseId?: number }) => n.id === mapNodeId && n.warehouseId === Number(w.id)))
          throw new ActionError("Vincule a posição a um ponto do seu almoxarifado na planta publicada.", 409);
      }
      await c.execute(
        "UPDATE inventory SET quantity=?,minimum_quantity=?,aisle=?,shelf=?,capacity=?,map_node_id=? WHERE part_id=? AND warehouse_id=?",
        [
          q,
          d.localMinimum === undefined
            ? Number(b.minimum_quantity)
            : integer(Number(d.localMinimum), 0),
          text(d.aisle === undefined && id ? b.aisle : d.aisle, 80),
          text(d.shelf === undefined && id ? b.shelf : d.shelf, 80) || text(d.location, 80),
          cap,
          mapNodeId || null,
          pId,
          w.id,
        ],
      );
      await movement(
        c,
        actorId,
        pId!,
        Number(w.id),
        delta > 0 ? "ajuste_entrada" : "ajuste_saida",
        Math.abs(delta),
        note,
      );
      await audit(c, actorId, "part", pId!, id ? "update" : "create", {
        note,
        quantity: q,
        code,
        referenceUnitPrice: cost,
      });
      return { id: pId };
    }
    if (a.type === "registerReturn") {
      const p = await partLock(c, a.code),
        q = integer(a.quantity),
        w = await place(c, a.warehouse ?? "Central"),
        b = await first(c, "SELECT id FROM blocks WHERE name=?", [
          text(a.block, 80),
        ]);
      if (!b || !["Apto", "Danificado"].includes(String(a.condition)))
        throw new ActionError("Bloco ou condição inválidos.");
      const reqId = a.requestId ? integer(a.requestId) : null;
      if (reqId) {
        const r = await first(
          c,
          "SELECT quantity,block_id,part_id FROM requests WHERE id=? AND status='Entregue' FOR UPDATE",
          [reqId],
        );
        const previousReturns = await rows(
          c,
          "SELECT quantity FROM return_records WHERE request_id=? FOR UPDATE",
          [reqId],
        );
        if (
          !r ||
          Number(r.part_id) !== Number(p.id) ||
          Number(r.block_id) !== Number(b.id) ||
          previousReturns.reduce((s, v) => s + Number(v.quantity), 0) + q > Number(r.quantity)
        )
          throw new ActionError(
            "Devolução excede ou não corresponde à entrega.",
            409,
          );
      }
      const [r] = await c.execute<ResultSetHeader>(
        "INSERT INTO return_records(part_id,block_id,warehouse_id,quantity,condition_type,returned_by,note,received_by,request_id,inspection_status) VALUES(?,?,?,?,?,?,?,?,?,'Pendente')",
        [
          p.id,
          b.id,
          w.id,
          q,
          a.condition,
          reason(a.returnedBy),
          reason(a.note),
          actorId,
          reqId,
        ],
      );
      await audit(c, actorId, "return", r.insertId, "pending", { quantity: q });
      return { id: r.insertId };
    }
    if (a.type === "inspectReturn") {
      const id = integer(a.id),
        lookup = await first(
          c,
          "SELECT part_id FROM return_records WHERE id=?",
          [id],
        );
      if (!lookup) throw new ActionError("Devolução não encontrada.", 404);
      await partLock(c, null, lookup.part_id);
      const r = await first(
        c,
        "SELECT * FROM return_records WHERE id=? FOR UPDATE",
        [id],
      );
      if (r.inspection_status !== "Pendente")
        throw new ActionError("Devolução já conferida.", 409);
      if (!["Apto", "Danificado"].includes(String(a.condition)))
        throw new ActionError("Condição inválida.");
      const note = reason(a.reason);
      if (a.condition === "Apto") {
        await c.execute(
          "INSERT IGNORE INTO inventory(part_id,warehouse_id) VALUES(?,?)",
          [r.part_id, r.warehouse_id],
        );
        const b = (await stock(c, Number(r.part_id))).find(
          (v) => Number(v.warehouse_id) === Number(r.warehouse_id),
        )!;
        if (!b) throw new ActionError("Local de devolução inativo. Resolva o cadastro antes de conferir.", 409);
        capacity(b, Number(b.quantity) + Number(r.quantity));
        await c.execute(
          "UPDATE inventory SET quantity=quantity+? WHERE part_id=? AND warehouse_id=?",
          [r.quantity, r.part_id, r.warehouse_id],
        );
        await movement(
          c,
          actorId,
          Number(r.part_id),
          Number(r.warehouse_id),
          "devolucao",
          Number(r.quantity),
          note,
          r.request_id ? Number(r.request_id) : null,
          Number(r.block_id),
          id,
        );
      }
      await c.execute(
        "UPDATE return_records SET condition_type=?,inspection_status='Conferida',inspected_at=UTC_TIMESTAMP(3),received_by=? WHERE id=?",
        [String(a.condition), actorId, id],
      );
      await audit(c, actorId, "return", id, "inspect", {
        condition: a.condition,
        reason: note,
      });
      return { id };
    }
    if (a.type === "receiveInbound" || a.type === "cancelInbound") {
      const id = integer(a.id),
        lookup = await first(
          c,
          "SELECT part_id FROM expected_receipts WHERE id=?",
          [id],
        );
      if (!lookup)
        throw new ActionError("Entrada prevista não encontrada.", 404);
      const p = await partLock(c, null, lookup.part_id),
        r = await first(
          c,
          "SELECT * FROM expected_receipts WHERE id=? FOR UPDATE",
          [id],
        );
      if (r.status !== "Confirmada")
        throw new ActionError("Entrada já encerrada.", 409);
      let routeEvidence: unknown;
      if (a.type === "receiveInbound") {
        routeEvidence = a.receivingNode ? await storageRoute(c, Number(p.id), text(a.receivingNode, 64), Number(r.warehouse_id), { objective: a.receivingObjective as RouteOptions["objective"], transport: a.receivingTransport as RouteOptions["transport"] }) : { route: null, mapVersion: null, reason: "Informe e mapeie o ponto real de recebimento para calcular o encaminhamento." };
        scan(p, a.qrCode);
        if (integer(a.quantity) !== Number(r.quantity))
          throw new ActionError("Confira a quantidade recebida.");
        await c.execute(
          "INSERT IGNORE INTO inventory(part_id,warehouse_id) VALUES(?,?)",
          [p.id, r.warehouse_id],
        );
        const b = (await stock(c, Number(p.id))).find(
          (v) => Number(v.warehouse_id) === Number(r.warehouse_id),
        )!;
        if (!b) throw new ActionError("Local de recebimento inativo. Resolva o cadastro antes de receber.", 409);
        capacity(b, Number(b.quantity) + Number(r.quantity));
        await c.execute(
          "UPDATE inventory SET quantity=quantity+? WHERE part_id=? AND warehouse_id=?",
          [r.quantity, p.id, r.warehouse_id],
        );
        await movement(
          c,
          actorId,
          Number(p.id),
          Number(r.warehouse_id),
          "entrada",
          Number(r.quantity),
          `Entrada prevista #${id}: ${r.reference}`,
        );
      }
      await c.execute("UPDATE expected_receipts SET status=? WHERE id=?", [
        a.type === "receiveInbound" ? "Recebida" : "Cancelada",
        id,
      ]);
      await audit(c, actorId, "inbound", id, String(a.type), { route: routeEvidence, reference: r.reference });
      return { id };
    }
    const p = await partLock(
      c,
      a.code,
      a.type === "deletePart" ? integer(a.id) : undefined,
    );
    if (a.type === "deletePart") {
      const pending = await first(
        c,
        "SELECT id FROM requests WHERE part_id=? AND status NOT IN ('Cancelada','Entregue') LIMIT 1",
        [p.id],
      );
      if (
        pending ||
        (await first(
          c,
          "SELECT id FROM stock_transfers WHERE part_id=? AND status IN ('Solicitada','Em trânsito') LIMIT 1",
          [p.id],
        )) ||
        (await stock(c, Number(p.id))).some((b) => Number(b.quantity) > 0)
      )
        throw new ActionError(
          "Zere o saldo e conclua pedidos antes de desativar.",
          409,
        );
      await c.execute("UPDATE parts SET active=FALSE WHERE id=?", [p.id]);
      await audit(c, actorId, "part", Number(p.id), "deactivate", {});
      return { id: p.id };
    }
    if (a.type === "confirmInbound") {
      const w = await place(c, a.warehouse),
        q = integer(a.quantity),
        due = text(a.dueDate, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due)) || new Date(due).toISOString().slice(0, 10) !== due)
        throw new ActionError("Data prevista inválida.");
      const [r] = await c.execute<ResultSetHeader>(
        "INSERT INTO expected_receipts(part_id,warehouse_id,quantity,due_date,supplier,reference,created_by) VALUES(?,?,?,?,?,?,?)",
        [p.id, w.id, q, due, reason(a.supplier), reason(a.reference), actorId],
      );
      await audit(c, actorId, "inbound", r.insertId, "confirm", {
        quantity: q,
      });
      return { id: r.insertId };
    }
    const w = await place(
      c,
      a.type === "transfer" ? (a.from ?? "Central") : a.warehouse,
    );
    await c.execute(
      "INSERT IGNORE INTO inventory(part_id,warehouse_id) VALUES(?,?)",
      [p.id, w.id],
    );
    if (a.type === "stockEntry" || a.type === "replenishStock" || a.type === "adjustStock") {
      if (a.type === "replenishStock") scan(p, a.qrCode);
      const b = (await stock(c, Number(p.id))).find(
          (b) => Number(b.warehouse_id) === Number(w.id),
        )!,
        q = integer(a.quantity, a.type === "adjustStock" ? 0 : 1),
        next = a.type !== "adjustStock" ? Number(b.quantity) + q : q,
        delta = next - Number(b.quantity),
        note = reason(a.reason);
      if (next < Number(b.reserved) + Number(b.pending_outgoing ?? 0))
        throw new ActionError(
          "O saldo não pode ficar abaixo do reservado.",
          409,
        );
      capacity(b, next);
      await c.execute(
        "UPDATE inventory SET quantity=? WHERE part_id=? AND warehouse_id=?",
        [next, p.id, w.id],
      );
      await movement(
        c,
        actorId,
        Number(p.id),
        Number(w.id),
        a.type !== "adjustStock"
          ? "entrada"
          : delta > 0
            ? "ajuste_entrada"
            : "ajuste_saida",
        Math.abs(delta),
        note,
      );
      await audit(c, actorId, "part", Number(p.id), String(a.type), {
        warehouse: w.id,
        old: b.quantity,
        next,
        reason: note,
      });
      return { ok: true };
    }
    throw new ActionError("Ação inválida.");
  };
  return connection ? work(connection) : transaction(work);
}
