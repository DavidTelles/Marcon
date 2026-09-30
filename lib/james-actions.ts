import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import type { Account } from "./accounts";
import { ActionError, can, demand, integer } from "./permissions";
import { workspaceSnapshot } from "./workspace-db";
import { executeWorkspaceAction } from "./workspace-actions";
import { dashboardReport } from "./dashboard-report";
import { jamesPlan, type JamesStep } from "./james-model";
import { explicitCartPlan, quantityWords } from "./james-commands";
import {
  advanceJamesForm,
  startJamesForm,
  beginJamesForm,
  type JamesForm,
} from "./james-forms";
import {
  reportContext,
  explicitReportPlan,
  type JamesReportContext,
} from "./james-reports";
import { pathFor } from "./workspace-routes";
import { choiceIndex } from "./james-voice";
import { catalogMatches, narrowCandidates, rankCatalogCandidates, candidateQuestion } from "./james-catalog";
import { explicitOperation } from "./james-intents";
import {
  previewJamesOperation,
  executeJamesOperation,
  type JamesOperation,
  parseJamesOperation,
} from "./james-operations";
export type JamesCart = {
  code: string;
  quantity: number;
  priority: "Leve" | "Moderado" | "Urgente";
  justification: string;
}[];
function draft(
  step: JamesStep,
  block: string | null | undefined,
  stage: string,
) {
  return {
    action: step.action,
    query: step.query || "",
    purpose: step.purpose || null,
    appearance: step.appearance || null,
    material: step.material || null,
    dimensions: step.dimensions || null,
    quantity: step.quantity ?? null,
    unit: step.unit || null,
    block: block || null,
    pending: stage,
    version: randomUUID(),
  };
}
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "America/Sao_Paulo",
    }).format(new Date()),
  );
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}
const mac = (s: string) =>
  createHmac("sha256", process.env.SESSION_SECRET!)
    .update("james-confirm:" + s)
    .digest("base64url");
