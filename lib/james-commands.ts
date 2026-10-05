import type { JamesStep } from "./james-model";

const numbers: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  catorze: 14,
  quatorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezassete: 17,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
};
const numberPattern = `(?:${Object.keys(numbers).join("|")})(?: e (?:${Object.keys(numbers).join("|")}))?`;
export function quantityWords(value: string) {
  // Only quantity positions, never product identifiers or free-text reasons.
  return value.replace(
    new RegExp(
      `\\b(${numberPattern})(?=\\s+(?:caixas?|embalagens?|unidades?)\\b|[.!]?$$)`,
      "g",
    ),
    (words) =>
      String(
        words
          .split(" e ")
          .reduce((sum: number, word: string) => sum + numbers[word], 0),
      ),
  );
}
export function commandText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^\s*marco[\s,:]+/, "")
    .trim()
    .replace(/[.!?]+$/, "");
}

// Deterministic fast path for complete, explicit commands. Unknown language goes
// to the configured model; neither path can execute a mutation without review.
export function explicitCartPlan(value: string): JamesStep[] | undefined {
  let text = quantityWords(commandText(value)).replace(/\s+no carrinho\b/g, "");
  text = text.replace(
    new RegExp(`\\b(${numberPattern}) (?=[a-z])`, "g"),
    (words) =>
      String(
        words
          .trim()
          .split(" e ")
          .reduce((sum, word) => sum + numbers[word], 0),
      ) + " ",
  );
  const clauses = text.split(
    /\s*[,;]\s*|\s+e\s+(?=\d|adicione\b|coloque\b|inclua\b|mostre\b|leia\b|revise\b|faca\b)/,
  );
  const steps: JamesStep[] = [];
  let adding = false;
  for (const clause of clauses) {
    if (
      /^(?:mostre|leia|revisar) (?:o |meu )?(?:carrinho|pedido)$/.test(clause)
    ) {
      steps.push({ action: "cart" });
      continue;
    }
    if (
      /^(?:(?:faca|envie|revise|revisar) (?:a |minha )?requisicao|revise)$/.test(
        clause,
      )
    ) {
      steps.push({ action: "review" });
      continue;
    }
    const remove = clause.match(
      /^(?:retire|remova|exclua) (?:as? |os? )?(.+)$/,
    );
    if (remove && !/\b(requisicao|transferencia|usuario)\b/.test(remove[1])) {
      steps.push({ action: "remove", query: remove[1] });
      continue;
    }
    const item = clause.match(
      /^(?:(adicione|coloque|inclua|quero|preciso de)\s+)?(\d+)\s+(?:(caixas?|embalagens?|unidades?)\s+(?:de\s+)?)?(.+)$/,
    );
    if (item && (item[1] || adding)) {
      adding = true;
      const purpose = item[4].match(/\s+para\s+((?:prender|fixar|instalar|montar|usar|repor)\b.+)$/);
      steps.push({
        action: "add",
        quantity: Number(item[2]),
        unit: /^(caixa|embalage)/.test(item[3] || "") ? "package" : "unit",
        query: purpose ? item[4].slice(0, purpose.index).trim() : item[4],
        purpose: purpose?.[1],
      });
      continue;
    }
    const find = clause.match(/^(?:procure|busque|localize) (.+)$/);
    if (find) {
      steps.push({ action: "find", query: find[1] });
      continue;
    }
    return undefined;
  }
  return steps.length && steps.length <= 12 ? steps : undefined;
}
