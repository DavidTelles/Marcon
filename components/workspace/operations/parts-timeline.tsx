import type { PartsConsumptionReport } from "@/lib/parts-consumption";

/** Same dependency-free SVG chart approach already used by DashboardCharts. */
export function PartsTimeline({
  report,
  onSelect,
}: {
  report: PartsConsumptionReport;
  onSelect: (series: string, date: string) => void;
}) {
  const dates = Array.from({ length: report.period.days }, (_, i) =>
    new Date(Date.parse(report.period.from) + i * 86400000)
      .toISOString()
      .slice(0, 10),
  );
  const byKey = new Map(
    report.daily.map((d) => [`${d.series}:${d.date}`, d.quantity]),
  );
  const maximum = Math.max(1, ...report.daily.map((d) => d.quantity));
  const x = (i: number) => 65 + (i / Math.max(1, dates.length - 1)) * 620;
  const y = (q: number) => 210 - (q / maximum) * 160;
  return (
    <div>
      <p>
        Quantidade entregue diária · {report.filters.unit} · UTC. As séries
        ficam na mesma escala. Cada dia é acessível na tabela abaixo.
      </p>
      <svg
        viewBox="0 0 720 255"
        role="img"
        aria-label={`Evolução das entregas de ${report.series.join(", ")} em ${report.filters.unit}`}
        style={{ width: "100%", maxHeight: 340 }}
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1="65"
              x2="685"
              y1={y(maximum * t)}
              y2={y(maximum * t)}
              stroke="var(--line)"
            />
            <text
              x="55"
              y={y(maximum * t) + 4}
              textAnchor="end"
              fill="var(--ink)"
              fontSize="11"
            >
              {(maximum * t).toLocaleString("pt-BR")}
            </text>
          </g>
        ))}
        <text x="65" y="240" fill="var(--ink)" fontSize="11">
          {dates[0]}
        </text>
        <text x="685" y="240" textAnchor="end" fill="var(--ink)" fontSize="11">
          {dates.at(-1)}
        </text>
        {report.series.map((s, index) => (
          <g key={s}>
            <polyline
              fill="none"
              stroke={`var(--chart-${index + 1})`}
              strokeWidth="2.5"
              points={dates
                .map((d, i) => `${x(i)},${y(byKey.get(`${s}:${d}`) || 0)}`)
                .join(" ")}
            />
            {report.daily
              .filter((d) => d.series === s)
              .map((d) => (
                <circle
                  key={d.date}
                  cx={x(dates.indexOf(d.date))}
                  cy={y(d.quantity)}
                  r="4"
                  fill={`var(--chart-${index + 1})`}
                  onClick={() => onSelect(s, d.date)}
                  style={{ cursor: "pointer" }}
                >
                  <title>
                    {s}: {d.date} · {d.quantity} {report.filters.unit}
                  </title>
                </circle>
              ))}
          </g>
        ))}
      </svg>
      <p>
        {report.series.map((s, i) => (
          <span
            key={s}
            style={{ marginRight: 16, color: `var(--chart-${i + 1})` }}
          >
            ● {s}
          </span>
        ))}
      </p>
      <details>
        <summary>
          Tabela diária · alternativa acessível e registros de origem
        </summary>
        <div style={{ overflowX: "auto", maxHeight: 400 }}>
          <table style={{ width: "100%" }}>
            <caption>
              Quantidade entregue por dia · {report.filters.unit} · UTC
            </caption>
            <thead>
              <tr>
                <th>Data</th>
                {report.series.map((s) => (
                  <th key={s}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((day) => (
                <tr key={day}>
                  <th>{day}</th>
                  {report.series.map((s) => (
                    <td key={s}>
                      <button
                        type="button"
                        className="insight-choice"
                        onClick={() => onSelect(s, day)}
                        aria-label={`Registros de ${s} em ${day}`}
                      >
                        {(byKey.get(`${s}:${day}`) || 0).toLocaleString(
                          "pt-BR",
                        )}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
