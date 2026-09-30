type Candidate = {
  code: string;
  name: string;
  category?: string;
  description?: string;
  purpose?: string;
  material?: string;
  dimensions?: string;
  approvedAliases?: string[];
};

export type CatalogClues = {
  query: string;
  purpose?: string;
  material?: string;
  dimensions?: string;
  appearance?: string;
};

export const normalizeCatalogText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// Codes and dimensions remain literal. A spoken number such as "seis" is not
// silently mapped to M6: the candidate must be confirmed by its catalog name.
export function catalogMatches<T extends Candidate>(
  stock: T[],
  query: string,
): T[] {
  const q = normalizeCatalogText(query);
  if (!q) return [];
  const exact = stock.filter((part) => normalizeCatalogText(part.code) === q);
  if (exact.length) return exact;
  const words = q.split(/[\s,;:()]+/).filter(Boolean);
  const coded = stock.filter((part) =>
    words.includes(normalizeCatalogText(part.code)),
  );
  if (coded.length) return coded;
  const terms = words.map((word) => word.replace(/s$/, ""));
  return stock.filter((part) => {
    const text = normalizeCatalogText(`${part.name} ${part.code}`);
    const nameWords = text.split(/[^a-z0-9]+/);
    return terms.every((term) =>
      /\d/.test(term) ? nameWords.includes(term) : text.includes(term),
    );
  });
}

export function narrowCandidates<T extends Candidate>(
  stock: T[],
  answer: string,
): T[] {
  const ignored = new Set([
    "quero",
    "tipo",
    "para",
    "com",
    "uma",
    "esse",
    "aquele",
    "aquela",
    "o",
    "de",
    "do",
    "da",
    "seis",
    "tres",
    "cinco",
    "oito",
  ]);
  const words = normalizeCatalogText(answer)
    .split(/\s+/)
    .filter(
      (word) =>
        (word.length > 2 || /^[a-z]?\d/.test(word)) && !ignored.has(word),
    );
  if (!words.length) return [];
  return stock.filter((part) => {
    const nameWords = normalizeCatalogText(part.name).split(/[^a-z0-9]+/);
    return words.every((word) => nameWords.includes(word));
  });
}

const stopwords = new Set(["de", "do", "da", "o", "a", "um", "uma", "aquele", "aquela", "peca", "item", "para", "que", "com", "quero", "preciso", "me", "prender", "usar", "uso", "na", "no", "mais"]);
const terms = (value: string) => normalizeCatalogText(value).split(/[^a-z0-9]+/).filter((word) => word.length > 1 && !stopwords.has(word)).map((word) => word.replace(/s$/, ""));

export function rankCatalogCandidates<T extends Candidate>(stock: T[], clues: CatalogClues, recentCodes: readonly string[] = []) {
  const query = normalizeCatalogText(clues.query);
  const queryTerms = terms(query);
  const requiredDimensions = terms(clues.dimensions || "").filter((word) => /\d/.test(word));
  const ranked = stock.flatMap((part) => {
    const name = normalizeCatalogText(`${part.name} ${part.code}`);
    const official = normalizeCatalogText(`${part.name} ${part.code} ${part.dimensions || ""} ${part.material || ""}`);
    const officialWords = official.split(/[^a-z0-9]+/);
    if (requiredDimensions.some((word) => !officialWords.includes(word))) return [];
    const aliases = (part.approvedAliases || []).map(normalizeCatalogText);
    let score = 0;
    const evidence: string[] = [];
    if (query === normalizeCatalogText(part.code)) { score += 1000; evidence.push("código exato"); }
    else if (query === normalizeCatalogText(part.name)) { score += 400; evidence.push("nome exato"); }
    for (const word of queryTerms) {
      if (name.split(/[^a-z0-9]+/).some((token) => token === word || (!/\d/.test(word) && token.startsWith(word)))) { score += 25; evidence.push("nome"); }
      else if (aliases.some((alias) => alias.includes(word))) { score += 22; evidence.push("apelido revisado"); }
      else if (normalizeCatalogText(part.category || "").includes(word)) { score += 8; evidence.push("categoria"); }
      else if (normalizeCatalogText(part.description || "").includes(word)) { score += 4; evidence.push("descrição"); }
    }
    if (query && aliases.some((alias) => alias === query)) { score += 100; evidence.push("apelido exato"); }
    const purposeTerms = terms(clues.purpose || "");
    if (purposeTerms.length && purposeTerms.every((word) => normalizeCatalogText(`${part.purpose || ""} ${part.description || ""}`).includes(word))) { score += 30; evidence.push("finalidade cadastrada"); }
    if (clues.material && normalizeCatalogText(part.material || "").includes(normalizeCatalogText(clues.material))) { score += 30; evidence.push("material"); }
    if (clues.appearance && terms(clues.appearance).some((word) => normalizeCatalogText(`${part.description || ""} ${part.name}`).includes(word))) { score += 8; evidence.push("aparência descrita"); }
    if (!score) return [];
    if (recentCodes.includes(part.code)) { score += 2; evidence.push("pedido anterior permitido"); }
    return [{ part, score, evidence: [...new Set(evidence)] }];
  });
  return ranked.sort((a, b) => b.score - a.score || a.part.code.localeCompare(b.part.code));
}

export function candidateQuestion<T extends Candidate>(candidates: T[]) {
  const values = (pattern: RegExp) => candidates.map((part) => normalizeCatalogText(`${part.name} ${part.dimensions || ""}`).match(pattern)?.[1] || "");
  const ask = (found: string[], label: string, suffix = "") => {
    const distinct = [...new Set(found.filter(Boolean))];
    return distinct.length > 1 && distinct.length <= 3 ? `Qual ${label}: ${distinct.map((value) => `${value}${suffix}`).join(" ou ")}?` : null;
  };
  return ask(values(/\b(m\d{1,2})\b/).map((value) => value.toUpperCase()), "rosca")
    || ask(values(/[×x]\s*(\d{1,3})\b/), "comprimento", " milímetros")
    || ask(candidates.map((part) => normalizeCatalogText(part.material || "")), "material")
    || ask(candidates.map((part) => normalizeCatalogText(part.name).includes("allen") ? "Allen" : normalizeCatalogText(part.name).includes("sextavado") ? "sextavado" : ""), "tipo")
    || "Qual característica, medida ou uso diferencia a peça que você quer?";
}
