import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader } from "mysql2";
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
} from "./stock-ledger";

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
    const b = (await stock(c, Number(p.id))).find(
      (b) => Number(b.warehouse_id) === Number(source.id),
    );
    if (!b || available(b) - Number(b.minimum_quantity) < q)
      throw new ActionError(
        "Saldo insuficiente acima das reservas e do mínimo da origem.",
        409,
      );
    const [r] = await c.execute<ResultSetHeader>(
      "INSERT INTO stock_transfers(part_id,source_warehouse_id,destination_warehouse_id,quantity,qr_code_scanned,performed_by,status,reason,request_key) VALUES(?,?,?,?,?,?,'Solicitada',?,?)",
      [p.id, source.id, dest.id, q, "", actor, note, key],
    );
    await audit(c, actor, "transfer", r.insertId, "request", {
      quantity: q,
      reason: note,
    });
    return { id: r.insertId };
  }
  const id = integer(a.id);
  // Same lock order as every stock write: part first, then transfer and inventory.
  const ref = await first(c, "SELECT part_id FROM stock_transfers WHERE id=?", [
    id,
  ]);
  if (!ref) throw new ActionError("Transferência inexistente.", 404);
  const p = await partLock(c, null, ref.part_id);
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
    if (available(b) - Number(b.minimum_quantity) < q)
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
  await audit(c, actor, "transfer", id, dispatch ? "dispatch" : "receive", {
    quantity: q,
  });
  return { id };
}
