import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import type { Account } from "./accounts";
import { transaction } from "./db";
import { ActionError, demand, integer, reason, text } from "./permissions";
import { first, available, stock, place, partLock, scan } from "./stock-ledger";
import { executeWorkspaceAction } from "./workspace-actions";
import { recordDeliveryPlan } from "./delivery-planning";

export const jamesOperations = [
  "approve",
  "analyze",
  "editRequest",
  "deleteRequest",
  "requestCancellation",
  "confirmReceipt",
  "transfer",
  "cancelTransfer",
  "planRoute",
  "stockEntry",
  "adjustStock",
  "registerReturn",
  "inspectReturn",
  "confirmInbound",
  "cancelInbound",
  "receiveInbound",
  "dispatchTransfer",
  "receiveTransfer",
  "createPart",
  "updatePart",
  "deletePart",
  "updateUser",
  "toggleUser",
  "updatePrice",
] as const;
export type JamesOperation = {
  name: (typeof jamesOperations)[number];
  id?: number;
  quantity?: number;
  code?: string;
  from?: string;
  to?: string;
  warehouse?: string;
  reason?: string;
  block?: string;
  condition?: "Apto" | "Danificado";
  returnedBy?: string;
  dueDate?: string;
  supplier?: string;
  reference?: string;
  qrCode?: string;
  itemName?: string;
  unit?: string;
  category?: string;
  location?: string;
  packSize?: number;
  minimum?: number;
  leadDays?: number;
  price?: number;
  employeeNo?: string;
  personName?: string;
  email?: string;
  sector?: string;
  role?: string;
  active?: boolean;
};
export function parseJamesOperation(value: unknown): JamesOperation {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ActionError("Operação inválida.", 422);
  const o = value as JamesOperation;
  if (!jamesOperations.includes(o.name))
    throw new ActionError(
      "Essa ação ainda precisa ser feita na tela do sistema.",
      422,
    );
  if (["updateUser", "toggleUser"].includes(o.name)) {
    if (
      typeof o.employeeNo !== "string" ||
      !/^[A-Za-z0-9_-]{1,30}$/.test(o.employeeNo) ||
      typeof o.active !== "boolean"
    )
      throw new ActionError("Matrícula ou status inválido.", 422);
    if (o.name === "toggleUser")
      return { name: o.name, employeeNo: o.employeeNo, active: o.active };
    if (
      !o.personName?.trim() ||
      o.personName.length > 120 ||
      !o.email ||
      o.email.length > 190 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email) ||
      !o.sector?.trim() ||
      o.sector.length > 80 ||
      ![
        "Administrador",
        "Líder de bloco",
        "Almoxarife",
        "Funcionário",
      ].includes(o.role || "")
    )
      throw new ActionError("Confira nome, e-mail, setor e função.", 422);
    return {
      name: o.name,
      employeeNo: o.employeeNo,
      active: o.active,
      personName: o.personName,
      email: o.email,
      sector: o.sector,
      role: o.role,
      block: text(o.block, 80),
    };
  }
  if (o.name === "updatePrice") {
    if (
      !text(o.code, 64) ||
      typeof o.price !== "number" ||
      !Number.isFinite(o.price) ||
      o.price < 0 ||
      o.price > 9999999999
    )
      throw new ActionError("Código ou preço inválido.", 422);
    return { name: o.name, code: text(o.code, 64), price: o.price };
  }
  if (["createPart", "updatePart", "deletePart"].includes(o.name)) {
    const code = text(o.code, 64).toUpperCase();
    if (!code) throw new ActionError("Informe o código do item.", 422);
    if (o.name === "deletePart") return { name: o.name, code };
    for (const field of [
      "itemName",
      "unit",
      "category",
      "location",
      "warehouse",
      "qrCode",
    ] as const)
      if (
        typeof o[field] !== "string" ||
        !o[field]!.trim() ||
        o[field]!.length >
          (field === "itemName"
            ? 160
            : field === "qrCode"
              ? 128
              : field === "unit"
                ? 24
                : 80)
      )
        throw new ActionError(`Campo ${field} inválido.`, 422);
    if (
      typeof o.price !== "number" ||
      !Number.isFinite(o.price) ||
      o.price < 0 ||
      o.price > 9999999999
    )
      throw new ActionError("Preço interno inválido.", 422);
    return {
      name: o.name,
      code,
      itemName: o.itemName!.trim(),
      unit: o.unit!.trim(),
      category: o.category!.trim(),
      location: o.location!.trim(),
      warehouse: o.warehouse!.trim(),
      qrCode: o.qrCode!.trim(),
      packSize: integer(o.packSize),
      minimum: integer(o.minimum),
      leadDays: integer(o.leadDays),
      price: o.price,
    };
  }
  for (const v of [
    o.code,
    o.from,
    o.to,
    o.warehouse,
    o.reason,
    o.block,
    o.condition,
    o.returnedBy,
    o.dueDate,
    o.supplier,
    o.reference,
    o.qrCode,
  ])
    if (v !== undefined && (typeof v !== "string" || v.length > 1000))
      throw new ActionError("Parâmetro inválido.", 422);
  if (
    ["registerReturn", "inspectReturn"].includes(o.name) &&
    !["Apto", "Danificado"].includes(o.condition || "")
  )
    throw new ActionError("Informe Apto ou Danificado.", 422);
  if (
    o.name === "confirmInbound" &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(o.dueDate || "") ||
      !Number.isFinite(Date.parse(o.dueDate!)) ||
      new Date(o.dueDate!).toISOString().slice(0, 10) !== o.dueDate)
  )
    throw new ActionError("Informe uma data real no formato ano-mês-dia.", 422);
  return {
    name: o.name,
    ...(o.name === "transfer"
      ? { code: text(o.code, 64), from: text(o.from, 80), to: text(o.to, 80) }
      : [
            "stockEntry",
            "adjustStock",
            "registerReturn",
            "confirmInbound",
          ].includes(o.name)
        ? { code: text(o.code, 64), warehouse: text(o.warehouse, 80) }
        : { id: integer(o.id) }),
    ...([
      "transfer",
      "editRequest",
      "stockEntry",
      "adjustStock",
      "registerReturn",
      "confirmInbound",
      "dispatchTransfer",
      "receiveTransfer",
      "createPart",
      "updatePart",
      "deletePart",
      "receiveInbound",
    ].includes(o.name)
      ? { quantity: integer(o.quantity, o.name === "adjustStock" ? 0 : 1) }
      : {}),
    ...([
      "transfer",
      "cancelTransfer",
      "requestCancellation",
      "stockEntry",
      "adjustStock",
      "registerReturn",
      "inspectReturn",
    ].includes(o.name)
      ? { reason: reason(o.reason) }
      : {}),
    ...(o.name === "registerReturn"
      ? {
          block: reason(o.block),
          returnedBy: reason(o.returnedBy),
          condition: o.condition,
        }
      : {}),
    ...(o.name === "inspectReturn" ? { condition: o.condition } : {}),
    ...(o.name === "confirmInbound"
      ? {
          dueDate: o.dueDate,
          supplier: reason(o.supplier),
          reference: reason(o.reference),
        }
      : {}),
    ...(["dispatchTransfer", "receiveTransfer", "receiveInbound"].includes(
      o.name,
    )
      ? { qrCode: reason(o.qrCode) }
      : {}),
  };
}

