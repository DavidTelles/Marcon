"use client";
import { useState } from "react";
import { useDemoStore } from "../demo-store";
import { useEmployeeBlock } from "../employee-identity";
import { heading } from "../ui";
import styles from "./workflow.module.css";

export function MaterialsScreen() {
  const { stock, requests, returns } = useDemoStore();
  const block = useEmployeeBlock();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const inPeriod = (date: string) => {
    const day = date.slice(0, 10);
    return (!from || day >= from) && (!to || day <= to);
  };
  const materials = new Map(
    stock.map((p) => [
      p.code,
      { code: p.code, name: p.name, unit: p.unit || "un" },
    ]),
  );
  for (const r of requests)
    if (r.block === block && r.code && !materials.has(r.code))
      materials.set(r.code, {
        code: r.code,
        name: r.material,
        unit: r.unit || "un",
      });
  for (const r of returns)
    if (r.fromBlock === block && !materials.has(r.partCode))
      materials.set(r.partCode, {
        code: r.partCode,
        name: r.partCode,
        unit: "un",
      });
  const rows = [...materials.values()]
    .map((p) => {
      const deliveries = requests.filter(
        (r) =>
          r.block === block && r.code === p.code && r.status === "Entregue",
      );
      const outgoing = returns.filter(
        (r) =>
          r.fromBlock === block &&
          r.partCode === p.code &&
          r.inspectionStatus === "Conferida",
      );
      const incoming = deliveries
        .filter((r) => inPeriod(r.deliveredAt || r.createdAt || ""))
        .reduce((s, r) => s + r.quantity, 0);
      const returned = outgoing
        .filter((r) => inPeriod(r.inspectedAt || r.date))
        .reduce((s, r) => s + r.quantity, 0);
      const balance =
        deliveries.reduce((s, r) => s + r.quantity, 0) -
        outgoing.reduce((s, r) => s + r.quantity, 0);
      return {
        code: p.code,
        name: p.name,
        unit: p.unit || "un",
        incoming,
        returned,
        balance,
      };
    })
    .filter(
      (r) =>
        (r.incoming || r.returned || r.balance) &&
        `${r.name} ${r.code}`.toLowerCase().includes(query.toLowerCase()),
    );
  return (
    <>
      {heading(
        "MOVIMENTAÇÃO DO BLOCO",
        "Materiais",
        `Entradas por entregas concluídas e saídas por devoluções conferidas no ${block}.`,
      )}
      <div className={styles.summary}>
        <div>
          <span>Materiais movimentados</span>
          <strong>{rows.length}</strong>
        </div>
        <div>
          <span>Entregas concluídas</span>
          <strong>
            {
              requests.filter(
                (r) =>
                  r.block === block &&
                  r.status === "Entregue" &&
                  inPeriod(r.deliveredAt || ""),
              ).length
            }
          </strong>
        </div>
      </div>
      <section className="panel">
        <div className={styles.filters}>
          <label>
            Material
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
            />
          </label>
          <label>
            De
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <div className={styles.chart}>
          {rows.map((r) => {
            const max = Math.max(
              1,
              ...rows
                .filter((other) => other.unit === r.unit)
                .flatMap((other) => [other.incoming, other.returned]),
            );
            return (
              <div key={r.code} className={styles.chartRow}>
                <strong>
                  {r.name}
                  <small> · {r.unit}</small>
                </strong>
                <div className={styles.bars}>
                  <div
                    className={styles.bar}
                    style={{ width: `${(r.incoming / max) * 100}%` }}
                    aria-label={`${r.incoming} ${r.unit} entraram`}
                  />
                  <span>
                    Entraram {r.incoming} {r.unit}
                  </span>
                  <div
                    className={`${styles.bar} ${styles.out}`}
                    style={{ width: `${(r.returned / max) * 100}%` }}
                    aria-label={`${r.returned} ${r.unit} saíram`}
                  />
                  <span>
                    Saíram {r.returned} {r.unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="table-wrap">
          <table className={styles.materialTable}>
            <caption>Materiais do {block}</caption>
            <thead>
              <tr>
                <th>Material</th>
                <th>Unidade</th>
                <th>Entraram no período</th>
                <th>Saíram no período</th>
                <th>Saldo registrado acumulado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code}>
                  <td>
                    {r.name}
                    <small>{r.code}</small>
                  </td>
                  <td>{r.unit}</td>
                  <td>{r.incoming}</td>
                  <td>{r.returned}</td>
                  <td>{r.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p className={styles.empty}>
            Nenhuma movimentação registrada neste bloco para os filtros
            selecionados.
          </p>
        )}
        <p className={styles.empty}>
          O saldo registrado considera entregas e devoluções. Consumo físico
          dentro do bloco só pode ser refletido quando houver uma baixa
          registrada; não é estimado.
        </p>
      </section>
    </>
  );
}
