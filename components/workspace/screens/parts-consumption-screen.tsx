"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { PartsConsumptionReport } from "@/lib/parts-consumption";
import type { Role } from "@/lib/workspace-routes";
import { heading } from "../ui";
import styles from "./workflow.module.css";
const number = (value: number) =>
  value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
export function PartsConsumptionScreen({
  role,
  mode,
  initialCode,
}: {
  role: Role;
  mode: "comparison" | "share";
  initialCode?: string;
}) {
  const [filters, setFilters] = useState<Record<string, string>>(
    initialCode ? { code: initialCode } : {},
  );
  const [report, setReport] = useState<PartsConsumptionReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(
          "/api/parts-consumption?" + new URLSearchParams(filters),
          { signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setReport(data);
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Falha na consulta.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [filters, revision]);
  const set = (key: string, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const selected = filters.code || "";
  const prefix = role === "admin" ? "/admin/dashboard" : "/warehouse/dashboard";
  const choose = (
    name: string,
    key: string,
    options: { value: string; label: string }[],
  ) => (
    <label>
      {name}
      <select
        value={filters[key] || ""}
        onChange={(event) => set(key, event.target.value)}
      >
        <option value="">Todos</option>
        {options.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      {heading(
        "CONSUMO REGISTRADO",
        mode === "comparison" ? "Peças" : "Por peça",
        mode === "comparison"
          ? "Compare o consumo de cada material entre períodos, blocos e setores."
          : "Veja a participação de cada bloco e setor no consumo do material selecionado.",
      )}
      <nav className={styles.reportTabs} aria-label="Painéis de peças">
        <Link
          href={`${prefix}/parts`}
          aria-current={mode === "comparison" ? "page" : undefined}
        >
          Peças · comparativo
        </Link>
        <Link
          href={`${prefix}/by-part`}
          aria-current={mode === "share" ? "page" : undefined}
        >
          Por peça · participação
        </Link>
      </nav>
      <section className="panel">
        <div className={styles.filters}>
          <label>
            De
            <input
              type="date"
              value={filters.from || report?.period.from || ""}
              onChange={(event) => set("from", event.target.value)}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={filters.to || report?.period.to || ""}
              onChange={(event) => set("to", event.target.value)}
            />
          </label>
          {choose(
            "Peça",
            "code",
            report?.options.parts.map((part) => ({
              value: part.code,
              label: `${part.name} · ${part.code}`,
            })) ?? [],
          )}
          {choose(
            "Bloco",
            "block",
            report?.options.blocks.map((value) => ({ value, label: value })) ??
              [],
          )}
          {choose(
            "Setor",
            "sector",
            report?.options.sectors.map((value) => ({ value, label: value })) ??
              [],
          )}
          {choose(
            "Almoxarifado",
            "warehouse",
            report?.options.warehouses.map((value) => ({
              value,
              label: value,
            })) ?? [],
          )}
          {choose(
            "Funcionário",
            "requester",
            report?.options.requesters.map((person) => ({
              value: person.id,
              label: `${person.name} · ${person.id}`,
            })) ?? [],
          )}
          {mode === "comparison" && (
            <>
              <label>
                Comparar de
                <input
                  type="date"
                  value={filters.compareFrom || report?.comparison.from || ""}
                  onChange={(event) => set("compareFrom", event.target.value)}
                />
              </label>
              <label>
                Comparar até
                <input
                  type="date"
                  value={filters.compareTo || report?.comparison.to || ""}
                  onChange={(event) => set("compareTo", event.target.value)}
                />
              </label>
            </>
          )}
          <button
            className="button secondary"
            onClick={() => setRevision((value) => value + 1)}
            disabled={loading}
          >
            Atualizar
          </button>
          <button className="button secondary" onClick={() => setFilters({})}>
            Limpar filtros
          </button>
        </div>
      </section>
      {error ? (
        <p role="alert">{error}</p>
      ) : loading ? (
        <p role="status">Consultando consumo no banco…</p>
      ) : (
        report && (
          <>
            <div className={styles.summary}>
              <div>
                <span>Materiais no filtro</span>
                <strong>{report.items.length}</strong>
              </div>
              <div>
                <span>Entregas no período</span>
                <strong>{report.requests}</strong>
              </div>
              <div>
                <span>Entregas no comparativo</span>
                <strong>{report.previousRequests}</strong>
              </div>
            </div>
            {mode === "comparison" ? (
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Consumo por material</h2>
                    <p>
                      {report.period.from} a {report.period.to} · Comparativo:{" "}
                      {report.comparison.from} a {report.comparison.to}
                    </p>
                  </div>
                </div>
                <div className={styles.legend}>
                  <span>● Período selecionado</span>
                  <span>● Período comparativo</span>
                </div>
                <div className={styles.chart}>
                  {report.items
                    .filter((item) => item.quantity || item.previousQuantity)
                    .slice(0, 12)
                    .map((item) => {
                      const maximum = Math.max(
                        1,
                        ...report.items
                          .filter((other) => other.unit === item.unit)
                          .flatMap((other) => [
                            other.quantity,
                            other.previousQuantity,
                          ]),
                      );
                      return (
                        <div className={styles.chartRow} key={item.code}>
                          <Link
                            href={`${prefix}/by-part?code=${encodeURIComponent(item.code)}`}
                          >
                            {item.name}
                            <small>{item.code}</small>
                          </Link>
                          <div className={styles.bars}>
                            <div
                              className={styles.bar}
                              style={{
                                width: `${(item.quantity / maximum) * 100}%`,
                              }}
                            />
                            <span>
                              Atual: {number(item.quantity)} {item.unit}
                            </span>
                            <div
                              className={`${styles.bar} ${styles.previous}`}
                              style={{
                                width: `${(item.previousQuantity / maximum) * 100}%`,
                              }}
                            />
                            <span>
                              Comparativo: {number(item.previousQuantity)}{" "}
                              {item.unit}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
                <div className={styles.tableScroll}>
                  <table className={styles.materialTable}>
                    <caption>
                      Todos os materiais do filtro; gráfico com os 12 maiores
                      consumos.
                    </caption>
                    <thead>
                      <tr>
                        <th>Peça</th>
                        <th>Unidade</th>
                        <th>Atual</th>
                        <th>Comparativo</th>
                        <th>Variação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.items.map((item) => (
                        <tr key={item.code}>
                          <td>
                            <Link
                              href={`${prefix}/by-part?code=${encodeURIComponent(item.code)}`}
                            >
                              {item.name}
                            </Link>
                            <small>{item.code}</small>
                          </td>
                          <td>{item.unit}</td>
                          <td>{number(item.quantity)}</td>
                          <td>{number(item.previousQuantity)}</td>
                          <td>
                            {item.change === null
                              ? item.quantity
                                ? "Sem base anterior"
                                : "Sem consumo"
                              : `${item.change > 0 ? "+" : ""}${number(item.change)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : !selected ? (
              <section className="panel ops-panel">
                <h2>Selecione uma peça</h2>
                <p>
                  Use o filtro Peça para calcular os percentuais por bloco e
                  setor de um único material.
                </p>
              </section>
            ) : (
              <div className={styles.shareGrid}>
                {[
                  ["Por bloco", report.blocks],
                  ["Por setor", report.sectors],
                ].map(([title, values]) => (
                  <section key={String(title)} className="panel ops-panel">
                    <h2>{String(title)}</h2>
                    {(values as PartsConsumptionReport["blocks"]).map(
                      (value) => (
                        <div className={styles.shareRow} key={value.label}>
                          <div>
                            <strong>{value.label}</strong>
                            <span>
                              {number(value.quantity)} {report.items[0]?.unit} ·{" "}
                              {number(value.percentage)}%
                            </span>
                          </div>
                          <div className={styles.shareTrack}>
                            <div
                              className={styles.bar}
                              style={{ width: `${value.percentage}%` }}
                            />
                          </div>
                        </div>
                      ),
                    )}
                    {!(values as unknown[]).length && (
                      <p>Nenhum consumo registrado neste período e filtro.</p>
                    )}
                  </section>
                ))}
              </div>
            )}
            <p className={styles.methodology}>
              {report.methodology} Atualizado em{" "}
              {new Date(report.generatedAt).toLocaleString("pt-BR")}.
            </p>
          </>
        )
      )}
    </>
  );
}
