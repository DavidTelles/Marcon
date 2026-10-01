"use client";

import { useState } from "react";
import type { DashboardReport } from "@/lib/dashboard-report";

export function itemColor(code: string) {
  let hash = 0;
  for (const char of code) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${(hash * 137.508) % 360} 58% 43%)`;
}

export function StockComposition({ rows, onWarehouse, onItem }: {
  rows: DashboardReport["stockByItem"];
  onWarehouse?: (warehouse: string) => void;
  onItem?: (code: string) => void;
}) {
  const units = [...new Set(rows.map((row) => row.unit))];
  const [selectedUnit, setSelectedUnit] = useState("");
  const unit = units.includes(selectedUnit) ? selectedUnit : units[0];
  const available = rows.filter((row) => row.unit === unit && row.available > 0);
  const locations = new Map<string, typeof available>();
  const items = new Map<string, { code: string; item: string; quantity: number }>();
  for (const row of available) {
    const group = locations.get(row.warehouse) ?? [];
    group.push(row);
    locations.set(row.warehouse, group);
    const item = items.get(row.code) ?? { code: row.code, item: row.item, quantity: 0 };
    item.quantity += row.available;
    items.set(row.code, item);
  }
  const totals = [...locations].map(([warehouse, parts]) => ({
    warehouse, parts, total: parts.reduce((sum, row) => sum + row.available, 0),
  }));
  const maximum = Math.max(1, ...totals.map((row) => row.total));
  return (
    <article className="panel ops-panel dashboard-composition">
      <div className="panel-head"><div>
        <h2>Peças disponíveis por almoxarifado</h2>
        <p>Cada cor representa uma peça que pode ser requisitada. Selecione um local ou uma peça para consultar.</p>
      </div></div>
      {units.length > 1 && <label>Unidade das peças
        <select value={unit} onChange={(event) => setSelectedUnit(event.target.value)}>
          {units.map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>}
      {totals.length ? <>
        <div className="dashboard-composition-bars">
          {totals.map(({ warehouse, parts, total }) => (
            <button type="button" className="dashboard-chart-choice" key={warehouse}
              disabled={!onWarehouse} onClick={() => onWarehouse?.(warehouse)}>
              <span>{warehouse}</span><strong>{total.toLocaleString("pt-BR")} {unit}</strong>
              <span className="dashboard-stock-track" aria-hidden="true">
                {parts.map((row) => <i key={row.code} title={`${row.item}: ${row.available} ${unit}`}
                  style={{ background: itemColor(row.code), width: `${row.available / maximum * 100}%` }} />)}
              </span>
              <small>{parts.map((row) => `${row.item}: ${row.available.toLocaleString("pt-BR")} ${unit}`).join(" · ")}</small>
            </button>
          ))}
        </div>
        <div className="dashboard-piece-legend" aria-label="Legenda das peças disponíveis">
          {[...items.values()].sort((a, b) => a.code.localeCompare(b.code)).map((row) => (
            <button type="button" key={row.code} disabled={!onItem} onClick={() => onItem?.(row.code)}>
              <i aria-hidden="true" style={{ background: itemColor(row.code) }} />
              <span>{row.item}<small>{row.code}</small></span>
              <strong>{row.quantity.toLocaleString("pt-BR")} {unit}</strong>
            </button>
          ))}
        </div>
      </> : <p className="dashboard-empty">Nenhuma peça disponível para requisição nesta unidade e nos locais selecionados.</p>}
    </article>
  );
}
