"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDemoStore } from "../demo-store";
import { balanceOf, WAREHOUSES } from "@/lib/inventory";
import { badge } from "../ui";

export function AdminDashboard({
  dashboardView,
  routePart,
}: {
  dashboardView?: string;
  routePart?: string;
}) {
  const params = useSearchParams();
  const { requests, stock, balances } = useDemoStore();
  const view =
    params.get("dashboard") ??
    (dashboardView === "block"
      ? "bloco"
      : dashboardView === "sector"
        ? "requisicoes"
        : dashboardView
          ? "estoque"
          : "geral");
  const pending = requests.filter((r) =>
    ["Pendente", "Em análise", "Aprovada", "Cancelamento solicitado"].includes(
      r.status,
    ),
  );
  const critical = stock.filter((part) => part.quantity < part.minimum);
  const titles: Record<string, string> = {
    geral: "Visão geral",
    bloco: "Dashboard por bloco",
    estoque: "Dashboard de estoque",
    requisicoes: "Dashboard de requisições",
  };
  const summaries =
    view === "estoque"
      ? [
          ["Peças cadastradas", stock.length],
          ["Abaixo do mínimo", critical.length],
        ]
      : [
          ["Requisições", requests.length],
          ["Em acompanhamento", pending.length],
          ["Entregues", requests.filter((r) => r.status === "Entregue").length],
        ];
  const parts =
    routePart &&
    routePart !== "all" &&
    dashboardView !== "sector" &&
    dashboardView !== "block"
      ? stock.filter(
          (p) =>
            String(p.id) === routePart ||
            p.code.toLowerCase() === routePart.toLowerCase() ||
            p.name.toLowerCase().includes(routePart.toLowerCase()),
        )
      : stock;
  return (
    <div className="dashboard-suite">
      <section className="panel ops-panel">
        <div className="panel-head">
          <div>
            <h1 className="dashboard-title">{titles[view] ?? titles.geral}</h1>
            <p>
              {view === "geral"
                ? "Os principais números da operação."
                : view === "estoque"
                  ? "Peças, saldos e disponibilidade em cada almoxarifado."
                  : "Acompanhe as requisições e sua situação."}
            </p>
          </div>
        </div>
        <div className="stats admin-summary">
          {summaries.map(([label, value]) => (
            <div className="stat" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        {view === "geral" && (
          <div className="overview-status">
            <span>Peças abaixo do mínimo</span>
            <strong>{critical.length}</strong>
            <Link href="/admin/dashboard?dashboard=estoque&metric=stock">
              Consultar estoque
            </Link>
          </div>
        )}
        {view === "bloco" && (
          <div className="focus-grid">
            {[...new Set(requests.map((r) => r.block))].map((block) => (
              <article className="stat" key={block}>
                <span>{block}</span>
                <strong>
                  {requests.filter((r) => r.block === block).length}
                </strong>
                <small>
                  {pending.filter((r) => r.block === block).length} em
                  acompanhamento
                </small>
              </article>
            ))}
          </div>
        )}
        {view === "estoque" && (
          <div
            className="ops-scroll history-table"
            role="region"
            aria-label="Peças por almoxarifado"
            tabIndex={0}
          >
            <table>
              <caption>Saldo disponível por peça e almoxarifado</caption>
              <thead>
                <tr>
                  {[
                    "Peça",
                    "Almoxarifado",
                    "Quantidade",
                    "Disponibilidade",
                    "Localização",
                  ].map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parts.flatMap((part) =>
                  WAREHOUSES.map((warehouse) => {
                    const quantity = balanceOf(balances, part.code, warehouse);
                    return (
                      <tr key={part.code + warehouse}>
                        <td data-label="Peça">
                          <Link href={`/admin/dashboard/stock/peca/${part.id}`}>
                            <strong>{part.name}</strong>
                          </Link>
                          <small>{part.code}</small>
                        </td>
                        <td data-label="Almoxarifado">{warehouse}</td>
                        <td data-label="Quantidade">{quantity} un.</td>
                        <td data-label="Disponibilidade">
                          {badge(quantity > 0 ? "Disponível" : "Indisponível")}
                        </td>
                        <td data-label="Localização">{part.location}</td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
            {!parts.length && (
              <p className="dashboard-empty">Nenhuma peça encontrada.</p>
            )}
          </div>
        )}
        {view === "requisicoes" && (
          <>
            <div className="panel-head">
              <h2>Acompanhamento das requisições</h2>
              <Link className="link-button" href="/admin/all-requests">
                Consultar e filtrar
              </Link>
            </div>
            <div
              className="ops-scroll history-table"
              role="region"
              aria-label="Requisições"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    {[
                      "Número",
                      "Material",
                      "Quantidade",
                      "Solicitante",
                      "Bloco",
                      "Data",
                      "Situação",
                    ].map((label) => (
                      <th key={label} scope="col">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Número">#{r.id}</td>
                      <td data-label="Material">
                        <strong>{r.material}</strong>
                        <small>{r.code}</small>
                      </td>
                      <td data-label="Quantidade">{r.quantity} un.</td>
                      <td data-label="Solicitante">{r.person}</td>
                      <td data-label="Bloco">{r.block}</td>
                      <td data-label="Data">{r.date}</td>
                      <td data-label="Situação">{badge(r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!requests.length && (
                <p className="dashboard-empty">
                  Nenhuma requisição registrada.
                </p>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
