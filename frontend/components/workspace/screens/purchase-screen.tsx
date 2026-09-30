"use client";

import { useState } from "react";
import { Download, Search } from "lucide-react";
import { heading, badge } from "../ui";
import { useDemoStore } from "../demo-store";
import type { Part } from "@/lib/demo-data";

type PurchaseItem = {
  item: Part;
  projection: { arrival: number; buy: number; growth: number };
};

const currency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PurchaseScreen({
  purchaseItems,
}: {
  purchaseItems: PurchaseItem[];
}) {
  const { setStock, persistent, runAction } = useDemoStore();
  const [saveError, setSaveError] = useState("");
  const [draftCosts, setDraftCosts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [warehouse, setWarehouse] = useState("Todos");
  const [risk, setRisk] = useState("Todos");
  const [order, setOrder] = useState("risk");

  function costFor(item: Part) {
    const draft = draftCosts[item.code];
    if (draft === undefined || draft.trim() === "") return item.estimatedCost;
    const value = Number(draft);
    return Number.isFinite(value) && value >= 0 ? value : item.estimatedCost;
  }

  async function saveCost(item: Part) {
    const value = costFor(item);
    if (persistent) {
      try {
        await runAction({ type: "updatePrice", code: item.code, price: value });
        setSaveError("");
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Não foi possível salvar o preço.");
      }
      return;
    }
    setStock((parts) =>
      parts.map((part) =>
        part.code === item.code ? { ...part, estimatedCost: value } : part,
      ),
    );
    setDraftCosts((current) => ({ ...current, [item.code]: String(value) }));
  }

  const warehouses = [
    "Todos",
    ...new Set(purchaseItems.map(({ item }) => item.warehouse)),
  ];
  const visibleItems = purchaseItems
    .filter(
      ({ item, projection }) =>
        (item.name + " " + item.code)
          .toLocaleLowerCase("pt-BR")
          .includes(search.toLocaleLowerCase("pt-BR")) &&
        (warehouse === "Todos" || item.warehouse === warehouse) &&
        (risk === "Todos" ||
          (risk === "Risco de ruptura") === projection.arrival < 0),
    )
    .sort((a, b) =>
      order === "cost"
        ? costFor(b.item) * b.projection.buy -
          costFor(a.item) * a.projection.buy
        : order === "quantity"
          ? b.projection.buy - a.projection.buy
          : order === "name"
            ? a.item.name.localeCompare(b.item.name, "pt-BR")
            : a.projection.arrival - b.projection.arrival,
    );
  const investment = visibleItems.reduce(
    (sum, { item, projection }) => sum + costFor(item) * projection.buy,
    0,
  );
  const ruptureCount = visibleItems.filter(
    ({ projection }) => projection.arrival < 0,
  ).length;

  function exportCsv() {
    const rows = [
      [
        "Peça",
        "ID",
        "Almoxarifado",
        "Saldo",
        "Consumo em 30 dias",
        "Prazo (dias)",
        "Saldo na chegada",
        "Compra sugerida",
        "Valor unitário (R$)",
        "Investimento (R$)",
      ],
      ...visibleItems.map(({ item, projection }) => [
        item.name,
        item.code,
        item.warehouse,
        item.quantity,
        item.consumed30,
        item.leadDays,
        projection.arrival,
        projection.buy,
        costFor(item),
        projection.buy * costFor(item),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => JSON.stringify(String(value))).join(";"))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "marcon-compra-preditiva.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {heading(
        "PLANEJAMENTO",
        "Compra preditiva",
        "Projeção de reposição de peças baseada no consumo e no prazo de fornecimento.",
      )}
      {saveError && <div className="info" role="alert">{saveError}</div>}
      <div className="info">
        <strong>{persistent ? "Planejamento de compras" : "Simulação para avaliação"}</strong>
        <p>
          Edite o valor unitário de referência para simular o investimento. O
          custo cadastrado é uma referência e não representa cotação de mercado.
        </p>
      </div>
      <section
        className="panel purchase-filters"
        aria-label="Filtros de compra preditiva"
      >
        <div className="panel-head">
          <div>
            <h2>Priorizar compras</h2>
            <p>Encontre peças em risco e compare a previsão de investimento.</p>
          </div>
          <button
            className="button secondary"
            type="button"
            onClick={exportCsv}
            disabled={visibleItems.length === 0}
          >
            <Download size={16} aria-hidden="true" /> Exportar planilha
          </button>
        </div>
        <div className="filter-grid">
          <label>
            Peça ou ID
            <div className="purchase-search">
              <Search size={17} aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar peça"
              />
            </div>
          </label>
          <label>
            Almoxarifado
            <select
              value={warehouse}
              onChange={(event) => setWarehouse(event.target.value)}
            >
              {warehouses.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Risco
            <select
              value={risk}
              onChange={(event) => setRisk(event.target.value)}
            >
              <option>Todos</option>
              <option>Risco de ruptura</option>
              <option>Reposição sugerida</option>
            </select>
          </label>
          <label>
            Organizar
            <select
              value={order}
              onChange={(event) => setOrder(event.target.value)}
            >
              <option value="risk">Maior risco primeiro</option>
              <option value="cost">Maior investimento</option>
              <option value="quantity">Maior compra sugerida</option>
              <option value="name">Nome A–Z</option>
            </select>
          </label>
        </div>
      </section>
      <div className="prediction-summary">
        <div className="stat">
          <span>Peças com compra sugerida</span>
          <strong>{visibleItems.length}</strong>
          <small>No recorte atual</small>
        </div>
        <div className="stat">
          <span>Em risco de ruptura</span>
          <strong>{ruptureCount}</strong>
          <small>Saldo projetado negativo na chegada</small>
        </div>
        <div className="stat">
          <span>Investimento estimado</span>
          <strong>{currency(investment)}</strong>
          <small>Valores editáveis desta sessão</small>
        </div>
      </div>
      {visibleItems.length ? (
        <div className="stock-grid">
          {visibleItems.map(({ item, projection }) => (
            <article className="panel stock-card" key={item.code}>
              <div className="card-line">
                {badge(
                  projection.arrival < 0
                    ? "Risco de ruptura"
                    : "Reposição sugerida",
                )}
                <small>{item.code}</small>
              </div>
              <h2>{item.name}</h2>
              <p>
                {item.warehouse} · Saldo: {item.quantity} · Consumo 30 dias:{" "}
                {item.consumed30} · Variação: {projection.growth > 0 ? "+" : ""}
                {projection.growth}%
              </p>
              <p>
                Prazo do fornecedor: {item.leadDays} dias · Saldo projetado na
                chegada: {projection.arrival}
              </p>
              <strong>Comprar {projection.buy} unidades</strong>
              <label className="purchase-cost">
                Valor de referência unitária (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={draftCosts[item.code] ?? String(item.estimatedCost)}
                  onChange={(event) =>
                    setDraftCosts((current) => ({
                      ...current,
                      [item.code]: event.target.value,
                    }))
                  }
                  onBlur={() => saveCost(item)}
                  aria-label={"Valor de referência unitária de " + item.name}
                />
              </label>
              <p className="purchase-estimate">
                Estimativa para {projection.buy} unidades:{" "}
                <strong>{currency(projection.buy * costFor(item))}</strong>
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel empty">
          <h3>Nenhuma compra no recorte</h3>
          <p>Altere os filtros para ver outras sugestões.</p>
          <button
            className="button secondary"
            onClick={() => {
              setSearch("");
              setWarehouse("Todos");
              setRisk("Todos");
            }}
          >
            Limpar filtros
          </button>
        </div>
      )}
    </>
  );
}