function ticket(
  user: Account,
  entries: JamesCart,
  continuation?: {
    steps: JamesStep[];
    index: number;
    choices: string[];
    quantity?: boolean;
    candidates?: string[];
    offset?: number;
    hypothesisCode?: string;
  },
  operation?: JamesOperation,
  operationSummary?: string,
  form?: JamesForm,
  cartProposal = false,
  baseEntries?: JamesCart,
) {
  const data = Buffer.from(
    JSON.stringify({
      user: user.id,
      role: user.role,
      block: user.block,
      entries,
      baseEntries,
      kind: cartProposal
        ? "cart"
        : form
          ? "form"
          : operation
            ? "operation"
            : continuation
              ? "clarification"
              : "request",
      operation,
      operationSummary,
      form,
      continuation,
      key: randomUUID(),
      until: Date.now() + 10 * 60000,
    }),
  ).toString("base64url");
  return data + "." + mac(data);
}
function readTicket(user: Account, token: unknown, kind: string) {
  if (typeof token !== "string" || token.length > 32000)
    throw new ActionError("Resumo inválido. Revise novamente.", 403);
  const [data, signature, ...extra] = token.split(".");
  const expected = Buffer.from(mac(data || "")),
    received = Buffer.from(signature || "");
  if (
    extra.length ||
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  )
    throw new ActionError("Resumo inválido. Revise novamente.", 403);
  const t = JSON.parse(Buffer.from(data, "base64url").toString());
  if (
    t.kind !== kind ||
    t.user !== user.id ||
    t.role !== user.role ||
    t.block !== user.block ||
    t.until < Date.now()
  )
    throw new ActionError(
      "Resumo expirado ou fora do seu perfil. Revise novamente.",
      403,
    );
  return t;
}
export async function confirmJames(
  user: Account,
  token: unknown,
  confirmation: unknown,
  currentCart?: unknown,
) {
  if (confirmation === "confirmar carrinho") {
    demand(user, "request");
    const t = readTicket(user, token, "cart");
    if (JSON.stringify(currentCart) !== JSON.stringify(t.baseEntries))
      throw new ActionError("O carrinho mudou. Revise a proposta.", 409);
    const { stock } = await workspaceSnapshot(user, true);
    const byCode = new Map(stock.map((part) => [part.code, part]));
    for (const entry of t.entries as JamesCart) {
      const part = byCode.get(entry.code);
      if (!part || integer(entry.quantity) > (part.available ?? part.quantity))
        throw new ActionError(
          "O catálogo ou saldo mudou. Revise o carrinho.",
          409,
        );
    }
    return {
      reply: "Item confirmado no carrinho.",
      cart: t.entries,
      items: (t.entries as JamesCart).map((entry) => ({
        ...entry,
        name: byCode.get(entry.code)!.name,
        unit: byCode.get(entry.code)!.unit,
        packSize: byCode.get(entry.code)!.packSize,
        available: byCode.get(entry.code)!.available,
      })),
    };
  }
  if (confirmation === "confirmar acao") {
    const t = readTicket(user, token, "operation");
    return executeJamesOperation(user, t.operation, t.key, t.operationSummary);
  }
  demand(user, "request");
  if (
    typeof token !== "string" ||
    token.length > 32000 ||
    confirmation !== "confirmar requisicao"
  )
    throw new ActionError("Confirme explicitamente o resumo exibido.", 400);
  const t = readTicket(user, token, "request");
  const result = await executeWorkspaceAction(user, {
    type: "createRequests",
    entries: t.entries,
    requestKey: t.key,
  });
  return {
    reply:
      "Requisicao registrada. Voce pode acompanhar o pedido na pagina de requisicoes.",
    result,
    cart: [],
    submitted: true,
  };
}
export async function converseJames(
  user: Account,
  input: Record<string, unknown>,
  signal: AbortSignal,
) {
  const message = input.message;
  if (typeof message !== "string" || !message.trim() || message.length > 2000)
    throw new ActionError("Digite uma mensagem de ate 2000 caracteres.");
  if (!Array.isArray(input.cart) || input.cart.length > 30)
    throw new ActionError("Carrinho invalido.");
  const { stock } = await workspaceSnapshot(user, true);
  const byCode = new Map(stock.map((p) => [p.code, p]));
  let cart: JamesCart = input.cart.map((e) => {
    if (
      !e ||
      typeof e.code !== "string" ||
      !byCode.has(e.code) ||
      !["Leve", "Moderado", "Urgente"].includes(e.priority) ||
      typeof e.justification !== "string" ||
      e.justification.length > 1000
    )
      throw new ActionError("Revise os itens do carrinho.");
    return {
      code: e.code,
      quantity: integer(e.quantity),
      priority: e.priority,
      justification: e.justification,
    };
  });
  if (new Set(cart.map((e) => e.code)).size !== cart.length)
    throw new ActionError("Itens repetidos no carrinho.");
  if (cart.length) demand(user, "request");
  const describe = () =>
    cart.map((e) => {
      const p = byCode.get(e.code)!;
      return {
        ...e,
        name: p.name,
        unit: p.unit || "un",
        packSize: p.packSize,
        available: p.available ?? p.quantity,
      };
    });
  const simple = quantityWords(normalize(message).replace(/[.!?]/g, ""));
  const casual = simple
    .replace(/\b(?:james|jhames)\b/g, "")
    .replace(/[,;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (
    /^(?:(?:bom dia|boa tarde|boa noite|oi|ola)\s*)?(?:(?:como (?:vai|voce esta|esta voce|esta)(?: hoje)?|tudo bem)\s*)?$/.test(
      casual,
    ) &&
    casual
  )
    return {
      cart,
      reply: `${/^(bom dia|boa tarde|boa noite|oi|ola)/.test(casual) ? greeting() + "! " : ""}Estou pronto para ajudar. Como está seu dia?`,
      updatedAt: new Date().toISOString(),
    };
  if (/^(obrigad[oa]|valeu|muito obrigad[oa])$/.test(casual))
    return {
      cart,
      reply: "Por nada! Quando precisar, é só chamar.",
      updatedAt: new Date().toISOString(),
    };
  if (/^(cancelar|cancele|nao)$/.test(simple))
    return {
      reply:
        "Envio e esclarecimento cancelados. Seu carrinho foi mantido; requisições já registradas não foram canceladas.",
      cart,
      cancelled: true,
    };
  const startingForm = startJamesForm(message);
  if (startingForm || input.formToken) {
    const saved: JamesForm =
      startingForm || readTicket(user, input.formToken, "form").form;
    demand(
      user,
      ["updateUser", "toggleUser"].includes(saved.operation.name)
        ? "people"
        : "stock",
    );
    const next = advanceJamesForm(saved, startingForm ? undefined : message);
    const formToken = ticket(user, cart, undefined, undefined, undefined, next);
    if (next.field)
      return {
        cart,
        formToken,
        reply: next.question,
        updatedAt: new Date().toISOString(),
      };
    const op = parseJamesOperation(next.operation);
    const summary = await previewJamesOperation(user, op);
    return {
      cart,
      formToken,
      reply: `${summary} Diga Confirmar ação, Corrigir e o nome do campo, ou Cancelar. Nada foi executado ainda.`,
      confirmationToken: ticket(user, cart, undefined, op, summary),
      confirmationKind: "operation",
      updatedAt: new Date().toISOString(),
    };
  }
  let continuation: JamesStep[] | undefined;
  if (input.clarificationToken) {
    const saved = readTicket(user, input.clarificationToken, "clarification");
    if (JSON.stringify(saved.entries) !== JSON.stringify(cart))
      throw new ActionError(
        "O carrinho mudou. Repita o pedido para revisar as quantidades.",
        409,
      );
    const correction = quantityWords(normalize(message)).match(
      /^(?:na verdade[, ]*|corrija (?:a )?quantidade (?:para )?)(\d+)(?:\s+(unidades?|caixas?|embalagens?))?[.!]?$/,
    );
    if (correction && !saved.continuation.quantity) {
      const step = saved.continuation.steps[
        saved.continuation.index
      ] as JamesStep;
      step.quantity = integer(Number(correction[1]));
      if (correction[2])
        step.unit = correction[2].startsWith("unidade") ? "unit" : "package";
      const choices: string[] = saved.continuation.choices;
      return {
        reply: `Quantidade atualizada para ${step.quantity} ${step.unit === "package" ? "caixas" : "unidades"}. Qual peça você quer?`,
        cart,
        draft: draft(step, user.block, "peça"),
        clarificationToken: ticket(user, cart, saved.continuation),
        choices: choices.map((code) => ({
          code,
          name: byCode.get(code)?.name || code,
        })),
      };
    }
    if (saved.continuation.quantity) {
      const quantity = quantityWords(normalize(message)).match(
        /^(?:na verdade[, ]*)?(\d+)(?:\s+(unidades?|caixas?|embalagens?))?[.!]?$/,
      );
      if (!quantity)
        throw new ActionError(
          "Diga a quantidade e se são unidades ou caixas.",
          422,
        );
      continuation = saved.continuation.steps;
      continuation![saved.continuation.index].quantity = integer(
        Number(quantity[1]),
      );
      continuation![saved.continuation.index].unit = quantity[2]
        ? quantity[2].startsWith("unidade")
          ? "unit"
          : "package"
        : continuation![saved.continuation.index].unit;
    } else {
      const ordinal = choiceIndex(message);
      const allCodes: string[] =
        saved.continuation.candidates || saved.continuation.choices;
      if (!allCodes.length) {
        continuation = saved.continuation.steps;
        const step = continuation![saved.continuation.index];
        step.query = `${step.query || ""} ${message}`.trim();
      } else {
        if (normalize(message) === "mais opcoes") {
          const offset =
            ((saved.continuation.offset || 0) + 3) % allCodes.length;
          const choices = allCodes.slice(offset, offset + 3);
          return {
            reply: `Outras opções: ${choices.map((code, i) => `${i + 1}. ${byCode.get(code)?.name} (${code})`).join("; ")}.`,
            cart,
            draft: draft(
              saved.continuation.steps[saved.continuation.index],
              user.block,
              "peça",
            ),
            choices: choices.map((code) => ({
              code,
              name: byCode.get(code)?.name || code,
            })),
            moreOptions: allCodes.length > 3,
            clarificationToken: ticket(user, cart, {
              ...saved.continuation,
              choices,
              offset,
            }),
          };
        }
        let selected = saved.continuation.hypothesisCode && /^(?:sim|isso|esse mesmo)[.!]?$/i.test(message.trim())
          ? saved.continuation.hypothesisCode
          : ordinal === null ? message.trim() : saved.continuation.choices[ordinal];
        if (!allCodes.includes(selected)) {
          let narrowed = narrowCandidates(
            allCodes.map((code) => byCode.get(code)!).filter(Boolean),
            message,
          ).map((part) => part.code);
          if (!narrowed.length)
            narrowed = rankCatalogCandidates(
              allCodes.map((code) => byCode.get(code)!).filter(Boolean),
              { query: message },
            ).map((result) => result.part.code);
          const spokenMeasure = normalize(message).match(/\b(seis|oito|dez|doze)\b/);
          const numberWord: Record<string, string> = { seis: "6", oito: "8", dez: "10", doze: "12" };
          const plausible = spokenMeasure
            ? narrowed.filter((code) => {
                const part = byCode.get(code)!;
                const values = normalize(`${part.name} ${part.dimensions || ""}`);
                return new RegExp(`\\bm${numberWord[spokenMeasure[1]]}\\b|\\b${numberWord[spokenMeasure[1]]}\\s*mm\\b`).test(values);
              })
            : [];
          if (plausible.length === 1 && spokenMeasure && !/\bm\d+\b/i.test(message)) {
            const part = byCode.get(plausible[0])!;
            const thread = normalize(`${part.name} ${part.dimensions || ""}`).match(/\b(m\d+)\b/)?.[1]?.toUpperCase();
            return {
              reply: `Você disse "${spokenMeasure[1]}". ${part.name}${thread ? ` tem rosca ${thread}` : ""}. É essa medida? Diga sim ou informe outra característica.`,
              cart,
              draft: draft(saved.continuation.steps[saved.continuation.index], user.block, "confirmar medida"),
              choices: [{ code: part.code, name: part.name }],
              clarificationToken: ticket(user, cart, { ...saved.continuation, choices: [part.code], candidates: [part.code], hypothesisCode: part.code }),
            };
          }
          if (narrowed.length !== 1) {
            const candidates = narrowed.length ? narrowed : allCodes;
            const choices = candidates.slice(0, 3);
            return {
              reply: narrowed.length
                ? `Ainda há ${narrowed.length} peças. ${candidateQuestion(candidates.map((code) => byCode.get(code)!).filter(Boolean))} ${choices.map((code) => `${byCode.get(code)?.name} (${code})`).join("; ")}.`
                : "Não identifiquei essa característica no catálogo. Diga a medida ou o código exato de uma das opções.",
              cart,
              draft: draft(
                saved.continuation.steps[saved.continuation.index],
                user.block,
                "medida ou código",
              ),
              choices: choices.map((code) => ({
                code,
                name: byCode.get(code)?.name || code,
              })),
              moreOptions: candidates.length > 3,
              clarificationToken: ticket(user, cart, {
                ...saved.continuation,
                choices,
                candidates,
                offset: 0,
              }),
            };
          }
          selected = narrowed[0];
        }
        continuation = saved.continuation.steps;
        continuation![saved.continuation.index].query = selected;
      }
    }
  }
  const reordered = simple.replace(
    /^(troque|mude|altere|ajuste)\s+(?:para|pra)\s+(\d+)\s+(caixas|embalagens|unidades)$/,
    "$1 $3 para $2",
  );
  const correction = reordered.match(
    /^(?:troque|mude|altere|ajuste)\s+(?:as\s+)?(caixas|embalagens|unidades)\s+(?:para|pra)\s+(\d+)$/,
  );
  const correctionItems = correction
    ? cart.filter(
        (e) => correction[1] === "unidades" || byCode.get(e.code)!.packSize > 1,
      )
    : [];
  const bareCorrection = simple.match(
    /^na verdade[, ]*(\d+)(?:\s+(unidades?|caixas?|embalagens?))?$/,
  );
  if (!continuation && correction && correctionItems.length !== 1)
    return {
      reply:
        "Qual item do carrinho deseja corrigir? Informe o código e a quantidade. Nenhuma alteração foi aplicada.",
      cart: input.cart,
      clarificationToken: correctionItems.length
        ? ticket(user, cart, {
            steps: [
              {
                action: "set",
                quantity: integer(Number(correction[2])),
                unit: correction[1] === "unidades" ? "unit" : "package",
              },
            ],
            index: 0,
            choices: correctionItems.map((e) => e.code),
          })
        : undefined,
      choices: correctionItems.map((e) => ({
        code: e.code,
        name: byCode.get(e.code)!.name,
      })),
    };
  const justification = message.match(/^justificativa\s*:\s*(.+)$/i);
  const history = Array.isArray(input.history)
    ? input.history
        .slice(-6)
        .filter((v) => typeof v === "string")
        .map((v) => v.slice(0, 2000))
    : [];
  const operation = explicitOperation(message);
  let reportState: JamesReportContext | undefined = reportContext(
    input.reportContext,
  );
  const steps =
    continuation ??
    (operation
      ? [
          {
            action: "operation" as const,
            operation: parseJamesOperation(operation),
          },
        ]
      : undefined) ??
    (bareCorrection && cart.length === 1
      ? [
          {
            action: "set" as const,
            query: cart[0].code,
            quantity: integer(Number(bareCorrection[1])),
            unit:
              bareCorrection[2]?.startsWith("caixa") ||
              bareCorrection[2]?.startsWith("embalagem")
                ? "package"
                : "unit",
          },
        ]
      : correction
        ? [
            {
              action: "set" as const,
              query: correctionItems[0].code,
              quantity: integer(Number(correction[2])),
              unit: correction[1] === "unidades" ? "unit" : "package",
            },
          ]
        : (explicitCartPlan(message) ??
          explicitReportPlan(message, reportState) ??
          (justification
            ? [{ action: "justify" as const, reason: justification[1] }]
            : simple === "mostre meu carrinho"
              ? [{ action: "cart" as const }]
              : ["faca a requisicao", "revisar requisicao"].includes(simple)
                ? [{ action: "review" as const }]
                : await jamesPlan(
                    message,
                    {
                      page:
                        typeof input.page === "string"
                          ? input.page.slice(0, 180)
                          : "",
                      role: user.role,
                      operations:
                        user.role === "funcionario"
                          ? [
                              "editRequest",
                              "deleteRequest",
                              "requestCancellation",
                              "confirmReceipt",
                            ]
                          : user.role === "lider"
                            ? ["approve", "analyze"]
                            : user.role === "admin"
                              ? [
                                  "approve",
                                  "analyze",
                                  "transfer",
                                  "cancelTransfer",
                                  "planRoute",
                                  "stockEntry",
                                  "adjustStock",
                                ]
                              : [
                                  "transfer",
                                  "cancelTransfer",
                                  "planRoute",
                                  "stockEntry",
                                  "adjustStock",
                                ],
                      capabilities: can(user.role, "request")
                        ? [
                            "find",
                            "cart",
                            "add",
                            "set",
                            "remove",
                            "review",
                            "requests",
                            "export",
                            "navigate",
                          ]
                        : can(user.role, "planning")
                          ? [
                              "find",
                              "requests",
                              "dashboard",
                              "export",
                              "navigate",
                              "compra",
                              "recomendacoes",
                              "rotas",
                              "transferencias",
                            ]
                          : [
                              "find",
                              "requests",
                              "dashboard do próprio bloco",
                              "export",
                              "navigate",
                            ],
                      today: new Date().toISOString().slice(0, 10),
                      cart: describe(),
                      history,
                    },
                    signal,
                ))));
  if (steps.some((step) => /\b(?:mesmo que pedi|igual ao ultimo|mesmo de ontem|pedi ontem)\b/.test(normalize(step.query || "")))) {
    demand(user, "request");
    const { requests } = await workspaceSnapshot(user);
    const yesterday = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - 86_400_000));
    const own = requests.filter((request) => request.requesterId === user.id && (!/ontem/.test(simple) || request.date === yesterday));
    const previous = own[0];
    if (!previous) return { reply: "Não encontrei um pedido anterior seu nesse período. Descreva a peça ou procure no histórico.", cart };
    for (const step of steps) {
      if (/\b(?:mesmo que pedi|igual ao ultimo|mesmo de ontem|pedi ontem)\b/.test(normalize(step.query || "")))
        step.query = previous.code;
    }
  }
  const replies: string[] = [];
  let review = false;
  let dashboard: unknown;
  let href: string | undefined;
  let hrefLabel: string | undefined;
  let exportHref: string | undefined;
  let records:
    | {
        id: string;
        item: string;
        quantity: number;
        unit: string;
        status: string;
        block: string;
        date: string;
      }[]
    | undefined;
  for (const [index, step] of steps.entries()) {
    if (step.action === "form") {
      const form = advanceJamesForm(beginJamesForm(step.view));
      demand(
        user,
        ["updateUser", "toggleUser"].includes(form.operation.name)
          ? "people"
          : "stock",
      );
      return {
        cart,
        formToken: ticket(user, cart, undefined, undefined, undefined, form),
        reply: form.question,
        updatedAt: new Date().toISOString(),
      };
    }
    if (step.action === "chat")
      return { reply: step.answer, cart, updatedAt: new Date().toISOString() };
    if (step.action === "operation") {
      if (
        step.operation?.reason &&
        !normalize(message).includes(normalize(step.operation.reason))
      )
        throw new ActionError(
          "Diga a justificativa com suas palavras, junto com a ação.",
          422,
        );
      const summary = await previewJamesOperation(user, step.operation!);
      return {
        reply: `${summary} Nada foi executado ainda. Diga Confirmar ação ou Cancelar.`,
        cart,
        confirmationToken: ticket(
          user,
          cart,
          undefined,
          step.operation,
          summary,
        ),
        confirmationKind: "operation",
        updatedAt: new Date().toISOString(),
      };
    }
    if (
      ["add", "set", "remove", "review", "cart", "justify"].includes(
        step.action,
      )
    )
      demand(user, "request");
    if (["add", "set", "remove", "find"].includes(step.action)) {
      const ranked = rankCatalogCandidates(stock, {
        query: step.query || "",
        purpose: step.purpose,
        material: step.material,
        dimensions: step.dimensions,
        appearance: step.appearance,
      });
      const exact = stock.filter((part) => [part.code, part.name].some((value) => normalize(value) === normalize(step.query || "")));
      const compatible = new Set(ranked.map((result) => result.part.code));
      const verifiedExact = exact.filter((part) => compatible.has(part.code));
      let matches = verifiedExact.length ? verifiedExact : ranked.length ? ranked.map((result) => result.part) : exact.length ? [] : catalogMatches(stock, step.query || "");
      if (["set", "remove"].includes(step.action))
        matches = matches.filter((p) => cart.some((e) => e.code === p.code));
      if (step.action === "find") {
        replies.push(
          matches.length
            ? matches
                .slice(0, 8)
                .map(
                  (p) =>
                    `${p.code}: ${p.name}. Disponível: ${p.available ?? p.quantity} ${p.unit || "un"}. Embalagem: ${p.packSize} ${p.unit || "un"}. Locais: ${
                      (p.locations ?? [])
                        .slice(0, 5)
                        .map(
                          (l) =>
                            `${l.warehouse}, ${l.aisle} / ${l.shelf}: ${l.available} disponíveis`,
                        )
                        .join("; ") || p.location
                    }.`,
                )
                .join("\n")
            : "Nao encontrei esse item. Informe o codigo ou outro nome.",
        );
        continue;
      }
      if (matches.length !== 1)
        return {
          reply: matches.length
            ? `${candidateQuestion(matches.slice(0, 3))} ${matches
                .slice(0, 3)
                .map((p, i) => `Opção ${i + 1}: ${p.name}, código ${p.code}`)
                .join(
                  ". ",
                )}. Diga escolha a segunda, por exemplo, ou o código exato. Nenhuma alteração foi aplicada.`
            : "Qual item? Informe o codigo ou nome completo. Nenhuma alteracao foi aplicada.",
          choices: matches
            .slice(0, 3)
            .map((p) => ({ code: p.code, name: p.name })),
          moreOptions: matches.length > 3,
          clarificationToken: ticket(user, input.cart as JamesCart, {
            steps,
            index,
            choices: matches.slice(0, 3).map((p) => p.code),
            candidates: matches.slice(0, 30).map((p) => p.code),
          }),
          cart: input.cart,
          draft: draft(step, user.block, "peça"),
        };
      const p = matches[0];
      if (step.action === "remove") {
        cart = cart.filter((e) => e.code !== p.code);
        replies.push(`${p.name} removido do carrinho.`);
        continue;
      }
      if (!step.quantity || !["unit", "package"].includes(step.unit || ""))
        return {
          reply: `Quantas unidades ou embalagens de ${p.name}? Cada embalagem tem ${p.packSize} ${p.unit || "un"}. Nenhuma alteracao foi aplicada.`,
          cart: input.cart,
          draft: draft(
            { ...step, query: p.code },
            user.block,
            "quantidade e unidade",
          ),
          quantityPrompt: true,
          clarificationToken: ticket(user, input.cart as JamesCart, {
            steps,
            index,
            choices: [p.code],
            quantity: true,
          }),
        };
      const qtty = integer(
        step.quantity * (step.unit === "package" ? p.packSize : 1),
      );
      const existing = cart.find((e) => e.code === p.code);
      const total =
        step.action === "add" ? (existing?.quantity || 0) + qtty : qtty;
      if (total > (p.available ?? p.quantity))
        return {
          reply: `${p.name}: há apenas ${p.available ?? p.quantity} ${p.unit || "un"} disponíveis. Diga uma nova quantidade; a peça e a unidade foram mantidas.`,
          cart: input.cart,
          draft: draft({ ...step, query: p.code }, user.block, "quantidade"),
          quantityPrompt: true,
          clarificationToken: ticket(user, input.cart as JamesCart, {
            steps: steps.map((item, i) =>
              i === index ? { ...item, query: p.code } : item,
            ),
            index,
            choices: [p.code],
            quantity: true,
          }),
        };
      cart = cart.filter((e) => e.code !== p.code);
      cart.push({
        code: p.code,
        quantity: total,
        priority: existing?.priority || "Leve",
        justification: existing?.justification || "",
      });
      replies.push(
        `${p.name}: ${total} ${p.unit || "un"} no carrinho${step.unit === "package" ? ` (${step.quantity} embalagens de ${p.packSize})` : ""}.`,
      );
    } else if (step.action === "justify") {
      if (
        !step.reason?.trim() ||
        !normalize(message).includes(normalize(step.reason))
      )
        throw new ActionError(
          "Informe a justificativa com suas palavras: justificativa: seu motivo.",
        );
      cart = cart.map((e) => ({ ...e, justification: step.reason!.trim() }));
      replies.push("Justificativa atualizada.");
    } else if (step.action === "review") review = true;
    else if (step.action === "cart")
      replies.push(
        cart.length
          ? "Confira seu carrinho abaixo."
          : "Seu carrinho esta vazio.",
      );
    else if (step.action === "navigate") {
      const target = step.view || "catalogo";
      if (["estoque", "transferencias", "rotas"].includes(target))
        demand(user, "stock");
      if (["compra", "recomendacoes"].includes(target))
        demand(user, "planning");
      if (target === "mapa") demand(user, "map");
      if (target === "funcionarios") demand(user, "people");
      if (target === "devolucoes") demand(user, "stock");
      if (target === "nova") demand(user, "request");
      if (target === "dashboard" && user.role === "funcionario")
        throw new ActionError("Use o histórico das suas requisições.", 403);
      const destinations: Record<string, [string, string]> = {
        perfil: [
          "/profile",
          "Dados de acesso e biometria são alterados na tela segura. Não dite sua senha para o assistente.",
        ],
        historico: [
          pathFor(user.role, "historico"),
          "Confira os registros do seu escopo e os filtros do histórico.",
        ],
        funcionarios: [
          pathFor(user.role, "funcionarios"),
          "Gerencie usuários e permissões na tela de cadastro. Senhas devem ser preenchidas na tela segura.",
        ],
        devolucoes: [
          pathFor(user.role, "devolucoes"),
          "Devoluções só voltam ao saldo após a conferência física.",
        ],
        nova: [
          pathFor(user.role, "nova"),
          "Busque materiais ou diga o nome, a quantidade e se deseja unidades ou embalagens.",
        ],
        dashboard: [
          pathFor(user.role, "dashboard"),
          "Indicadores respeitam seu perfil e o bloco autorizado.",
        ],
        catalogo: [
          "/catalogo",
          "Busque o material e confira a unidade e a embalagem cadastradas.",
        ],
        estoque: [
          user.role === "admin"
            ? "/admin/dashboard/stock"
            : pathFor(user.role, "estoque"),
          "Confira os saldos físico, reservado e disponível antes de movimentar.",
        ],
        requisicoes: [
          pathFor(
            user.role,
            user.role === "funcionario"
              ? "historico"
              : user.role === "lider"
                ? "solicitacoes"
                : "requisicoes",
          ),
          "Confira status e etapas. Aprovação e entrega exigem as permissões e confirmações da tela.",
        ],
        transferencias: [
          pathFor(user.role, "recomendacoes"),
          "Revise origem, destino e quantidade; solicitação, saída e recebimento são confirmados na fila de transferências.",
        ],
        rotas: [
          pathFor(user.role, "requisicoes"),
          "Abra uma entrega para calcular o caminho do mapa publicado. Sem mapa válido, opere manualmente. Calcular rota não baixa estoque.",
        ],
        recomendacoes: [
          pathFor(user.role, "recomendacoes"),
          "Sugestões usam baixas reais por bloco e proximidade no mapa; revise a base e confirme a transferência.",
        ],
        compra: [
          pathFor(user.role, "compra"),
          "Compras usam consumo efetivo, mínimos e reposições confirmadas. Confira período e fonte do preço.",
        ],
        mapa: [
          pathFor(user.role, "mapa"),
          "Revise pontos, passagens e bloqueios antes de publicar a versão.",
        ],
      };
      if (!destinations[target])
        throw new ActionError("Essa tela não está disponível.", 422);
      [href] = destinations[target];
      hrefLabel = "Abrir " + target;
      replies.push(destinations[target][1]);
    } else if (["dashboard", "requests", "export"].includes(step.action)) {
      const view =
        (step.action === "requests" ? "requisicoes" : step.view) ||
        (user.role === "funcionario"
          ? "requisicoes"
          : user.role === "lider"
            ? "bloco"
            : "geral");
      if (["compra", "recomendacoes"].includes(view)) demand(user, "planning");
      const reportQuery = new URLSearchParams({
        ...step.filters,
        dashboard: view === "recomendacoes" ? "estoque" : view,
        pageSize: "5",
        ...(["estoque", "compra", "recomendacoes"].includes(view)
          ? { metric: "stock" }
          : {}),
        ...(view === "recomendacoes" ? { planning: "distribution" } : {}),
      });
      const report = await dashboardReport(user, reportQuery);
      reportState = {
        view,
        action: view === "requisicoes" ? "requests" : "dashboard",
        filters: {
          ...step.filters,
          from: report.filters.from,
          to: report.filters.to,
          page: String(report.filters.page),
        },
      };
      dashboard = {
        scope: report.scope,
        period: report.filters.from + " a " + report.filters.to,
        metrics: report.metrics,
        updatedAt: report.generatedAt,
      };
      if (step.action === "dashboard")
        replies.push(
          report.metrics
            .slice(0, 5)
            .map(
              (metric) =>
                `${metric.label}: ${metric.value === null ? "dados indisponíveis" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(metric.value)} ${metric.unit}.`,
            )
            .join("\n"),
        );
      if (step.action === "requests") {
        records = report.details.records.map((r) => ({
          id: r.id,
          item: r.item,
          quantity: r.quantity,
          unit: r.unit,
          status: r.status,
          block: r.block,
          date: r.date,
        }));
        replies.push(
          records.length
            ? records
                .map(
                  (r) =>
                    `${r.id}: ${r.item}, ${r.quantity} ${r.unit}, ${r.status}.`,
                )
                .join("\n")
            : "Nenhuma requisição no período e escopo selecionados.",
        );
      }
      if (step.action !== "export")
        replies.push(
          `Página ${report.filters.page} de ${report.pages}. ${report.details.total} registros. ${report.details.records.map((r) => `${r.id}: ${r.item}, ${r.quantity} ${r.unit}, ${r.status}`).join("; ")}. Diga próxima página, filtre por status, bloco ou código, ou exporte em PDF ou planilha.`,
        );
      if (step.action === "export") {
        if (!step.format)
          throw new ActionError("Escolha PDF ou planilha.", 422);
        reportQuery.set("format", step.format);
        if (["compra", "recomendacoes"].includes(view)) {
          reportQuery.delete("dashboard");
          reportQuery.set(
            "planning",
            view === "compra" ? "purchase" : "distribution",
          );
        }
        exportHref = "/api/operations?" + reportQuery;
        replies.push(
          "Exportação disponível abaixo, com os mesmos filtros e permissões. O arquivo será gerado pelo sistema ao baixar.",
        );
      }
      href =
        user.role === "funcionario"
          ? "/employee/history"
          : user.role === "lider"
            ? "/department-head/dashboard"
            : user.role === "almoxarifado"
              ? "/warehouse/dashboard"
              : "/admin/dashboard";
      if (view === "compra")
        href =
          user.role === "admin" ? "/admin/purchases" : "/warehouse/purchases";
      if (view === "recomendacoes") href = pathFor(user.role, "recomendacoes");
      hrefLabel = ["compra", "recomendacoes"].includes(view)
        ? "Abrir planejamento"
        : "Abrir dashboard";
      href +=
        "?" +
        new URLSearchParams({
          ...step.filters,
          james: "1",
          dashboard: view,
        }).toString();
      replies.push(
        `Dados de ${report.scope}, de ${report.filters.from} a ${report.filters.to}. Pedidos criados não representam retirada. Consulte os detalhes abaixo.`,
      );
    } else {
      const capabilities = [
        "buscar materiais e consultar registros autorizados",
      ];
      if (can(user.role, "request"))
        capabilities.push(
          "ajustar seu carrinho, revisar requisições e gerenciar seus pedidos",
        );
      if (can(user.role, "approve"))
        capabilities.push(
          "colocar pedidos em análise e aprovar dentro do seu escopo",
        );
      if (can(user.role, "stock"))
        capabilities.push(
          "solicitar transferências, registrar entradas ou ajustes conferidos e planejar rotas",
        );
      replies.push(
        `Posso ${capabilities.join("; ")}. Alterações exigem resumo e confirmação. Arquivos, leitura de códigos e conferência física continuam nas telas próprias. Diga, por exemplo: procure parafusos.`,
      );
    }
  }
  if (cart.length > 30)
    throw new ActionError("O carrinho aceita ate 30 itens.");
  let confirmationToken: string | undefined;
  if (review) {
    if (!cart.length) replies.push("Adicione um item antes de solicitar.");
    else if (
      cart.some(
        (e) =>
          e.quantity >
          (byCode.get(e.code)!.available ?? byCode.get(e.code)!.quantity),
      )
    )
      replies.push("O saldo mudou. Revise as quantidades antes de enviar.");
    else if (
      cart.some(
        (e) =>
          (e.quantity > 10 || e.priority === "Urgente") &&
          !e.justification.trim(),
      )
    )
      replies.push(
        "Preciso da justificativa para quantidade acima de 10 ou urgência. Diga: justificativa: seguida do motivo. Depois peça para revisar.",
      );
    else {
      confirmationToken = ticket(user, cart);
      replies.push(
        `Revise: ${describe()
          .map(
            (e) => `${e.name}, ${e.quantity} ${e.unit}, urgência ${e.priority}`,
          )
          .join(
            "; ",
          )}. Bloco ${user.block}, setor ${user.sector}. Para enviar, diga ou clique Confirmar requisição. Para desistir, Cancelar. Nada foi enviado ainda.`,
      );
    }
  }
  if (
    steps.length === 1 &&
    ["add", "set"].includes(steps[0].action) &&
    JSON.stringify(cart) !== JSON.stringify(input.cart)
  ) {
    const last = cart.at(-1)!;
    const part = byCode.get(last.code)!;
    const amount =
      steps[0].unit === "package"
        ? `${steps[0].quantity} ${steps[0].quantity === 1 ? "caixa" : "caixas"} de ${part.packSize} (${last.quantity} ${part.unit || "un"} no total)`
        : `${last.quantity} ${part.unit || "un"}`;
    return {
      reply: `Deseja colocar ${amount} de ${part.name} (${part.code}) no carrinho? Diga sim ou não.`,
      cart: input.cart,
      draft: draft(
        { ...steps[0], query: part.code },
        user.block,
        "confirmação",
      ),
      proposedItems: describe(),
      confirmationToken: ticket(
        user,
        cart,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
        input.cart as JamesCart,
      ),
      confirmationKind: "cart",
    };
  }
  return {
    reply: replies.join("\n"),
    cart,
    items: describe(),
    confirmationToken,
    dashboard,
    href,
    hrefLabel,
    exportHref,
    records,
    reportContext: reportState,
    navigate: !!href && /\b(?:abra|abrir|acesse)\b/.test(normalize(message)),
    updatedAt: new Date().toISOString(),
  };
}
