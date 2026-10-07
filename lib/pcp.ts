import { createHash } from "node:crypto";
import type { Account } from "./accounts";
import { transaction } from "./db";
import { ActionError, demand, integer, text } from "./permissions";
import {
  first,
  rows,
  insert,
  audit,
  stock,
  available,
  capacity,
  movement,
  scan,
  partLock,
  type Row,
} from "./stock-ledger";
import { transferAction } from "./transfer-actions";
import type { PoolConnection } from "./db-types";

const numberId = (value: unknown) => {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !/^[1-9]\d*$/.test(value))
  )
    throw new ActionError("ID inválido.", 422);
  return integer(Number(value));
};
const stockRoles = new Set(["admin", "almoxarifado"]);
function required(value: unknown, length = 190) {
  if (typeof value !== "string" || !value.trim() || value.length > length)
    throw new ActionError(
      "Preencha os dados obrigatórios dentro do limite de caracteres.",
      422,
    );
  return value.trim();
}
function weight(value: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1e9 ||
    Math.abs(value * 1e6 - Math.round(value * 1e6)) > 0.001
  )
    throw new ActionError("Peso inválido; use até seis casas decimais.", 422);
  return value;
}
export function receiptMatches(
  receipt: Row,
  quantity: number,
  measuredWeight: number | null,
) {
  return (
    quantity === Number(receipt.invoice_quantity) &&
    (receipt.invoice_weight == null ||
      (measuredWeight !== null &&
        Math.round(measuredWeight * 1e6) ===
          Math.round(Number(receipt.invoice_weight) * 1e6)))
  );
}
async function warehouse(c: PoolConnection, id: unknown, kind?: string) {
  const w = await first(
    c,
    "SELECT * FROM warehouses WHERE id=? AND active=TRUE FOR SHARE",
    [numberId(id)],
  );
  if (!w || (kind && w.pcp_kind !== kind))
    throw new ActionError(
      `Armazém inválido${kind ? ` para ${kind}` : ""}.`,
      422,
    );
  return w;
}
async function getReceipt(c: PoolConnection, id: unknown) {
  const ref = await first(c, "SELECT part_id FROM pcp_receipts WHERE id=?", [
    numberId(id),
  ]);
  if (!ref) throw new ActionError("Recebimento inexistente.", 404);
  await partLock(c, null, ref.part_id);
  return (await first(c, "SELECT * FROM pcp_receipts WHERE id=? FOR UPDATE", [
    numberId(id),
  ]))!;
}
async function getRequest(
  c: PoolConnection,
  id: unknown,
  actor: Row,
  user: Account,
) {
  const ref = await first(c, "SELECT part_id FROM pcp_requests WHERE id=?", [
    numberId(id),
  ]);
  if (!ref) throw new ActionError("Requisição inexistente.", 404);
  await partLock(c, null, ref.part_id);
  const r = (await first(
    c,
    "SELECT * FROM pcp_requests WHERE id=? FOR UPDATE",
    [numberId(id)],
  ))!;
  if (!stockRoles.has(user.role) && Number(r.requester_id) !== Number(actor.id))
    throw new ActionError("Requisição fora do seu escopo.", 403);
  return r;
}
async function validateRequest(c: PoolConnection, r: Row) {
  const balances = await stock(c, Number(r.part_id));
  const order = await first(
    c,
    "SELECT * FROM pcp_orders WHERE request_id=? AND part_id=?",
    [r.id, r.part_id],
  );
  const ownTransfer = r.transfer_id
    ? await first(c, "SELECT quantity,status FROM stock_transfers WHERE id=?", [
        r.transfer_id,
      ])
    : null;
  const reserved =
    ownTransfer?.status === "Solicitada" ? Number(ownTransfer.quantity) : 0;
  const source = balances.find(
    (b) => Number(b.warehouse_id) === Number(r.source_warehouse_id),
  );
  const total = balances.reduce((sum, b) => sum + available(b), 0) + reserved;
  const local = source
    ? Math.max(
        0,
        available(source) + reserved - Number(source.minimum_quantity),
      )
    : 0;
  const totalOk = total >= Number(r.quantity),
    sourceOk = local >= Number(r.quantity);
  const orderOk =
    Boolean(r.consumable) ||
    (!!order && Number(order.quantity) >= Number(r.quantity));
  return {
    saldoTotal: total,
    saldoOrigem: local,
    saldoSuficiente: totalOk,
    saldoOrigemSuficiente: sourceOk,
    pedidoCompraSuficiente: orderOk,
    pedidoCompra: order ?? null,
    podeLiberar:
      totalOk &&
      sourceOk &&
      orderOk &&
      r.status === "Separada" &&
      Number(r.picked_quantity) === Number(r.quantity),
  };
}
async function addStock(c: PoolConnection, p: Row, w: Row, quantity: number) {
  await c.execute(
    "INSERT IGNORE INTO inventory(part_id,warehouse_id) VALUES(?,?)",
    [p.id, w.id],
  );
  const current = (await stock(c, Number(p.id))).find(
    (b) => Number(b.warehouse_id) === Number(w.id),
  )!;
  capacity(current, Number(current.quantity) + quantity);
  await c.execute(
    "UPDATE inventory SET quantity=quantity+? WHERE part_id=? AND warehouse_id=?",
    [quantity, p.id, w.id],
  );
}

