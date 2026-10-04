export type PatternSample = { total: number; quantities: number[] };
export type RequestPattern = { block: PatternSample; sector: PatternSample };
export type RequestAnomaly = {
  unusual: boolean;
  reasons: string[];
  historySufficient: boolean;
};
export type HistoricalRequest = {
  part_id: number;
  block_id: number;
  sector: string;
  quantity: number;
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
export function requestPattern(
  history: HistoricalRequest[],
  partId: number,
  blockId: number,
  sector: string,
): RequestPattern {
  const sample = (matches: HistoricalRequest[]): PatternSample => ({
    total: matches.length,
    quantities: matches
      .filter((r) => Number(r.part_id) === partId)
      .map((r) => Number(r.quantity)),
  });
  return {
    block: sample(history.filter((r) => Number(r.block_id) === blockId)),
    sector: sample(history.filter((r) => r.sector === sector)),
  };
}
export function requestAnomaly(
  quantity: number,
  pattern?: RequestPattern,
): RequestAnomaly {
  const reasons: string[] = [];
  let historySufficient = false;
  for (const [label, sample] of [
    ["bloco", pattern?.block],
    ["setor", pattern?.sector],
  ] as const) {
    if (!sample || sample.total < 5) continue;
    historySufficient = true;
    if (!sample.quantities.length)
      reasons.push(
        `Peça incomum no ${label}: nenhum pedido aprovado deste material nos últimos 90 dias.`,
      );
    else if (sample.quantities.length >= 3) {
      const typical = median(sample.quantities);
      const deviation = median(
        sample.quantities.map((q) => Math.abs(q - typical)),
      );
      const limit = Math.max(typical * 2, typical + 3 * Math.max(1, deviation));
      if (quantity > limit)
        reasons.push(
          `Quantidade incomum no ${label}: ${quantity}, acima do limite histórico de ${Math.floor(limit)} (mediana ${typical}).`,
        );
    }
  }
  return { unusual: reasons.length > 0, reasons, historySufficient };
}

export function requestedUnits(
  amount: number,
  unit: unknown,
  packSize: number,
): number {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    ![undefined, "piece", "box"].includes(unit as undefined | string)
  )
    throw new Error("Quantidade ou unidade de requisição inválida.");
  const units = amount * (unit === "box" ? packSize : 1);
  if (!Number.isSafeInteger(units) || units < 1 || units > 1_000_000_000)
    throw new Error("Quantidade convertida inválida.");
  return units;
}
