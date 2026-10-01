type Row = { label: string; value: number; color?: string };

export function InsightChart({
  title,
  description,
  rows,
  unit = "registros",
  onSelect,
  className = "",
}: {
  title: string;
  description: string;
  rows: Row[];
  unit?: string;
  onSelect?: (label: string) => void;
  className?: string;
}) {
  const safeRows = rows.map((row) => ({
    ...row,
    value: Math.max(0, Number.isFinite(row.value) ? row.value : 0),
  }));
  const total = safeRows.reduce((sum, row) => sum + row.value, 0);
  const max = Math.max(1, ...safeRows.map((row) => row.value));
  const leader = safeRows.reduce<Row | null>(
    (best, row) => (!best || row.value > best.value ? row : best),
    null,
  );
  let angle = 0;
  const segments = safeRows.map((row, index) => {
    const start = angle;
    angle += total ? (row.value / total) * 360 : 0;
    return `${row.color ?? ["#25c5b8", "#3a71e6", "#ffba55", "#ff6f78", "#8c70e8"][index % 5]} ${start}deg ${angle}deg`;
  });
  return (
    <section className={`insight-chart panel ${className}`} aria-label={title}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="insight-chart-body">
        <div className="insight-ring-wrap">
          <div
            className="insight-ring"
            style={{
              background: total
                ? `conic-gradient(${segments.join(", ")})`
                : "#e1e5ef",
            }}
            aria-hidden="true"
          >
            <div className="insight-ring-center">
              <strong>{total.toLocaleString("pt-BR")}</strong>
              <span>{unit}</span>
            </div>
          </div>
        </div>
        <div className="insight-breakdown" role="list">
          {safeRows.map((row, index) => (
            <div className="insight-row" role="listitem" key={row.label}>
              <div>
                {onSelect ? (
                  <button
                    type="button"
                    className="insight-choice"
                    onClick={() => onSelect(row.label)}
                  >
                    <span
                      className="insight-dot"
                      style={{ background: row.color ?? "var(--blue)" }}
                      aria-hidden="true"
                    />
                    <span>{row.label}</span>
                    <strong>{row.value.toLocaleString("pt-BR")}</strong>
                    <span aria-hidden="true">→</span>
                  </button>
                ) : (
                  <>
                    <span
                      className="insight-dot"
                      style={{
                        background:
                          row.color ??
                          [
                            "#25c5b8",
                            "#3a71e6",
                            "#ffba55",
                            "#ff6f78",
                            "#8c70e8",
                          ][index % 5],
                      }}
                    />{" "}
                    <span>{row.label}</span>
                    <strong>{row.value.toLocaleString("pt-BR")}</strong>
                  </>
                )}
              </div>
              <div className="insight-track">
                <span
                  style={{
                    width: `${(row.value / max) * 100}%`,
                    background:
                      row.color ??
                      ["#25c5b8", "#3a71e6", "#ffba55", "#ff6f78", "#8c70e8"][
                        index % 5
                      ],
                  }}
                />
              </div>
            </div>
          ))}
          <p className="insight-explainer">
            {total === 0
              ? "Ainda não há dados para comparar."
              : `Total: ${total.toLocaleString("pt-BR")} ${unit}. Maior quantidade por grupo: ${leader?.value.toLocaleString("pt-BR")}.`}
          </p>
        </div>
      </div>
    </section>
  );
}
