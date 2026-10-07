import type { JamesOperation } from "./james-operations";
import { ActionError } from "./permissions";
import { commandText, quantityWords } from "./james-commands";

type Field = keyof Omit<JamesOperation, "name">;
export type JamesForm = { operation: JamesOperation; field?: Field };
const schemas: Partial<Record<JamesOperation["name"], Field[]>> = {
  approve: ["id"],
  analyze: ["id"],
  editRequest: ["id", "quantity"],
  deleteRequest: ["id"],
  requestCancellation: ["id", "reason"],
  confirmReceipt: ["id"],
  planRoute: ["id"],
  cancelTransfer: ["id", "reason"],
  updateUser: [
    "employeeNo",
    "personName",
    "email",
    "sector",
    "role",
    "block",
    "active",
  ],
  toggleUser: ["employeeNo", "active"],
  updatePrice: ["code", "price"],
  createPart: [
    "code",
    "itemName",
    "qrCode",
    "unit",
    "category",
    "location",
    "warehouse",
    "packSize",
    "minimum",
    "leadDays",
    "price",
  ],
  updatePart: [
    "code",
    "itemName",
    "qrCode",
    "unit",
    "category",
    "location",
    "warehouse",
    "packSize",
    "minimum",
    "leadDays",
    "price",
  ],
  deletePart: ["code"],
  transfer: ["code", "quantity", "from", "to", "reason"],
  stockEntry: ["code", "warehouse", "quantity", "reason"],
  adjustStock: ["code", "warehouse", "quantity", "reason"],
  registerReturn: [
    "code",
    "quantity",
    "warehouse",
    "block",
    "returnedBy",
    "condition",
    "reason",
  ],
  inspectReturn: ["id", "condition", "reason"],
  confirmInbound: [
    "code",
    "quantity",
    "warehouse",
    "dueDate",
    "supplier",
    "reference",
  ],
  cancelInbound: ["id"],
  receiveInbound: ["id", "quantity", "qrCode"],
  dispatchTransfer: ["id", "quantity", "qrCode"],
  receiveTransfer: ["id", "quantity", "qrCode"],
};
export const jamesForms = Object.keys(schemas) as JamesOperation["name"][];
export function beginJamesForm(name: unknown): JamesForm {
  if (typeof name !== "string" || !Object.hasOwn(schemas, name))
    throw new ActionError("Formulário indisponível.", 422);
  return { operation: { name: name as JamesOperation["name"] } };
}
const labels: Record<Field, string> = {
  employeeNo: "matrícula",
  personName: "nome completo",
  email: "e-mail",
  sector: "setor",
  role: "função: Administrador, Líder de bloco, Almoxarife ou Funcionário",
  active: "status: ativo ou inativo",
  itemName: "nome da peça",
  unit: "unidade cadastrada, por exemplo un ou kg",
  category: "categoria",
  location: "posição física",
  packSize: "quantidade por embalagem",
  minimum: "mínimo total",
  leadDays: "prazo de reposição em dias",
  price:
    "preço de referência interno em reais, por exemplo 12,50; zero se desconhecido",
  id: "número do registro",
  code: "código do item",
  quantity:
    "quantidade em unidades cadastradas (para ajuste, saldo final contado)",
  from: "almoxarifado de origem",
  to: "almoxarifado de destino",
  warehouse: "almoxarifado",
  reason: "motivo",
  block: "nome do bloco",
  condition: "condição: Apto ou Danificado",
  returnedBy: "nome de quem devolveu",
  dueDate: "data prevista no formato ano-mês-dia",
  supplier: "fornecedor",
  reference: "referência da compra",
  qrCode: "código lido na etiqueta após conferir fisicamente o material",
};
export function startJamesForm(message: string): JamesForm | undefined {
  const commands: Record<string, JamesOperation["name"]> = {
    "editar usuario": "updateUser",
    "alterar status de usuario": "toggleUser",
    "atualizar preco": "updatePrice",
    "cadastrar peca": "createPart",
    "editar peca": "updatePart",
    "desativar peca": "deletePart",
    "solicitar transferencia": "transfer",
    "registrar entrada": "stockEntry",
    "ajustar saldo": "adjustStock",
    "registrar devolucao": "registerReturn",
    "conferir devolucao": "inspectReturn",
    "registrar entrada prevista": "confirmInbound",
    "cancelar entrada prevista": "cancelInbound",
    "receber entrada prevista": "receiveInbound",
    "confirmar saida de transferencia": "dispatchTransfer",
    "confirmar recebimento de transferencia": "receiveTransfer",
  };
  const name = commands[commandText(message)];
  return name ? { operation: { name } } : undefined;
}
export function advanceJamesForm(form: JamesForm, message?: string) {
  const fields = schemas[form.operation.name];
  if (!fields) throw new ActionError("Formulário indisponível.", 422);
  const operation = { ...form.operation };
  // Explicit corrections can reopen any field before the final review.
  const correction = message && commandText(message).match(/^corrigir (.+)$/);
  if (correction) {
    const field = fields.find((f) =>
      commandText(labels[f]).startsWith(correction[1]),
    );
    if (!field)
      throw new ActionError("Diga corrigir e o nome de um campo listado.", 422);
    delete operation[field];
    return { operation, field, question: `Informe ${labels[field]}.` };
  }
  if (form.field && message !== undefined) {
    const f = form.field,
      v = message.trim();
    if (!v || v.length > 500)
      throw new ActionError("Informe até 500 caracteres.", 422);
    if (["quantity", "id", "packSize", "minimum", "leadDays"].includes(f)) {
      const number = quantityWords(commandText(v)).replace(/\s+unidades?$/, "");
      if (
        !/^\d+$/.test(number) ||
        !Number.isSafeInteger(Number(number)) ||
        Number(number) <
          (f === "quantity" && operation.name === "adjustStock" ? 0 : 1) ||
        Number(number) > 1000000
      )
        throw new ActionError("Informe um número inteiro válido.", 422);
      Object.assign(operation, { [f]: Number(number) });
    } else if (f === "price") {
      const number = Number(quantityWords(commandText(v)).replace(",", "."));
      if (!Number.isFinite(number) || number < 0 || number > 9999999999)
        throw new ActionError("Preço interno inválido.", 422);
      operation.price = number;
    } else if (f === "condition") {
      if (!["apto", "danificado"].includes(commandText(v)))
        throw new ActionError("Diga Apto ou Danificado.", 422);
      operation.condition = commandText(v) === "apto" ? "Apto" : "Danificado";
    } else if (f === "active") {
      if (!["ativo", "inativo"].includes(commandText(v)))
        throw new ActionError("Diga ativo ou inativo.", 422);
      operation.active = commandText(v) === "ativo";
    } else if (f === "dueDate") {
      const months = [
        "janeiro",
        "fevereiro",
        "marco",
        "abril",
        "maio",
        "junho",
        "julho",
        "agosto",
        "setembro",
        "outubro",
        "novembro",
        "dezembro",
      ];
      const day = commandText(v).match(/^(\d{1,2}) de ([a-z]+) de (\d{4})$/);
      const numeric = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      operation.dueDate =
        day && months.includes(day[2])
          ? `${day[3]}-${String(months.indexOf(day[2]) + 1).padStart(2, "0")}-${day[1].padStart(2, "0")}`
          : numeric
            ? `${numeric[3]}-${numeric[2]}-${numeric[1]}`
            : v;
    } else if (f === "email") {
      operation.email = v
        .toLowerCase()
        .replace(/\s+arroba\s+/g, "@")
        .replace(/\s+ponto\s+/g, ".")
        .replace(/\s/g, "");
    } else if (f === "role") {
      const role = [
        "Administrador",
        "Líder de bloco",
        "Almoxarife",
        "Funcionário",
      ].find((r) => commandText(r) === commandText(v));
      if (!role)
        throw new ActionError(
          "Escolha uma das quatro funções informadas.",
          422,
        );
      operation.role = role;
    } else if (f === "block" && /^(sem bloco|nenhum)$/.test(commandText(v)))
      operation.block = "";
    else Object.assign(operation, { [f]: v });
  }
  const field = fields.find((f) => operation[f] === undefined);
  return {
    operation,
    field,
    question: field
      ? `Etapa ${fields.indexOf(field) + 1} de ${fields.length}. Informe ${labels[field]}. Diga Cancelar para sair ou Corrigir e o nome do campo.`
      : undefined,
  };
}
