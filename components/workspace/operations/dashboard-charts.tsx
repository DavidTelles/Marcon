"use client";
import { useState } from "react";
import type { DashboardReport } from "@/lib/dashboard-report";
export function DashboardCharts({ report }: { report: DashboardReport }) {
  const units = [...new Set(report.daily.map((r) => r.unit))];
  const [selected, setSelected] = useState("");
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
  });
  const points = series
    .map(
      (s, i) =>
        `${40 + (i / Math.max(1, days - 1)) * 640},${190 - (s.quantity / max) * 150}`,
    )
    .join(" ");
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
      <article className="panel ops-panel">
        <div className="panel-head">
          <div>
            <h2>Evolução das retiradas</h2>
            <p>
              {report.methodology.period} · {report.scope} · baixas efetivas ·
              atualizado às {updatedAt}
            </p>
          </div>
        </div>
        <label>
          Unidade do gráfico
          <select value={unit} onChange={(e) => setSelected(e.target.value)}>
            {(units.length ? units : ["un"]).map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        {report.daily.length ? (
          <>
            <svg
              viewBox="0 0 720 230"
              className="dashboard-chart"
              role="img"
              aria-label={`Retiradas em ${unit} entre ${report.filters.from} e ${report.filters.to}`}
            >
              <line x1="40" y1="190" x2="680" y2="190" stroke="var(--line)" />
              <line x1="40" y1="40" x2="680" y2="40" stroke="var(--line)" />
              <text x="4" y="44">
                {max}
              </text>
              <text x="20" y="194">
                0
              </text>
              <polyline
                points={points}
                fill="none"
                stroke="var(--blue)"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
              {days === 1 && (
                <circle
                  cx="40"
                  cy={190 - (series[0].quantity / max) * 150}
                  r="5"
                  fill="var(--blue)"
                />
              )}
              <text x="40" y="217">
                {report.filters.from}
              </text>
              <text x="680" y="217" textAnchor="end">
                {report.filters.to}
              </text>
            </svg>
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
                        <td data-label="Data">{s.date}</td>
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
            Nenhuma movimentação no período. Não há evolução para apresentar.
          </p>
        )}
      </article>
      <article className="panel ops-panel">
        <div className="panel-head">
          <div>
            <h2>Peças mais usadas</h2>
            <p>
              Até 12 itens · {unit} · retiradas efetivas · atualizado às {updatedAt}
            </p>
          </div>
        </div>
        {top.length ? (
          <>
            <div className="dashboard-bars" role="list">
              {top.map((t) => (
                <div role="listitem" key={t.code}>
                  <span>
                    {t.item} <small>{t.code}</small>
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
        </>
      )}
    </section>
  );
}
