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
  physical?: number;
  unit?: string;
  step?: number;
  daily?: number;
};
// Only delivered stock events contribute. Apt inspected returns offset their
// own withdrawal document; unmatched returns never create negative demand.
export function netConsumption<
  T extends {
    kind: string;
    quantity: number;
    request_id?: unknown;
    part_id?: unknown;
  },
>(events: T[]): T[] {
  const returns = new Map<string, number>();
  const key = (e: T) => `${e.part_id}:${e.request_id}`;
  for (const e of events)
    if (e.kind === "devolucao" && e.request_id != null)
      returns.set(
        key(e),
        (returns.get(key(e)) ?? 0) + Math.max(0, Number(e.quantity)),
      );
  return events
    .filter((e) => e.kind === "saida")
    .map((e) => {
      const offset =
        e.request_id == null
          ? 0
          : Math.min(Number(e.quantity), returns.get(key(e)) ?? 0);
      if (offset) returns.set(key(e), returns.get(key(e))! - offset);
      return { ...e, quantity: Math.max(0, Number(e.quantity) - offset) };
    });
}
export function coverageTarget(
  series: number[],
  lead: number,
  minimum: number,
  horizon = 7,
  margin = 0.2,
): Forecast {
  const clean = series.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const daily = mean(clean),
    active = clean.filter((v) => v > 0).length;
  const irregular =
    daily > 0 &&
    Math.sqrt(mean(clean.map((v) => (v - daily) ** 2))) / daily > 1;
  return {
    method: "Média diária observada com cobertura e margem",
    daily,
    days: clean.length,
    minimum: Math.max(minimum, Math.ceil(daily * lead * (1 + margin))),
    target: Math.max(
      minimum,
      Math.ceil(daily * (lead + horizon) * (1 + margin)),
    ),
    mae: null,
    wape: null,
    confidence:
      clean.length < 30 || active < 7
        ? "Dados insuficientes"
        : irregular
          ? "Baixa"
          : "Moderada",
    reason: `Alvo = max(mínimo cadastrado, teto(consumo líquido / dias × (prazo + ${horizon} dias) × (1 + ${margin}))). ${irregular ? "Demanda irregular. " : ""}${active ? "Regra de cobertura; sem previsão avançada." : "Sem baixas observadas; ausência de registro não comprova ausência de necessidade."}`,
  };
}
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
      Number(b.available < b.minimum) - Number(a.available < a.minimum) ||
      Math.max(0, b.target - b.available - b.incoming) / Math.max(1, b.target) -
        Math.max(0, a.target - a.available - a.incoming) /
          Math.max(1, a.target) ||
      a.code.localeCompare(b.code) ||
      a.warehouse.localeCompare(b.warehouse),
  )) {
    if (!eligible(dest)) continue;
    let need = Math.max(
      0,
      Math.min(
        dest.target - dest.available - dest.incoming,
        (dest.capacity ?? Infinity) -
          (dest.physical ?? dest.available + (dest.reserved ?? 0)) -
          dest.incoming,
      ),
    );
    for (const source of supply
      .filter(
        (s) =>
          s.code === dest.code &&
          s.unit === dest.unit &&
          s.warehouse !== dest.warehouse &&
          Number.isFinite(routeCost(s, dest)),
      )
      .sort(
        (a, b) =>
          routeCost(a, dest) - routeCost(b, dest) || b.excess - a.excess,
      )) {
      const a = source.step ?? 1,
        b = dest.step ?? 1;
      if (![a, b].every((n) => Number.isSafeInteger(n) && n > 0)) continue;
      const gcd = (x: number, y: number): number =>
        y === 0 ? x : gcd(y, x % y);
      const step = (a / gcd(a, b)) * b;
      const q = Math.floor(Math.min(need, source.excess) / step) * step;
      if (q > 0) {
        result.push({
          code: dest.code,
          from: source.warehouse,
          to: dest.warehouse,
          quantity: q,
          reason:
            "O destino possui cobertura insuficiente; a origem mantém seu mínimo e sua cobertura após a transferência.",
        });
        source.excess -= q;
        need -= q;
      }
    }
  }
  return result;
}
// When stock cannot cover every ideal target, share the remaining coverage by
// demand within each mutually reachable network. Hard minimums stay protected.
export function proportionalCoverage<T extends StockTarget>(
  locations: T[],
  connected: (a: T, b: T) => boolean,
): T[] {
  const result = locations.map((location) => ({ ...location }));
  const visited = new Set<number>();
  for (let start = 0; start < result.length; start++) {
    if (visited.has(start)) continue;
    const component = [start];
    visited.add(start);
    for (let i = 0; i < component.length; i++)
      for (let next = 0; next < result.length; next++) {
        if (
          !visited.has(next) &&
          result[start].code === result[next].code &&
          result[start].unit === result[next].unit &&
          connected(result[component[i]], result[next]) &&
          connected(result[next], result[component[i]])
        ) {
          visited.add(next);
          component.push(next);
        }
      }
    const total = component.reduce(
      (sum, index) =>
        sum + Math.max(0, result[index].available) + result[index].incoming,
      0,
    );
    const floors = component.reduce(
      (sum, index) => sum + result[index].minimum,
      0,
    );
    const ideal = component.reduce(
      (sum, index) =>
        sum + Math.max(result[index].minimum, result[index].target),
      0,
    );
    if (total >= ideal || total < floors || ideal === floors) continue;
    const budget = Math.floor(total - floors);
    const shares = component.map((index) => ({
      index,
      exact:
        (budget * Math.max(0, result[index].target - result[index].minimum)) /
        (ideal - floors),
    }));
    let remainder =
      budget - shares.reduce((sum, share) => sum + Math.floor(share.exact), 0);
    for (const share of shares.sort(
      (a, b) => (b.exact % 1) - (a.exact % 1) || a.index - b.index,
    )) {
      result[share.index].target =
        result[share.index].minimum +
        Math.floor(share.exact) +
        (remainder-- > 0 ? 1 : 0);
    }
  }
  return result;
}
