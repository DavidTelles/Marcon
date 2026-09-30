"use client";

import { useState } from "react";
import { useDemoStore } from "../demo-store";
import { WAREHOUSES } from "@/lib/inventory";

export function StockMovementHistory() {
  const { stock, movements, transfers } = useDemoStore();
  const [warehouse, setWarehouse] = useState("Todos");
  const [query, setQuery] = useState("");
  const rows = movements.filter((item) => (warehouse === "Todos" || item.warehouse === warehouse) &&
    (item.partCode + (stock.find((part) => part.code === item.partCode)?.name ?? "")).toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return <section className="panel stock-history"><div className="panel-head"><div><h2>Histórico de estoque</h2><p>Entradas, saídas e transferências por almoxarifado.</p></div></div>
    <div className="filter-grid"><label>Almoxarifado<select value={warehouse} onChange={(event) => setWarehouse(event.target.value)}><option>Todos</option>{WAREHOUSES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Peça ou ID<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar peça" /></label></div>
    <div className="stock-history-list">{rows.length ? rows.map((item) => {
      const transfer = item.transferId ? transfers.find((row) => row.id === item.transferId) : undefined;
      return <article key={item.id} className="stock-history-row"><span className={item.type === "saida" ? "movement-type exit" : "movement-type entry"}>{item.type === "saida" ? "Saída" : "Entrada"}</span><div><strong>{stock.find((part) => part.code === item.partCode)?.name ?? item.partCode}</strong><small>{item.partCode} · {item.warehouse} · {item.date}</small>{transfer && <small>Transferência #{transfer.id}: {transfer.from} → {transfer.to} · QR/ID {transfer.qrCode}</small>}{item.requester && <small>Requisitante: {item.requester} · {item.block}</small>}</div><strong>{item.quantity} un.</strong></article>;
    }) : <p>Nenhuma movimentação encontrada.</p>}</div>
  </section>;
}
