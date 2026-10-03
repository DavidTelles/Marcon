"use client";
import type { DashboardReport } from "@/lib/dashboard-report";
import type { Role } from "@/lib/workspace-routes";
import { can } from "@/lib/permissions";
import { DistributionMap } from "./distribution-map";
import { TransferQueue } from "./transfer-queue";
const money = (value: number | null) =>
  value === null
    ? "Preço não informado"
    : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
            Revise a necessidade e escolha a ação. Sugestões não movimentam
            saldo.
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
            ? `Mapa publicado #${report.mapVersion}. Consumo sem vínculo ou caminho válido não gera transferência por proximidade.`
            : "Publique um mapa com blocos, almoxarifados e caminhos revisados para obter recomendações por proximidade. Sem mapa válido, use a movimentação manual."}
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
          <div className="decision-grid">
            {d.cards.map(({ row: r, transfer: t, action }) => (
              <article
                className="decision-card"
                key={`${action}:${r.code}:${r.warehouse}:${t?.from ?? ""}`}
              >
                <header>
                  <span className="dashboard-badge">
                    {action === "transfer"
                      ? "Transferir"
                      : action === "buy"
                        ? "Comprar"
                        : "Acompanhar"}
                  </span>
                  <h3>{r.item}</h3>
                  <p>
                    {r.code} ·{" "}
                    <strong>
                      {action === "observe" && mode === "distribution"
                        ? "Sem transferência sugerida"
                        : `${t?.quantity ?? r.buy} ${r.unit}${action === "observe" ? " a comprar" : " sugeridos"}`}
                    </strong>
                  </p>
                </header>
                <p className="decision-route">
                  {t ? (
                    <>
                      <span>{t.from}</span>
                      <span className="decision-arrow" aria-label="para">
                        →
                      </span>
                      <span>{t.to}</span>
                    </>
                  ) : (
                    <>Destino: {r.warehouse}</>
                  )}
                </p>
                <p>
                  {t
                    ? t.evidence.consumption?.length
                      ? `Consumo dos blocos atendidos: ${t.evidence.consumption.map((c) => `${c.block}, ${c.quantity} ${r.unit}`).join("; ")}. ${t.reason}`
                      : `Sem retiradas observadas nos blocos atendidos. ${t.reason}`
                    : action === "buy"
                      ? "Necessidade remanescente após saldo disponível, entradas e transferências possíveis."
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
                        {t.evidence.sourceAvailable - t.quantity} {r.unit}
                      </strong>
                    </span>
                    <small>
                      Mínimo recomendado na origem: {t.evidence.sourceMinimum}{" "}
                      {r.unit}. Reservado: {t.evidence.sourceReserved} {r.unit}.
                      Projeção considerando as sugestões anteriores deste relatório, sem alteração de saldo.
                    </small>
                  </div>
                )}
                <p>
                  Destino: disponível {r.available} {r.unit} · mínimo cadastrado{" "}
                  {r.configuredMinimum} {r.unit}.
                </p>
                <p className="decision-confidence">
                  Confiança: {r.analysis.confidence}.{" "}
                  {r.analysis.confidence === "Dados insuficientes" &&
                    `São ${r.analysis.days} dias observáveis; não há histórico suficiente para validar a previsão. `}
                  {!r.priceDate && "Falta data verificável do preço. "}
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
                          {r.distribution?.unmappedConsumption ?? 0} {r.unit}{" "}
                          neste item. Vincule os blocos e locais no mapa para
                          incluir essas retiradas.
                        </dd>
                      </>
                    )}
                    <dt>Período e atualização</dt>
                    <dd>
                      {report.methodology.period} · {report.generatedAt}
                    </dd>
                    <dt>Entradas / retiradas / devoluções</dt>
                    <dd>
                      Entradas: {r.entries} {r.unit}; retiradas efetivas:{" "}
                      {r.withdrawals} {r.unit}; devoluções: {r.returns} {r.unit}
                      .
                    </dd>
                    <dt>Estoque do destino</dt>
                    <dd>
                      Físico: {r.physical}; reservado: {r.reserved}; disponível:{" "}
                      {r.available}; mínimo sugerido: {r.minimum}; alvo:{" "}
                      {r.target} {r.unit}.
                      {mode === "purchase" &&
                        ` Mínimo cadastrado do item no conjunto dos locais: ${r.itemMinimum} ${r.unit}.`}
                    </dd>
                    <dt>Previsão e prazo</dt>
                    <dd>
                      {r.forecast} {r.unit} em {r.leadDays} dias. Entradas
                      confirmadas: {r.incoming} {r.unit}.
                    </dd>
                    <dt>Comprar / transferir</dt>
                    <dd>
                      Comprar: {r.buy} {r.unit}; transferir: {r.transfer}{" "}
                      {r.unit}.
                    </dd>
                    <dt>Preço e fonte</dt>
                    <dd>
                      {money(r.unitPrice)} por {r.unit}. {r.priceLabel}. Data:{" "}
                      {r.priceDate ?? "não registrada"}. Custo de compra
                      estimado: {money(r.cost)}.
                    </dd>
                    <dt>Método e validação</dt>
                    <dd>
                      {r.analysis.method}. {r.analysis.reason} MAE:{" "}
                      {r.analysis.mae?.toFixed(2) ?? "não validado"}; WAPE:{" "}
                      {r.analysis.wape === null
                        ? "não validado"
                        : `${(r.analysis.wape * 100).toFixed(1)}%`}
                      .
                    </dd>
                    <dt>Origem dos dados</dt>
                    <dd>
                      {report.methodology.source}{" "}
                      {t?.evidence.proximity ?? r.distribution?.proximity}
                    </dd>
                  </dl>
                  {t && <p>Cobertura na origem: {t.evidence.sourceCoverageBefore?.toFixed(1) ?? "indeterminada"} → {t.evidence.sourceCoverageAfter?.toFixed(1) ?? "indeterminada"} dias; destino: {t.evidence.destinationCoverageBefore?.toFixed(1) ?? "indeterminada"} → {t.evidence.destinationCoverageAfter?.toFixed(1) ?? "indeterminada"} dias. Conversão cadastrada: {t.evidence.packSize} {r.unit} por caixa; fracionamento em unidades inteiras permitido pelo fluxo atual.</p>}
                  {r.capacity === null && <p>Capacidade deste material no destino não cadastrada; confirme espaço físico na revisão. Não há estimativa de volume compartilhado.</p>}
                  <p>
                    Compra sugerida: alvo {r.target} − disponível {r.available}{" "}
                    − entradas {r.incoming} − transferências sugeridas{" "}
                    {r.transfer} − transferências pendentes{" "}
                    {r.distribution?.pendingIncoming ?? 0}, limitada a zero ={" "}
                    {r.buy} {r.unit}.
                  </p>
                  {t && (
                    <p>
                      {t.benefit} Alvo da origem: {t.evidence.sourceTarget}{" "}
                      {r.unit}; transferências pendentes no destino:{" "}
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
                    <button className="button secondary" disabled={busy} onClick={() => onReject(t)}>Rejeitar sugestão</button>
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
          {!d.cards.length && (
            <p role="status">
              Nenhuma sugestão corresponde a este filtro. Revise o período ou
              selecione todas as posições.
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
