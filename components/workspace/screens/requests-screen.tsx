"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ScanLine } from "lucide-react";
import { heading, badge } from "../ui";
import type { Request } from "@/lib/demo-data";
import type { Role, Page } from "@/lib/workspace-routes";
import { CodeScanner } from "../operations/code-scanner";

type Props = {
  role: Role;
  page: Page;
  current: { name: string };
  active: { label: string };
  requestRows: Request[];
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  statusFilter: string;
  setStatusFilter: React.Dispatch<React.SetStateAction<string>>;
  qrCode: string;
  setQrCode: React.Dispatch<React.SetStateAction<string>>;
  exportCsv: (rows: Request[]) => void;
  updateStatus: (id: number, status: Request["status"]) => Promise<boolean>;
  setDetail: React.Dispatch<React.SetStateAction<Request | null>>;
  allowedStatuses: (item: Request) => Request["status"][];
  requestCard: (item: Request) => React.ReactNode;
};

const isoDate = (value: string) =>
  value.includes("/") ? value.split("/").reverse().join("-") : value;

export function RequestsScreen({
  role,
  page,
  current,
  active,
  requestRows,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  qrCode,
  setQrCode,
  exportCsv,
  updateStatus,
  setDetail,
  allowedStatuses,
  requestCard,
}: Props) {
  const [requester, setRequester] = useState("");
  const [piece, setPiece] = useState("");
  const [block, setBlock] = useState("Todos");
  const [anomaly, setAnomaly] = useState("Todas");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState(
    page === "requisicoes" && role === "almoxarifado" ? "priority" : "recent",
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const warehouseQueue = role === "almoxarifado" && page === "requisicoes";
  const blocks = ["Todos", ...new Set(requestRows.map((item) => item.block))];
  const visibleRows = useMemo(
    () =>
      requestRows
        .filter((item) => {
          const unusual =
            Boolean(item.justification) || item.priority === "Urgente";
          const text = (value: string, query: string) =>
            value
              .toLocaleLowerCase("pt-BR")
              .includes(query.toLocaleLowerCase("pt-BR"));
          return (
            text(item.person, requester) &&
            text(item.material + " " + (item.code ?? ""), piece) &&
            (block === "Todos" || item.block === block) &&
            (anomaly === "Todas" ||
              (anomaly === "Com anormalidade") === unusual) &&
            (!from || isoDate(item.date) >= from) &&
            (!to || isoDate(item.date) <= to)
          );
        })
        .sort((a, b) =>
          sort === "oldest"
            ? isoDate(a.date).localeCompare(isoDate(b.date))
            : sort === "smallest"
              ? a.quantity - b.quantity
              : sort === "largest"
                ? b.quantity - a.quantity
                : sort === "priority"
                  ? { Urgente: 0, Moderado: 1, Leve: 2 }[a.priority] -
                    { Urgente: 0, Moderado: 1, Leve: 2 }[b.priority]
                  : isoDate(b.date).localeCompare(isoDate(a.date)),
        ),
    [requestRows, requester, piece, block, anomaly, from, to, sort],
  );
  const selected = visibleRows.find((item) => item.id === selectedId);

  function clearFilters() {
    setSearch("");
    setStatusFilter("Todas");
    setRequester("");
    setPiece("");
    setBlock("Todos");
    setAnomaly("Todas");
    setFrom("");
    setTo("");
    setSort(warehouseQueue ? "priority" : "recent");
  }

  return (
    <>
      {heading(
        current.name.toUpperCase(),
        active.label,
        warehouseQueue
          ? "Separe pedidos aprovados, confira o QR da embalagem e confirme a entrega."
          : "Consulte e filtre as requisições deste perfil.",
      )}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>
              {role === "funcionario" ? "Fila de requisições" : page === "historico"
                ? "Histórico de requisições"
                : "Requisições"}
            </h2>
            <p>
              {warehouseQueue
                ? "Pedidos aprovados para separação. Urgentes aparecem primeiro na ordenação por prioridade."
                : "Registros e detalhes dos pedidos."}
            </p>
          </div>
          <div className="head-actions">
            <span className="count">{visibleRows.length} registros</span>
            <button
              className="button secondary"
              onClick={() => exportCsv(visibleRows)}
            >
              Planilha CSV
            </button>
            <button className="button secondary" onClick={() => window.print()}>
              PDF / imprimir
            </button>
          </div>
        </div>
        <details className="request-table-filters" open={role !== "funcionario"}>
        <summary>Filtrar e organizar pedidos</summary>
        <div className="filter-grid request-filter-grid">
          <label>
            Busca geral
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Peça, pessoa ou número"
            />
          </label>
          <label>
            Solicitante
            <input
              value={requester}
              onChange={(event) => setRequester(event.target.value)}
              placeholder="Nome"
            />
          </label>
          <label>
            Peça
            <input
              value={piece}
              onChange={(event) => setPiece(event.target.value)}
              placeholder="Nome ou ID"
            />
          </label>
          <label>
            Bloco
            <select
              value={block}
              onChange={(event) => setBlock(event.target.value)}
            >
              {blocks.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Situação
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {[
                "Todas",
                "Pendente",
                "Em análise",
                "Aprovada",
                "Entregue",
                "Cancelada",
              ].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Anormalidades
            <select
              value={anomaly}
              onChange={(event) => setAnomaly(event.target.value)}
            >
              {["Todas", "Com anormalidade", "Sem anormalidade"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Data inicial
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            Data final
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <label>
            Organizar
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="recent">Mais recente</option>
              <option value="oldest">Mais antigo</option>
              <option value="priority">Prioridade</option>
              <option value="smallest">Menor quantidade</option>
              <option value="largest">Maior quantidade</option>
            </select>
          </label>
        </div>
        <div className="filter-footer">
          <button className="link-button" onClick={clearFilters}>
            Limpar filtros
          </button>
        </div>
        </details>
        {warehouseQueue && selected && (
          <div className="fulfillment-panel">
            <div className="fulfillment-title">
              <ScanLine size={21} aria-hidden="true" />
              <div>
                <h3>Separação #{selected.id}</h3>
                <p>
                  {selected.person} · {selected.block} · {selected.priority}
                </p>
              </div>
            </div>
            {selected.justification && (
              <p className="alert-note">
                <strong>Justificativa de atipicidade:</strong>{" "}
                {selected.justification}
              </p>
            )}
            <label className="checklist-item">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => setChecked(event.target.checked)}
              />
              <span>
                <strong>{selected.material}</strong>
                <small>
                  {selected.quantity} unidades · ID{" "}
                  {selected.code ?? "não informado"}
                </small>
              </span>
            </label>
            <CodeScanner expectedCode={selected.code} onCode={setQrCode} onInvalid={() => setQrCode("")} />
            <label className="scan-input">
              QR / ID da embalagem
              <input
                value={qrCode}
                onChange={(event) => setQrCode(event.target.value)}
                placeholder="Escaneie ou digite o conteúdo do QR"
              />
            </label>
            <div className="fulfillment-actions">
              <button
                className="button primary"
                disabled={!checked || !qrCode.trim()}
                onClick={async () => {
                  if (await updateStatus(selected.id, "Entregue")) {
                    setSelectedId(null);
                    setChecked(false);
                  }
                }}
              >
                <CheckCircle2 size={17} aria-hidden="true" /> Confirmar entrega
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  setSelectedId(null);
                  setChecked(false);
                  setQrCode("");
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        )}
        {visibleRows.length ? (
          <>
            <div className="table-wrap">
              <table>
                <caption>{page === "historico" ? "Histórico de requisições" : "Requisições e situação atual"}</caption>
                <thead>
                  <tr>
                    <th scope="col">Número</th>
                    <th>Peça</th>
                    <th scope="col">Quantidade</th>
                    <th>Solicitante</th>
                    <th>Bloco</th>
                    <th>Data</th>
                    <th>Prioridade</th>
                    <th>Situação</th>
                    <th>Detalhes</th>
                    {(warehouseQueue ||
                      (role === "lider" && page !== "historico")) && (
                      <th>Ação</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((item) => (
                    <tr key={item.id}>
                      <td>#{item.id}</td>
                      <td>
                        <strong>{item.material}</strong>
                        <small>
                          {item.code || "Código não informado"}
                        </small>
                      </td>
                      <td>{item.quantity} un.</td>
                      <td>{item.person}</td>
                      <td>{item.block}</td>
                      <td>{item.date}</td>
                      <td>
                        {badge(item.priority)}{" "}
                        {item.justification && badge("Anormalidade")}
                      </td>
                      <td>{badge(item.status)}</td>
                      <td>
                        <button
                          className="link-button"
                          onClick={() => setDetail(item)}
                        >
                          Detalhes
                        </button>
                      </td>
                      {warehouseQueue ? (
                        <td>
                          <button
                            className="button secondary"
                            onClick={() => {
                              setSelectedId(item.id);
                              setChecked(false);
                              setQrCode("");
                            }}
                          >
                            Separar
                          </button>
                        </td>
                      ) : role === "lider" && page !== "historico" ? (
                        <td>
                          <label
                            className="sr-only"
                            htmlFor={"status-" + item.id}
                          >
                            Situação de {item.material}
                          </label>
                          <select
                            id={"status-" + item.id}
                            value={item.status}
                            onChange={(event) =>
                              updateStatus(
                                item.id,
                                event.target.value as Request["status"],
                              )
                            }
                          >
                            {allowedStatuses(item).map((status) => (
                              <option key={status}>{status}</option>
                            ))}
                          </select>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="request-cards">
              {visibleRows.map((item) => (
                <div key={item.id}>
                  {requestCard(item)}
                  {warehouseQueue && (
                    <button
                      className="button secondary mobile-separate"
                      onClick={() => {
                        setSelectedId(item.id);
                        setChecked(false);
                        setQrCode("");
                      }}
                    >
                      Separar pedido
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="empty">
            <h3>Nenhuma requisição encontrada</h3>
            <p>Altere os filtros para consultar outros registros.</p>
            <button className="button secondary" onClick={clearFilters}>
              Limpar filtros
            </button>
          </div>
        )}
      </section>
    </>
  );
}
