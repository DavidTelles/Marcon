export function wakeCommand(transcript: string): string | null {
  const match = transcript.match(
    /\b(?:james|jhames|jeimes|djeimes|jaimes|djaimes)\b[\s,:.!?-]*/i,
  );
  if (!match) return null;
  const after = transcript.slice(match.index! + match[0].length).trim();
  // Keep greetings before the wake word, but never treat ambient prefix as a command.
  const before = transcript
    .slice(0, match.index)
    .trim()
    .replace(/[,!.?]+$/, "");
  return (
    after ||
    (/^(bom dia|boa tarde|boa noite|oi|olá|ola)$/i.test(before) ? before : "")
  );
}
export function choiceIndex(value: string): number | null {
  const text = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const match = text.match(
    /^(?:escolha |quero )?(?:a |o )?(primeir[ao]|segund[ao]|terceir[ao]|quart[ao]|quint[ao]|sext[ao]|setim[ao]|oitav[ao]|[1-8])(?: opcao)?[.!]?$/,
  );
  if (!match) return null;
  const words = [
    "primeir",
    "segund",
    "terceir",
    "quart",
    "quint",
    "sext",
    "setim",
    "oitav",
  ];
  return /^\d$/.test(match[1])
    ? Number(match[1]) - 1
    : words.findIndex((word) => match[1].startsWith(word));
}
export function explicitConfirmation(value: string) {
  return /^(?:sim[, ]+)?confirmar requisi[cç][aã]o[.!]?$/i.test(value.trim());
}
// Expand registered unit abbreviations for speech without changing visible codes or quantities.
export function speechText(value: string) {
  const smallNumbers = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const tens = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const spoken = (digits: string) => {
    const number = Number(digits);
    if (!Number.isSafeInteger(number) || number < 0 || number >= 100) return digits;
    return number < 20 ? smallNumbers[number] : `${tens[Math.floor(number / 10)]}${number % 10 ? ` e ${smallNumbers[number % 10]}` : ""}`;
  };
  const units: Record<string, [string, string]> = {
    un: ["unidade", "unidades"],
    unid: ["unidade", "unidades"],
    kg: ["quilograma", "quilogramas"],
    g: ["grama", "gramas"],
    m: ["metro", "metros"],
    l: ["litro", "litros"],
  };
  return value
    .replace(/(?<![-\w])M(\d{1,2})\s*[×x]\s*(\d{1,2})\b/gi, (_, thread: string, length: string) => `M ${spoken(thread)} por ${spoken(length)} milímetros`)
    .replace(/(?<![-\w])M(\d{1,2})\b/gi, (_, thread: string) => `M ${spoken(thread)}`)
    .replace(
    /\b(\d+(?:[,.]\d+)?)\s+(unid|un|kg|g|m|l)(?=[\s,.;:!?]|$)/gi,
    (_, quantity: string, unit: string) =>
      `${quantity} ${units[unit.toLowerCase()][Number(quantity.replace(",", ".")) === 1 ? 0 : 1]}`,
    );
}
