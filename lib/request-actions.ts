import type { PoolConnection } from "./db-types";
import type { ResultSetHeader } from "./db-types";
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
import { deliveryTargets, shortestPath, type FacilityGraph } from "./routing";
import {
  requestPattern,
  requestAnomaly,
  requestedUnits,
  type HistoricalRequest,
} from "./request-policy";
export const requestActions = new Set([
  "createRequests",
  "changeRequestStatus",
  "editRequest",
  "deleteRequest",
  "requestCancellation",
  "confirmReceipt",
  "claimRequest",
  "preparePick",
  "confirmPick",
]);
async function patternFor(c: PoolConnection, actor: Row, partId: number) {
  const history = await rows(
    c,
    "SELECT part_id,block_id,sector,quantity FROM requests WHERE (block_id=? OR sector=?) AND approved_at IS NOT NULL AND status NOT IN ('Cancelada','Rejeitada') AND created_at>=DATE_SUB(NOW(),INTERVAL 90 DAY)",
    [actor.block_id, actor.sector],
  );
  return requestPattern(
    history as HistoricalRequest[],
    partId,
    Number(actor.block_id),
    String(actor.sector),
  );
}
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
      const p = await partLock(c, e.code);
      let q: number;
      try {
        q = requestedUnits(
          integer(e.quantity),
          e.requestedUnit,
          Number(p.pack_size),
        );
      } catch (error) {
        throw new ActionError(
          error instanceof Error ? error.message : "Quantidade inválida.",
        );
      }
      if (!["Leve", "Moderado", "Urgente"].includes(String(e.priority)))
        throw new ActionError("Urgência inválida.");
      const anomaly = requestAnomaly(
        q,
        await patternFor(c, actor, Number(p.id)),
      );
      if (
        (anomaly.unusual || e.priority === "Urgente") &&
        text(e.justification).length < 3
      )
        throw new ActionError("Justifique o pedido fora do padrão.");
      if (
        q >
        (await stock(c, Number(p.id))).reduce((sum, r) => sum + available(r), 0)
      )
        throw new ActionError("Saldo disponível insuficiente.", 409);
      const [r] = await c.execute<ResultSetHeader>(
        "INSERT INTO requests(requester_id,block_id,part_id,quantity,priority,justification,batch_id,sector,requested_unit,requested_amount,pack_size_at_request,anomaly) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          actorId,
          actor.block_id,
          p.id,
          q,
          e.priority,
          text(e.justification) || null,
          batch,
          actor.sector,
          e.requestedUnit ?? "piece",
          e.quantity,
          p.pack_size,
          JSON.stringify(anomaly),
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
    demand(user, "request");
    if (!owns || !pending)
      throw new ActionError(
        "Somente o requisitor pode editar/excluir antes da aprovação.",
        403,
      );
    if (a.type === "editRequest") {
      const q = integer(a.quantity);
      const anomaly = requestAnomaly(
        q,
        await patternFor(c, actor, Number(p.id)),
      );
      const justification = text(a.justification ?? r.justification);
      if (
        (anomaly.unusual || r.priority === "Urgente") &&
        justification.length < 3
      )
        throw new ActionError("Justifique o pedido fora do padrão.");
      if (
        q > (await stock(c, Number(p.id))).reduce((s, v) => s + available(v), 0)
      )
        throw new ActionError("Saldo insuficiente.", 409);
      await c.execute(
        "UPDATE requests SET quantity=?,requested_unit='piece',requested_amount=?,anomaly=?,justification=? WHERE id=?",
        [q, q, JSON.stringify(anomaly), justification || null, id],
      );
    } else
      await c.execute(
        "UPDATE requests SET status='Cancelada',cancellation_reason='Excluída pelo requisitor antes da aprovação' WHERE id=?",
        [id],
      );
  } else if (a.type === "claimRequest") {
    demand(user, "stock", "requests.deliver");
    if (r.status !== "Aprovada")
      throw new ActionError(
        "Pedido já assumido ou indisponível para separação.",
        409,
      );
    await recordDeliveryPlan(c, user, { action: "planDelivery" }, id);
    await c.execute(
      "UPDATE requests SET status='Em separação',fulfilled_by=? WHERE id=?",
      [actorId, id],
    );
  } else if (a.type === "preparePick" || a.type === "confirmPick") {
    demand(user, "stock", "requests.deliver");
    if (
      a.code !== undefined &&
      text(a.code).toUpperCase() !== String(p.code).toUpperCase()
    )
      throw new ActionError("Material diferente da requisição.", 422);
    if (r.status !== "Em separação" || Number(r.fulfilled_by) !== actorId)
      throw new ActionError(
        "Somente o almoxarife responsável pode confirmar esta retirada.",
        409,
      );
    scan(p, a.qrCode);
    if (integer(a.confirmedQuantity) !== Number(r.quantity))
      throw new ActionError("Confirme a quantidade exata reservada.", 422);
    const digest = createHash("sha256")
      .update(
        JSON.stringify([
          actorId,
          id,
          text(a.qrCode).toUpperCase(),
          a.confirmedQuantity,
          a.confirmation,
        ]),
      )
      .digest("hex");
    if (a.type === "preparePick") {
      const confirmation = randomUUID();
      const hash = createHash("sha256")
        .update(
          JSON.stringify([
            actorId,
            id,
            text(a.qrCode).toUpperCase(),
            a.confirmedQuantity,
            confirmation,
          ]),
        )
        .digest("hex");
      await c.execute("UPDATE requests SET pickup_confirmation=? WHERE id=?", [
        JSON.stringify({ hash, expiresAt: Date.now() + 5 * 60_000 }),
        id,
      ]);
      return { id, confirmation };
    }
    const confirmation =
      typeof r.pickup_confirmation === "string"
        ? JSON.parse(r.pickup_confirmation)
        : r.pickup_confirmation;
    if (
      !confirmation ||
      confirmation.hash !== digest ||
      confirmation.expiresAt < Date.now()
    )
      throw new ActionError(
        "Confirmação expirada ou alterada. Confirme a retirada novamente.",
        409,
      );
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
      a.sourceWarehouseId !== undefined &&
      (reserved.length !== 1 ||
        Number(reserved[0].warehouse_id) !== integer(a.sourceWarehouseId))
    )
      throw new ActionError(
        "Origem diferente da reserva. Para múltiplos locais, confira a retirada pelo atendimento da requisição.",
        422,
      );
    if (
      reserved.reduce((sum, v) => sum + Number(v.quantity), 0) !==
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
        throw new ActionError("Saldo inconsistente. Retirada bloqueada.", 409);
      await movement(
        c,
        actorId,
        Number(p.id),
        Number(v.warehouse_id),
        "saida",
        Number(v.quantity),
        "Retirada conferida; aguardando entrega no bloco",
        id,
        Number(r.block_id),
      );
    }
    await c.execute("DELETE FROM request_reservations WHERE request_id=?", [
      id,
    ]);
    await c.execute(
      "UPDATE requests SET status='Em entrega',fulfilled_from=?,picked_at=UTC_TIMESTAMP(3),pickup_confirmation=NULL WHERE id=?",
      [reserved[0].warehouse_id, id],
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
      demand(user, "approve", "requests.analyze");
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
      const destinations = graph ? deliveryTargets(graph, Number(r.block_id), String(r.sector)) : [];
      const ranked = locations
        .map((l) => {
          const node =
            graph?.nodes.find((n) => n.id === l.map_node_id) ??
            graph?.nodes.find((n) => n.warehouseId === Number(l.warehouse_id));
          const paths = graph && node ? destinations.map((destination) => shortestPath(graph, node.id, destination.id)).filter((path) => path !== null) : [];
          return {
            l,
            score: graph?.reviewed ? Math.min(Infinity, ...paths.map((path) => path.cost)) : Infinity,
          };
        })
        .sort(
          (a, b) =>
            a.score - b.score ||
            Number(b.l.block_id === r.block_id) -
              Number(a.l.block_id === r.block_id) ||
            available(b.l) - available(a.l),
        );
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
            "INSERT INTO request_reservations(request_id,part_id,warehouse_id,quantity) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE quantity=request_reservations.quantity+VALUES(quantity)",
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
    } else if (next === "Rejeitada" && pending) {
      demand(user, "approve");
      await c.execute(
        "UPDATE requests SET status='Rejeitada',cancellation_reason=? WHERE id=?",
        [reason(a.reason), id],
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
    } else if (next === "Entregue" && r.status === "Em entrega") {
      demand(user, "stock");
      demand(user, "stock", "requests.deliver");
      if (Number(r.fulfilled_by) !== actorId || !r.picked_at)
        throw new ActionError(
          "Confirme primeiro a retirada com o almoxarife responsável.",
          409,
        );
      await c.execute(
        "UPDATE requests SET status='Entregue',delivered_at=UTC_TIMESTAMP(3) WHERE id=?",
        [id],
      );
    } else throw new ActionError("Transição de estado inválida.", 409);
  }
  await audit(c, actorId, "request", id, String(a.type), {
    status: a.status ?? null,
    quantity: a.quantity ?? null,
  });
  return { id };
}
