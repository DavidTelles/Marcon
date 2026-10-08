"use client";
import type { DashboardReport } from "@/lib/dashboard-report";
import type { Role } from "@/lib/workspace-routes";
import { can } from "@/lib/permissions";
import { DistributionMap } from "./distribution-map";
import { TransferQueue } from "./transfer-queue";
import { PurchaseCard } from "./purchase-card";
import { StockNeeds } from "./stock-needs";
export function RecommendationCards({
  mode = "distribution",
  report,
  role,
  busy,
  onFilter,
  onPage,
  onTransfer,
  onReject,
  onBuy,
  onCritical,
}: {
  mode?: "purchase" | "distribution";
  report: DashboardReport;
  role: Role;
  busy: boolean;
  onFilter: (filter: string) => void;
  onPage: (page: number) => void;
  onTransfer: (transfer: DashboardReport["transfers"][number]) => void;
  onReject: (transfer: DashboardReport["transfers"][number]) => void;
  onBuy: (code: string, warehouse: string) => void;
  onCritical: () => void;
}) {
  const d = report.decisions,
    archived = ["analysis", "history"].includes(d.filter);
  const groups =
    mode === "distribution"
      ? [...new Set(d.cards.map((card) => card.row.warehouse))].map(
          (warehouse) => ({
            warehouse,
            cards: d.cards.filter((card) => card.row.warehouse === warehouse),
          }),
        )
      : [{ warehouse: null, cards: d.cards }];
  return (
    <section
      className="panel ops-panel decision-panel"
      aria-label={
        mode === "purchase" ? "Compras sugeridas" : "Recomendação de estoque"
      }
    >
      <div className="panel-head">
        <div>
          <h2>
            {mode === "purchase"
              ? "Compras sugeridas"
              : "Recomendação de estoque"}
          </h2>
          <p>
            {mode === "distribution"
              ? "Veja o que cada estoque deve receber, de onde retirar e como isso atende o consumo próximo. Revise e solicite a transferência."
              : "Veja o total a comprar por peça e abra o card para conferir quanto cada estoque precisa."}{" "}
            Sugestões não movimentam saldo.
          </p>
        </div>
      </div>
      <div className="decision-totals">
        <button
          onClick={() => onFilter(mode === "purchase" ? "buy" : "transfer")}
        >
          <strong>{mode === "purchase" ? d.purchases : d.transfers}</strong>
          <span>
            {mode === "purchase"
              ? "Posições com compra recomendada"
              : "Transferências recomendadas"}
          </span>
        </button>
        <button onClick={onCritical}>
          <strong>{d.criticalItems}</strong>
          <span>Itens abaixo do mínimo</span>
        </button>
        <button onClick={() => onFilter("action")}>
          <strong>{d.awaitingReview}</strong>
          <span>Sugestões aguardando aprovação</span>
        </button>
        {mode === "distribution" && (
          <div className="decision-needs-total">
            <strong>{d.needs.length}</strong>
            <span>Necessidades de reposição a revisar</span>
          </div>
        )}
      </div>
      <p className="decision-context">
        Contagem no escopo filtrado, antes da paginação. “Aguardando aprovação”
        indica propostas para sua confirmação, não uma nova etapa do fluxo.
        Risco de falta: disponível abaixo do mínimo cadastrado.
      </p>
      <p>
        Período: {report.methodology.period} · {report.scope} · Atualizado em{" "}
        {report.generatedAt}.
      </p>
      <label>
        Filtrar sugestões
        <select value={d.filter} onChange={(e) => onFilter(e.target.value)}>
          <option value="action">Ação necessária</option>
          {mode === "distribution" && (
            <option value="transfer">Transferir</option>
          )}
          {mode === "purchase" && <option value="buy">Comprar</option>}
          {mode === "distribution" && (
            <option value="analysis">Em análise / em andamento</option>
          )}
          <option value="insufficient">Sem dados suficientes</option>
          {mode === "distribution" && (
            <option value="history">Histórico</option>
          )}
          <option value="all">Todas as posições</option>
        </select>
      </label>
      {mode === "distribution" && (
        <p role="status">
          {report.mapVersion
            ? `Mapa publicado #${report.mapVersion}. Rotas por Dijkstra nos caminhos transitáveis; reposição conforme consumo dos blocos e setores próximos, preservando a cobertura da origem e o espaço do destino.`
            : "Os déficits identificados aparecem abaixo. Para calcular de qual estoque retirar e a rota por Dijkstra, publique a planta com blocos, almoxarifados e caminhos vinculados."}
        </p>
      )}
      {archived ? (
        <TransferQueue
          key={`${d.filter}:${report.filters.code}:${report.filters.warehouse}:${report.filters.block}:${report.filters.from}:${report.filters.to}`}
          mode={d.filter === "analysis" ? "analysis" : "history"}
          codeFilter={report.filters.code}
          warehouseFilter={report.filters.warehouse}
          blockFilter={report.filters.block}
          from={report.filters.from}
          to={report.filters.to}
        />
      ) : (
        <>
          {mode === "distribution" && (
            <StockNeeds
              key={JSON.stringify([
                report.filters.code,
                report.filters.warehouse,
                report.filters.block,
                report.filters.requester,
                report.filters.sector,
                report.filters.status,
                report.filters.priority,
              ])}
              needs={d.needs}
              role={role}
              pageSize={report.filters.pageSize}
            />
          )}
          {mode === "purchase" ? (
            <div className="decision-grid">
              {d.purchaseGroups.map((group) => (
                <PurchaseCard
                  key={JSON.stringify([group.code, group.unit])}
                  group={group}
                  report={report}
                  role={role}
                  busy={busy}
                  onBuy={onBuy}
                />
              ))}
            </div>
          ) : (
            <div className="decision-destinations">
              {groups.map((group) => (
                <section
                  className="decision-destination"
                  key={group.warehouse ?? "purchases"}
                  aria-label={
                    group.warehouse
                      ? `Reposição para ${group.warehouse}`
                      : "Sugestões de compra"
                  }
                >
                  {group.warehouse && (
                    <header className="decision-destination-heading">
                      <div>
                        <span>
                          {group.cards.some((card) => card.transfer)
                            ? "Estoque que deve receber"
                            : "Estoque analisado"}
                        </span>
                        <h3>{group.warehouse}</h3>
                      </div>
                      <p>
                        {new Set(group.cards.map((card) => card.row.code)).size}{" "}
                        materiais ·{" "}
                        {group.cards.filter((card) => card.transfer).length}{" "}
                        transferências nesta página
                      </p>
                    </header>
                  )}
                  <div className="decision-grid">
                    {group.cards.map(({ row: r, transfer: t, action }) => (
                      <article
                        className="decision-card"
                        key={`${action}:${r.code}:${r.warehouse}:${t?.from ?? ""}`}
                      >
                        <header>
                          <span className="dashboard-badge">
                            {action === "transfer"
                              ? r.available < r.configuredMinimum
                                ? "Reposição urgente"
                                : "Receber de outro estoque"
                              : action === "buy"
                                ? "Comprar"
                                : "Acompanhar"}
                          </span>
                          {group.warehouse ? (
                            <h4>{r.item}</h4>
                          ) : (
                            <h3>{r.item}</h3>
                          )}
                          <p>
                            {r.code} ·{" "}
                            <strong>
                              {action === "observe" && mode === "distribution"
                                ? "Sem transferência sugerida"
                                : `${t ? "Receber " : ""}${t?.quantity ?? r.buy} ${r.unit}${action === "observe" ? " a comprar" : t ? "" : " sugeridos"}`}
                            </strong>
                          </p>
                        </header>
                        <p className="decision-route">
                          {t ? (
                            <>
                              <span>
                                <small>Retirar de</small>
                                {t.from}
                              </span>
                              <span
                                className="decision-arrow"
                                aria-label="para"
                              >
                                →
                              </span>
                              <span>
                                <small>Entregar em</small>
                                {t.to}
                              </span>
                            </>
                          ) : (
                            <>Destino: {r.warehouse}</>
                          )}
                        </p>
                        {t && mode === "distribution" && (
                          <>
                            <div
                              className="decision-receipt"
                              aria-label="Saldo do destino antes e depois"
                            >
                              <span>
                                Disponível no destino
                                <strong>
                                  {t.evidence.destinationAvailable} {r.unit}
                                </strong>
                              </span>
                              <span
                                className="decision-arrow"
                                aria-hidden="true"
                              >
                                →
                              </span>
                              <span>
                                Após receber
                                <strong>
                                  {t.evidence.destinationAvailable + t.quantity}{" "}
                                  {r.unit}
                                </strong>
                              </span>
                              <small>
                                Alvo de cobertura:{" "}
                                {t.evidence.destinationTarget} {r.unit}.
                                Entradas já previstas:{" "}
                                {t.evidence.destinationIncoming} {r.unit}.
                              </small>
                            </div>
                            <dl
                              className="decision-impact"
                              aria-label="Consumo, espaço e rota"
                            >
                              <div>
                                <dt>Consumo próximo</dt>
                                <dd>
                                  {r.analysis.daily.toLocaleString("pt-BR", {
                                    maximumFractionDigits: 2,
                                  })}{" "}
                                  {r.unit}/dia
                                </dd>
                                <small>{r.analysis.days} dias observados</small>
                              </div>
                              <div>
                                <dt>Libera na origem</dt>
                                <dd>
                                  {t.quantity} {r.unit}
                                </dd>
                                <small>Ao concluir a saída física</small>
                              </div>
                              <div>
                                <dt>Espaço após receber</dt>
                                <dd>
                                  {t.evidence.destinationSpaceAfter === null
                                    ? "A confirmar"
                                    : `${t.evidence.destinationSpaceAfter} ${r.unit}`}
                                </dd>
                                <small>
                                  {t.evidence.destinationCapacity === null
                                    ? "Cadastre a capacidade desta peça"
                                    : `Capacidade desta peça: ${t.evidence.destinationCapacity} ${r.unit}`}
                                </small>
                              </div>
                              <div>
                                <dt>Rota mais curta</dt>
                                <dd>
                                  {t.evidence.route
                                    ? `${t.evidence.route.cost.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${t.evidence.route.unit ?? "unidades do mapa"}`
                                    : "Indisponível"}
                                </dd>
                                <small>Por caminhos da planta publicada</small>
                              </div>
                            </dl>
                            {t.evidence.destinationCapacity !== null &&
                              t.evidence.destinationCapacity > 0 && (
                                <div className="decision-occupancy">
                                  <label>
                                    Ocupação prevista desta peça:{" "}
                                    {t.evidence.destinationPhysicalAfter +
                                      t.evidence.destinationIncoming}{" "}
                                    / {t.evidence.destinationCapacity} {r.unit}
                                    <meter
                                      min={0}
                                      max={t.evidence.destinationCapacity}
                                      value={
                                        t.evidence.destinationPhysicalAfter +
                                        t.evidence.destinationIncoming
                                      }
                                      aria-label={`Ocupação prevista de ${r.code} em ${t.to}`}
                                    />
                                  </label>
                                  <small>
                                    Inclui saldo físico, recebimento sugerido e
                                    entradas já previstas.
                                  </small>
                                </div>
                              )}
                          </>
                        )}
                        <p>
                          {t
                            ? t.evidence.nearbyConsumption?.length
                              ? `Atende: ${t.evidence.nearbyConsumption.map((c) => `${c.block} · ${c.sector}: ${c.quantity} ${r.unit} no período`).join("; ")}.`
                              : `Sem retiradas observadas nos blocos atendidos. ${t.reason}`
                            : action === "buy"
                              ? "Necessidade remanescente após saldo disponível, entradas e transferências possíveis."
                              : mode === "distribution"
                                ? "Nenhuma transferência segura foi encontrada com os dados atuais. Revise o consumo, a capacidade e os vínculos na planta."
                                : "Sem compra ou transferência sugerida com os dados atuais."}
                        </p>
                        {t && (
                          <div
                            className="decision-balance"
                            aria-label="Saldo disponível da origem antes e depois"
                          >
                            <span>
                              Disponível projetado na origem
                              <br />
                              <strong>
                                {t.evidence.sourceAvailable} {r.unit}
                              </strong>
                            </span>
                            <span
                              className="decision-arrow"
                              aria-label="após transferência"
                            >
                              →
                            </span>
                            <span>
                              Após transferência
                              <br />
                              <strong>
                                {t.evidence.sourceAvailable - t.quantity}{" "}
                                {r.unit}
                              </strong>
                            </span>
                            <small>
                              Mínimo recomendado na origem:{" "}
                              {t.evidence.sourceMinimum} {r.unit}. Reservado:{" "}
                              {t.evidence.sourceReserved} {r.unit}. Alvo de
                              cobertura protegido: {t.evidence.sourceTarget}{" "}
                              {r.unit}. Projeção considerando as sugestões
                              anteriores deste relatório, sem alteração de
                              saldo.
                            </small>
                          </div>
                        )}
                        <p>
                          Destino: disponível {r.available} {r.unit} · mínimo
                          cadastrado {r.configuredMinimum} {r.unit}.
                        </p>
                        <p className="decision-confidence">
                          Confiança: {r.analysis.confidence}.{" "}
                          {r.analysis.confidence === "Dados insuficientes" &&
                            `São ${r.analysis.days} dias observáveis; não há histórico suficiente para validar a previsão. `}
                          {mode === "distribution" &&
                            !report.mapVersion &&
                            "Falta mapa publicado válido para comprovar proximidade e rota."}
                        </p>
                        <details className="decision-calculation">
                          <summary>Ver cálculo e dados</summary>
                          <dl>
                            {mode === "distribution" && (
                              <>
                                <dt>Consumo sem acesso mapeado</dt>
                                <dd>
                                  {r.distribution?.unmappedConsumption ?? 0}{" "}
                                  {r.unit} neste item. Vincule os blocos e
                                  locais no mapa para incluir essas retiradas.
                                </dd>
                              </>
                            )}
                            <dt>Período e atualização</dt>
                            <dd>
                              {report.methodology.period} · {report.generatedAt}
                            </dd>
                            <dt>Entradas / retiradas / devoluções</dt>
                            <dd>
                              Entradas: {r.entries} {r.unit}; retiradas
                              efetivas: {r.withdrawals} {r.unit}; devoluções:{" "}
                              {r.returns} {r.unit}.
                            </dd>
                            <dt>Estoque do destino</dt>
                            <dd>
                              Físico: {r.physical}; reservado: {r.reserved};
                              disponível: {r.available}; mínimo sugerido:{" "}
                              {r.minimum}; alvo: {r.target} {r.unit}.
                              {mode === "distribution" &&
                                r.distribution?.idealTarget !== undefined &&
                                r.distribution.idealTarget > r.target &&
                                ` O saldo da rede é insuficiente para o alvo ideal de ${r.distribution.idealTarget} ${r.unit}; a cobertura foi dividida proporcionalmente ao consumo, preservando os mínimos.`}
                            </dd>
                            <dt>Previsão e prazo</dt>
                            <dd>
                              {r.forecast} {r.unit} em {r.leadDays} dias.
                              Entradas confirmadas: {r.incoming} {r.unit}.
                            </dd>
                            <dt>
                              {mode === "distribution"
                                ? "Reposição no destino"
                                : "Comprar / transferir"}
                            </dt>
                            <dd>
                              {mode === "distribution"
                                ? "Ainda não coberto pela rede"
                                : "Comprar"}
                              : {r.buy} {r.unit}; transferências sugeridas:{" "}
                              {r.transfer} {r.unit}.
                            </dd>
                            <dt>Método e validação</dt>
                            <dd>
                              {r.analysis.method}. {r.analysis.reason} MAE:{" "}
                              {r.analysis.mae?.toFixed(2) ?? "não validado"};
                              WAPE:{" "}
                              {r.analysis.wape === null
                                ? "não validado"
                                : `${(r.analysis.wape * 100).toFixed(1)}%`}
                              .
                            </dd>
                            <dt>Origem dos dados</dt>
                            <dd>
                              {report.methodology.source}{" "}
                              {t?.evidence.proximity ??
                                r.distribution?.proximity}
                            </dd>
                          </dl>
                          {t && (
                            <p>
                              Cobertura na origem:{" "}
                              {t.evidence.sourceCoverageBefore?.toFixed(1) ??
                                "indeterminada"}{" "}
                              →{" "}
                              {t.evidence.sourceCoverageAfter?.toFixed(1) ??
                                "indeterminada"}{" "}
                              dias; destino:{" "}
                              {t.evidence.destinationCoverageBefore?.toFixed(
                                1,
                              ) ?? "indeterminada"}{" "}
                              →{" "}
                              {t.evidence.destinationCoverageAfter?.toFixed(
                                1,
                              ) ?? "indeterminada"}{" "}
                              dias. Conversão cadastrada: {t.evidence.packSize}{" "}
                              {r.unit} por caixa; fracionamento em unidades
                              inteiras permitido pelo fluxo atual.
                            </p>
                          )}
                          {r.capacity === null && (
                            <p>
                              Capacidade deste material no destino não
                              cadastrada; confirme espaço físico na revisão. Não
                              há estimativa de volume compartilhado.
                            </p>
                          )}
                          <p>
                            {mode === "distribution"
                              ? "Déficit restante"
                              : "Compra sugerida"}
                            : alvo {r.target} − disponível {r.available} −
                            entradas {r.incoming} − transferências sugeridas{" "}
                            {r.transfer} − transferências pendentes{" "}
                            {r.distribution?.pendingIncoming ?? 0}, limitada a
                            zero = {r.buy} {r.unit}.
                          </p>
                          {t && (
                            <p>
                              {t.benefit} Alvo da origem:{" "}
                              {t.evidence.sourceTarget} {r.unit}; transferências
                              pendentes no destino:{" "}
                              {t.evidence.pendingIncoming ?? 0} {r.unit}.
                            </p>
                          )}
                        </details>
                        <div className="decision-actions">
                          {t && can(role, "stock") && (
                            <>
                              <button
                                className="button primary"
                                disabled={busy}
                                onClick={() => onTransfer(t)}
                              >
                                Solicitar transferência sugerida
                              </button>
                              <button
                                className="button secondary"
                                disabled={busy}
                                onClick={() => onReject(t)}
                              >
                                Rejeitar sugestão
                              </button>
                            </>
                          )}
                          {action === "buy" && can(role, "planning") && (
                            <button
                              className="button secondary"
                              onClick={() => onBuy(r.code, r.warehouse)}
                            >
                              Revisar compra e exportar
                            </button>
                          )}
                        </div>
                        {t && report.mapVersion && (
                          <DistributionMap
                            key={`${report.mapVersion}:${t.from}:${t.to}`}
                            version={report.mapVersion}
                            from={t.from}
                            to={t.to}
                            fromNode={t.evidence.route?.nodes[0]}
                            toNode={t.evidence.route?.nodes.at(-1)}
                          />
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
          {!(mode === "purchase"
            ? d.purchaseGroups.length
            : d.cards.length) && (
            <p role="status">
              {mode === "distribution" && d.needs.length
                ? "Nenhuma transferência validada corresponde a este filtro. Confira as necessidades de reposição acima e os dados pendentes em cada card."
                : "Nenhuma sugestão corresponde a este filtro. Revise o período ou selecione todas as posições."}
            </p>
          )}
          <nav className="head-actions" aria-label="Paginação das sugestões">
            <button
              className="button secondary"
              disabled={d.page <= 1}
              onClick={() => onPage(d.page - 1)}
            >
              Sugestões anteriores
            </button>
            <span>
              Página {d.page} · {d.total} cartões
            </span>
            <button
              className="button secondary"
              disabled={d.page * report.filters.pageSize >= d.total}
              onClick={() => onPage(d.page + 1)}
            >
              Mais sugestões
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
