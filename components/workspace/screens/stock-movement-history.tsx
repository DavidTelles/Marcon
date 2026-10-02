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
    <div className="ops-scroll history-table" role="region" aria-label="Histórico de movimentações de estoque" tabIndex={0}><table><caption>Movimentações mais recentes primeiro</caption><thead><tr>{["Data", "Movimento", "Peça", "Quantidade", "Almoxarifado", "Requisitante / bloco", "Transferência"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{rows.map((item) => {
      const transfer = item.transferId ? transfers.find((row) => row.id === item.transferId) : undefined;
      return <tr key={item.id}><td data-label="Data">{item.date.split("-").reverse().join("/")}</td><td data-label="Movimento"><span className={item.type === "saida" ? "movement-type exit" : "movement-type entry"}>{item.type === "saida" ? "Saída" : "Entrada"}</span></td><td data-label="Peça"><strong>{stock.find((part) => part.code === item.partCode)?.name ?? item.partCode}</strong><small>{item.partCode}</small></td><td data-label="Quantidade">{item.quantity} un.</td><td data-label="Almoxarifado">{item.warehouse}</td><td data-label="Requisitante / bloco">{item.requester || "—"}<small>{item.block}</small></td><td data-label="Transferência">{transfer ? <>#{transfer.id}: {transfer.from} → {transfer.to}<small>QR/ID {transfer.qrCode}</small></> : "—"}</td></tr>;
    })}</tbody></table>{!rows.length && <p className="dashboard-empty">Nenhuma movimentação encontrada.</p>}</div>
  </section>;
}
