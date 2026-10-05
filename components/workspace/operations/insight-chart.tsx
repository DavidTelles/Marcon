type Row = { label: string; value: number; color?: string };

export function InsightChart({
  title,
  description,
  rows,
  unit = "registros",
  onSelect,
  className = "",
  variant = "ring",
}: {
  title: string;
  description: string;
  rows: Row[];
  unit?: string;
  onSelect?: (label: string) => void;
  className?: string;
  variant?: "ring" | "bars";
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
    return `${row.color ?? `var(--chart-${(index % 6) + 1})`} ${start}deg ${angle}deg`;
  });
  return (
    <section className={`insight-chart panel ${className}`} aria-label={title}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div
        className="insight-chart-body"
        style={
          variant === "bars"
            ? { gridTemplateColumns: "minmax(0, 1fr)" }
            : undefined
        }
      >
        {variant === "ring" && (
          <div className="insight-ring-wrap">
            <div
              className="insight-ring"
              style={{
                background: total
                  ? `conic-gradient(${segments.join(", ")})`
                  : "var(--line)",
              }}
              aria-hidden="true"
            >
              <div className="insight-ring-center">
                <strong>{total.toLocaleString("pt-BR")}</strong>
                <span>{unit}</span>
              </div>
            </div>
          </div>
        )}
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
                      style={{
                        background:
                          row.color ?? `var(--chart-${(index % 6) + 1})`,
                      }}
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
                          row.color ?? `var(--chart-${(index % 6) + 1})`,
                      }}
                    />{" "}
                    <span>{row.label}</span>
                    <strong>{row.value.toLocaleString("pt-BR")}</strong>
                  </>
                )}
              </div>
              <div
                className="insight-track"
                role={variant === "bars" && onSelect ? "button" : undefined}
                tabIndex={variant === "bars" && onSelect ? 0 : undefined}
                aria-label={
                  variant === "bars" && onSelect
                    ? `Ver registros de ${row.label}`
                    : undefined
                }
                onClick={
                  variant === "bars" && onSelect
                    ? () => onSelect(row.label)
                    : undefined
                }
                onKeyDown={
                  variant === "bars" && onSelect
                    ? (event) => {
                        if (["Enter", " "].includes(event.key)) {
                          event.preventDefault();
                          onSelect(row.label);
                        }
                      }
                    : undefined
                }
              >
                <span
                  style={{
                    width: `${(row.value / max) * 100}%`,
                    ...(variant === "bars"
                      ? { animation: "none", boxShadow: "none" }
                      : {}),
                    background: row.color ?? `var(--chart-${(index % 6) + 1})`,
                  }}
                />
              </div>
            </div>
          ))}
          <p className="insight-explainer">
            {variant === "bars"
              ? `Escala: 0 a ${max.toLocaleString("pt-BR")} ${unit}. Clique em um material ou bloco para ver os registros.`
              : total === 0
                ? "Ainda não há dados para comparar."
                : `Total: ${total.toLocaleString("pt-BR")} ${unit}. Maior quantidade por grupo: ${leader?.value.toLocaleString("pt-BR")}.`}
          </p>
        </div>
      </div>
    </section>
  );
}
