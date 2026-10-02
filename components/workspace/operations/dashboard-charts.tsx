"use client";
import { useId, useState } from "react";
import type { DashboardReport } from "@/lib/dashboard-report";
import { InsightChart } from "./insight-chart";
import { StockComposition } from "./stock-composition";
export type DashboardChartData = Pick<
  DashboardReport,
  "view" | "daily" | "top" | "generatedAt" | "scope"
> & {
  filters: Pick<DashboardReport["filters"], "from" | "to">;
  methodology: Pick<DashboardReport["methodology"], "period">;
  metrics: Pick<DashboardReport["metrics"][number], "id" | "label" | "value">[];
  stockByWarehouse?: DashboardReport["stockByWarehouse"];
  stockByItem?: DashboardReport["stockByItem"];
};
export function DashboardCharts({
  report,
  onWarehouse,
  onItem,
  onMetric,
}: {
  report: DashboardChartData;
  onWarehouse?: (warehouse: string) => void;
  onItem?: (code: string) => void;
  onMetric?: (metric: "entries" | "withdrawals" | "critical" | "stock") => void;
}) {
  const gradient = useId();
  const units = [
    ...new Set([
      ...report.daily.map((r) => r.unit),
      ...(report.stockByWarehouse ?? []).map((r) => r.unit),
    ]),
  ];
  const [selected, setSelected] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const unit = units.includes(selected) ? selected : (units[0] ?? "un");
  const start = Date.parse(report.filters.from),
    days = Math.round((Date.parse(report.filters.to) - start) / 86400000) + 1;
  const series = Array.from({ length: days }, (_, i) => {
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
    return {
      date,
      quantity: report.daily
        .filter((r) => r.date === date && r.kind === "saida" && r.unit === unit)
        .reduce((s, r) => s + r.quantity, 0),
    };
  });
  const max = Math.max(1, ...series.map((s) => s.quantity)),
    top = report.top.filter((t) => t.unit === unit),
    topMax = Math.max(1, ...top.map((t) => t.quantity)),
    requestMetrics = report.metrics.filter((metric) =>
      ["requests", "pending", "urgent", "anomalies"].includes(metric.id),
    ),
    requestMax = Math.max(
      1,
      ...requestMetrics.map((metric) => metric.value ?? 0),
    );
  const updatedAt = new Date(report.generatedAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const flowRows = [
    { label: "Entradas", kind: "entrada", color: "var(--success)" },
    { label: "Saídas", kind: "saida", color: "var(--blue)" },
  ].map(({ label, kind, color }) => ({
    label,
    color,
    value: report.daily
      .filter((row) => row.unit === unit && row.kind === kind)
      .reduce((total, row) => total + row.quantity, 0),
  }));
  const hasWithdrawals = report.daily.some(
    (row) => row.kind === "saida" && row.unit === unit && row.quantity > 0,
  );
  const formatDate = (date: string) => date.split("-").reverse().join("/");
  const points = series
    .map(
      (s, i) =>
        `${40 + (i / Math.max(1, days - 1)) * 640},${190 - (s.quantity / max) * 150}`,
    )
    .join(" ");
  const activeIndex = Math.max(
    0,
    series.findIndex((row) => row.date === selectedDate),
  );
  const active = series[activeIndex];
  const activeX = 40 + (activeIndex / Math.max(1, days - 1)) * 640;
  const inventory = (report.stockByWarehouse ?? []).filter(
    (row) => row.unit === unit,
  );
  const inventoryMax = Math.max(1, ...inventory.map((row) => row.physical));
  const stockCount = report.metrics.find(
    (metric) => metric.id === "stock",
  )?.value;
  const criticalCount = report.metrics.find(
    (metric) => metric.id === "critical",
  )?.value;
  return (
    <section className="dashboard-charts" aria-label="Gráficos do painel">
      {report.view === "requisicoes" ? (
        <article className="panel ops-panel dashboard-request-chart">
          <div className="panel-head">
            <div>
              <h2>Pedidos e pontos de atenção</h2>
              <p>
                {report.methodology.period} · {report.scope} · quantidade de
                requisições · atualizado às {updatedAt}
              </p>
            </div>
          </div>
          <div className="dashboard-bars" role="list">
            {requestMetrics.map((metric) => (
              <div role="listitem" key={metric.id}>
                <span>{metric.label}</span>
                <div className="dashboard-bar-track">
                  <span
                    style={{
                      width: `${(100 * (metric.value ?? 0)) / requestMax}%`,
                    }}
                  />
                </div>
                <strong>{(metric.value ?? 0).toLocaleString("pt-BR")}</strong>
              </div>
            ))}
          </div>
          <p className="dashboard-chart-note">
            Pendentes, urgentes e anormalidades podem fazer parte do total de
            pedidos; compare cada indicador sem somar as barras.
          </p>
        </article>
      ) : (
        <>
          {report.view === "estoque" && report.stockByItem && (
            <StockComposition rows={report.stockByItem} onWarehouse={onWarehouse} onItem={onItem} />
          )}
          <article className="panel ops-panel dashboard-trend-card">
            <div className="panel-head">
              <div>
                <h2>Evolução das retiradas</h2>
                <p>
                  Materiais retirados a cada dia · atualizado às {updatedAt}
                </p>
              </div>
            </div>
            <label>
              Unidade dos gráficos
              <select
                value={unit}
                onChange={(e) => setSelected(e.target.value)}
              >
                {(units.length ? units : ["un"]).map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
            {hasWithdrawals ? (
              <>
                <svg
                  viewBox="0 0 720 230"
                  className="dashboard-chart"
                  role="img"
                  aria-label={`Retiradas em ${unit} entre ${report.filters.from} e ${report.filters.to}`}
                  onClick={(event) => {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const x =
                      ((event.clientX - bounds.left) / bounds.width) * 720;
                    const index = Math.max(
                      0,
                      Math.min(
                        days - 1,
                        Math.round(((x - 40) / 640) * (days - 1)),
                      ),
                    );
                    setSelectedDate(series[index].date);
                  }}
                >
                  <defs>
                    <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--bright)" stopOpacity=".22" />
                      <stop
                        offset="100%"
                        stopColor="var(--bright)"
                        stopOpacity=".01"
                      />
                    </linearGradient>
                  </defs>
                  <line
                    x1="40"
                    y1="190"
                    x2="680"
                    y2="190"
                    stroke="var(--line)"
                  />
                  <line x1="40" y1="40" x2="680" y2="40" stroke="var(--line)" />
                  <text x="4" y="44">
                    {max.toLocaleString("pt-BR")}
                  </text>
                  <text x="20" y="194">
                    0
                  </text>
                  <line
                    x1="40"
                    y1="115"
                    x2="680"
                    y2="115"
                    stroke="var(--line)"
                    strokeDasharray="4 6"
                  />
                  <polygon
                    points={`40,190 ${points} 680,190`}
                    fill={`url(#${gradient})`}
                  />
                  <polyline
                    points={points}
                    pathLength={1}
                    fill="none"
                    stroke="var(--blue)"
                    strokeWidth="3"
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1={activeX}
                    x2={activeX}
                    y1="40"
                    y2="190"
                    stroke="var(--blue)"
                    strokeOpacity=".3"
                    strokeDasharray="4 5"
                  />
                  <circle
                    cx={activeX}
                    cy={190 - (active.quantity / max) * 150}
                    r="6"
                    fill="var(--blue)"
                    stroke="white"
                    strokeWidth="2"
                  />
                  <text x="40" y="217">
                    {formatDate(report.filters.from)}
                  </text>
                  <text x="680" y="217" textAnchor="end">
                    {formatDate(report.filters.to)}
                  </text>
                </svg>
                <div className="dashboard-chart-inspector">
                  <output>
                    {formatDate(active.date)} ·{" "}
                    <strong>
                      {active.quantity.toLocaleString("pt-BR")} {unit}
                    </strong>
                  </output>
                  <label>
                    Consultar um dia
                    <input
                      type="range"
                      min="0"
                      max={days - 1}
                      value={activeIndex}
                      onChange={(event) =>
                        setSelectedDate(series[Number(event.target.value)].date)
                      }
                      aria-valuetext={`${formatDate(active.date)}: ${active.quantity} ${unit}`}
                    />
                  </label>
                </div>
                <details>
                  <summary>Ver valores diários em tabela</summary>
                  <div
                    className="ops-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Dados do gráfico de linha"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Data</th>
                          <th scope="col">Retiradas ({unit})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {series.map((s) => (
                          <tr key={s.date}>
                            <td data-label="Data">{formatDate(s.date)}</td>
                            <td data-label={unit}>{s.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            ) : (
              <p className="dashboard-empty">
                Nenhuma retirada em {unit} no período selecionado.
              </p>
            )}
          </article>
          {inventory.length > 0 && report.view !== "estoque" && (
            <article className="panel ops-panel dashboard-inventory-chart">
              <div className="panel-head">
                <div>
                  <h2>Estoque por almoxarifado</h2>
                  <p>
                    Saldo atual · {unit} · selecione um local para consultar
                  </p>
                </div>
              </div>
              <div className="dashboard-inventory-legend">
                <span>
                  <i className="available" />
                  Disponível
                </span>
                <span>
                  <i className="reserved" />
                  Reservado
                </span>
              </div>
              <div className="dashboard-bars" role="list">
                {inventory.map((row) => (
                  <div role="listitem" key={row.warehouse}>
                    <button
                      type="button"
                      className="dashboard-chart-choice"
                      onClick={() => onWarehouse?.(row.warehouse)}
                      disabled={!onWarehouse}
                    >
                      <span>{row.warehouse}</span>
                      <strong>
                        {row.physical.toLocaleString("pt-BR")} {unit}
                      </strong>
                      <span className="dashboard-stock-track">
                        <i
                          className="available"
                          style={{
                            width: `${(Math.max(0, row.available) / inventoryMax) * 100}%`,
                          }}
                        />
                        <i
                          className="reserved"
                          style={{
                            width: `${(Math.max(0, row.reserved) / inventoryMax) * 100}%`,
                          }}
                        />
                      </span>
                      <small>
                        {row.available.toLocaleString("pt-BR")} disponíveis ·{" "}
                        {row.reserved.toLocaleString("pt-BR")} reservados
                      </small>
                    </button>
                  </div>
                ))}
              </div>
            </article>
          )}
          <article className="panel ops-panel dashboard-top-chart">
            <div className="panel-head">
              <div>
                <h2>Peças mais usadas</h2>
                <p>Itens com maior volume de retiradas · {unit}</p>
              </div>
            </div>
            {top.length ? (
              <>
                <div className="dashboard-bars" role="list">
                  {top.map((t) => (
                    <div role="listitem" key={t.code}>
                      <span>
                        {onItem ? (
                          <button
                            type="button"
                            className="dashboard-item-choice"
                            onClick={() => onItem(t.code)}
                          >
                            {t.item} <small>{t.code}</small>
                          </button>
                        ) : (
                          <>
                            {t.item} <small>{t.code}</small>
                          </>
                        )}
                      </span>
                      <div className="dashboard-bar-track">
                        <span
                          style={{ width: (100 * t.quantity) / topMax + "%" }}
                        />
                      </div>
                      <strong>
                        {t.quantity} {unit}
                      </strong>
                    </div>
                  ))}
                </div>
                <details>
                  <summary>Ver comparação em tabela</summary>
                  <div
                    className="ops-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Dados do gráfico de barras"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Item</th>
                          <th scope="col">Quantidade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {top.map((t) => (
                          <tr key={t.code}>
                            <td data-label="Item">
                              {t.code} · {t.item}
                            </td>
                            <td data-label="Quantidade">
                              {t.quantity} {unit}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            ) : (
              <p className="dashboard-empty">
                Sem retiradas efetivas nesta unidade.
              </p>
            )}
          </article>
          <InsightChart
            title="Fluxo de materiais"
            className="dashboard-material-flow"
            description={`Entradas e saídas no período selecionado · ${unit}`}
            rows={flowRows}
            unit={unit}
            onSelect={
              onMetric
                ? (label) =>
                    onMetric(label === "Entradas" ? "entries" : "withdrawals")
                : undefined
            }
          />
          {stockCount != null && criticalCount != null && (
            <InsightChart
              title="Situação do estoque"
              className="dashboard-stock-health"
              description="Locais com saldo adequado e abaixo do mínimo"
              rows={[
                {
                  label: "Abaixo do mínimo",
                  value: criticalCount,
                  color: "var(--warning)",
                },
                {
                  label: "Saldo adequado",
                  value: Math.max(0, stockCount - criticalCount),
                  color: "var(--success)",
                },
              ]}
              unit="posições"
              onSelect={
                onMetric
                  ? (label) =>
                      onMetric(
                        label === "Abaixo do mínimo" ? "critical" : "stock",
                      )
                  : undefined
              }
            />
          )}
        </>
      )}
    </section>
  );
}
