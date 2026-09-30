export type Forecast = {
  method: string;
  daily: number;
  minimum: number;
  target: number;
  mae: number | null;
  wape: number | null;
  confidence: string;
  days: number;
  reason: string;
};
const mean = (a: number[]) =>
  a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0;
const ewma = (a: number[]) =>
  a.reduce((s, n, i) => (i ? 0.25 * n + 0.75 * s : n), 0);
export function predict(
  series: number[],
  lead: number,
  minimum: number,
  criticality = 1,
): Forecast {
  const clean = series.map((n) => (Number.isFinite(n) && n > 0 ? n : 0)),
    days = clean.length,
    active = clean.filter((n) => n > 0).length;
  const methods = [
    { name: "Média diária observada", fn: mean },
    ...(days >= 90 && active >= 15
      ? [
          {
            name: "Média móvel de 28 dias",
            fn: (a: number[]) => mean(a.slice(-28)),
          },
          { name: "Suavização exponencial α=0,25", fn: ewma },
        ]
      : []),
  ];
  const enough = days >= 60 && active >= 7;
  const evaluated = methods
    .map((method) => {
      const errors: number[] = [],
        actual: number[] = [];
      if (enough)
        for (let i = days - 28; i < days; i++) {
          errors.push(Math.abs(method.fn(clean.slice(0, i)) - clean[i]));
          actual.push(clean[i]);
        }
      return {
        ...method,
        mae: errors.length ? mean(errors) : null,
        wape:
          actual.reduce((s, n) => s + n, 0) > 0
            ? errors.reduce((s, n) => s + n, 0) /
              actual.reduce((s, n) => s + n, 0)
            : null,
      };
    })
    .sort((a, b) => (a.mae ?? Infinity) - (b.mae ?? Infinity));
  const chosen = evaluated[0],
    daily = chosen.fn(clean),
    average = mean(clean),
    std = Math.sqrt(mean(clean.map((n) => (n - average) ** 2))),
    safety =
      [1, 1.65, 2.33][Math.max(0, Math.min(2, criticality - 1))] *
      std *
      Math.sqrt(lead);
  return {
    method: chosen.name,
    daily,
    minimum: Math.max(minimum, Math.ceil(daily * lead + safety)),
    target: Math.max(minimum, Math.ceil(daily * (lead + 7) + safety)),
    mae: chosen.mae,
    wape: chosen.wape,
    confidence: !enough
      ? "Dados insuficientes"
      : chosen.wape !== null && chosen.wape <= 0.35
        ? "Moderada"
        : "Baixa",
    days,
    reason: !enough
      ? "Regra simples com mínimo cadastrado; histórico insuficiente para afirmar precisão."
      : `Validação temporal: 28 previsões diárias, sem usar dados futuros; ${methods.length} método(s) comparado(s).`,
  };
}
export type StockTarget = {
  code: string;
  warehouse: string;
  available: number;
  reserved?: number;
  target: number;
  minimum: number;
  incoming: number;
  capacity: number | null;
};
export function suggestTransfers(
  locations: StockTarget[],
  routeCost: (source: StockTarget, destination: StockTarget) => number = () =>
    0,
  eligible: (destination: StockTarget) => boolean = () => true,
) {
  const supply = locations.map((l) => ({
    ...l,
    excess: Math.max(0, l.available - Math.max(l.target, l.minimum)),
  }));
  const result: {
    code: string;
    from: string;
    to: string;
    quantity: number;
    reason: string;
  }[] = [];
  for (const dest of [...locations].sort(
    (a, b) =>
      b.target -
      b.available -
      b.incoming -
      (a.target - a.available - a.incoming),
  )) {
    if (!eligible(dest)) continue;
    let need = Math.max(
      0,
      Math.min(
        dest.target,
        (dest.capacity ?? Infinity) - (dest.reserved ?? 0),
      ) -
        dest.available -
        dest.incoming,
    );
    for (const source of supply
      .filter(
        (s) =>
          s.code === dest.code &&
          s.warehouse !== dest.warehouse &&
          Number.isFinite(routeCost(s, dest)),
      )
      .sort(
        (a, b) =>
          routeCost(a, dest) - routeCost(b, dest) || b.excess - a.excess,
      )) {
      const q = Math.min(need, source.excess);
      if (q > 0) {
        result.push({
          code: dest.code,
          from: source.warehouse,
          to: dest.warehouse,
          quantity: q,
          reason:
            "Excesso disponível acima do alvo na origem; repor o destino antes de comprar.",
        });
        source.excess -= q;
        need -= q;
      }
    }
  }
  return result;
}
