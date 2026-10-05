"use client";
import { useEffect, useState } from "react";
import type { ReportRow } from "@/lib/operations-report";

/** Lazy read of the existing recommendation service; no local forecast formulas. */
export function PartsPlanning({
  code,
  from,
  to,
  warehouse,
  revision,
}: {
  code: string;
  from: string;
  to: string;
  warehouse: string;
  revision: number;
}) {
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setRows(null);
      setError("");
      try {
        const response = await fetch(
          "/api/operations?" +
            new URLSearchParams({
              planning: "purchase",
              code,
              from,
              to,
              ...(warehouse ? { warehouse } : {}),
              pageSize: "50",
            }),
          { signal: controller.signal, cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Sugestões indisponíveis.");
        if (!controller.signal.aborted) setRows(data.rows);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Sugestões indisponíveis.",
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [code, from, to, warehouse, retry, revision]);
  if (error)
    return (
      <div role="alert">
        <p>{error}</p>
        <button
          className="button secondary"
          onClick={() => setRetry((v) => v + 1)}
        >
          Reconsultar sugestões
        </button>
      </div>
    );
  if (!rows)
    return (
      <p role="status">Consultando o serviço de recomendação de estoque…</p>
    );
  const relevant = rows.filter(
    (r) => r.code === code && (!warehouse || r.warehouse === warehouse),
  );
  return (
    <div>
      <h3>Sugestões do planejamento existente</h3>
      <p>
        Base própria do serviço: baixas efetivas, cobertura observável e margens
        de segurança. Difere das entregas confirmadas deste painel; não mede uso
        na produção. Bloco de destino não restringe esta análise de reposição da
        peça/local.
      </p>
      {relevant.length ? (
        <div style={{ overflowX: "auto" }}>
          <table>
            <caption>
              Recomendação por peça/local, consultada agora · até 50 locais;
              veja todos no planejamento
            </caption>
            <thead>
              <tr>
                <th>Almoxarifado</th>
                <th>Compra sugerida</th>
                <th>Unidade</th>
                <th>Método / histórico</th>
              </tr>
            </thead>
            <tbody>
              {relevant.map((r) => (
                <tr key={`${r.code}:${r.warehouse}`}>
                  <td>{r.warehouse}</td>
                  <td>{r.buy}</td>
                  <td>{r.unit}</td>
                  <td>
                    {r.analysis.method} · {r.analysis.days} dias ·{" "}
                    {r.analysis.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Nenhuma sugestão disponível para esta peça/local.</p>
      )}
    </div>
  );
}
