import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader } from "mysql2";
import type { Account } from "./accounts";
import { createHash, randomUUID } from "node:crypto";
import { recordDeliveryPlan } from "./delivery-planning";
import { ActionError, demand, integer, text, reason } from "./permissions";
import {
  available,
  audit,
  first,
  movement,
  partLock,
  rows,
  scan,
  stock,
  type Row,
} from "./stock-ledger";
import { shortestPath, type FacilityGraph } from "./routing";
export const requestActions = new Set([
  "createRequests",
  "changeRequestStatus",
  "editRequest",
  "deleteRequest",
  "requestCancellation",
  "confirmReceipt",
]);
export async function executeRequestAction(
  c: PoolConnection,
  user: Account,
  actor: Row,
  a: Record<string, unknown>,
) {
  const actorId = Number(actor.id);
  if (a.type === "createRequests") {
    demand(user, "request");
    if (
      !Array.isArray(a.entries) ||
      !a.entries.length ||
      a.entries.length > 30 ||
      a.entries.some((e) => !e || typeof e !== "object")
    )
      throw new ActionError("Carrinho inválido.");
    const entries = a.entries as Record<string, unknown>[];
    const requestKey = a.requestKey;
    if (requestKey !== undefined) {
      if (
        typeof requestKey !== "string" ||
        !/^[a-zA-Z0-9_-]{16,64}$/.test(requestKey)
      )
        throw new ActionError("Identificador de envio inválido.");
      const hash = createHash("sha256")
        .update(JSON.stringify(entries))
        .digest("hex");
      await c.execute(
        "INSERT IGNORE INTO request_submissions(actor_id,request_key,payload_hash) VALUES(?,?,?)",
        [actorId, requestKey, hash],
      );
      const submitted = await first(
        c,
        "SELECT payload_hash,result FROM request_submissions WHERE actor_id=? AND request_key=? FOR UPDATE",
        [actorId, requestKey],
      );
      if (submitted.payload_hash !== hash)
        throw new ActionError("Este envio já pertence a outro carrinho.", 409);
      if (submitted.result)
        return typeof submitted.result === "string"
          ? JSON.parse(submitted.result)
          : submitted.result;
    }
    if (
      new Set(entries.map((e) => text(e.code, 64).toUpperCase())).size !==
      entries.length
    )
      throw new ActionError("Agrupe os itens repetidos no carrinho.");
    const batch = randomUUID(),
      ids: number[] = [];
    for (const e of [...entries].sort((x, y) =>
      String(x.code).localeCompare(String(y.code)),
    )) {
      const p = await partLock(c, e.code),
        q = integer(e.quantity);
      if (!["Leve", "Moderado", "Urgente"].includes(String(e.priority)))
        throw new ActionError("Urgência inválida.");
      if ((q > 10 || e.priority === "Urgente") && !text(e.justification))
        throw new ActionError("Justifique o pedido fora do padrão.");
      if (
        q >
        (await stock(c, Number(p.id))).reduce((sum, r) => sum + available(r), 0)
      )
        throw new ActionError("Saldo disponível insuficiente.", 409);
      const [r] = await c.execute<ResultSetHeader>(
        "INSERT INTO requests(requester_id,block_id,part_id,quantity,priority,justification,batch_id,sector) VALUES(?,?,?,?,?,?,?,?)",
        [
          actorId,
          actor.block_id,
          p.id,
          q,
          e.priority,
          text(e.justification) || null,
          batch,
          actor.sector,
        ],
      );
      ids.push(r.insertId);
      await audit(c, actorId, "request", r.insertId, "create", {
        quantity: q,
        batch,
      });
    }
    const result = { ids, batch };
    if (requestKey)
      await c.execute(
        "UPDATE request_submissions SET result=? WHERE actor_id=? AND request_key=?",
        [JSON.stringify(result), actorId, requestKey],
      );
    return result;
  }
  const id = integer(a.id),
    lookup = await first(c, "SELECT part_id FROM requests WHERE id=?", [id]);
  if (!lookup) throw new ActionError("Requisição não encontrada.", 404);
  // Toda mutação de estoque começa pelo lock da peça; carrinhos ordenam os locks.
  const p = await partLock(c, null, lookup.part_id),
    r = await first(c, "SELECT * FROM requests WHERE id=? FOR UPDATE", [id]);
  const owns = Number(r.requester_id) === actorId;
  if (
    (user.role === "funcionario" && !owns) ||
    (user.role === "lider" && Number(r.block_id) !== Number(actor.block_id))
  )
    throw new ActionError("Requisição fora do seu escopo.", 403);
  const pending = ["Pendente", "Em análise"].includes(String(r.status));
  if (a.type === "editRequest" || a.type === "deleteRequest") {
    if (!owns || !pending)
      throw new ActionError(
        "Somente o requisitor pode editar/excluir antes da aprovação.",
        403,
      );
    if (a.type === "editRequest") {
      const q = integer(a.quantity);
      if (
        q > (await stock(c, Number(p.id))).reduce((s, v) => s + available(v), 0)
      )
        throw new ActionError("Saldo insuficiente.", 409);
      await c.execute("UPDATE requests SET quantity=? WHERE id=?", [q, id]);
    } else
      await c.execute(
        "UPDATE requests SET status='Cancelada',cancellation_reason='Excluída pelo requisitor antes da aprovação' WHERE id=?",
        [id],
      );
  } else if (a.type === "confirmReceipt") {
    if (!owns || r.status !== "Entregue" || r.received_at)
      throw new ActionError("Recebimento indisponível nesta etapa.", 409);
    await c.execute(
      "UPDATE requests SET received_at=UTC_TIMESTAMP(3) WHERE id=?",
      [id],
    );
  } else if (a.type === "requestCancellation") {
    if (!owns || r.status !== "Aprovada")
      throw new ActionError(
        "Cancelamento só pode ser solicitado após aprovação e antes da entrega.",
        409,
      );
    await c.execute(
      "UPDATE requests SET status='Cancelamento solicitado',cancellation_reason=? WHERE id=?",
      [reason(a.reason), id],
    );
  } else {
    const next = String(a.status);
    if (user.role === "funcionario")
      throw new ActionError("Aprovação/entrega exige outro perfil.", 403);
    if (next === "Em análise" && r.status === "Pendente") {
      demand(user, "approve");
      await c.execute("UPDATE requests SET status='Em análise' WHERE id=?", [
        id,
      ]);
    } else if (next === "Aprovada" && (pending || r.status === "Aprovada")) {
      demand(user, "approve");
      const locations = await stock(c, Number(p.id));
      const published = await first(
        c,
        "SELECT graph FROM map_versions WHERE status='Publicada'",
      );
      const graph = published
        ? ((typeof published.graph === "string"
            ? JSON.parse(published.graph)
            : published.graph) as FacilityGraph)
        : null;
      const destination = graph?.nodes.find(
        (n) =>
          n.blockId === Number(r.block_id) &&
          (n.kind === "delivery" || n.kind === "block"),
      );
      const ranked = locations
        .map((l) => {
          const node =
            graph?.nodes.find((n) => n.id === l.map_node_id) ??
            graph?.nodes.find((n) => n.warehouseId === Number(l.warehouse_id));
          const path =
            graph && node && destination
              ? shortestPath(graph, node.id, destination.id)
              : null;
          const factor =
            r.priority === "Urgente" ? 2 : r.priority === "Moderado" ? 1.5 : 1;
          return {
            l,
            score: path
              ? path.cost * factor +
                (Number(l.block_id) === Number(r.block_id) ? 0 : 30)
              : Number(l.block_id) === Number(r.block_id)
                ? 1_000_000
                : Number(l.is_central)
                  ? 2_000_000
                  : 3_000_000,
          };
        })
        .sort((a, b) => a.score - b.score || available(b.l) - available(a.l));
      const existing = await rows(
        c,
        "SELECT warehouse_id,quantity FROM request_reservations WHERE request_id=? FOR UPDATE",
        [id],
      );
      let remaining =
        Number(r.quantity) -
        existing.reduce((sum, v) => sum + Number(v.quantity), 0);
      for (const { l } of ranked) {
        const q = Math.min(remaining, available(l));
        if (q > 0) {
          await c.execute(
            "INSERT INTO request_reservations(request_id,part_id,warehouse_id,quantity) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)",
            [id, p.id, l.warehouse_id, q],
          );
          remaining -= q;
        }
      }
      if (remaining)
        throw new ActionError(
          "Saldo insuficiente para reservar. Nenhuma aprovação foi aplicada.",
          409,
        );
      await c.execute(
        "UPDATE requests SET status='Aprovada',approved_by=?,approved_at=COALESCE(approved_at,UTC_TIMESTAMP(3)) WHERE id=?",
        [actorId, id],
      );
    } else if (
      next === "Cancelada" &&
      [
        "Pendente",
        "Em análise",
        "Aprovada",
        "Cancelamento solicitado",
      ].includes(String(r.status))
    ) {
      if (
        user.role === "almoxarifado" &&
        !["Aprovada", "Cancelamento solicitado"].includes(String(r.status))
      )
        throw new ActionError("Aguardando aprovação do gestor.", 403);
      await c.execute("DELETE FROM request_reservations WHERE request_id=?", [
        id,
      ]);
      await c.execute(
        "UPDATE requests SET status='Cancelada',cancellation_reason=COALESCE(cancellation_reason,?) WHERE id=?",
        [reason(a.reason ?? "Cancelamento confirmado pelo responsável"), id],
      );
    } else if (next === "Entregue" && r.status === "Aprovada") {
      demand(user, "stock");
      scan(p, a.qrCode);
      if (integer(a.confirmedQuantity) !== Number(r.quantity))
        throw new ActionError("Confirme a quantidade exata separada.", 422);
      const departure = await first(
        c,
        "SELECT id FROM delivery_route_history WHERE request_id=? AND event='Saída' LIMIT 1",
        [id],
      );
      // Legacy/manual delivery confirmation still captures its planning decision atomically.
      if (!departure)
        await recordDeliveryPlan(
          c,
          user,
          { action: "planDelivery", atDelivery: true },
          id,
        );
      const reserved = await rows(
        c,
        "SELECT * FROM request_reservations WHERE request_id=? ORDER BY warehouse_id FOR UPDATE",
        [id],
      );
      if (
        reserved.reduce((s, v) => s + Number(v.quantity), 0) !==
        Number(r.quantity)
      )
        throw new ActionError(
          "Reserva incompleta. Peça revalidação ao gestor.",
          409,
        );
      for (const v of reserved) {
        const [updated] = await c.execute<ResultSetHeader>(
          "UPDATE inventory SET quantity=quantity-? WHERE part_id=? AND warehouse_id=? AND quantity>=?",
          [v.quantity, p.id, v.warehouse_id, v.quantity],
        );
        if (updated.affectedRows !== 1)
          throw new ActionError("Saldo inconsistente. Entrega bloqueada.", 409);
        await movement(
          c,
          actorId,
          Number(p.id),
          Number(v.warehouse_id),
          "saida",
          Number(v.quantity),
          "Entrega conferida",
          id,
          Number(r.block_id),
        );
      }
      await c.execute("DELETE FROM request_reservations WHERE request_id=?", [
        id,
      ]);
      await c.execute(
        "UPDATE requests SET status='Entregue',fulfilled_by=?,fulfilled_from=?,delivered_at=UTC_TIMESTAMP(3) WHERE id=?",
        [actorId, reserved[0].warehouse_id, id],
      );
    } else throw new ActionError("Transição de estado inválida.", 409);
  }
  await audit(c, actorId, "request", id, String(a.type), {
    status: a.status ?? null,
    quantity: a.quantity ?? null,
  });
  return { id };
}
