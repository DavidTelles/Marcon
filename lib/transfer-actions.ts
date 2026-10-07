import type { PoolConnection } from "./db-types";
import type { ResultSetHeader } from "./db-types";
import { ActionError, integer, reason, text } from "./permissions";
import {
  first,
  partLock,
  place,
  stock,
  available,
  capacity,
  scan,
  movement,
  audit,
  rows,
} from "./stock-ledger";
import { storageRoute } from "./delivery-planning";
import type { RouteOptions } from "./routing";

// Called inside the existing stock transaction, after server-side stock authorization.
export async function transferAction(
  c: PoolConnection,
  actor: number,
  a: Record<string, unknown>,
) {
  if (a.type === "transfer") {
    const p = await partLock(c, a.code),
      source = await place(c, a.from ?? "Central"),
      dest = await place(c, a.to);
    if (p.material_kind === "consumivel") throw new ActionError("Consumíveis usam baixa direta, sem transferência.", 422);
    if ((source.pcp_kind && source.pcp_kind !== "almoxarifado") || (dest.pcp_kind && dest.pcp_kind !== "almoxarifado"))
      throw new ActionError("Use o fluxo PCP para transferir entre qualidade, almoxarifado e produção.", 422);
    const q = integer(a.quantity),
      note = reason(a.reason),
      key = text(a.requestKey, 64);
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(key))
      throw new ActionError(
        "Identificador de solicitação ausente. Atualize e tente novamente.",
      );
    if (Number(source.id) === Number(dest.id))
      throw new ActionError("Escolha locais diferentes.");
    const existing = await first(
      c,
      "SELECT id FROM stock_transfers WHERE request_key=? FOR UPDATE",
      [key],
    );
    if (existing) throw new ActionError("Solicitação já registrada.", 409);
    const balances = await stock(c, Number(p.id));
    const b = balances.find(
      (b) => Number(b.warehouse_id) === Number(source.id),
    );
    if (!b || available(b) - Number(b.minimum_quantity) < q)
      throw new ActionError(
        "Saldo insuficiente acima das reservas e do mínimo da origem.",
        409,
      );
    const destination = balances.find((v) => Number(v.warehouse_id) === Number(dest.id));
    const incoming = await rows(c, "SELECT quantity FROM stock_transfers WHERE part_id=? AND destination_warehouse_id=? AND status IN ('Solicitada','Em trânsito') FOR UPDATE", [p.id, dest.id]);
    if (destination) capacity(destination, Number(destination.quantity) + incoming.reduce((s, v) => s + Number(v.quantity), 0) + q);
    const currentRoute = await storageRoute(c, Number(p.id), Number(source.id), Number(dest.id), { objective: a.objective as RouteOptions["objective"], transport: a.transport as RouteOptions["transport"] });
    let routeEvidence: unknown = currentRoute;
    if (a.recommendation && typeof a.recommendation === "object") {
      const key=(a.recommendation as Record<string,unknown>).key;
      if(typeof key!=="string"||!/^[a-f0-9]{64}$/.test(key))throw new ActionError("Recomendação inválida.");
      const saved=await first(c,"SELECT *,created_at<DATE_SUB(NOW(),INTERVAL 15 MINUTE) AS expired FROM stock_recommendations WHERE key=? FOR UPDATE",[key]);
      if(!saved||saved.status!=="Pendente"||saved.expired||Number(saved.part_id)!==Number(p.id)||Number(saved.source_warehouse_id)!==Number(source.id)||Number(saved.destination_warehouse_id)!==Number(dest.id)||Number(saved.quantity)!==q||String(saved.part_updated_at)!==String(p.updated_at))throw new ActionError("A recomendação mudou, expirou ou já foi decidida. Atualize o relatório.",409);
      const rec = typeof saved.payload==="string"?JSON.parse(saved.payload):saved.payload;
      rec.key=key;rec.mapVersion=Number(saved.map_version_id);
      if(Number(rec.sourceAvailable)!==available(b)||!destination||Number(rec.destinationAvailable)!==available(destination))throw new ActionError("Os saldos ou reservas mudaram. Atualize a recomendação.",409);
      if (currentRoute.mapVersion !== rec.mapVersion) throw new ActionError("A planta mudou. Atualize a recomendação.", 409);
      const route = currentRoute.route;
      if (![rec.sourceTarget, rec.sourceMinimum].every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0)) throw new ActionError("Cobertura inválida.");
      if (!route || available(b) - Math.max(Number(rec.sourceTarget), Number(rec.sourceMinimum), Number(b.minimum_quantity)) < q)
        throw new ActionError("Cobertura ou percurso mudou. Atualize a recomendação.", 409);
      routeEvidence = { ...rec, route, parameters: { objective: route.objective, transport: route.transport } };
    }
    const [r] = await c.execute<ResultSetHeader>(
      "INSERT INTO stock_transfers(part_id,source_warehouse_id,destination_warehouse_id,quantity,qr_code_scanned,performed_by,status,reason,request_key) VALUES(?,?,?,?,?,?,'Solicitada',?,?)",
      [p.id, source.id, dest.id, q, "", actor, note, key],
    );
    await audit(c, actor, "transfer", r.insertId, "request", {
      quantity: q,
      reason: note,
      route: routeEvidence,
    });
    if (a.recommendation) {
      await c.execute("UPDATE stock_recommendations SET status='Aceita',decided_at=NOW(),decided_by=?,transfer_id=? WHERE key=?",[actor,r.insertId,(a.recommendation as Record<string,unknown>).key]);
      await audit(c, actor, "recommendation", Number(p.id), "accept", { transferId: r.insertId, ...routeEvidence as object });
    }
    return { id: r.insertId };
  }
  const id = integer(a.id);
  // Same lock order as every stock write: part first, then transfer and inventory.
  const ref = await first(c, "SELECT part_id FROM stock_transfers WHERE id=?", [
    id,
  ]);
  if (!ref) throw new ActionError("Transferência inexistente.", 404);
  const p = await partLock(c, null, ref.part_id);
  if (p.material_kind === "consumivel") throw new ActionError("Consumíveis usam baixa direta, sem transferência.", 422);
  const pcp = await first(c, "SELECT id,status FROM pcp_requests WHERE transfer_id=? FOR UPDATE", [id]);
  if (pcp && (a.type === "cancelTransfer" || pcp.status !== "Liberada")) throw new ActionError("Transferência vinculada à requisição PCP liberada; cancelamento não permitido neste fluxo.", 409);
  const t = await first(
    c,
    "SELECT * FROM stock_transfers WHERE id=? FOR UPDATE",
    [id],
  );
  const dispatch = a.type === "dispatchTransfer";
  if (a.type === "cancelTransfer") {
    if (t.status !== "Solicitada")
      throw new ActionError(
        "Somente solicitações sem saída podem ser canceladas.",
        409,
      );
    await c.execute(
      "UPDATE stock_transfers SET status='Cancelada' WHERE id=?",
      [id],
    );
    await audit(c, actor, "transfer", id, "cancel", {
      reason: reason(a.reason),
    });
    return { id };
  }
  if (t.status !== (dispatch ? "Solicitada" : "Em trânsito"))
    throw new ActionError("Etapa já confirmada ou inválida.", 409);
  scan(p, a.qrCode);
  const q = Number(t.quantity);
  if (integer(a.confirmedQuantity) !== q)
    throw new ActionError("Confirme a quantidade exata conferida.", 422);
  const warehouse = Number(
    dispatch ? t.source_warehouse_id : t.destination_warehouse_id,
  );
  await c.execute(
    "INSERT IGNORE INTO inventory(part_id,warehouse_id) VALUES(?,?)",
    [p.id, warehouse],
  );
  const b = (await stock(c, Number(p.id))).find(
    (b) => Number(b.warehouse_id) === warehouse,
  )!;
  if (!b)
    throw new ActionError(
      "Local inativo. Regularize o almoxarifado antes de confirmar.",
      409,
    );
  if (dispatch) {
    // The current document already commits q; exclude only its own commitment.
    if (available(b) + q - Number(b.minimum_quantity) < q)
      throw new ActionError(
        "Saída consumiria reservas ou mínimo da origem.",
        409,
      );
    await c.execute(
      "UPDATE inventory SET quantity=quantity-? WHERE part_id=? AND warehouse_id=?",
      [q, p.id, warehouse],
    );
    await c.execute(
      "UPDATE stock_transfers SET status='Em trânsito',shipped_by=?,shipped_at=UTC_TIMESTAMP(3),qr_code_scanned=? WHERE id=?",
      [actor, text(a.qrCode, 128), id],
    );
  } else {
    capacity(b, Number(b.quantity) + q);
    await c.execute(
      "UPDATE inventory SET quantity=quantity+? WHERE part_id=? AND warehouse_id=?",
      [q, p.id, warehouse],
    );
    await c.execute(
      "UPDATE stock_transfers SET status='Recebida',received_by=?,received_at=UTC_TIMESTAMP(3) WHERE id=?",
      [actor, id],
    );
    if (pcp) await c.execute("UPDATE pcp_requests SET status='Transferida',updated_at=NOW() WHERE id=?", [pcp.id]);
  }
  await movement(
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
    id,
  );
  const planned = await first(c, "SELECT details FROM audit_log WHERE entity_type='transfer' AND entity_id=? AND action='request' ORDER BY id DESC LIMIT 1", [id]);
  const plannedDetails = planned ? typeof planned.details === "string" ? JSON.parse(planned.details) : planned.details : null;
  await audit(c, actor, "transfer", id, dispatch ? "dispatch" : "receive", {
    quantity: q,
    route: await storageRoute(c, Number(p.id), Number(t.source_warehouse_id), Number(t.destination_warehouse_id), { objective: (a.objective ?? plannedDetails?.route?.parameters?.objective) as RouteOptions["objective"], transport: (a.transport ?? plannedDetails?.route?.parameters?.transport) as RouteOptions["transport"] }),
  });
  return { id };
}
