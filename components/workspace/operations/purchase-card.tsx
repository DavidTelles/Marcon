"use client";
import type { DashboardReport } from "@/lib/dashboard-report";
import type { Role } from "@/lib/workspace-routes";
import { can } from "@/lib/permissions";

const quantity = (value: number) =>
  value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const money = (value: number | null) =>
  value === null
    ? "Preço não informado"
    : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PurchaseCard({
  group,
  report,
  role,
  busy,
  onBuy,
}: {
  group: DashboardReport["decisions"]["purchaseGroups"][number];
  report: DashboardReport;
  role: Role;
  busy: boolean;
  onBuy: (code: string, warehouse: string) => void;
}) {
  const locations = group.rows.filter((row) => row.buy > 0).length;
  return (
    <details className="decision-card purchase-card">
      <summary>
        <span className="dashboard-badge">
          {group.quantity > 0 ? "Compra sugerida" : "Acompanhar"}
        </span>
        <h3>{group.item}</h3>
        <span className="purchase-code">{group.code}</span>
        <span className="purchase-total">
          Total a comprar
          <strong>
            {quantity(group.quantity)} {group.unit}
          </strong>
        </span>
        <span>
          {locations}{" "}
          {locations === 1 ? "estoque precisa" : "estoques precisam"} desta peça
        </span>
        <span className="purchase-toggle">
          <span className="purchase-show">Ver necessidade por estoque</span>
          <span className="purchase-hide">Recolher detalhes</span>
          <span aria-hidden="true">⌄</span>
        </span>
      </summary>
      <div className="purchase-details">
        <p>
          Total dos estoques incluídos nos filtros. Cada quantidade considera o
          saldo disponível, as entradas previstas e as transferências sugeridas.
        </p>
        <p>
          Período: {report.methodology.period} · Atualizado em{" "}
          {report.generatedAt}.
        </p>
        <div className="purchase-warehouses">
          {group.rows.map((row) => (
            <section
              className="purchase-warehouse"
              key={row.warehouse}
              aria-label={`Necessidade em ${row.warehouse}`}
            >
              <div className="purchase-warehouse-heading">
                <h4>{row.warehouse}</h4>
                <strong>
                  {quantity(row.buy)} {row.unit} a comprar
                </strong>
              </div>
              <p>
                Disponível: {quantity(row.available)} {row.unit} · Alvo de
                cobertura: {quantity(row.target)} {row.unit}
              </p>
              <p>
                Entradas previstas: {quantity(row.incoming)} {row.unit} ·
                Transferências sugeridas: {quantity(row.transfer)} {row.unit}
              </p>
              <p className="decision-confidence">
                Confiança: {row.analysis.confidence}. {row.analysis.reason}
                {!row.priceDate && " Falta data verificável do preço."}
              </p>
              <details className="decision-calculation">
                <summary>Ver cálculo e dados de {row.warehouse}</summary>
                <dl>
                  <dt>Estoque</dt>
                  <dd>
                    Físico: {quantity(row.physical)}; reservado:{" "}
                    {quantity(row.reserved)}; disponível:{" "}
                    {quantity(row.available)}; mínimo cadastrado:{" "}
                    {quantity(row.configuredMinimum)} {row.unit}. Mínimo
                    cadastrado do item no conjunto dos locais:{" "}
                    {quantity(row.itemMinimum)} {row.unit}.
                  </dd>
                  <dt>Consumo observado</dt>
                  <dd>
                    Entradas: {quantity(row.entries)}; retiradas efetivas:{" "}
                    {quantity(row.withdrawals)}; devoluções:{" "}
                    {quantity(row.returns)} {row.unit}. {row.analysis.days} dias
                    observados.
                  </dd>
                  <dt>Previsão e prazo</dt>
                  <dd>
                    {quantity(row.forecast)} {row.unit} em {row.leadDays} dias.
                  </dd>
                  <dt>Compra sugerida</dt>
                  <dd>
                    Alvo {quantity(row.target)} − disponível{" "}
                    {quantity(row.available)} − entradas{" "}
                    {quantity(row.incoming)} − transferências sugeridas{" "}
                    {quantity(row.transfer)} − transferências pendentes{" "}
                    {quantity(row.distribution?.pendingIncoming ?? 0)}, limitada
                    a zero = {quantity(row.buy)} {row.unit}.
                  </dd>
                  <dt>Preço e fonte</dt>
                  <dd>
                    {money(row.unitPrice)} por {row.unit}. {row.priceLabel}.
                    Data: {row.priceDate ?? "não registrada"}. Custo estimado
                    desta posição: {money(row.cost)}.
                  </dd>
                  <dt>Método e validação</dt>
                  <dd>
                    {row.analysis.method}. {row.analysis.reason} MAE:{" "}
                    {row.analysis.mae?.toFixed(2) ?? "não validado"}; WAPE:{" "}
                    {row.analysis.wape === null
                      ? "não validado"
                      : `${(row.analysis.wape * 100).toFixed(1)}%`}
                    .
                  </dd>
                  <dt>Origem dos dados</dt>
                  <dd>{report.methodology.source}</dd>
                </dl>
                {row.capacity === null && (
                  <p>
                    Capacidade desta peça não cadastrada; confirme o espaço
                    disponível antes de comprar.
                  </p>
                )}
              </details>
            </section>
          ))}
        </div>
        {group.quantity > 0 && can(role, "planning") && (
          <div className="decision-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => onBuy(group.code, "")}
            >
              Revisar compra e exportar
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
