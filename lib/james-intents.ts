import type { JamesOperation } from "./james-operations";

// Short, anchored commands avoid model latency. This only parses intent;
// authorization, previews, confirmation and writes still run on the server.
export function explicitOperation(message: string): JamesOperation | null {
  const value = message
    .trim()
    .replace(/^(?:james|jhames)[, ]+/i, "")
    .replace(/[.!]$/, "");
  const request = "requisi[çc][aã]o\\s+(?:pendente\\s+)?#?(\\d+)";
  for (const [prefix, name] of [
    ["(?:aprove|aprovar)(?: a)?", "approve"],
    ["(?:exclua|excluir)(?: a)?", "deleteRequest"],
    ["(?:calcule|calcular) a rota da", "planRoute"],
    ["confirme (?:meu|o) recebimento da", "confirmReceipt"],
  ] as const) {
    const match = value.match(
      new RegExp(
        `^${prefix} ${request}${name === "deleteRequest" ? "(?: pendente)?" : ""}$`,
        "i",
      ),
    );
    if (match) return { name, id: Number(match[1]) };
  }
  let match = value.match(
    new RegExp(`^coloque a ${request} em an[aá]lise$`, "i"),
  );
  if (match) return { name: "analyze", id: Number(match[1]) };
  match = value.match(
    new RegExp(
      `^(?:altere|troque|mude) a quantidade da ${request} para (\\d+) unidades?$`,
      "i",
    ),
  );
  if (match)
    return {
      name: "editRequest",
      id: Number(match[1]),
      quantity: Number(match[2]),
    };
  match = value.match(
    new RegExp(`^solicite cancelamento da ${request},? motivo:\\s*(.+)$`, "i"),
  );
  if (match)
    return {
      name: "requestCancellation",
      id: Number(match[1]),
      reason: match[2],
    };
  match = value.match(/^cancele a transfer[eê]ncia #?(\d+),? motivo:\s*(.+)$/i);
  if (match)
    return { name: "cancelTransfer", id: Number(match[1]), reason: match[2] };
  match = value.match(
    /^solicite transfer[eê]ncia de (\d+) unidades? do c[oó]digo ([\w-]+),? de (.+?) para (.+?), motivo:\s*(.+)$/i,
  );
  if (match)
    return {
      name: "transfer",
      quantity: Number(match[1]),
      code: match[2],
      from: match[3],
      to: match[4],
      reason: match[5],
    };
  match = value.match(
    /^registre entrada de (\d+) unidades? do c[oó]digo ([\w-]+) em (.+?), motivo:\s*(.+)$/i,
  );
  if (match)
    return {
      name: "stockEntry",
      quantity: Number(match[1]),
      code: match[2],
      warehouse: match[3],
      reason: match[4],
    };
  match = value.match(
    /^ajuste o saldo do c[oó]digo ([\w-]+) em (.+?) para (\d+) unidades?, motivo:\s*(.+)$/i,
  );
  if (match)
    return {
      name: "adjustStock",
      code: match[1],
      warehouse: match[2],
      quantity: Number(match[3]),
      reason: match[4],
    };
  return null;
}