export async function pcpOperation(
  user: Account,
  method: string,
  path: string[],
  body: Record<string, unknown> = {},
  query: URLSearchParams = new URLSearchParams(),
) {
  const route = path.join("/");
  return transaction(async (c) => {
    const actor = await first(
      c,
      "SELECT id,block_id FROM users WHERE employee_no=? AND active=TRUE",
      [user.id],
    );
    if (!actor) throw new ActionError("Faça login novamente.", 401);
    const isStock = stockRoles.has(user.role);
    if (isStock) demand(user, "stock");
    if (
      !isStock &&
      (!Number.isSafeInteger(Number(actor.block_id)) ||
        Number(actor.block_id) < 1)
    )
      throw new ActionError(
        "Configure o vínculo com um bloco para usar o PCP.",
        403,
      );
    if (method !== "GET") {
      if (
        !["requisicoes", "consumiveis/requisicoes"].includes(route) ||
        method !== "POST"
      )
        demand(user, "stock");
      else if (!isStock) {
        if (user.role === "funcionario") demand(user, "request");
        else if (
          user.role !== "lider" ||
          user.permissionOverrides?.["requests.create"] === false
        )
          throw new ActionError("Sem permissão para requisitar.", 403);
      }
    }
    if (method === "GET") return execute();
    if (
      typeof body.requestKey !== "string" ||
      !/^[\w-]{16,64}$/.test(body.requestKey)
    )
      throw new ActionError(
        "Informe requestKey (16 a 64 caracteres) para evitar operação duplicada.",
        422,
      );
    const hash = createHash("sha256")
      .update(JSON.stringify({ method, route, body }))
      .digest("hex");
    const key =
      "pcp-" +
      createHash("sha256").update(body.requestKey).digest("hex").slice(0, 60);
    await c.execute(
      "INSERT IGNORE INTO request_submissions(actor_id,request_key,payload_hash) VALUES(?,?,?)",
      [actor.id, key, hash],
    );
    const saved = (await first(
      c,
      "SELECT payload_hash,result FROM request_submissions WHERE actor_id=? AND request_key=? FOR UPDATE",
      [actor.id, key],
    ))!;
    if (saved.payload_hash !== hash)
      throw new ActionError("Chave já usada por outra operação.", 409);
    if (saved.result)
      return typeof saved.result === "string"
        ? JSON.parse(saved.result)
        : saved.result;
    const result = await execute();
    await c.execute(
      "UPDATE request_submissions SET result=? WHERE actor_id=? AND request_key=?",
      [JSON.stringify(result), actor.id, key],
    );
    return result;

    async function execute(): Promise<unknown> {
      if (route === "armazens" && method === "GET")
        return rows(
          c,
          "SELECT id,code,name,pcp_kind,is_central FROM warehouses WHERE active=TRUE ORDER BY id",
        );
      if (route === "armazens" && method === "POST") {
        if (
          user.role !== "admin" ||
          user.permissionOverrides?.["warehouses.manage"] === false
        )
          throw new ActionError(
            "Administração de armazéns não autorizada.",
            403,
          );
        if (!["almoxarifado", "producao"].includes(String(body.tipo)))
          throw new ActionError("Tipo de armazém inválido.", 422);
        const created = await insert(
          c,
          "INSERT INTO warehouses(code,name,pcp_kind) VALUES(?,?,?) RETURNING id",
          [required(body.codigo, 30), required(body.nome, 80), body.tipo],
        );
        await audit(
          c,
          Number(actor.id),
          "warehouse",
          created.id,
          "pcp-create",
          { nome: body.nome, tipo: body.tipo },
        );
        return created;
      }
      if (path[0] === "armazens" && path.length === 2 && method === "PATCH") {
        if (
          user.role !== "admin" ||
          user.permissionOverrides?.["warehouses.manage"] === false
        )
          throw new ActionError(
            "Administração de armazéns não autorizada.",
            403,
          );
        if (!["almoxarifado", "producao"].includes(String(body.tipo)))
          throw new ActionError("Tipo de armazém inválido.", 422);
        const w = await warehouse(c, path[1]);
        if (w.is_central && body.tipo === "producao")
          throw new ActionError(
            "O armazém central deve permanecer como almoxarifado.",
            422,
          );
        await c.execute("SELECT id FROM warehouses WHERE id=? FOR UPDATE", [
          w.id,
        ]);
        const jobs = await first(
          c,
          "SELECT id FROM pcp_requests WHERE (source_warehouse_id=? OR destination_warehouse_id=?) AND status NOT IN ('Transferida','Baixada') LIMIT 1",
          [w.id, w.id],
        );
        const transfers = await first(
          c,
          "SELECT id FROM stock_transfers WHERE (source_warehouse_id=? OR destination_warehouse_id=?) AND status IN ('Solicitada','Em trânsito') LIMIT 1",
          [w.id, w.id],
        );
        if (jobs || transfers)
          throw new ActionError(
            "Conclua as operações pendentes antes de alterar o tipo de armazém.",
            409,
          );
        await c.execute("UPDATE warehouses SET pcp_kind=? WHERE id=?", [
          body.tipo,
          w.id,
        ]);
        await audit(
          c,
          Number(actor.id),
          "warehouse",
          Number(w.id),
          "pcp-kind",
          { previous: w.pcp_kind, tipo: body.tipo },
        );
        return { id: Number(w.id), tipo: body.tipo };
      }
      if (route === "recebimentos") {
        demand(user, "stock");
        if (method === "GET")
          return rows(
            c,
            "SELECT r.*,p.code,p.name,p.unit FROM pcp_receipts r JOIN parts p ON p.id=r.part_id ORDER BY r.id DESC LIMIT 200",
          );
        if (method === "POST") {
          const p = await partLock(c, null, numberId(body.itemId));
          if (p.material_kind === "consumivel")
            throw new ActionError(
              "Consumíveis usam entrada de estoque e baixa direta.",
              422,
            );
          const qty = integer(body.quantidadeNota);
          const w = body.pesoNota == null ? null : weight(body.pesoNota);
          if (w === 0)
            throw new ActionError("Peso da nota deve ser positivo.", 422);
          const created = await insert(
            c,
            "INSERT INTO pcp_receipts(part_id,invoice,lot,invoice_quantity,invoice_weight,actor_id) VALUES(?,?,?,?,?,?) RETURNING id",
            [
              p.id,
              required(body.notaFiscal),
              required(body.lote, 120),
              qty,
              w,
              actor.id,
            ],
          );
          await audit(
            c,
            Number(actor.id),
            "pcp_receipt",
            created.id,
            "create",
            { itemId: p.id, quantidadeNota: qty, pesoNota: w },
          );
          return { ...created, status: "Aguardando conferência" };
        }
      }
      if (path[0] === "recebimentos" && path.length >= 2 && path.length <= 3) {
        demand(user, "stock");
        const r = await getReceipt(c, path[1]);
        if (method === "GET" && path.length === 2) return r;
        if (method === "GET" && path[2] === "status-qualidade")
          return {
            id: Number(r.id),
            status: r.status,
            qualidade: ["Aprovado", "Transferido"].includes(r.status)
              ? "aprovado"
              : r.status === "Reprovado"
                ? "reprovado"
                : "aguardando",
            saldoLiberado: r.status === "Transferido",
            motivo: r.quality_note,
          };
        if (r.status === "Transferido")
          throw new ActionError(
            "Recebimento já transferido; registro preservado.",
            409,
          );
        if (method === "PATCH" && path[2] === "conferencia") {
          if (["Aprovado", "Reprovado"].includes(r.status))
            throw new ActionError(
              "Conferência já finalizada pela qualidade.",
              409,
            );
          const qty = integer(body.quantidadeConferida, 0),
            w = body.pesoConferido == null ? null : weight(body.pesoConferido);
          if (r.invoice_weight != null && w === null)
            throw new ActionError("Informe o peso conferido.", 422);
          const status = receiptMatches(r, qty, w)
            ? "Aguardando qualidade"
            : "Pendente";
          await c.execute(
            "UPDATE pcp_receipts SET counted_quantity=?,counted_weight=?,status=?,updated_at=NOW() WHERE id=?",
            [qty, w, status, r.id],
          );
          await audit(
            c,
            Number(actor.id),
            "pcp_receipt",
            Number(r.id),
            "conference",
            { qty, w, status },
          );
          return {
            id: Number(r.id),
            status,
            divergenciaQuantidade: qty - Number(r.invoice_quantity),
            divergenciaPeso:
              r.invoice_weight == null ? null : w! - Number(r.invoice_weight),
          };
        }
        if (method === "POST" && path[2] === "lancamento-totus") {
          if (r.counted_quantity == null || r.status === "Pendente")
            throw new ActionError(
              "Resolva a conferência antes do lançamento.",
              409,
            );
          if (body.modo !== "manual")
            throw new ActionError(
              "Integração Totus não configurada. Registre o lançamento manual com comprovante.",
              501,
            );
          const ref = required(body.referencia);
          if (r.totus_reference && r.totus_reference !== ref)
            throw new ActionError(
              "Lançamento já registrado com outra referência.",
              409,
            );
          await c.execute(
            "UPDATE pcp_receipts SET totus_reference=?,updated_at=NOW() WHERE id=?",
            [ref, r.id],
          );
          await audit(
            c,
            Number(actor.id),
            "pcp_receipt",
            Number(r.id),
            "totus-manual",
            { referencia: ref },
          );
          return { id: Number(r.id), referencia: ref, modo: "manual" };
        }
        if (method === "PATCH" && path[2] === "validacao-qualidade") {
          if (r.status !== "Aguardando qualidade" || !r.totus_reference)
            throw new ActionError(
              "Conferência sem divergências e lançamento no Totus são obrigatórios.",
              409,
            );
          if (!["aprovado", "reprovado"].includes(String(body.resultado)))
            throw new ActionError("Resultado de qualidade inválido.", 422);
          const note = required(body.motivo, 1000),
            status = body.resultado === "aprovado" ? "Aprovado" : "Reprovado";
          await c.execute(
            "UPDATE pcp_receipts SET status=?,quality_note=?,updated_at=NOW() WHERE id=?",
            [status, note, r.id],
          );
          await audit(
            c,
            Number(actor.id),
            "pcp_receipt",
            Number(r.id),
            "quality",
            { status, motivo: note },
          );
          return { id: Number(r.id), status };
        }
      }
      if (route === "consumiveis/categorias" && method === "GET")
        return rows(
          c,
          "SELECT category,COUNT(*) AS itens FROM parts WHERE active=TRUE AND material_kind='consumivel' GROUP BY category ORDER BY category",
        );
      if (["requisicoes", "consumiveis/requisicoes"].includes(route)) {
        const consumable = route.startsWith("consumiveis");
        if (method === "GET")
          return rows(
            c,
            `SELECT r.*,p.code,p.name,p.unit FROM pcp_requests r JOIN parts p ON p.id=r.part_id WHERE r.consumable=? ${isStock ? "" : "AND r.requester_id=?"} ORDER BY r.id DESC LIMIT 200`,
            isStock ? [Number(consumable)] : [Number(consumable), actor.id],
          );
        if (method === "POST") {
          const p = await partLock(c, null, numberId(body.itemId));
          if ((p.material_kind === "consumivel") !== consumable)
            throw new ActionError(
              "Tipo de item não corresponde ao fluxo escolhido.",
              422,
            );
          const source = await warehouse(c, body.origemId, "almoxarifado");
          if (!isStock && Number(source.block_id) !== Number(actor.block_id))
            throw new ActionError("Armazém de origem fora do seu bloco.", 403);
          const dest = consumable
            ? null
            : await warehouse(c, body.destinoId, "producao");
          const created = await insert(
            c,
            "INSERT INTO pcp_requests(part_id,requester_id,source_warehouse_id,destination_warehouse_id,quantity,cost_center,production_order,consumable) VALUES(?,?,?,?,?,?,?,?) RETURNING id",
            [
              p.id,
              actor.id,
              source.id,
              dest?.id ?? null,
              integer(body.quantidade),
              required(body.centroCusto, 120),
              text(body.ordemProducao, 120) || null,
              Number(consumable),
            ],
          );
          await audit(
            c,
            Number(actor.id),
            "pcp_request",
            created.id,
            "create",
            { itemId: p.id, consumable },
          );
          return { ...created, status: "Pendente" };
        }
      }
      const requestId =
        path[0] === "requisicoes"
          ? path[1]
          : path[0] === "consumiveis" && path[1] === "requisicoes"
            ? path[2]
            : null;
      if (requestId) {
        const r = await getRequest(c, requestId, actor, user);
        const action = path[path[0] === "requisicoes" ? 2 : 3];
        if (Boolean(r.consumable) !== (path[0] === "consumiveis"))
          throw new ActionError("Requisição de outro fluxo.", 404);
        if (method === "GET" && !action) return r;
        if (method === "GET" && action === "validacao")
          return validateRequest(c, r);
        if (
          method === "PATCH" &&
          action === "confirmar-retirada" &&
          !r.consumable
        ) {
          if (!["Pendente", "Separada"].includes(r.status))
            throw new ActionError("Requisição já liberada.", 409);
          const p = await partLock(c, null, r.part_id);
          scan(p, body.qrCode);
          const qty = integer(body.quantidadeConferida);
          if (qty > Number(r.quantity))
            throw new ActionError(
              "Separação maior que a quantidade solicitada.",
              422,
            );
          await c.execute(
            "UPDATE pcp_requests SET picked_quantity=?,status='Separada',updated_at=NOW() WHERE id=?",
            [qty, r.id],
          );
          await audit(
            c,
            Number(actor.id),
            "pcp_request",
            Number(r.id),
            "pick",
            { quantity: qty, code: p.code },
          );
          return {
            id: Number(r.id),
            status: "Separada",
            quantidadeConferida: qty,
          };
        }
        if (method === "PATCH" && action === "liberar" && !r.consumable) {
          if (!(await validateRequest(c, r)).podeLiberar)
            throw new ActionError(
              "Liberação exige saldo na origem, pedido suficiente e retirada integral conferida.",
              409,
            );
          const p = await partLock(c, null, r.part_id);
          await warehouse(c, r.source_warehouse_id, "almoxarifado");
          await warehouse(c, r.destination_warehouse_id, "producao");
          const t = await insert(
            c,
            "INSERT INTO stock_transfers(part_id,source_warehouse_id,destination_warehouse_id,quantity,qr_code_scanned,performed_by,status,reason) VALUES(?,?,?,?,?,?,'Solicitada',?) RETURNING id",
            [
              p.id,
              r.source_warehouse_id,
              r.destination_warehouse_id,
              r.quantity,
              p.code,
              actor.id,
              `Requisição PCP ${r.id}`,
            ],
          );
          await c.execute(
            "UPDATE pcp_requests SET status='Liberada',transfer_id=?,updated_at=NOW() WHERE id=?",
            [t.id, r.id],
          );
          await audit(
            c,
            Number(actor.id),
            "pcp_request",
            Number(r.id),
            "release",
            { transferId: t.id },
          );
          return {
            id: Number(r.id),
            status: "Liberada",
            transferenciaId: t.id,
          };
        }
        if (method === "PATCH" && action === "baixa" && r.consumable) {
          if (r.status !== "Pendente")
            throw new ActionError("Consumível já baixado.", 409);
          const p = await partLock(c, null, r.part_id);
          scan(p, body.qrCode);
          const qty = integer(body.quantidadeConferida);
          if (qty !== Number(r.quantity))
            throw new ActionError(
              "Quantidade conferida diverge da requisição.",
              422,
            );
          const b = (await stock(c, Number(p.id))).find(
            (v) => Number(v.warehouse_id) === Number(r.source_warehouse_id),
          );
          if (!b || available(b) < qty)
            throw new ActionError("Saldo disponível insuficiente.", 409);
          await c.execute(
            "UPDATE inventory SET quantity=quantity-? WHERE part_id=? AND warehouse_id=?",
            [qty, p.id, r.source_warehouse_id],
          );
          await movement(
            c,
            Number(actor.id),
            Number(p.id),
            Number(r.source_warehouse_id),
            "saida",
            qty,
            `Baixa consumível PCP ${r.id}`,
          );
          await c.execute(
            "UPDATE pcp_requests SET status='Baixada',picked_quantity=?,updated_at=NOW() WHERE id=?",
            [qty, r.id],
          );
          await audit(
            c,
            Number(actor.id),
            "pcp_request",
            Number(r.id),
            "consume",
            { quantity: qty },
          );
          return { id: Number(r.id), status: "Baixada" };
        }
      }
      if (route === "pedidos-compra" && method === "POST") {
        const r = await getRequest(c, body.requisicaoId, actor, user);
        if (r.consumable || !["Pendente", "Separada"].includes(r.status))
          throw new ActionError(
            "Requisição não permite pedido de compra.",
            409,
          );
        const qty = integer(body.quantidade);
        if (qty < Number(r.quantity))
          throw new ActionError("Pedido insuficiente para a requisição.", 422);
        const created = await insert(
          c,
          "INSERT INTO pcp_orders(request_id,part_id,quantity,reference,actor_id) VALUES(?,?,?,?,?) RETURNING id",
          [r.id, r.part_id, qty, required(body.referencia), actor.id],
        );
        await audit(c, Number(actor.id), "pcp_order", created.id, "create", {
          requestId: r.id,
          quantity: qty,
        });
        return created;
      }
      if (route === "estoque/transferencias" && method === "POST") {
        if (!!body.recebimentoId === !!body.requisicaoId)
          throw new ActionError(
            "Informe um recebimento ou uma requisição.",
            422,
          );
        if (body.recebimentoId) {
          const r = await getReceipt(c, body.recebimentoId);
          if (r.status !== "Aprovado" || !r.totus_reference)
            throw new ActionError(
              "Saldo bloqueado: exige aprovação da qualidade e lançamento no Totus.",
              409,
            );
          const p = await partLock(c, null, r.part_id),
            w = await warehouse(c, body.destinoId, "almoxarifado");
          scan(p, body.qrCode);
          const qty = integer(Number(r.counted_quantity));
          if (integer(body.quantidadeConferida) !== qty)
            throw new ActionError(
              "Confirme a quantidade física exata do lote.",
              422,
            );
          await addStock(c, p, w, qty);
          await movement(
            c,
            Number(actor.id),
            Number(p.id),
            Number(w.id),
            "entrada",
            qty,
            `Recebimento PCP ${r.id}; lote ${r.lot}; qualidade aprovada`,
          );
          await c.execute(
            "UPDATE pcp_receipts SET status='Transferido',transferred_to=?,updated_at=NOW() WHERE id=?",
            [w.id, r.id],
          );
          await audit(
            c,
            Number(actor.id),
            "pcp_receipt",
            Number(r.id),
            "transfer",
            { destination: w.id, quantity: qty },
          );
          return {
            id: Number(r.id),
            status: "Transferido",
            destinoId: Number(w.id),
            quantidade: qty,
          };
        }
        const r = await getRequest(c, body.requisicaoId, actor, user);
        if (r.consumable || !r.transfer_id || r.status !== "Liberada")
          throw new ActionError(
            "Transferência exige requisição de produção liberada.",
            409,
          );
        const p = await partLock(c, null, r.part_id);
        scan(p, body.qrCode);
        if (!["expedir", "receber"].includes(String(body.etapa)))
          throw new ActionError(
            "Informe etapa expedir ou receber; confirme cada etapa física.",
            422,
          );
        const result = await transferAction(c, Number(actor.id), {
          type:
            body.etapa === "expedir" ? "dispatchTransfer" : "receiveTransfer",
          id: Number(r.transfer_id),
          qrCode: body.qrCode,
          confirmedQuantity: integer(body.quantidadeConferida),
          code: p.code,
        });
        if (body.etapa === "receber")
          await c.execute(
            "UPDATE pcp_requests SET status='Transferida',updated_at=NOW() WHERE id=?",
            [r.id],
          );
        return { ...result, requisicaoId: Number(r.id), etapa: body.etapa };
      }
      if (
        path[0] === "produtos" &&
        path[2] === "qr" &&
        path.length === 3 &&
        method === "PATCH"
      ) {
        const value = body.qrCode;
        if (
          typeof value !== "string" ||
          !value.trim() ||
          value.length > 128 ||
          value.includes("\0") ||
          body.confirmado !== true
        )
          throw new ActionError(
            "Leia a etiqueta e confirme o produto para vincular.",
            422,
          );
        await c.execute(
          "SELECT pg_advisory_xact_lock(hashtext('marcon-product-identifiers'))",
        );
        const p = await partLock(c, null, numberId(path[1]));
        const collision = await first(
          c,
          "SELECT id FROM parts WHERE (code=? OR qr_code=?) AND id<>? LIMIT 1",
          [value, value, p.id],
        );
        if (collision)
          throw new ActionError("Etiqueta já pertence a outro produto.", 409);
        await c.execute("UPDATE parts SET qr_code=? WHERE id=?", [value, p.id]);
        await audit(c, Number(actor.id), "part", Number(p.id), "qr-bind", {
          previous: p.qr_code,
          qrCode: value,
        });
        return { id: Number(p.id), code: p.code, name: p.name, qrCode: value };
      }
      if (path[0] === "estoque" && path.length === 3 && method === "GET") {
        const p = await partLock(c, null, numberId(path[1]));
        if (path[2] === "saldo") {
          const kind = query.get("armazem") || "almoxarifado";
          if (
            !["almoxarifado", "producao", "aguardando-qualidade"].includes(kind)
          )
            throw new ActionError("Armazém inválido.", 422);
          if (kind === "aguardando-qualidade") {
            demand(user, "stock");
            return first(
              c,
              "SELECT COALESCE(SUM(counted_quantity),0) AS fisico,0 AS disponivel FROM pcp_receipts WHERE part_id=? AND status<>'Transferido'",
              [p.id],
            );
          }
          const balances = await stock(c, Number(p.id));
          const warehouses = await rows(
            c,
            "SELECT id FROM warehouses WHERE active=TRUE AND pcp_kind=?",
            [kind],
          );
          const scope = balances.filter(
            (b) =>
              warehouses.some((w) => Number(w.id) === Number(b.warehouse_id)) &&
              (isStock || Number(b.block_id) === Number(actor.block_id)),
          );
          return {
            itemId: Number(p.id),
            armazem: kind,
            unidade: p.unit,
            fisico: scope.reduce((s, b) => s + Number(b.quantity), 0),
            disponivel: scope.reduce((s, b) => s + available(b), 0),
            locais: scope,
          };
        }
        if (path[2] === "historico-transferencias") {
          demand(user, "stock");
          return {
            transferencias: await rows(
              c,
              "SELECT * FROM stock_transfers WHERE part_id=? ORDER BY id DESC LIMIT 200",
              [p.id],
            ),
            recebimentos: await rows(
              c,
              "SELECT id,lot,counted_quantity,transferred_to,updated_at FROM pcp_receipts WHERE part_id=? AND status='Transferido' ORDER BY id DESC LIMIT 200",
              [p.id],
            ),
          };
        }
      }
      throw new ActionError("Rota PCP ou método inexistente.", 404);
    }
  });
}
