"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { pathFor } from "@/lib/workspace-routes";
import type { Role } from "@/lib/workspace-routes";
import type { DashboardReport, DetailRecord } from "@/lib/dashboard-report";
import {
  dashboardTitles,
  type DashboardView,
  type Metric,
} from "@/lib/dashboard-definitions";
import { can } from "@/lib/permissions";
import { useDemoStore } from "../demo-store";
import { RequestOperations } from "./request-operations";
import { DashboardDialog } from "./dashboard-dialog";
import { DashboardCharts } from "./dashboard-charts";
import { DistributionMap } from "./distribution-map";
import { TransferQueue } from "./transfer-queue";
import { RecommendationCards } from "./recommendation-cards";
import { AnimatedNumber } from "./animated-number";
const dates = (value: string | null | undefined) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Não registrado";
function initialView(role: Role, mode: string, view?: string): DashboardView {
  return role === "funcionario"
    ? "requisicoes"
    : mode === "requisicoes" || mode === "solicitacoes" || mode === "historico"
      ? "requisicoes"
      : role === "lider"
        ? "bloco"
        : mode === "compra"
          ? "compra"
          : mode === "recomendacoes" ||
              view === "stock" ||
              view === "warehouse" ||
              view === "parts"
            ? "estoque"
            : view === "sector"
              ? "requisicoes"
              : view === "block"
                ? "bloco"
                : "geral";
}
export function OperationsPanel({
  role,
  mode,
  dashboardView,
  routePart,
}: {
  role: Role;
  mode: string;
  dashboardView?: string;
  routePart?: string;
}) {
  const { runAction } = useDemoStore(),
    first = initialView(role, mode, dashboardView);
  const router = useRouter();
  const planning =
    mode === "compra"
      ? "purchase"
      : mode === "recomendacoes"
        ? "distribution"
        : null;
  function reportQuery(value: string) {
    const q = new URLSearchParams(value);
    if (planning) {
      q.delete("dashboard");
      q.set("planning", planning);
    }
    return q.toString();
  }
  const urlParams = useSearchParams(),
    jamesQuery =
      planning || mode === "dashboard" || urlParams.get("james") === "1"
        ? urlParams.toString()
        : "";
  const incoming = new URLSearchParams(jamesQuery);
  const jamesFilters = Object.fromEntries(
    [...incoming].filter(([k]) =>
      [
        "dashboard",
        "metric",
        "from",
        "to",
        "block",
        "code",
        "warehouse",
        "status",
        "priority",
      ].includes(k),
    ),
  );
  const [query, setQuery] = useState(() =>
      new URLSearchParams({
        ...(routePart && routePart !== "all"
          ? dashboardView === "sector"
            ? { sector: routePart }
            : { part: routePart }
          : {}),
        dashboard: first,
        metric:
          first === "compra" || first === "estoque" ? "stock" : "requests",
        ...jamesFilters,
        ...(planning
          ? { decision: planning === "purchase" ? "buy" : "transfer" }
          : {}),
      }).toString(),
    ),
    [report, setReport] = useState<DashboardReport | null>(null),
    [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [requiresLogin, setRequiresLogin] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [detailOpen, setDetailOpen] = useState(false),
    [selected, setSelected] = useState<DetailRecord | null>(null),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [exporting, setExporting] = useState(false);
  const resolve = useRef<((value: boolean) => void) | null>(null);
  const fetching = useRef(false);
  useEffect(() => {
    const refresh = () => {
      if (fetching.current || document.hidden || !navigator.onLine) return;
      setRefreshing(true);
      setRevision((v) => v + 1);
    };
    window.addEventListener("marcon:workspace-updated", refresh);
    const onVisibility = () => {
      if (!document.hidden) refresh();
    };
    const timer = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, 5_000);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("marcon:workspace-updated", refresh);
    };
  }, []);
  useEffect(() => {
    if (!jamesQuery) return;
    const timer = setTimeout(() => {
      const q = new URLSearchParams(jamesQuery);
      q.delete("james");
      if (planning) {
        q.set("dashboard", first);
        q.set("metric", "stock");
        q.set("decision", planning === "purchase" ? "buy" : "transfer");
      }
      setQuery(q.toString());
    }, 0);
    return () => clearTimeout(timer);
  }, [jamesQuery, planning, first]);
  const transferKeys = useRef<Record<string, string>>({});
  const view = (
    planning ? first : new URLSearchParams(query).get("dashboard") || first
  ) as DashboardView;
  useEffect(() => {
    const c = new AbortController();
    fetching.current = true;
    const timeout = window.setTimeout(() => {
      c.abort();
      fetching.current = false;
      setRefreshing(false);
      setLoading(false);
      setError("A atualização demorou mais que o esperado. Tente novamente.");
    }, 15_000);
    const params = new URLSearchParams(query);
    if (planning) {
      params.delete("dashboard");
      params.set("planning", planning);
    }
    fetch("/api/operations?" + params, { signal: c.signal, cache: "no-store" })
      .then(async (r) => {
        const body = await r.json();
        if (c.signal.aborted) return;
        setRequiresLogin(r.status === 401);
        if (!r.ok) throw Error(body.error || "Falha ao carregar indicadores.");
        setReport(body);
        setLoading(false);
        setError("");
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message);
          setLoading(false);
        }
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (!c.signal.aborted) {
          fetching.current = false;
          setRefreshing(false);
        }
      });
    return () => {
      window.clearTimeout(timeout);
      c.abort();
      fetching.current = false;
    };
  }, [query, revision, planning]);
  useEffect(
    () => () => {
      resolve.current?.(false);
    },
    [],
  );
  function update(values: Record<string, string>) {
    setLoading(true);
    setError("");
    const q = new URLSearchParams(query);
    Object.entries(values).forEach(([k, v]) => (v ? q.set(k, v) : q.delete(k)));
    if (Object.hasOwn(values, "code")) q.delete("part");
    setQuery(q.toString());
    setRevision((n) => n + 1);
  }
  function reload() {
    setRefreshing(true);
    setRevision((n) => n + 1);
  }
  function confirm(message: string) {
    setConfirmation(message);
    return new Promise<boolean>((r) => {
      resolve.current = r;
    });
  }
  function answer(value: boolean) {
    resolve.current?.(value);
    resolve.current = null;
    setConfirmation("");
  }
  async function act(action: Record<string, unknown>, message: string) {
    if (!(await confirm(message))) return;
    setBusy(true);
    try {
      await runAction(action);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operação não concluída.");
    } finally {
      setBusy(false);
    }
  }
  async function download(format: "pdf" | "xlsx") {
    setExporting(true);
    setError("");
    try {
      const r = await fetch(
        "/api/operations?" + reportQuery(query) + "&format=" + format,
      );
      if (!r.ok) {
        const b = await r.json();
        throw Error(b.error);
      }
      const url = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = `marcon-${view}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Exportação indisponível.");
    } finally {
      setExporting(false);
    }
  }
  const views: DashboardView[] =
    role === "funcionario"
      ? ["requisicoes"]
      : role === "lider"
        ? ["bloco", "requisicoes"]
        : ["geral", "bloco", "estoque", "requisicoes"];
  const ids: Record<DashboardView, Metric[]> = {
    geral: [
      "pending",
      "urgent",
      "critical",
      "withdrawals",
      "entries",
      "delivery",
    ],
    bloco: ["requests", "pending", "withdrawals", "delivery", "anomalies"],
    estoque: ["stock", "critical", "idle", "entries", "withdrawals", "returns"],
    requisicoes: ["requests", "pending", "urgent", "delivery", "anomalies"],
    compra: ["buy", "critical", "withdrawals"],
  };
  const displayed = (report?.metrics ?? []).filter((m) =>
    (view === "bloco"
      ? ["requests", "pending", "delivery"]
      : view === "estoque"
        ? ["stock", "critical", "idle"]
        : view === "requisicoes"
          ? ["requests", "pending", "delivery"]
          : ids[view]
    ).includes(m.id),
  );
  const openMetric = (id: Metric) => {
    setSelected(null);
    setDetailOpen(true);
    update({ metric: id, page: "1" });
  };
  const pagination = (total: number, pages: number) =>
    report && (
      <nav
        className="dashboard-pagination"
        aria-label="Paginação dos registros"
      >
        <button
          className="button secondary"
          disabled={loading || report.filters.page <= 1}
          onClick={() => update({ page: String(report.filters.page - 1) })}
        >
          Anterior
        </button>
        <span>
          Página {report.filters.page} de {pages} · {total} registros
        </span>
        <button
          className="button secondary"
          disabled={loading || report.filters.page >= pages}
          onClick={() => update({ page: String(report.filters.page + 1) })}
        >
          Próxima
        </button>
      </nav>
    );
  const records = report && (
    <>
      {report.details.records.length && role === "funcionario" ? (
        <div
          className="ops-scroll employee-queue-scroll"
          role="region"
          aria-label="Minhas requisições"
          tabIndex={0}
        >
          <table>
            <caption>Pedidos ordenados por urgência e data de criação</caption>
            <thead>
              <tr>
                <th>Pedido / material</th>
                <th>Quantidade</th>
                <th>Bloco</th>
                <th>Data</th>
                <th>Prioridade</th>
                <th>Situação</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {report.details.records.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.item}</strong>
                    <small>
                      #{r.id} · {r.code}
                    </small>
                  </td>
                  <td data-label="Quantidade">
                    {r.quantity} {r.unit}
                  </td>
                  <td data-label="Bloco">{r.block}</td>
                  <td data-label="Data">{dates(r.date)}</td>
                  <td data-label="Prioridade">
                    <span
                      className={
                        "dashboard-badge " +
                        (r.priority === "Urgente" ? "urgent" : "")
                      }
                    >
                      {r.priority || "Não informada"}
                    </span>
                  </td>
                  <td data-label="Situação">
                    <span className="dashboard-badge" data-status={r.status}>
                      {r.status}
                    </span>
                  </td>
                  <td data-label="Ação">
                    <button
                      className="button secondary"
                      onClick={() => {
                        setSelected(r);
                        setDetailOpen(true);
                      }}
                    >
                      Abrir registros #{r.id}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : report.details.records.length &&
        (mode === "historico" || ["requisicoes", "bloco"].includes(view)) ? (
        <div
          className="ops-scroll history-table"
          role="region"
          aria-label="Registros de requisições"
          tabIndex={0}
        >
          <table>
            <caption>
              {mode === "historico"
                ? "Histórico de requisições"
                : "Acompanhamento das requisições"}
            </caption>
            <thead>
              <tr>
                {[
                  "Número",
                  "Material",
                  "Quantidade",
                  "Solicitante",
                  "Bloco",
                  "Data",
                  "Prioridade",
                  "Situação",
                  "Detalhes",
                ].map((label) => (
                  <th scope="col" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.details.records.map((r) => (
                <tr key={r.kind + r.id}>
                  <td data-label="Número">#{r.id}</td>
                  <td data-label="Material">
                    <strong>{r.item}</strong>
                    <small>{r.code}</small>
                  </td>
                  <td data-label="Quantidade">
                    {r.quantity.toLocaleString("pt-BR")} {r.unit}
                  </td>
                  <td data-label="Solicitante">
                    {r.person || "Não informado"}
                  </td>
                  <td data-label="Bloco">{r.block || "—"}</td>
                  <td data-label="Data">{dates(r.date)}</td>
                  <td data-label="Prioridade">
                    <span
                      className={
                        "dashboard-badge " +
                        (r.priority === "Urgente" ? "urgent" : "")
                      }
                    >
                      {r.priority || "—"}
                    </span>
                  </td>
                  <td data-label="Situação">
                    <span className="dashboard-badge" data-status={r.status}>
                      {r.status}
                    </span>
                  </td>
                  <td data-label="Detalhes">
                    <button
                      className="link-button"
                      aria-label={"Abrir registros #" + r.id}
                      onClick={() => {
                        setSelected(r);
                        setDetailOpen(true);
                      }}
                    >
                      Detalhes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : report.details.records.length ? (
        <div className="dashboard-records">
          {report.details.records.map((r) => (
            <article key={r.id} className="dashboard-record">
              <div>
                <strong>
                  {r.code} · {r.item}
                </strong>
                <p>
                  {r.quantity} {r.unit} · {r.block} ·{" "}
                  {r.warehouse || "Origem ainda não reservada"}
                </p>
                <span className="dashboard-badge">{r.status}</span>
                {r.priority && (
                  <span
                    className={
                      "dashboard-badge " +
                      (r.priority === "Urgente" ? "urgent" : "")
                    }
                  >
                    {r.priority}
                  </span>
                )}
                <p>
                  {r.person && "Requisitor: " + r.person + " · "}Responsável:{" "}
                  {r.actor || "Não atribuído"}
                </p>
                <small>{dates(r.date)}</small>
              </div>
              <button
                className="button secondary"
                onClick={() => {
                  setSelected(r);
                  setDetailOpen(true);
                }}
              >
                Abrir registros #{r.id}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="dashboard-empty">
          Nenhum registro corresponde aos filtros.
        </p>
      )}
      {pagination(report.details.total, report.pages)}
    </>
  );
  const stockPanel = (integrated: boolean) =>
    report && (
      <section
        className={
          integrated ? "dashboard-stock-integrated" : "panel ops-panel"
        }
      >
        <div className="panel-head">
          <div>
            <h2>
              {planning ? "Recomendação de compra" : "Peças por almoxarifado"}
            </h2>
            <p>
              Saldo atual. Movimentações no período {report.methodology.period}.
            </p>
          </div>
        </div>
        <details className="decision-table" open={!planning}>
          <summary>
            {planning
              ? "Ver tabela detalhada de estoque e previsão"
              : "Ver tabela detalhada de estoque"}
          </summary>
          <div
            className="ops-scroll"
            role="region"
            aria-label="Estoque e previsão"
            tabIndex={0}
          >
            <table>
              <caption>Valores exatos por unidade cadastrada</caption>
              <thead>
                <tr>
                  {[
                    "Peça",
                    "Almoxarifado",
                    "Físico",
                    "Reservado",
                    "Disponível",
                    "Mínimo",
                    "Disponibilidade",
                    "Movimentações",
                    ...(planning
                      ? [
                          "Prazo / previsão",
                          "Compra / transferência",
                          "Preço e fonte",
                          "Metodologia",
                        ]
                      : []),
                  ].map((h) => (
                    <th key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.code + r.warehouse}>
                    <td data-label="Item / local">
                      <strong>
                        {r.code} · {r.item}
                      </strong>
                      <p>
                        {r.location} · {r.unit}
                      </p>
                    </td>
                    <td data-label="Almoxarifado">{r.warehouse}</td>
                    <td data-label="Físico">{r.physical}</td>
                    <td data-label="Reservado">{r.reserved}</td>
                    <td data-label="Disponível">{r.available}</td>
                    <td data-label="Mínimo">
                      {r.configuredMinimum}
                      {planning && (
                        <small>
                          Sugerido: {r.minimum} · alvo: {r.target}
                        </small>
                      )}
                    </td>
                    <td data-label="Disponibilidade">
                      <span
                        className="dashboard-badge"
                        data-status={
                          r.available <= 0
                            ? "Indisponível"
                            : r.available < r.configuredMinimum
                              ? "Abaixo do mínimo"
                              : "Disponível"
                        }
                      >
                        {r.available <= 0
                          ? "Indisponível"
                          : r.available < r.configuredMinimum
                            ? "Abaixo do mínimo"
                            : "Disponível"}
                      </span>
                    </td>
                    <td data-label="Movimentações">
                      Entradas: {r.entries}
                      <br />
                      Retiradas: {r.withdrawals}
                      <br />
                      Devoluções: {r.returns}
                    </td>
                    {planning && (
                      <>
                        <td data-label="Prazo / previsão">
                          {r.leadDays} dias / {r.forecast} {r.unit}
                        </td>
                        <td data-label="Compra / transferência">
                          Comprar: {r.buy} {r.unit}
                          <br />
                          Transferir: {r.transfer} {r.unit}
                          <small>
                            Custo interno:{" "}
                            {r.cost.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}
                          </small>
                        </td>
                        <td data-label="Preço e fonte">
                          {r.unitPrice === null
                            ? "Indisponível"
                            : r.unitPrice.toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                          <small>
                            {r.priceLabel} · Data: {dates(r.priceDate)}
                          </small>
                        </td>
                        <td data-label="Metodologia">
                          <span className="dashboard-badge">
                            {r.analysis.confidence}
                          </span>
                          <details>
                            <summary>Explicar cálculo</summary>
                            <p>
                              {r.analysis.method} · {r.analysis.days} dias · MAE{" "}
                              {r.analysis.mae?.toFixed(2) ?? "não validado"} ·
                              WAPE{" "}
                              {r.analysis.wape === null
                                ? "não validado"
                                : (r.analysis.wape * 100).toFixed(1) + "%"}
                            </p>
                            <p>{r.analysis.reason}</p>
                            <p>
                              Compra = max(0, {r.target} − {r.available} −{" "}
                              {r.incoming} − {r.transfer}) = {r.buy}.
                            </p>
                          </details>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!report.rows.length && (
            <p className="dashboard-empty">
              Nenhum item/local corresponde aos filtros.
            </p>
          )}
          {pagination(
            report.rowTotal,
            Math.max(1, Math.ceil(report.rowTotal / report.filters.pageSize)),
          )}
        </details>
      </section>
    );
  return (
    <div className="dashboard-suite">
      {!planning &&
        mode !== "dashboard" &&
        mode !== "historico" &&
        role !== "funcionario" && (
          <nav className="dashboard-tabs" aria-label="Dashboards">
            {views.map((v) => (
              <button
                key={v}
                className={view === v ? "active" : ""}
                aria-current={view === v ? "page" : undefined}
                onClick={() => {
                  setSelected(null);
                  update({
                    dashboard: v,
                    metric: ["compra", "estoque"].includes(v)
                      ? "stock"
                      : "requests",
                    page: "1",
                    status: "",
                    priority: "",
                  });
                }}
              >
                {v === "compra"
                  ? "Recomendação de compra"
                  : v === "geral"
                    ? "Geral"
                    : v === "bloco"
                      ? "Por bloco"
                      : v === "estoque"
                        ? "Estoque"
                        : "Requisições"}
              </button>
            ))}
          </nav>
        )}
      <section className="panel ops-panel">
        <div className="panel-head">
          <div>
            <h1 className="dashboard-title">
              {planning === "purchase"
                ? "Compra preditiva"
                : planning === "distribution"
                  ? "Recomendação de estoque"
                  : mode === "historico"
                    ? "Histórico"
                    : role === "funcionario"
                      ? "Minhas requisições"
                      : dashboardTitles[view]}
            </h1>
            <p>
              {planning === "purchase"
                ? "Revise compras por consumo efetivamente baixado, mínimos, prazo e entradas confirmadas."
                : planning === "distribution"
                  ? "Aproxime os materiais dos blocos que os consomem, usando caminhos do mapa publicado. Confirme toda transferência."
                  : role === "funcionario"
                    ? "Acompanhe seus pedidos, confira as etapas e consulte os detalhes."
                    : "Veja o que precisa de atenção e acompanhe seus materiais."}
            </p>
            <p>
              {report?.scope ??
                (error
                  ? "Dados temporariamente indisponíveis"
                  : "Carregando sua visão geral…")}
            </p>
          </div>
          <details
            className="dashboard-popover"
            onKeyDown={(e) => {
              if (e.key === "Escape") e.currentTarget.open = false;
            }}
          >
            <summary>Exportar</summary>
            <div>
              <button
                className="button secondary"
                disabled={exporting || loading || !report}
                onClick={() => void download("pdf")}
              >
                PDF
              </button>
              <button
                className="button secondary"
                disabled={exporting || loading || !report}
                onClick={() => void download("xlsx")}
              >
                Planilha
              </button>
              <small>
                Filtros e permissões atuais. Todos os registros do indicador
                selecionado.
              </small>
            </div>
          </details>
        </div>
        <details
          className="dashboard-filters"
          onKeyDown={(e) => {
            if (e.key === "Escape") e.currentTarget.open = false;
          }}
        >
          <summary>Filtros do relatório</summary>
          <form
            key={view + JSON.stringify(report?.filters)}
            className="ops-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const values = Object.fromEntries(
                [...f.entries()].map(([k, v]) => [k, String(v)]),
              );
              setSelected(null);
              update({ ...values, page: "1" });
            }}
          >
            <label>
              De
              <input
                name="from"
                type="date"
                defaultValue={report?.filters.from}
              />
            </label>
            <label>
              Até
              <input name="to" type="date" defaultValue={report?.filters.to} />
            </label>
            {!["lider", "funcionario"].includes(role) && (
              <label>
                Bloco
                <select name="block" defaultValue={report?.filters.block}>
                  <option value="">Todos autorizados</option>
                  {(report?.options.blocks ?? []).map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Código do item
              <input
                name="code"
                maxLength={64}
                defaultValue={report?.filters.code}
              />
            </label>
            <label>
              Setor
              <input
                name="sector"
                maxLength={80}
                defaultValue={report?.filters.sector}
              />
            </label>
            {role !== "funcionario" && (
              <label>
                Matrícula do requisitor
                <input
                  name="requester"
                  maxLength={30}
                  defaultValue={report?.filters.requester}
                />
              </label>
            )}
            <label>
              Almoxarifado
              <select name="warehouse" defaultValue={report?.filters.warehouse}>
                <option value="">Todos no escopo</option>
                {(report?.options.warehouses ?? []).map((w) => (
                  <option key={w}>{w}</option>
                ))}
              </select>
            </label>
            {view === "requisicoes" && (
              <>
                <label>
                  Status
                  <select name="status" defaultValue={report?.filters.status}>
                    <option value="">Todos</option>
                    {[
                      "Pendente",
                      "Em análise",
                      "Aprovada",
                      "Entregue",
                      "Cancelada",
                      "Cancelamento solicitado",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Urgência
                  <select
                    name="priority"
                    defaultValue={report?.filters.priority}
                  >
                    <option value="">Todas</option>
                    <option>Urgente</option>
                    <option>Moderado</option>
                    <option>Leve</option>
                  </select>
                </label>
              </>
            )}
            <button className="button primary">Aplicar filtros</button>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setSelected(null);
                update({
                  from: "",
                  to: "",
                  block: "",
                  code: "",
                  part: "",
                  sector: "",
                  requester: "",
                  warehouse: "",
                  status: "",
                  priority: "",
                  page: "1",
                });
              }}
            >
              Limpar filtros
            </button>
          </form>
        </details>
        {role === "funcionario" && report && !loading && (
          <section
            className="employee-queue"
            aria-labelledby="employee-queue-title"
          >
            <div className="panel-head">
              <div>
                <h2 id="employee-queue-title">Fila de requisições</h2>
                <p>Seus pedidos por urgência, seguidos dos mais antigos.</p>
              </div>
              <span className="count">{report.details.total} registros</span>
            </div>
            {records}
          </section>
        )}
        {error && (
          <div role="alert">
            <p>{error}</p>
            {report && (
              <p>Os últimos dados carregados permanecem disponíveis.</p>
            )}
            {requiresLogin ? (
              <a className="button secondary" href="/login">
                Entrar novamente
              </a>
            ) : (
              <button className="button secondary" onClick={reload}>
                Tentar novamente
              </button>
            )}
          </div>
        )}
        {loading && <p role="status">Carregando indicadores e registros…</p>}
        {exporting && <p role="status">Gerando relatório…</p>}
        {report && !loading && (
          <>
            <div
              className="dashboard-live-bar"
              aria-label="Atualização dos dados"
            >
              <span
                className={
                  error
                    ? "dashboard-live-state unavailable"
                    : "dashboard-live-state"
                }
              >
                <i aria-hidden="true" />
                {error
                  ? "Atualização indisponível"
                  : refreshing
                    ? "Atualizando dados…"
                    : "Dados conectados"}
              </span>
              <span>Atualização automática a cada 5 segundos</span>
              <button
                type="button"
                className="button secondary"
                disabled={refreshing}
                onClick={reload}
              >
                Atualizar agora
              </button>
            </div>
            <p className="dashboard-context">
              Período: {report.methodology.period} · Escopo: {report.scope} ·
              Atualização: {dates(report.generatedAt)}
            </p>
            <details
              hidden={mode === "historico"}
              className="dashboard-indicators"
              open={!planning && role !== "funcionario"}
            >
              <summary>
                {view === "geral"
                  ? "Indicadores essenciais"
                  : "Ver indicadores do período"}
              </summary>
              <div className="ops-metrics dashboard-metrics">
                {displayed.map((m) => (
                  <article className="ops-metric" key={m.id}>
                    <button
                      className="dashboard-metric-button"
                      onClick={() => openMetric(m.id)}
                      aria-label={"Abrir " + m.label}
                    >
                      <span>{m.label}</span>
                      <strong>
                        {m.breakdown.length ? (
                          m.breakdown
                            .map(
                              (b) =>
                                `${b.quantity.toLocaleString("pt-BR")} ${b.unit}`,
                            )
                            .join(" · ")
                        ) : m.value === null ? (
                          "Sem dados"
                        ) : (
                          <AnimatedNumber
                            value={m.value}
                            decimals={m.id === "delivery" ? 2 : 0}
                          />
                        )}
                      </strong>
                      <small>{m.unit}</small>
                    </button>
                    <details className="dashboard-definition">
                      <summary aria-label={"Definição de " + m.label}>
                        Sobre este indicador
                      </summary>
                      <p role="tooltip">{m.definition}</p>
                      <small>
                        {m.period}
                        <br />
                        {m.scope}
                        <br />
                        Atualizado: {dates(m.updatedAt)}
                      </small>
                    </details>
                  </article>
                ))}
              </div>
            </details>
          </>
        )}
        {report &&
          !loading &&
          !planning &&
          role !== "funcionario" &&
          ["requisicoes", "bloco"].includes(view) && (
            <section className="dashboard-request-integrated">
              <div className="panel-head">
                <div>
                  <h2>
                    {mode === "historico"
                      ? "Histórico de requisições"
                      : "Acompanhamento das requisições"}
                  </h2>
                  <p>
                    Consulte situação, solicitante e detalhes de cada material.
                  </p>
                </div>
              </div>
              {records}
            </section>
          )}
        {view === "estoque" && !planning && !loading && stockPanel(true)}
        {report &&
          !loading &&
          view === "estoque" &&
          can(role, "stock") &&
          report.incoming.some((row) => row.status === "Confirmada") && (
            <section className="dashboard-stock-integrated">
              <h2>Entradas confirmadas</h2>
              <p>Previsões não alteram saldo até a conferência.</p>
              {report.incoming
                .filter((r) => r.status === "Confirmada")
                .map((r) => (
                  <form
                    className="ops-form"
                    key={r.id}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void act(
                        {
                          type: "receiveInbound",
                          id: r.id,
                          qrCode: String(f.get("code")),
                          quantity: Number(f.get("quantity")),
                        },
                        `Confirmar recebimento de ${r.quantity} unidades de ${r.code}?`,
                      );
                    }}
                  >
                    <p>
                      {r.code} · {r.quantity} un. · {r.warehouse} · {r.supplier}{" "}
                      · {String(r.due_date).slice(0, 10)}
                    </p>
                    <label>
                      Código recebido
                      <input name="code" required />
                    </label>
                    <label>
                      Quantidade recebida
                      <input name="quantity" type="number" min="1" required />
                    </label>
                    <button className="button primary" disabled={busy}>
                      Conferir recebimento
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          { type: "cancelInbound", id: r.id },
                          "Cancelar esta entrada prevista?",
                        )
                      }
                    >
                      Cancelar entrada prevista
                    </button>
                  </form>
                ))}
            </section>
          )}
      </section>
      {report &&
        !loading &&
        !planning &&
        !["estoque", "requisicoes"].includes(view) &&
        !(role === "admin" && ["geral", "bloco"].includes(view)) &&
        mode !== "historico" && (
          <DashboardCharts
            report={report}
            onWarehouse={(warehouse) => update({ warehouse, page: "1" })}
            onItem={(code) => update({ code, page: "1" })}
            onMetric={openMetric}
          />
        )}
      {report && !loading && (
        <>
          {planning && (
            <RecommendationCards
              mode={planning}
              report={report}
              role={role}
              busy={busy}
              onFilter={(decision) => update({ decision, decisionPage: "1" })}
              onPage={(page) => update({ decisionPage: String(page) })}
              onCritical={() => openMetric("critical")}
              onBuy={(code, warehouse) =>
                planning === "purchase"
                  ? openMetric("buy")
                  : router.push(
                      pathFor(role, "compra") +
                        "?" +
                        new URLSearchParams({ code, warehouse }),
                    )
              }
              onTransfer={(t) =>
                void act(
                  {
                    type: "transfer",
                    ...t,
                    requestKey: (transferKeys.current[
                      `${t.code}:${t.from}:${t.to}:${t.quantity}`
                    ] ||= crypto.randomUUID()),
                  },
                  `Solicitar ${t.quantity} unidades de ${t.code}, de ${t.from} para ${t.to}? Os saldos só mudam após saída e recebimento conferidos.`,
                )
              }
            />
          )}
          {view === "geral" && mode !== "dashboard" && (
            <details className="panel ops-panel dashboard-quality">
              <summary>Sobre os dados e recomendações</summary>
              {report.quality.map((q) => (
                <details key={q.label}>
                  <summary>
                    {q.label}: {q.count}
                  </summary>
                  <p>{q.detail}</p>
                  {q.metric && (
                    <button
                      className="button secondary"
                      onClick={() => openMetric(q.metric!)}
                    >
                      Abrir posições relacionadas
                    </button>
                  )}
                </details>
              ))}
              <p>
                Prazo de atendimento não cadastrado; a fila usa urgência e
                antiguidade, sem SLA presumido.
              </p>
            </details>
          )}
          {planning &&
            ["estoque", "compra"].includes(view) &&
            stockPanel(false)}
          {planning === "purchase" &&
            ["estoque", "requisicoes"].includes(view) &&
            can(role, "stock") && (
              <section className="panel ops-panel">
                <div className="panel-head">
                  <div>
                    <h2>Distribuição e rotas</h2>
                    <p>Consulta e sugestões não movimentam estoque.</p>
                  </div>
                </div>
                <DistributionMap version={report.mapVersion} />
                <p>
                  Solicite sem escanear. Código e quantidade serão conferidos na
                  saída e no recebimento.
                </p>
                {report.transfers.length ? (
                  report.transfers.map((t) => (
                    <article
                      className="ops-suggestion"
                      key={t.code + t.from + t.to}
                    >
                      <p>
                        <strong>
                          {t.code} · {t.quantity} unidades
                        </strong>
                        <br />
                        {t.from} → {t.to}
                        <br />
                        {t.reason}
                        <br />
                        Confiança: {t.confidence}. {t.benefit}
                        <br />
                        Período: {t.evidence.period.from} a{" "}
                        {t.evidence.period.to}. Prazo: {t.evidence.leadDays}{" "}
                        dias.
                        <br />
                        Origem: disponível {t.evidence.sourceAvailable},
                        reservado {t.evidence.sourceReserved}, mínimo{" "}
                        {t.evidence.sourceMinimum}, alvo{" "}
                        {t.evidence.sourceTarget}
                        .
                        <br />
                        Destino: disponível {t.evidence.destinationAvailable},
                        reservado {t.evidence.destinationReserved}, alvo{" "}
                        {t.evidence.destinationTarget}, previsão{" "}
                        {t.evidence.forecast}, entradas {t.evidence.incoming},
                        transferências pendentes {t.evidence.pendingIncoming}.
                        <br />
                        Consumo por bloco:{" "}
                        {t.evidence.consumption
                          ?.map((c) => `${c.block}: ${c.quantity}`)
                          .join("; ") || "Sem baixas observadas"}
                        .
                        <br />
                        {t.evidence.proximity}
                      </p>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            {
                              type: "transfer",
                              ...t,
                              requestKey: (transferKeys.current[
                                `${t.code}:${t.from}:${t.to}:${t.quantity}`
                              ] ||= crypto.randomUUID()),
                            },
                            `Solicitar ${t.quantity} unidades de ${t.code}, de ${t.from} para ${t.to}? Os saldos só mudam após saída e recebimento conferidos.`,
                          )
                        }
                      >
                        Solicitar transferência sugerida
                      </button>
                    </article>
                  ))
                ) : (
                  <p>Não há excesso transferível para os alvos atuais.</p>
                )}
                <TransferQueue />
              </section>
            )}
          {view === "compra" && (
            <section className="panel ops-panel">
              <h2>Antes de comprar</h2>
              <p>
                A sugestão considera transferências antes de novas compras. Não
                há envio de pedido ao fornecedor nem cotação externa
                configurada.
              </p>
              <button
                className="button secondary"
                onClick={() =>
                  update({ dashboard: "estoque", metric: "stock", page: "1" })
                }
              >
                Revisar distribuição e rotas
              </button>
              <button
                className="button primary"
                disabled={exporting}
                onClick={async () => {
                  if (
                    await confirm(
                      "Gerar a recomendação de compra para revisão? Este documento usa estimativas internas e não envia pedidos ao fornecedor.",
                    )
                  )
                    await download("xlsx");
                }}
              >
                Confirmar recomendação para revisão
              </button>
            </section>
          )}
        </>
      )}
      <DashboardDialog
        open={detailOpen}
        title={selected ? "Registro #" + selected.id : "Registros do indicador"}
        onClose={() => {
          setDetailOpen(false);
          setSelected(null);
        }}
      >
        {loading ? (
          <p role="status">Carregando detalhes…</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : selected ? (
          <>
            <h3>
              {selected.code} · {selected.item}
            </h3>
            <p>
              {selected.quantity} {selected.unit} · {selected.block} ·{" "}
              {selected.status}
            </p>
            <p>{selected.reason || "Sem justificativa adicional"}</p>
            {selected.kind === "stock" && (
              <dl className="dashboard-stock-details">
                <dt>Físico</dt>
                <dd>
                  {selected.physical} {selected.unit}
                </dd>
                <dt>Reservado</dt>
                <dd>
                  {selected.reserved} {selected.unit}
                </dd>
                <dt>Disponível</dt>
                <dd>
                  {selected.available} {selected.unit}
                </dd>
                <dt>Mínimo cadastrado</dt>
                <dd>
                  {selected.minimum} {selected.unit}
                </dd>
                <dt>Almoxarifado</dt>
                <dd>{selected.warehouse}</dd>
              </dl>
            )}
            {selected.timeline && (
              <ol className="dashboard-timeline">
                {selected.timeline.map((t, i) => (
                  <li key={i} className={t.at ? "complete" : ""}>
                    <strong>{t.label}</strong>
                    <span>{dates(t.at)}</span>
                  </li>
                ))}
              </ol>
            )}
            {selected.request && (
              <RequestOperations
                id={Number(selected.id)}
                role={role}
                request={selected.request}
                beforeAction={() =>
                  confirm(
                    "Confirmar esta alteração na requisição? A ação será validada e registrada no histórico.",
                  )
                }
                onComplete={() => {
                  setSelected(null);
                  reload();
                }}
              />
            )}
            <button
              className="button secondary"
              onClick={() => setSelected(null)}
            >
              Voltar aos registros
            </button>
          </>
        ) : (
          <>
            <p>
              {
                report?.metrics.find((m) => m.id === report.filters.metric)
                  ?.definition
              }
            </p>
            <p>
              {report?.methodology.period} · {report?.scope} ·{" "}
              {dates(report?.generatedAt)}
            </p>
            {records}
          </>
        )}
      </DashboardDialog>
      <DashboardDialog
        open={!!confirmation}
        title="Confirmar operação"
        onClose={() => answer(false)}
        compact
      >
        <p>{confirmation}</p>
        <div className="head-actions">
          <button className="button secondary" onClick={() => answer(false)}>
            Voltar sem alterar
          </button>
          <button className="button primary" onClick={() => answer(true)}>
            Confirmar
          </button>
        </div>
      </DashboardDialog>
    </div>
  );
}
