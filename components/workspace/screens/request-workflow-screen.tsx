"use client";
import { Fragment, useState } from "react";
import type { Role } from "@/lib/workspace-routes";
import { useDemoStore } from "../demo-store";
import { heading, badge } from "../ui";
import { RequestOperations } from "../operations/request-operations";
import { DashboardDialog } from "../operations/dashboard-dialog";
import styles from "./workflow.module.css";

export function RequestWorkflowScreen({
  role,
  history = false,
  compact = false,
}: {
  role: Role;
  history?: boolean;
  compact?: boolean;
}) {
  const { requests, accountId } = useDemoStore();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todas");
  const [priority, setPriority] = useState("");
  const [block, setBlock] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const rows = requests.filter((r) =>
    history
      ? r.status === "Entregue"
      : role === "almoxarifado"
        ? [
            "Aprovada",
            "Em separação",
            "Em entrega",
            "Cancelamento solicitado",
          ].includes(r.status)
        : r.status !== "Entregue",
  );
  const shown = rows
    .filter(
      (r) =>
        (status === "Todas" || r.status === status) &&
        (!priority || r.priority === priority) &&
        (!block || r.block === block) &&
        (!warehouse ||
          r.allocations?.some(
            (allocation) => allocation.warehouse === warehouse,
          )) &&
        `${r.id} ${r.material} ${r.code} ${r.person} ${r.block}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      history
        ? new Date(b.deliveredAt ?? b.createdAt ?? 0).getTime() -
            new Date(a.deliveredAt ?? a.createdAt ?? 0).getTime() || b.id - a.id
        : { Urgente: 0, Moderado: 1, Leve: 2 }[a.priority] -
            { Urgente: 0, Moderado: 1, Leve: 2 }[b.priority] || b.id - a.id,
    );
  const selected = requests.find((r) => r.id === selectedId);
  const title = history
    ? "Histórico geral de entregas"
    : role === "lider"
      ? "Solicitações do bloco"
      : role === "funcionario"
        ? "Meus pedidos"
        : "Requisições para atendimento";
  return (
    <>
      {compact ? (
        <h2 id="meus-pedidos">{title}</h2>
      ) : (
        heading(
          history ? "ENTREGAS CONCLUÍDAS" : "OPERAÇÃO",
          title,
          history
            ? "Entregas concluídas de todos os blocos e locais. Use os filtros para consultar o atendimento."
            : role === "lider"
              ? "Analise o pedido, o padrão de consumo e a justificativa antes de aprovar ou rejeitar."
              : "Assuma o atendimento, confira a retirada e confirme a entrega no destino.",
        )
      )}
      {!history && !compact && (
        <div className={styles.summary} aria-label="Prioridades de atendimento">
          {["Urgente", "Moderado", "Leve"].map((value) => (
            <button
              key={value}
              className={styles[`priority${value}`]}
              aria-pressed={priority === value}
              onClick={() => setPriority(priority === value ? "" : value)}
            >
              <strong>{value}</strong>
              <span>
                {rows.filter((row) => row.priority === value).length} pedidos
              </span>
            </button>
          ))}
        </div>
      )}
      {!history && role === "lider" && (
        <div className={styles.summary}>
          {[
            "Pendente",
            "Em análise",
            "Aprovada",
            "Em separação",
            "Em entrega",
            "Rejeitada",
          ].map((s) => (
            <button
              key={s}
              aria-pressed={status === s}
              onClick={() => setStatus(status === s ? "Todas" : s)}
            >
              <span>{s}</span>
              <strong>{rows.filter((r) => r.status === s).length}</strong>
            </button>
          ))}
        </div>
      )}
      <section className="panel">
        <div className={styles.filters}>
          <label>
            Buscar pedido
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Material, matrícula, solicitante ou número"
            />
          </label>
          <label>
            Situação
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option>Todas</option>
              {[...new Set(rows.map((r) => r.status))].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <span>{shown.length} pedidos</span>
          {history && (
            <>
              <label>
                Bloco
                <select
                  value={block}
                  onChange={(event) => setBlock(event.target.value)}
                >
                  <option value="">Todos os blocos</option>
                  {[...new Set(rows.map((row) => row.block))]
                    .sort()
                    .map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                </select>
              </label>
              <label>
                Local de retirada
                <select
                  value={warehouse}
                  onChange={(event) => setWarehouse(event.target.value)}
                >
                  <option value="">Todos os locais</option>
                  {[
                    ...new Set(
                      rows.flatMap(
                        (row) =>
                          row.allocations?.map(
                            (allocation) => allocation.warehouse,
                          ) ?? [],
                      ),
                    ),
                  ]
                    .sort()
                    .map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                </select>
              </label>
            </>
          )}
        </div>
        <div className={styles.cards}>
          {shown.map((r, index) => (
            <Fragment key={r.id}>
              {!history &&
                !compact &&
                (index === 0 || shown[index - 1].priority !== r.priority) && (
                  <h2 className={styles.priorityGroup}>
                    {r.priority} ·{" "}
                    {shown.filter((row) => row.priority === r.priority).length}{" "}
                    pedidos
                  </h2>
                )}
              <article
                data-request-id={r.id}
                data-priority={r.priority}
                className={styles.card}
              >
                <div className={styles.cardTop}>
                  <strong>#{r.id}</strong>
                  {badge(r.status)}
                  <strong
                    className={`${styles.priority} ${styles[`priority${r.priority}`]}`}
                  >
                    {r.priority}
                  </strong>
                </div>
                <h2>{r.material}</h2>
                <p>
                  {r.code} · {r.quantity} peças
                  {r.requestedUnit === "box" &&
                    ` (${r.requestedAmount} caixas de ${r.packSizeAtRequest})`}
                </p>
                <p>
                  {r.person} · {r.block} · {r.sector || "Setor não informado"}
                </p>
                {r.anomaly?.unusual && (
                  <div className={styles.anomaly}>
                    <strong>Pedido fora do padrão</strong>
                    {r.anomaly.reasons.map((reason) => (
                      <p key={reason}>{reason}</p>
                    ))}
                    <p>
                      <strong>Justificativa:</strong>{" "}
                      {r.justification || "Não registrada no pedido legado"}
                    </p>
                  </div>
                )}
                {!r.anomaly?.unusual && r.justification && (
                  <p>
                    <strong>Justificativa:</strong> {r.justification}
                  </p>
                )}
                {r.status === "Rejeitada" && (
                  <p>
                    <strong>Motivo da rejeição:</strong> {r.cancellationReason}
                  </p>
                )}
                {r.allocations?.map((a) => (
                  <p key={a.warehouse}>
                    {r.pickedAt
                      ? "Retirada registrada"
                      : "Retirada recomendada"}
                    : {a.warehouse} · {a.location} · {a.quantity} peças
                  </p>
                ))}
                {r.fulfilledBy && (
                  <p>
                    {r.fulfilledBy === accountId
                      ? "Atendimento assumido por você"
                      : `Responsável: matrícula ${r.fulfilledBy}`}
                  </p>
                )}
                {r.deliveredAt && (
                  <p>
                    Entregue em{" "}
                    {new Date(r.deliveredAt).toLocaleString("pt-BR")}
                  </p>
                )}
                <button
                  className="button primary"
                  onClick={() => setSelectedId(r.id)}
                >
                  {history
                    ? "Ver entrega"
                    : role === "lider"
                      ? "Analisar solicitação"
                      : role === "funcionario"
                        ? "Ver meu pedido"
                        : "Abrir atendimento"}
                </button>
              </article>
            </Fragment>
          ))}
        </div>
        {!shown.length && (
          <p className={styles.empty}>
            {history
              ? "Nenhuma entrega concluída neste perfil."
              : "Nenhum pedido nesta situação."}
          </p>
        )}
      </section>
      <DashboardDialog
        open={Boolean(selected)}
        title={`Requisição #${selectedId ?? ""}`}
        onClose={() => setSelectedId(null)}
      >
        {selected && (
          <>
            <h3>{selected.material}</h3>
            <p>
              Entregar no {selected.block} · setor{" "}
              {selected.sector || "não informado"} · solicitante{" "}
              {selected.person}
            </p>
            {history ? (
              <div className="ops-actions">
                <p>
                  {selected.quantity} peças · Prioridade:{" "}
                  <strong>{selected.priority}</strong>
                </p>
                <p>
                  Entregue em{" "}
                  {selected.deliveredAt
                    ? new Date(selected.deliveredAt).toLocaleString("pt-BR")
                    : "Data não registrada"}
                </p>
                <p>
                  Justificativa: {selected.justification || "Não informada"}
                </p>
                {selected.allocations?.map((allocation) => (
                  <p key={allocation.warehouse}>
                    {allocation.quantity} peças retiradas de{" "}
                    {allocation.warehouse} · {allocation.location}
                  </p>
                ))}
              </div>
            ) : (
              <RequestOperations
                key={selected.id}
                id={selected.id}
                role={role}
                request={selected}
              />
            )}
          </>
        )}
      </DashboardDialog>
    </>
  );
}
