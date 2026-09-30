"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Download,
  FileText,
  TriangleAlert,
  X,
} from "lucide-react";
import type { Movement, Part, Request } from "@/lib/demo-data";
import { boxLabel } from "@/lib/packaging";
import { heading, badge } from "../ui";
import { useDemoStore } from "../demo-store";
import { WAREHOUSES, balanceOf } from "@/lib/inventory";

type DetailKind =
  | "entries"
  | "exits"
  | "anomalies"
  | "critical"
  | "requests"
  | "requested-parts"
  | "regular";

type Filters = {
  warehouse: string;
  part: string;
  block: string;
  requester: string;
  from: string;
  to: string;
  minimum: string;
  anomaly: string;
};
const defaultFilters: Filters = {
  warehouse: "Todos",
  part: "Todas",
  block: "Todos",
  requester: "",
  from: "",
  to: "",
  minimum: "",
  anomaly: "Todas",
};
const toIso = (date: string) =>
  date.includes("/") ? date.split("/").reverse().join("-") : date;
const total = (items: Movement[], type: Movement["type"]) =>
  items
    .filter((item) => (item.kind ? item.kind === type : item.type === type))
    .reduce((sum, item) => sum + item.quantity, 0);

function exportDashboard(rows: Movement[], stock: Part[], requests: Request[]) {
  const lines = [
    [
      "Tipo",
      "Peça",
      "Quantidade",
      "Data",
      "Almoxarifado",
      "Bloco",
      "Solicitante",
    ],
    ...rows.map((item) => [
      item.type,
      stock.find((part) => part.code === item.partCode)?.name ?? item.partCode,
      item.quantity,
      item.date,
      item.warehouse,
      item.block ?? "",
      item.requester ?? "",
    ]),
    [],
    ["Indicador", "Valor"],
    ["Requisições filtradas", requests.length],
    [
      "Peças requisitadas",
      requests.reduce((sum, item) => sum + item.quantity, 0),
    ],
    [
      "Pedidos com anormalidade",
      requests.filter((item) => Boolean(item.justification)).length,
    ],
  ];
  const csv = lines
    .map((line) => line.map((cell) => JSON.stringify(String(cell))).join(";"))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "marcon-dashboard-almoxarifado.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function WarehouseDashboard({
  stock,
  requests,
  movements,
}: {
  stock: Part[];
  requests: Request[];
  movements: Movement[];
}) {
  const { balances, persistent } = useDemoStore();
  const [filters, setFilters] = useState(defaultFilters);
  const [sort, setSort] = useState<"most" | "least">("most");
  const [detail, setDetail] = useState<DetailKind | null>(null);
  const warehouses = ["Todos", ...WAREHOUSES];
  const blocks = ["Todos", ...new Set(requests.map((item) => item.block))];
  const filteredMovements = useMemo(
    () =>
      movements.filter((item) => {
        const part = stock.find((piece) => piece.code === item.partCode);
        return (
          (filters.warehouse === "Todos" ||
            item.warehouse === filters.warehouse) &&
          (filters.part === "Todas" || item.partCode === filters.part) &&
          (filters.block === "Todos" || item.block === filters.block) &&
          (!filters.from || item.date >= filters.from) &&
          (!filters.to || item.date <= filters.to) &&
          (!filters.minimum || item.quantity >= Number(filters.minimum)) &&
          (!filters.requester ||
            (item.requester ?? "")
              .toLocaleLowerCase("pt-BR")
              .includes(filters.requester.toLocaleLowerCase("pt-BR"))) &&
          (!part || filters.part === "Todas" || part.code === filters.part)
        );
      }),
    [movements, stock, filters],
  );
  const filteredRequests = useMemo(
    () =>
      requests.filter((item) => {
        const date = toIso(item.date);
        const abnormal =
          Boolean(item.justification) || item.priority === "Urgente";
        return (
          (filters.part === "Todas" ||
            item.code === filters.part ||
            stock.find((part) => part.code === filters.part)?.name ===
              item.material) &&
          (filters.block === "Todos" || item.block === filters.block) &&
          (!filters.from || date >= filters.from) &&
          (!filters.to || date <= filters.to) &&
          (!filters.minimum || item.quantity >= Number(filters.minimum)) &&
          (!filters.requester ||
            item.person
              .toLocaleLowerCase("pt-BR")
              .includes(filters.requester.toLocaleLowerCase("pt-BR"))) &&
          (filters.anomaly === "Todas" ||
            (filters.anomaly === "Com anormalidade") === abnormal)
        );
      }),
    [requests, stock, filters],
  );
  const relevantStock = stock
    .filter((item) => filters.part === "Todas" || item.code === filters.part)
    .map((item) =>
      filters.warehouse === "Todos"
        ? item
        : {
            ...item,
            warehouse: filters.warehouse,
            quantity: balanceOf(
              balances,
              item.code,
              filters.warehouse as (typeof WAREHOUSES)[number],
            ),
            minimum: Math.max(
              2,
              Math.ceil(
                item.minimum / (filters.warehouse === "Central" ? 4 : 8),
              ),
            ),
          },
    );
  const pieceRows = relevantStock
    .map((item) => ({
      item,
      entries: total(
        filteredMovements.filter((movement) => movement.partCode === item.code),
        "entrada",
      ),
      exits: total(
        filteredMovements.filter((movement) => movement.partCode === item.code),
        "saida",
      ),
    }))
    .sort((a, b) => (sort === "most" ? b.exits - a.exits : a.exits - b.exits));
  const maxMovement = Math.max(
    1,
    ...pieceRows.map((item) => Math.max(item.entries, item.exits)),
  );
  const received = total(filteredMovements, "entrada");
  const dispatched = total(filteredMovements, "saida");
  const abnormalCount = filteredRequests.filter(
    (item) => Boolean(item.justification) || item.priority === "Urgente",
  ).length;
  const criticalParts = relevantStock.filter(
    (item) => item.quantity < item.minimum,
  );
  const critical = criticalParts.length;
  const abnormalRequests = filteredRequests.filter(
    (item) => Boolean(item.justification) || item.priority === "Urgente",
  );
  const detailTitle: Record<DetailKind, string> = {
    entries: "Peças recebidas",
    exits: "Peças retiradas",
    anomalies: "Pedidos com anormalidade",
    critical: "Peças abaixo do mínimo",
    requests: "Requisições dos blocos",
    "requested-parts": "Peças requisitadas",
    regular: "Pedidos regulares",
  };
  const detailMovements = filteredMovements.filter(
    (item) => item.type === (detail === "entries" ? "entrada" : "saida"),
  );
  const detailRequests =
    detail === "anomalies"
      ? abnormalRequests
      : detail === "regular"
        ? filteredRequests.filter((item) => !abnormalRequests.includes(item))
        : filteredRequests;
  const setFilter = (key: keyof Filters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));

  return (
    <>
      {heading(
        "ALMOXARIFADO",
        "Dashboard do almoxarifado",
        "Entradas, saídas, peças, estoque e requisições em uma visão filtrável.",
      )}
      <div className="dashboard-actions">
        <span className="demo-label">
          {persistent
            ? "Dados atualizados do sistema"
            : "Dados demonstrativos e alterações desta sessão"}
        </span>
        <button
          className="button secondary"
          onClick={() =>
            exportDashboard(filteredMovements, stock, filteredRequests)
          }
        >
          <Download size={16} aria-hidden="true" /> Planilha
        </button>
        <button className="button secondary" onClick={() => window.print()}>
          <FileText size={16} aria-hidden="true" /> PDF / imprimir
        </button>
      </div>
      <section
        className="panel warehouse-filters"
        aria-label="Filtros do dashboard"
      >
        <div className="panel-head">
          <div>
            <h2>Filtros de análise</h2>
            <p>Combine local, peça, bloco, requisitante, data e volume.</p>
          </div>
          <button
            className="link-button"
            onClick={() => setFilters(defaultFilters)}
          >
            Limpar filtros
          </button>
        </div>
        <div className="filter-grid">
          <label>
            Almoxarifado
            <select
              value={filters.warehouse}
              onChange={(event) => setFilter("warehouse", event.target.value)}
            >
              {warehouses.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Peça
            <select
              value={filters.part}
              onChange={(event) => setFilter("part", event.target.value)}
            >
              <option>Todas</option>
              {stock.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Bloco
            <select
              value={filters.block}
              onChange={(event) => setFilter("block", event.target.value)}
            >
              {blocks.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Requisitante
            <input
              value={filters.requester}
              onChange={(event) => setFilter("requester", event.target.value)}
              placeholder="Buscar nome"
            />
          </label>
          <label>
            Data inicial
            <input
              type="date"
              value={filters.from}
              onChange={(event) => setFilter("from", event.target.value)}
            />
          </label>
          <label>
            Data final
            <input
              type="date"
              min={filters.from || undefined}
              value={filters.to}
              onChange={(event) => setFilter("to", event.target.value)}
            />
          </label>
          <label>
            Quantidade mínima
            <input
              type="number"
              min="0"
              value={filters.minimum}
              onChange={(event) => setFilter("minimum", event.target.value)}
              placeholder="Qualquer"
            />
          </label>
          <label>
            Anormalidades
            <select
              value={filters.anomaly}
              onChange={(event) => setFilter("anomaly", event.target.value)}
            >
              <option>Todas</option>
              <option>Com anormalidade</option>
              <option>Sem anormalidade</option>
            </select>
          </label>
        </div>
      </section>
      <div className="stats warehouse-stats">
        <button
          type="button"
          className="stat dashboard-drilldown"
          onClick={() => setDetail("entries")}
        >
          <span className="stat-icon green">
            <ArrowDownRight size={20} aria-hidden="true" />
          </span>
          <span>Peças recebidas</span>
          <strong>{received}</strong>
          <small>
            {filteredMovements.filter((item) => item.type === "entrada").length}{" "}
            movimentações de entrada · Ver detalhes
          </small>
        </button>
        <button
          type="button"
          className="stat dashboard-drilldown"
          onClick={() => setDetail("exits")}
        >
          <span className="stat-icon blue">
            <ArrowUpRight size={20} aria-hidden="true" />
          </span>
          <span>Peças retiradas</span>
          <strong>{dispatched}</strong>
          <small>
            {filteredMovements.filter((item) => item.type === "saida").length}{" "}
            movimentações de saída · Ver detalhes
          </small>
        </button>
        <button
          type="button"
          className="stat dashboard-drilldown"
          onClick={() => setDetail("anomalies")}
        >
          <span className="stat-icon coral">
            <TriangleAlert size={20} aria-hidden="true" />
          </span>
          <span>Pedidos com anormalidade</span>
          <strong>{abnormalCount}</strong>
          <small>
            de {filteredRequests.length} requisições filtradas · Ver detalhes
          </small>
        </button>
        <button
          type="button"
          className="stat dashboard-drilldown is-critical"
          onClick={() => setDetail("critical")}
        >
          <span className="stat-icon coral">
            <Boxes size={20} aria-hidden="true" />
          </span>
          <span>Peças abaixo do mínimo</span>
          <strong>{critical}</strong>
          <small>
            de {relevantStock.length} peças no recorte · Ver detalhes
          </small>
        </button>
      </div>
      <section className="panel visual-panel">
        <div className="panel-head">
          <div>
            <h2>Onde estão as peças</h2>
            <p>
              Compare o saldo dos cinco almoxarifados. Toque em uma barra para
              filtrar o dashboard.
            </p>
          </div>
        </div>
        <div className="visual-bars">
          {WAREHOUSES.map((name) => {
            const amount = stock.reduce(
              (sum, part) => sum + balanceOf(balances, part.code, name),
              0,
            );
            const maximum = Math.max(
              1,
              ...WAREHOUSES.map((place) =>
                stock.reduce(
                  (sum, part) => sum + balanceOf(balances, part.code, place),
                  0,
                ),
              ),
            );
            return (
              <button
                className="visual-bar visual-bar-button"
                type="button"
                key={name}
                onClick={() => setFilter("warehouse", name)}
                aria-label={`Filtrar ${name}, ${amount} unidades`}
              >
                <span>{name}</span>
                <div className="metric-track">
                  <i
                    className={name === "Central" ? "entry" : "exit"}
                    style={{ width: `${(amount / maximum) * 100}%` }}
                  />
                </div>
                <strong>{amount} un.</strong>
              </button>
            );
          })}
        </div>
      </section>
      <div className="warehouse-panels">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Peças · entradas e saídas</h2>
              <p>Compare o movimento de cada peça no período selecionado.</p>
            </div>
            <label className="compact-select">
              Ordenar
              <select
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value as "most" | "least")
                }
              >
                <option value="most">Mais saídas</option>
                <option value="least">Menos saídas</option>
              </select>
            </label>
          </div>
          <div className="movement-list">
            {pieceRows.length ? (
              pieceRows.map(({ item, entries, exits }) => (
                <div className="movement-row" key={item.code}>
                  <div className="movement-heading">
                    <strong>{item.name}</strong>
                    <small>
                      {item.code} · {item.warehouse}
                    </small>
                  </div>
                  <div className="movement-bar">
                    <span>Entradas {entries}</span>
                    <div className="metric-track">
                      <i
                        className="entry"
                        style={{ width: (entries / maxMovement) * 100 + "%" }}
                      />
                    </div>
                  </div>
                  <div className="movement-bar">
                    <span>Saídas {exits}</span>
                    <div className="metric-track">
                      <i
                        className="exit"
                        style={{ width: (exits / maxMovement) * 100 + "%" }}
                      />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty">
                <h3>Nenhuma peça neste recorte</h3>
                <p>Altere os filtros para visualizar os movimentos.</p>
              </div>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Estoque por almoxarifado</h2>
              <p>Saldo, peças mais usadas e alertas de falta.</p>
            </div>
          </div>
          <div className="warehouse-stock-list">
            {relevantStock.length ? (
              relevantStock.map((item) => (
                <div
                  className={
                    "warehouse-stock-row" +
                    (item.quantity < item.minimum ? " is-critical" : "")
                  }
                  key={item.code}
                >
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.warehouse} · posição {item.location} ·{" "}
                      {boxLabel(item.quantity, item.packSize)}
                    </small>
                  </div>
                  <div>
                    <strong>{item.quantity} un.</strong>
                    {badge(
                      item.quantity < item.minimum ? "Crítico" : "Adequado",
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty">
                <h3>Sem peças encontradas</h3>
              </div>
            )}
          </div>
        </section>
      </div>
      <section className="panel request-overview">
        <div className="panel-head">
          <div>
            <h2>Requisições dos blocos</h2>
            <p>Volume, peças solicitadas e pedidos fora do padrão.</p>
          </div>
        </div>
        <div className="request-overview-grid">
          <button type="button" onClick={() => setDetail("requests")}>
            <strong>{filteredRequests.length}</strong>
            <span>requisições · Ver detalhes</span>
          </button>
          <button type="button" onClick={() => setDetail("requested-parts")}>
            <strong>
              {filteredRequests.reduce((sum, item) => sum + item.quantity, 0)}
            </strong>
            <span>peças requisitadas · Ver detalhes</span>
          </button>
          <button type="button" onClick={() => setDetail("anomalies")}>
            <strong>{abnormalCount}</strong>
            <span>com anormalidade · Ver detalhes</span>
          </button>
          <button type="button" onClick={() => setDetail("regular")}>
            <strong>{filteredRequests.length - abnormalCount}</strong>
            <span>regulares · Ver detalhes</span>
          </button>
        </div>
        <div className="request-preview">
          {filteredRequests.slice(0, 5).map((item) => (
            <div key={item.id}>
              <span>
                <strong>
                  #{item.id} · {item.material}
                </strong>
                <small>
                  {item.person} · {item.block} · {item.date}
                </small>
              </span>
              <span>
                {badge(item.priority)}{" "}
                {item.justification && badge("Anormalidade")}
              </span>
            </div>
          ))}
          {filteredRequests.length === 0 && (
            <p className="empty-note">
              Nenhuma requisição corresponde aos filtros.
            </p>
          )}
        </div>
      </section>
      {detail && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setDetail(null)}
        >
          <section
            className="detail-modal dashboard-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label={detailTitle[detail]}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") setDetail(null);
            }}
          >
            <button
              type="button"
              className="icon-button modal-close"
              aria-label="Fechar detalhes"
              onClick={() => setDetail(null)}
            >
              <X size={20} />
            </button>
            <p className="kicker">DASHBOARD · RECORTE ATUAL</p>
            <h2>{detailTitle[detail]}</h2>
            <p>Registros correspondentes aos filtros aplicados.</p>
            <div className="dashboard-detail-list">
              {(detail === "entries" || detail === "exits") &&
                (detailMovements.length ? (
                  detailMovements.map((item) => (
                    <article key={item.id}>
                      <strong>
                        {stock.find((part) => part.code === item.partCode)
                          ?.name ?? item.partCode}
                      </strong>
                      <span>
                        {item.quantity} un. · {item.date} · {item.warehouse}
                      </span>
                      <small>
                        {item.block ? item.block + " · " : ""}
                        {item.requester
                          ? "Solicitante: " + item.requester
                          : "Movimentação de estoque"}
                      </small>
                    </article>
                  ))
                ) : (
                  <p>Nenhuma movimentação neste recorte.</p>
                ))}
              {detail === "critical" &&
                (criticalParts.length ? (
                  criticalParts.map((item) => (
                    <article key={item.code}>
                      <strong>{item.name}</strong>
                      <span>
                        {item.code} · {item.warehouse} · posição {item.location}
                      </span>
                      <small>
                        Saldo: {item.quantity} un. · Mínimo: {item.minimum} un.
                        · Faltam {item.minimum - item.quantity} un.
                      </small>
                    </article>
                  ))
                ) : (
                  <p>Nenhuma peça abaixo do mínimo neste recorte.</p>
                ))}
              {["anomalies", "requests", "requested-parts", "regular"].includes(
                detail,
              ) &&
                (detailRequests.length ? (
                  detailRequests.map((item) => (
                    <article key={item.id}>
                      <strong>
                        #{item.id} · {item.material}
                      </strong>
                      <span>
                        {item.quantity} un. · {item.code ?? "Sem ID"} ·{" "}
                        {item.block}
                      </span>
                      <small>
                        Solicitante: {item.person} · {item.date} · {item.status}{" "}
                        · {item.priority}
                      </small>
                      {item.justification && (
                        <p className="alert-note">
                          <strong>Justificativa:</strong> {item.justification}
                        </p>
                      )}
                      {detail === "anomalies" && !item.justification && (
                        <small>Motivo: prioridade urgente.</small>
                      )}
                    </article>
                  ))
                ) : (
                  <p>Nenhuma requisição neste recorte.</p>
                ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
