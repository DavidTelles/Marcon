"use client";
import { useState } from "react";
import Link from "next/link";
import type { StockNeed } from "@/lib/stock-needs";
import { pathFor, type Role } from "@/lib/workspace-routes";
import { can } from "@/lib/permissions";

const number = (value: number) =>
  value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
export function StockNeeds({
  needs,
  role,
  pageSize,
}: {
  needs: StockNeed[];
  role: Role;
  pageSize: number;
}) {
  const [requestedPage, setPage] = useState(1);
  if (!needs.length) return null;
  const pages = Math.ceil(needs.length / pageSize),
    page = Math.min(requestedPage, pages);
  return (
    <section className="stock-needs" aria-label="Necessidades de reposição">
      <div className="decision-destination-heading">
        <div>
          <span>Reposição a revisar</span>
          <h3>Necessidades identificadas · {needs.length}</h3>
        </div>
        <p>Déficits com base nos dados disponíveis</p>
      </div>
      <p>
        Estes cards mostram onde falta saldo para atingir o mínimo ou alvo. A
        transferência será sugerida após validar a origem, o espaço e o
        percurso. Saldos importados aguardam conciliação e não são
        disponibilidade operacional.
      </p>
      <div className="decision-grid">
        {needs.slice((page - 1) * pageSize, page * pageSize).map((need) => (
          <article className="decision-card stock-need" key={need.key}>
            <span className="dashboard-badge">
              {need.purchaseBlocked
                ? "Compra bloqueada na origem"
                : need.source === "imported"
                  ? "Conferir saldo importado"
                  : "Reposição necessária"}
            </span>
            <h4>{need.item}</h4>
            <p>
              {need.code} · <strong>{need.destination}</strong>
            </p>
            <div className="purchase-total">
              <span>Déficit identificado</span>
              <strong>
                {number(need.quantity)} {need.unit}
              </strong>
            </div>
            <dl className="stock-need-balances">
              <div>
                <dt>
                  {need.source === "imported"
                    ? "Saldo no relatório"
                    : "Disponível no estoque"}
                </dt>
                <dd>
                  {number(need.available)} {need.unit}
                </dd>
              </div>
              <div>
                <dt>
                  {need.source === "imported"
                    ? "Estoque de segurança informado"
                    : "Mínimo / alvo de cobertura"}
                </dt>
                <dd>
                  {number(need.target)} {need.unit}
                </dd>
              </div>
              {need.source === "operational" && (
                <div>
                  <dt>Entradas e transferências já consideradas</dt>
                  <dd>
                    {number(need.incoming)} {need.unit}
                  </dd>
                </div>
              )}
            </dl>
            <details className="decision-calculation">
              <summary>Ver dados e próximos passos</summary>
              <p>{need.reference}</p>
              {need.consumption && <p>Consumo agregado: {need.consumption}.</p>}
              <p>
                Cálculo do déficit: máximo de zero, {number(need.target)} −{" "}
                {number(need.available)} − {number(need.incoming)} ={" "}
                {number(need.quantity)} {need.unit}.
              </p>
              <h5>Para definir a reposição</h5>
              <ul>
                {need.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
              {!!need.conflicts.length && (
                <>
                  <h5>Pendências do relatório</h5>
                  <ul>
                    {need.conflicts.map((conflict, i) => (
                      <li key={i}>{conflict}</li>
                    ))}
                  </ul>
                </>
              )}
            </details>
            {can(role, "map") && (
              <Link className="button secondary" href={pathFor(role, "mapa")}>
                Configurar vínculos e caminhos
              </Link>
            )}
          </article>
        ))}
      </div>
      {pages > 1 && (
        <nav className="head-actions" aria-label="Paginação das necessidades">
          <button
            className="button secondary"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Necessidades anteriores
          </button>
          <span>
            Página {page} de {pages} · {needs.length} necessidades
          </span>
          <button
            className="button secondary"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Mais necessidades
          </button>
        </nav>
      )}
    </section>
  );
}
