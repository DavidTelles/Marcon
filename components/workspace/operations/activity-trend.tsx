"use client";

import { useId, useState } from "react";

type Record = { date: string; value: number };
const iso = (date: string) =>
  date.includes("/") ? date.split("/").reverse().join("-") : date.slice(0, 10);
const label = (date: string) => date.slice(5).split("-").reverse().join("/");

export function ActivityTrend({
  records,
  title,
  unit,
}: {
  records: Record[];
  title: string;
  unit: string;
}) {
  const gradient = useId();
  const [period, setPeriod] = useState(7);
  const normalized = records
    .map((record) => ({ ...record, date: iso(record.date) }))
    .filter(
      (record) =>
        /^\d{4}-\d{2}-\d{2}$/.test(record.date) &&
        Number.isFinite(Date.parse(record.date)) &&
        Number.isFinite(record.value),
    );
  const last = normalized
    .map((record) => record.date)
    .sort()
    .at(-1);
  const end = last ? Date.parse(last) : 0;
  const series = Array.from({ length: period }, (_, index) => {
    const date = new Date(end - (period - index - 1) * 86400000)
      .toISOString()
      .slice(0, 10);
    return {
      date,
      value: normalized
        .filter((record) => record.date === date)
        .reduce((sum, record) => sum + Math.max(0, record.value), 0),
    };
  });
  const max = Math.max(1, ...series.map((record) => record.value));
  const points = series
    .map(
      (record, index) =>
        `${48 + (index / (period - 1)) * 616},${180 - (record.value / max) * 140}`,
    )
    .join(" ");
  const total = series.reduce((sum, record) => sum + record.value, 0);
  return (
    <section className="panel activity-trend" aria-label={title}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>
            {last
              ? `Até ${last.split("-").reverse().join("/")} · ${unit}`
              : "Os dados aparecerão aqui quando houver registros."}
          </p>
        </div>
        <div
          className="trend-period"
          role="group"
          aria-label="Período do gráfico"
        >
          {[7, 30].map((days) => (
            <button
              type="button"
              key={days}
              aria-pressed={period === days}
              onClick={() => setPeriod(days)}
            >
              {days} dias
            </button>
          ))}
        </div>
      </div>
      {last ? (
        <>
          <div className="trend-total">
            <strong>{total.toLocaleString("pt-BR")}</strong>
            <span>{unit} no período</span>
          </div>
          <svg
            viewBox="0 0 720 225"
            className="dashboard-chart"
            role="img"
            aria-label={`${title}: ${total} ${unit} em ${period} dias. Valores disponíveis na tabela abaixo.`}
          >
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--bright)" stopOpacity=".24" />
                <stop offset="100%" stopColor="var(--bright)" stopOpacity=".01" />
              </linearGradient>
            </defs>
            {[0, 0.5, 1].map((fraction) => (
              <g key={fraction}>
                <line
                  x1="48"
                  x2="664"
                  y1={180 - fraction * 140}
                  y2={180 - fraction * 140}
                  stroke="var(--line)"
                  strokeDasharray="4 6"
                />
                <text x="35" y={184 - fraction * 140} textAnchor="end">
                  {Number((fraction * max).toFixed(1))}
                </text>
              </g>
            ))}
            <polygon
              points={`48,180 ${points} 664,180`}
              fill={`url(#${gradient})`}
            />
            <polyline
              points={points}
              pathLength={1}
              fill="none"
              stroke="var(--blue)"
              strokeWidth="3"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {series.map((record, index) => (
              <circle
                key={record.date}
                cx={48 + (index / (period - 1)) * 616}
                cy={180 - (record.value / max) * 140}
                r="3.5"
                fill="var(--blue)"
              >
                <title>{`${label(record.date)}: ${record.value} ${unit}`}</title>
              </circle>
            ))}
            <text x="48" y="214">
              {label(series[0].date)}
            </text>
            <text x="664" y="214" textAnchor="end">
              {label(series.at(-1)!.date)}
            </text>
          </svg>
          <details className="trend-data">
            <summary>Ver valores por dia</summary>
            <div
              className="ops-scroll"
              tabIndex={0}
              role="region"
              aria-label={`Valores de ${title}`}
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">{unit}</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((record) => (
                    <tr key={record.date}>
                      <td>{label(record.date)}</td>
                      <td>{record.value.toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p className="dashboard-empty">Nenhum registro para este gráfico.</p>
      )}
    </section>
  );
}