// Read exactly the requested record with authorization before exposing a preview.
// Mutations use the same official service and transaction as the workspace API.
async function prepare(c: PoolConnection, user: Account, op: JamesOperation) {
  const actor = await first(
    c,
    "SELECT id,block_id,sector FROM users WHERE employee_no=? AND active=TRUE",
    [user.id],
  );
  if (!actor) throw new ActionError("Sessão inválida.", 401);
  if (["updateUser", "toggleUser"].includes(op.name)) {
    demand(user, "people");
    const target = await first(
      c,
      "SELECT u.id,u.employee_no,u.name,u.email,u.sector,u.role,u.active,b.name block FROM users u LEFT JOIN blocks b ON b.id=u.block_id WHERE u.employee_no=? FOR UPDATE",
      [op.employeeNo],
    );
    if (!target) throw new ActionError("Usuário não encontrado.", 404);
    if (
      op.employeeNo === user.id &&
      (!op.active || (op.name === "updateUser" && op.role !== "Administrador"))
    )
      throw new ActionError(
        "Não altere o próprio perfil ou status de administrador.",
        403,
      );
    return {
      actor,
      action:
        op.name === "toggleUser"
          ? { type: "toggleUser", id: op.employeeNo, active: op.active }
          : {
              type: "saveUser",
              editingId: op.employeeNo,
              user: {
                id: op.employeeNo,
                name: op.personName,
                email: op.email,
                sector: op.sector,
                role: op.role,
                block: op.block,
                active: op.active,
              },
            },
      summary: `${op.name === "toggleUser" ? "Alterar status" : "Atualizar cadastro"} de ${target.name}, matrícula ${target.employee_no}. Atual: ${target.email}, ${target.sector}, ${target.role}, ${target.block || "sem bloco"}, ${target.active ? "ativo" : "inativo"}. Novo: ${op.personName || target.name}${op.name === "updateUser" ? `, ${op.email}, ${op.sector}, ${op.role}, ${op.block || "sem bloco"}` : ""}, ${op.active ? "ativo" : "inativo"}. Senha e biometria preservadas.`,
    };
  }
  if (op.name === "updatePrice") {
    demand(user, "stock");
    const p = await partLock(c, op.code);
    return {
      actor,
      action: { type: "updatePrice", code: p.code, price: op.price },
      summary: `Atualizar estimativa interna de ${p.name} (${p.code}): R$ ${p.reference_unit_price} → R$ ${op.price!.toFixed(2)}. Não é uma cotação de mercado.`,
    };
  }
  if (
    [
      "transfer",
      "cancelTransfer",
      "planRoute",
      "stockEntry",
      "adjustStock",
      "registerReturn",
      "inspectReturn",
      "confirmInbound",
      "cancelInbound",
      "receiveInbound",
      "dispatchTransfer",
      "receiveTransfer",
    ].includes(op.name)
  )
    demand(user, "stock");
  if (["createPart", "updatePart", "deletePart"].includes(op.name)) {
    const creating = op.name === "createPart";
    const p = creating ? null : await partLock(c, op.code);
    if (op.name === "deletePart") {
      if ((await stock(c, Number(p!.id))).some((b) => Number(b.quantity) > 0))
        throw new ActionError("Zere o saldo antes de desativar o item.", 409);
      return {
        actor,
        action: { type: "deletePart", id: Number(p!.id) },
        summary: `Desativar ${p!.name} (${p!.code}). O histórico será preservado; pedidos e transferências pendentes impedem a ação.`,
      };
    }
    const w = await place(c, op.warehouse);
    const b = p
      ? (await stock(c, Number(p.id))).find(
          (b) => Number(b.warehouse_id) === Number(w.id),
        )
      : null;
    const action = {
      type: "savePart",
      warehouse: w.name,
      localQuantity: Number(b?.quantity || 0),
      part: {
        id: p ? Number(p.id) : undefined,
        code: op.code,
        name: op.itemName,
        qrCode: op.qrCode,
        unit: op.unit,
        category: op.category,
        location: op.location,
        packSize: op.packSize,
        minimum: op.minimum,
        leadDays: op.leadDays,
        estimatedCost: op.price,
        criticality: p ? Number(p.criticality) : 1,
        ...(b
          ? {
              localMinimum: Number(b.minimum_quantity),
              aisle: b.aisle,
              shelf: b.shelf,
              capacity: b.capacity,
              mapNodeId: b.map_node_id,
            }
          : {}),
      },
    };
    return {
      actor,
      action,
      summary: `${creating ? "Cadastrar" : "Atualizar"} item ${op.itemName} (${op.code}); etiqueta ${op.qrCode}; unidade ${op.unit}; categoria ${op.category}; posição ${op.location}; almoxarifado ${w.name}; embalagem de ${op.packSize}; mínimo total ${op.minimum}; reposição ${op.leadDays} dias; estimativa interna R$ ${op.price!.toFixed(2)}. ${p ? `Cadastro atual: ${p.name}; ${p.unit}; ${p.category}; ${p.location}; embalagem ${p.pack_size}; mínimo ${p.minimum_total}; reposição ${p.lead_days}; preço ${p.reference_unit_price}.` : "Saldo inicial zero."} Nenhum saldo será alterado.`,
    };
  }
  if (["registerReturn", "confirmInbound"].includes(op.name)) {
    const p = await partLock(c, op.code),
      w = await place(c, op.warehouse);
    if (op.name === "registerReturn") {
      const b = await first(c, "SELECT id,name FROM blocks WHERE name=?", [
        op.block,
      ]);
      if (!b) throw new ActionError("Bloco não encontrado.", 422);
      return {
        actor,
        action: { ...op, type: op.name, note: op.reason },
        summary: `Registrar devolução pendente: ${op.quantity} ${p.unit} de ${p.name} (${p.code}), ${b.name} → ${w.name}, devolvido por ${op.returnedBy}, condição informada ${op.condition}. Motivo: ${op.reason}. O saldo só aumenta após conferência.`,
      };
    }
    return {
      actor,
      action: { ...op, type: op.name },
      summary: `Registrar entrada prevista: ${op.quantity} ${p.unit} de ${p.name} (${p.code}), em ${w.name}, para ${op.dueDate}. Fornecedor: ${op.supplier}; referência: ${op.reference}. Não registra recebimento físico.`,
    };
  }
  if (
    [
      "inspectReturn",
      "cancelInbound",
      "receiveInbound",
      "dispatchTransfer",
      "receiveTransfer",
    ].includes(op.name)
  ) {
    // Table selection is a closed allowlist; IDs and all data remain parameters.
    const table =
      op.name === "inspectReturn"
        ? "return_records"
        : op.name.endsWith("Transfer")
          ? "stock_transfers"
          : "expected_receipts";
    const ref = await first(c, `SELECT part_id FROM ${table} WHERE id=?`, [
      op.id,
    ]);
    if (!ref) throw new ActionError("Registro não encontrado.", 404);
    const p = await partLock(c, null, ref.part_id);
    const r = await first(c, `SELECT * FROM ${table} WHERE id=? FOR UPDATE`, [
      op.id,
    ]);
    const expected =
      op.name === "inspectReturn"
        ? "Pendente"
        : op.name === "dispatchTransfer"
          ? "Solicitada"
          : op.name === "receiveTransfer"
            ? "Em trânsito"
            : "Confirmada";
    if (
      (op.name === "inspectReturn" ? r.inspection_status : r.status) !==
      expected
    )
      throw new ActionError("Etapa já concluída ou indisponível.", 409);
    if (op.qrCode) {
      scan(p, op.qrCode);
      if (Number(r.quantity) !== op.quantity)
        throw new ActionError(
          "Quantidade conferida não corresponde ao registro.",
          422,
        );
    }
    const labels = {
      inspectReturn: "Conferir devolução",
      cancelInbound: "Cancelar entrada prevista",
      receiveInbound: "Receber entrada física",
      dispatchTransfer: "Confirmar saída da transferência",
      receiveTransfer: "Confirmar recebimento da transferência",
    };
    return {
      actor,
      action: { ...op, type: op.name, confirmedQuantity: op.quantity },
      summary: `${labels[op.name as keyof typeof labels]} ${op.id}: ${r.quantity} ${p.unit} de ${p.name} (${p.code}), etapa ${expected}.${op.condition ? ` Condição: ${op.condition}. Motivo: ${op.reason}.` : ""}${op.qrCode ? ` Código conferido: ${op.qrCode}. Confirme somente após a conferência física.` : ""}`,
    };
  }
  if (["approve", "analyze"].includes(op.name)) demand(user, "approve");
  if (
    [
      "editRequest",
      "deleteRequest",
      "requestCancellation",
      "confirmReceipt",
    ].includes(op.name)
  )
    demand(user, "request");
  if (["stockEntry", "adjustStock"].includes(op.name)) {
    const p = await partLock(c, op.code),
      w = await place(c, op.warehouse);
    const balance = (await stock(c, Number(p.id))).find(
      (b) => Number(b.warehouse_id) === Number(w.id),
    );
    const current = Number(balance?.quantity ?? 0);
    const next =
      op.name === "stockEntry" ? current + op.quantity! : op.quantity!;
    if (next < Number(balance?.reserved ?? 0))
      throw new ActionError("Saldo não pode ficar abaixo das reservas.", 409);
    return {
      actor,
      action: {
        type: op.name,
        code: p.code,
        warehouse: w.name,
        quantity: op.quantity,
        reason: op.reason,
      },
      summary: `${op.name === "stockEntry" ? "Registrar entrada física" : "Corrigir contagem física"} de ${p.name} (${p.code}), em ${w.name}. Saldo: ${current} → ${next} ${p.unit}. Motivo: ${op.reason}. Confirme somente após conferir fisicamente os materiais.`,
    };
  }
  if (op.name === "transfer") {
    const p = await partLock(c, op.code);
    if (!p)
      throw new ActionError("Informe o código exato de um item ativo.", 422);
    const source = await place(c, op.from),
      dest = await place(c, op.to);
    if (source.id === dest.id)
      throw new ActionError("Escolha locais diferentes.", 422);
    const balance = (await stock(c, Number(p.id))).find(
      (b) => Number(b.warehouse_id) === Number(source.id),
    );
    if (
      !balance ||
      available(balance) - Number(balance.minimum_quantity) < op.quantity!
    )
      throw new ActionError(
        "Saldo insuficiente acima das reservas e do mínimo da origem.",
        409,
      );
    return {
      actor,
      action: {
        type: "transfer",
        code: p.code,
        from: source.name,
        to: dest.name,
        quantity: op.quantity,
        reason: op.reason,
      },
      summary: `Solicitar transferência de ${op.quantity} ${p.unit} de ${p.name}: ${source.name} → ${dest.name}. Motivo: ${op.reason}. Disponível na origem: ${available(balance)}; mínimo: ${balance.minimum_quantity}. A saída e o recebimento ainda exigirão conferência física.`,
    };
  }
  if (op.name === "cancelTransfer") {
    const t = await first(
      c,
      "SELECT t.id,t.status,t.quantity,p.name FROM stock_transfers t JOIN parts p ON p.id=t.part_id WHERE t.id=?",
      [op.id],
    );
    if (!t || t.status !== "Solicitada")
      throw new ActionError(
        "Transferência não encontrada ou já saiu da origem.",
        409,
      );
    return {
      actor,
      action: { type: "cancelTransfer", id: op.id, reason: op.reason },
      summary: `Cancelar transferência ${op.id}: ${t.quantity} de ${t.name}. Motivo: ${op.reason}.`,
    };
  }
  const scope =
    user.role === "funcionario"
      ? "AND r.requester_id=?"
      : user.role === "lider"
        ? "AND r.block_id=?"
        : "";
  const params =
    user.role === "funcionario"
      ? [actor.id]
      : user.role === "lider"
        ? [actor.block_id]
        : [];
  const ref = await first(
    c,
    `SELECT r.part_id FROM requests r WHERE r.id=? ${scope}`,
    [op.id, ...params],
  );
  if (!ref)
    throw new ActionError("Requisição não encontrada no seu escopo.", 404);
  await partLock(c, null, ref.part_id);
  const r = await first(
    c,
    `SELECT r.*,p.name,p.unit,b.name AS block FROM requests r JOIN parts p ON p.id=r.part_id JOIN blocks b ON b.id=r.block_id WHERE r.id=? ${scope} FOR UPDATE`,
    [op.id, ...params],
  );
  if (!r)
    throw new ActionError("Requisição não encontrada no seu escopo.", 404);
  const pending = ["Pendente", "Em análise"].includes(String(r.status));
  if (
    (["approve", "editRequest", "deleteRequest"].includes(op.name) &&
      !pending) ||
    (op.name === "analyze" && r.status !== "Pendente") ||
    (["requestCancellation", "planRoute"].includes(op.name) &&
      r.status !== "Aprovada") ||
    (op.name === "confirmReceipt" && (r.status !== "Entregue" || r.received_at))
  )
    throw new ActionError(
      "Essa ação não está disponível na etapa atual do pedido.",
      409,
    );
  const labels = {
    approve: "Aprovar e reservar",
    analyze: "Colocar em análise",
    editRequest: `Alterar quantidade para ${op.quantity} ${r.unit}`,
    deleteRequest: "Excluir pedido pendente",
    requestCancellation: "Solicitar cancelamento",
    confirmReceipt: "Confirmar que você recebeu fisicamente",
    planRoute: "Calcular e registrar rota, sem baixar estoque",
  };
  const label = labels[op.name as keyof typeof labels];
  const action =
    op.name === "approve" || op.name === "analyze"
      ? {
          type: "changeRequestStatus",
          id: op.id,
          status: op.name === "approve" ? "Aprovada" : "Em análise",
        }
      : { type: op.name, id: op.id, quantity: op.quantity, reason: op.reason };
  return {
    actor,
    action,
    summary: `${label}: requisição ${op.id}, ${r.name}, ${r.quantity} ${r.unit}, ${r.block}, status ${r.status}.${op.reason ? ` Motivo: ${op.reason}.` : ""}`,
  };
}
export async function previewJamesOperation(
  user: Account,
  operation: JamesOperation,
) {
  return transaction(async (c) => (await prepare(c, user, operation)).summary);
}
export async function executeJamesOperation(
  user: Account,
  operation: JamesOperation,
  key: string,
  expectedSummary: string,
) {
  return transaction(async (c) => {
    const actor = await first(
      c,
      "SELECT id FROM users WHERE employee_no=? AND active=TRUE",
      [user.id],
    );
    if (!actor) throw new ActionError("Sessão inválida.", 401);
    const hash = createHash("sha256")
      .update(JSON.stringify({ james: operation }))
      .digest("hex");
    // Reuse the existing persistent idempotency ledger. Result and business write commit together.
    await c.execute(
      "INSERT IGNORE INTO request_submissions(actor_id,request_key,payload_hash) VALUES(?,?,?)",
      [actor.id, key, hash],
    );
    const saved = await first(
      c,
      "SELECT payload_hash,result FROM request_submissions WHERE actor_id=? AND request_key=? FOR UPDATE",
      [actor.id, key],
    );
    if (saved.payload_hash !== hash)
      throw new ActionError("Confirmação incompatível.", 409);
    if (saved.result)
      return typeof saved.result === "string"
        ? JSON.parse(saved.result)
        : saved.result;
    const prepared = await prepare(c, user, operation);
    if (prepared.summary !== expectedSummary)
      throw new ActionError(
        "Os dados mudaram desde a revisão. Peça um novo resumo antes de confirmar.",
        409,
      );
    let result: unknown;
    let reply = "Concluído: " + prepared.summary;
    if (operation.name === "planRoute") {
      demand(user, "stock");
      const plan = await recordDeliveryPlan(
        c,
        user,
        { action: "planDelivery" },
        operation.id!,
      );
      result = { id: plan.id, mapVersion: plan.mapVersion };
      reply = plan.route
        ? `Rota registrada: ${plan.labels.join(" → ")}. Custo: ${plan.route.cost} ${plan.metric}. Versão ${plan.mapVersion}. Nenhuma baixa de estoque.`
        : `Operação manual: ${plan.reason} Decisão registrada no histórico, sem baixa de estoque.`;
    } else
      // A ação roda na API do backend (transação própria); aqui só registramos
      // a submissão idempotente no banco local.
      result = await executeWorkspaceAction(
        user,
        { ...prepared.action, requestKey: key },
      );
    const response = { result, reply, operationCompleted: true };
    await c.execute(
      "UPDATE request_submissions SET result=? WHERE actor_id=? AND request_key=?",
      [JSON.stringify(response), actor.id, key],
    );
    return response;
  });
}
