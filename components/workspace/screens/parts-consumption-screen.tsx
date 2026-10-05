"use client";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PartsConsumptionReport } from "@/lib/parts-consumption";
import {
  isPartsConsumptionReport,
  PARTS_REPORT_INCOMPATIBLE,
} from "@/lib/parts-consumption-contract";
import type { Role } from "@/lib/workspace-routes";
import { heading } from "../ui";
import { InsightChart } from "../operations/insight-chart";
import { PartsTimeline } from "../operations/parts-timeline";
import { PartsPlanning } from "../operations/parts-planning";
import styles from "./parts-consumption.module.css";

const number = (v: number | null) =>
  v === null
    ? "Indisponível"
    : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const variation = (
  v: { difference: number; change: number | null },
  unit: string,
) =>
  `${v.difference > 0 ? "+" : ""}${number(v.difference)} ${unit} · ${v.change === null ? "Sem base percentual" : `${v.change > 0 ? "+" : ""}${number(v.change)}%`}`;
const filterKeys = [
  "from",
  "to",
  "code",
  "block",
  "blocks",
  "warehouse",
  "unit",
  "group",
  "sector",
  "requester",
  "limit",
  "threshold",
  "page",
];

export function PartsConsumptionScreen({
  role,
  mode,
  initialCode,
}: {
  role: Role;
  mode: "comparison" | "share";
  initialCode?: string;
}) {
  const search = useSearchParams();
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const initial = Object.fromEntries(
      filterKeys.filter((k) => search.has(k)).map((k) => [k, search.get(k)!]),
    );
    if (initialCode) initial.code = initialCode;
    return initial;
  });
  const [report, setReport] = useState<PartsConsumptionReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [origin, setOrigin] = useState<Record<string, string> | null>(null);
  const [originReport, setOriginReport] =
    useState<PartsConsumptionReport["details"]>(null);
  const [originError, setOriginError] = useState("");
  const [originLoading, setOriginLoading] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [series, setSeries] = useState<string[]>(() =>
    (search.get("series") || "").split("|").filter(Boolean),
  );
  const originHeading = useRef<HTMLHeadingElement>(null);
  const mainHeading = useRef<HTMLDivElement>(null);
  const prefix = role === "admin" ? "/admin/dashboard" : "/warehouse/dashboard";
  const selected = filters.code || "";
  let selectedBlocks: string[] = [];
  try {
    const value = JSON.parse(filters.blocks || "[]");
    if (Array.isArray(value) && value.every((b) => typeof b === "string"))
      selectedBlocks = value;
  } catch {
    /* Server reports invalid URL filters. */
  }
  const effectiveFilters = {
    ...filters,
    ...(series.length ? { series: series.join("|") } : {}),
    ...(report
      ? {
          from: filters.from || report.period.from,
          to: filters.to || report.period.to,
          unit: filters.unit || report.filters.unit,
        }
      : {}),
  };
  const link = (path: string, changes: Record<string, string> = {}) =>
    `${path}?${new URLSearchParams({ ...effectiveFilters, ...changes })}`;
  const set = (key: string, value: string) => {
    setLoading(true);
    setOrigin(null);
    setSeries([]);
    setFilters((current) => {
      const next = {
        ...current,
        [key]: value,
        page: key === "page" ? value : "1",
      };
      if (key === "code")
        next.unit =
          report?.options.parts.find((p) => p.code === value)?.unit || "";
      if (key === "unit") next.code = "";
      if (key === "blocks") next.block = "";
      if (key === "block") next.blocks = "";
      return next;
    });
  };
  useEffect(() => {
    const update = () => setRevision((v) => v + 1);
    window.addEventListener("marcon:workspace-updated", update);
    window.addEventListener("focus", update);
    return () => {
      window.removeEventListener("marcon:workspace-updated", update);
      window.removeEventListener("focus", update);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({
          ...filters,
          ...(series.length ? { series: series.join("|") } : {}),
        });
        const response = await fetch("/api/parts-consumption?" + query, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Falha na consulta.");
        if (!isPartsConsumptionReport(data))
          throw new Error(PARTS_REPORT_INCOMPATIBLE);
        if (!controller.signal.aborted) setReport(data);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Falha na consulta.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filters, revision, series]);
  useEffect(() => {
    if (!origin || !report) return;
    const controller = new AbortController();
    async function load() {
      setOriginLoading(true);
      setOriginError("");
      setOriginReport(null);
      try {
        const response = await fetch(
          "/api/parts-consumption?" +
            new URLSearchParams({
              ...report!.filters,
              from: report!.period.from,
              to: report!.period.to,
              details: "1",
              ...origin,
            }),
          { signal: controller.signal, cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Falha na consulta de origem.");
        if (!isPartsConsumptionReport(data))
          throw new Error(PARTS_REPORT_INCOMPATIBLE);
        if (!controller.signal.aborted) {
          setOriginReport(data.details);
          originHeading.current?.focus();
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setOriginError(
            cause instanceof Error ? cause.message : "Falha na consulta.",
          );
      } finally {
        if (!controller.signal.aborted) setOriginLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [origin, report, revision]);
  const investigate = (params: Record<string, string>) => {
    setOrigin({ detailKind: "delivery", detailPage: "1", ...params });
  };
  const rowProps = (params: Record<string, string>) => ({
    tabIndex: 0,
    onClick: (event: MouseEvent<HTMLTableRowElement>) => {
      if (!(event.target as HTMLElement).closest("button,a"))
        investigate(params);
    },
    onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (
        event.target === event.currentTarget &&
        ["Enter", " "].includes(event.key)
      ) {
        event.preventDefault();
        investigate(params);
      }
    },
  });
  const choose = (
    label: string,
    key: string,
    options: string[],
    all = true,
  ) => (
    <label>
      {label}
      <select
        value={
          filters[key] || (key === "unit" ? report?.filters.unit : "") || ""
        }
        onChange={(e) => set(key, e.target.value)}
      >
        {all && (
          <option value="">
            {key === "block" && selectedBlocks.length
              ? `${selectedBlocks.length} blocos selecionados`
              : "Todos"}
          </option>
        )}
        {options.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
  const busy = loading || !report;
  const unit = report?.filters.unit || "";
  return (
    <div className={styles.root}>
      <div ref={mainHeading} tabIndex={-1}>
        {heading(
          "MATERIAIS · ENTREGAS CONFIRMADAS",
          mode === "comparison" ? "Peça" : "Por Peça",
          mode === "comparison"
            ? "Compare materiais na mesma unidade, com acesso às entregas que compõem cada resultado."
            : "Selecione um material e compare as entregas entre blocos.",
        )}
      </div>
      <nav className={styles.tabs} aria-label="Painéis de peças">
        <Link
          href={link(`${prefix}/parts`)}
          aria-current={mode === "comparison" ? "page" : undefined}
        >
          Peça · materiais
        </Link>
        <Link
          href={link(`${prefix}/by-part`)}
          aria-current={mode === "share" ? "page" : undefined}
        >
          Por Peça · blocos
        </Link>
      </nav>
      <section className="panel" aria-label="Filtros de entregas">
        <div className={styles.filters}>
          <label>
            De (UTC)
            <input
              type="date"
              value={filters.from || report?.period.from || ""}
              onChange={(e) => set("from", e.target.value)}
            />
          </label>
          <label>
            Até (UTC)
            <input
              type="date"
              value={filters.to || report?.period.to || ""}
              onChange={(e) => set("to", e.target.value)}
            />
          </label>
          <label>
            Peça · código ou descrição
            <input
              list="parts-catalog"
              aria-label="Buscar peça por código ou descrição"
              placeholder="Busque e selecione no catálogo"
              onChange={(e) => {
                const value = e.target.value;
                const part = report?.options.parts.find(
                  (p) =>
                    p.code === value ||
                    `${p.code} · ${p.name}` === value ||
                    p.name === value,
                );
                if (part) set("code", part.code);
                else if (!value) set("code", "");
              }}
            />
            <datalist id="parts-catalog">
              {report?.options.parts.map((p) => (
                <option key={p.code} value={`${p.code} · ${p.name}`} />
              ))}
            </datalist>
            <select
              aria-label="Peça selecionada"
              value={selected}
              onChange={(e) => set("code", e.target.value)}
            >
              <option value="">
                {mode === "share" ? "Selecione uma peça" : "Todos os materiais"}
              </option>
              {report?.options.parts.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </label>
          {choose(
            "Unidade compatível",
            "unit",
            report?.options.units || [],
            false,
          )}
          {choose("Grupo", "group", report?.options.groups || [])}
          {choose("Bloco de destino", "block", report?.options.blocks || [])}
          <details>
            <summary>
              Selecionar vários blocos
              {selectedBlocks.length ? ` · ${selectedBlocks.length}` : ""}
            </summary>
            <div className={styles.series}>
              {report?.options.blocks.map((block) => (
                <label key={block}>
                  <input
                    type="checkbox"
                    checked={selectedBlocks.includes(block)}
                    onChange={(e) =>
                      set(
                        "blocks",
                        JSON.stringify(
                          e.target.checked
                            ? [...selectedBlocks, block]
                            : selectedBlocks.filter((b) => b !== block),
                        ),
                      )
                    }
                  />
                  {block}
                </label>
              ))}
            </div>
          </details>
          {choose(
            "Almoxarifado de origem da retirada",
            "warehouse",
            report?.options.warehouses || [],
          )}
          <label>
            Ranking
            <select
              value={filters.limit || "10"}
              onChange={(e) => set("limit", e.target.value)}
            >
              <option value="10">10 maiores</option>
              <option value="20">20 maiores</option>
              <option value="50">50 maiores</option>
              <option value="all">Todos · páginas de 50</option>
            </select>
          </label>
        </div>
        <div className={styles.actions}>
          <button
            className="button secondary"
            disabled={loading}
            onClick={() => setRevision((v) => v + 1)}
          >
            Atualizar
          </button>
          <button
            className="button secondary"
            onClick={() => {
              setFilters({});
              setOrigin(null);
              setSeries([]);
            }}
          >
            Limpar filtros
          </button>
          <span>
            Origem indica quem forneceu; destino indica quem recebeu. Filial não
            disponível no cadastro.
          </span>
        </div>
      </section>
      {error ? (
        <section className="panel ops-panel" role="alert">
          <p>{error}</p>
          <button
            className="button secondary"
            onClick={() => setRevision((v) => v + 1)}
          >
            Tentar novamente
          </button>
        </section>
      ) : busy ? (
        <p role="status">Consultando entregas no banco…</p>
      ) : (
        report && (
          <>
            <p className={styles.context}>
              {report.period.from} a {report.period.to} · UTC · {unit} ·
              anterior: {report.comparison.from} a {report.comparison.to}
              <br />
              Atualização:{" "}
              {new Date(report.generatedAt).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}{" "}
              (São Paulo). Base: entregas confirmadas; consumo efetivo não
              medido.
            </p>
            {report.quality.legacyWithoutLedger > 0 && (
              <p role="status">
                Base incompleta: {report.quality.legacyWithoutLedger} pedidos
                entregues sem baixa vinculada foram excluídos. As quantidades
                abaixo cobrem apenas as movimentações encontradas.
              </p>
            )}
            {mode === "share" && !selected ? (
              <section className="panel ops-panel">
                <h2>Selecione uma peça</h2>
                <p>Busque por código ou descrição para comparar os blocos.</p>
              </section>
            ) : (
              <>
                <div className={styles.summary}>
                  <div>
                    <span>Quantidade entregue · {unit}</span>
                    <strong>{number(report.total.quantity)}</strong>
                    <small>{variation(report.total, unit)}</small>
                  </div>
                  <div>
                    <span>Retiradas distintas · pedidos</span>
                    <strong>{number(report.total.withdrawals)}</strong>
                    <small>
                      {mode === "share"
                        ? `Média: ${number(report.total.average)} ${unit} por retirada`
                        : `${report.totalItems} materiais na unidade selecionada`}
                    </small>
                  </div>
                </div>
                <InsightChart
                  variant="bars"
                  title={
                    mode === "comparison"
                      ? `Ranking de materiais · ${unit}`
                      : `Quantidade entregue por bloco · ${unit}`
                  }
                  description={
                    mode === "comparison"
                      ? report.limit === "all"
                        ? `Todos os materiais · página ${report.page} de ${report.pages}. Tabela abaixo com o período anterior.`
                        : `Até ${report.limit} maiores. Tabela abaixo com o período anterior.`
                      : report.participation
                  }
                  unit={unit}
                  rows={
                    mode === "comparison"
                      ? report.ranking.map((p) => ({
                          label: `${p.code} · ${p.name}`,
                          value: p.quantity,
                          color: "var(--blue)",
                        }))
                      : report.blocks.map((b) => ({
                          label: b.label,
                          value: b.quantity,
                          color: "var(--blue)",
                        }))
                  }
                  onSelect={(label) =>
                    investigate(
                      mode === "comparison"
                        ? { detailCode: label.split(" · ")[0] }
                        : { detailBlock: label },
                    )
                  }
                />
                <section className="panel ops-panel">
                  <div className="panel-head">
                    <div>
                      <h2>
                        {mode === "comparison"
                          ? "Materiais e comparação"
                          : "Blocos e participação"}
                      </h2>
                      <p>
                        Clique em Registros para investigar. Percentuais sem
                        período anterior positivo ficam sem base.
                      </p>
                    </div>
                    <div className={styles.actions}>
                      <a
                        className="button secondary"
                        href={link("/api/parts-consumption", {
                          format: "pdf",
                          export: "all",
                        })}
                      >
                        PDF
                      </a>
                      <a
                        className="button secondary"
                        href={link("/api/parts-consumption", {
                          format: "xlsx",
                          export: "all",
                        })}
                      >
                        Planilha
                      </a>
                    </div>
                  </div>
                  <p>
                    Exportação: todos os resultados agregados do filtro,
                    incluindo detalhes complementares; registros de origem são
                    paginados na tela.
                  </p>
                  <div
                    className={styles.scroll}
                    role="region"
                    aria-label="Alternativa tabular ao ranking"
                    tabIndex={0}
                  >
                    <table>
                      <caption>
                        Quantidade entregue · {unit} · atual e período anterior
                        equivalente
                      </caption>
                      <thead>
                        <tr>
                          <th>
                            {mode === "comparison"
                              ? "Código / descrição"
                              : "Bloco"}
                          </th>
                          <th>Unidade</th>
                          <th>Atual</th>
                          <th>Anterior</th>
                          <th>Diferença / variação</th>
                          {mode === "share" && (
                            <>
                              <th>Participação</th>
                              <th>Retiradas / média</th>
                            </>
                          )}
                          <th>Origem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mode === "comparison"
                          ? report.items.map((p) => (
                              <tr
                                key={p.code}
                                {...rowProps({ detailCode: p.code })}
                              >
                                <td>
                                  <Link
                                    href={link(`${prefix}/by-part`, {
                                      code: p.code,
                                      unit: p.unit,
                                      page: "1",
                                    })}
                                  >
                                    {p.code}
                                  </Link>
                                  <small>{p.name}</small>
                                </td>
                                <td>{p.unit}</td>
                                <td>{number(p.quantity)}</td>
                                <td>{number(p.previousQuantity)}</td>
                                <td>{variation(p, p.unit)}</td>
                                <td>
                                  <button
                                    className={styles.textButton}
                                    onClick={() =>
                                      investigate({ detailCode: p.code })
                                    }
                                  >
                                    Registros de {p.code}
                                  </button>
                                </td>
                              </tr>
                            ))
                          : report.blocks.map((b) => (
                              <tr
                                key={b.label}
                                {...rowProps({ detailBlock: b.label })}
                              >
                                <td>{b.label}</td>
                                <td>{unit}</td>
                                <td>{number(b.quantity)}</td>
                                <td>{number(b.previousQuantity)}</td>
                                <td>{variation(b, unit)}</td>
                                <td>
                                  {number(b.percentage)}
                                  {b.percentage !== null && "%"}
                                </td>
                                <td>
                                  {b.withdrawals} / {number(b.average)} {unit}
                                </td>
                                <td>
                                  <button
                                    className={styles.textButton}
                                    onClick={() =>
                                      investigate({ detailBlock: b.label })
                                    }
                                  >
                                    Registros de {b.label}
                                  </button>
                                </td>
                              </tr>
                            ))}
                      </tbody>
                    </table>
                  </div>
                  {(mode === "comparison"
                    ? report.items.length
                    : report.blocks.length) === 0 && (
                    <p>Nenhum registro neste recorte.</p>
                  )}
                  {report.total.withdrawals === 0 && (
                    <p>
                      Nenhuma entrega confirmada encontrada. Quantidade zero não
                      indica consumo efetivo medido.
                    </p>
                  )}
                  {mode === "comparison" && report.pages > 1 && (
                    <div className={styles.actions}>
                      <button
                        className="button secondary"
                        disabled={report.page <= 1}
                        onClick={() => set("page", String(report.page - 1))}
                      >
                        Anterior
                      </button>
                      <span>
                        Página {report.page} de {report.pages}
                      </span>
                      <button
                        className="button secondary"
                        disabled={report.page >= report.pages}
                        onClick={() => set("page", String(report.page + 1))}
                      >
                        Próxima
                      </button>
                    </div>
                  )}
                </section>
                {origin && (
                  <section
                    className={`panel ops-panel ${styles.origins}`}
                    aria-label="Registros de origem"
                  >
                    <h2 ref={originHeading} tabIndex={-1}>
                      Registros de origem
                    </h2>
                    <p>
                      {origin.detailCode || selected} ·{" "}
                      {origin.detailBlock || "Todos os blocos do filtro"} ·{" "}
                      {origin.detailDate ||
                        `${report.period.from} a ${report.period.to}`}{" "}
                      ·{" "}
                      {origin.detailKind === "return"
                        ? "Devoluções conferidas"
                        : origin.detailKind === "request"
                          ? "Pedidos criados"
                          : "Entregas confirmadas"}
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setOrigin(null);
                        mainHeading.current?.focus();
                      }}
                    >
                      Voltar à visão anterior
                    </button>
                    {originLoading ? (
                      <p role="status">Carregando origem…</p>
                    ) : originError ? (
                      <div role="alert">
                        {originError}
                        <button
                          className="button secondary"
                          onClick={() => setOrigin({ ...origin })}
                        >
                          Tentar novamente
                        </button>
                      </div>
                    ) : (
                      originReport && (
                        <>
                          <div
                            className={styles.scroll}
                            tabIndex={0}
                            role="region"
                            aria-label="Registros que compõem o resultado"
                          >
                            <table>
                              <caption>
                                {originReport.total} registros · página{" "}
                                {originReport.page} · máximo 50 linhas
                              </caption>
                              <thead>
                                <tr>
                                  {[
                                    "ID / pedido",
                                    "Data UTC",
                                    "Material",
                                    "Bloco",
                                    "Quantidade",
                                    "Unidade",
                                    "Situação",
                                    "Almoxarifado",
                                    "Requisitante / responsável",
                                  ].map((h) => (
                                    <th key={h}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {originReport.records.map((r) => (
                                  <tr key={r.id}>
                                    <td>
                                      {r.id}
                                      <small>
                                        Pedido: {r.requestId ?? "Sem vínculo"}
                                      </small>
                                    </td>
                                    <td>{r.date}</td>
                                    <td>
                                      {r.code}
                                      <small>{r.name}</small>
                                    </td>
                                    <td>{r.block}</td>
                                    <td>{number(r.quantity)}</td>
                                    <td>{r.unit}</td>
                                    <td>{r.status}</td>
                                    <td>{r.warehouse}</td>
                                    <td>
                                      {r.person}
                                      <small>{r.actor}</small>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {!originReport.total && (
                            <p>Nenhum registro de origem para este recorte.</p>
                          )}
                          <div className={styles.actions}>
                            <button
                              className="button secondary"
                              disabled={originReport.page <= 1}
                              onClick={() =>
                                setOrigin({
                                  ...origin,
                                  detailPage: String(originReport.page - 1),
                                })
                              }
                            >
                              Registros anteriores
                            </button>
                            <button
                              className="button secondary"
                              disabled={
                                originReport.page * 50 >= originReport.total
                              }
                              onClick={() =>
                                setOrigin({
                                  ...origin,
                                  detailPage: String(originReport.page + 1),
                                })
                              }
                            >
                              Próximos registros
                            </button>
                          </div>
                        </>
                      )
                    )}
                  </section>
                )}
                <details
                  className={`panel ops-panel ${styles.details}`}
                  open={timelineOpen}
                  onToggle={(e) => setTimelineOpen(e.currentTarget.open)}
                >
                  <summary>Evolução temporal · até 4 séries</summary>
                  {timelineOpen && (
                    <>
                      <div className={styles.series}>
                        {(selected
                          ? report.blocks.map((b) => ({
                              id: b.label,
                              name: b.label,
                            }))
                          : report.items.map((p) => ({
                              id: p.code,
                              name: `${p.code} · ${p.name}`,
                            }))
                        ).map((s) => (
                          <label key={s.id}>
                            <input
                              type="checkbox"
                              checked={(series.length
                                ? series
                                : report.series
                              ).includes(s.id)}
                              disabled={
                                !(
                                  series.length ? series : report.series
                                ).includes(s.id) &&
                                (series.length ? series : report.series)
                                  .length >= 4
                              }
                              onChange={(e) => {
                                const current = series.length
                                  ? series
                                  : report.series;
                                setSeries(
                                  e.target.checked
                                    ? [...current, s.id]
                                    : current.filter((v) => v !== s.id),
                                );
                              }}
                            />
                            {s.name}
                          </label>
                        ))}
                      </div>
                      <PartsTimeline
                        report={report}
                        onSelect={(s, day) =>
                          investigate({
                            ...(selected
                              ? { detailBlock: s }
                              : { detailCode: s }),
                            detailDate: day,
                          })
                        }
                      />
                    </>
                  )}
                </details>
                {mode === "share" && (
                  <details className={`panel ops-panel ${styles.details}`}>
                    <summary>
                      Pedidos solicitados, entregues e pendentes
                    </summary>
                    <p>{report.cohortMethod}</p>
                    <div className={styles.scroll}>
                      <table>
                        <caption>
                          Coorte de pedidos criados no período · {unit}
                        </caption>
                        <thead>
                          <tr>
                            <th>Bloco</th>
                            <th>Solicitada</th>
                            <th>Entregue até atualização</th>
                            <th>Pendente de confirmação</th>
                            <th>Origem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.cohort.map((c) => (
                            <tr key={c.block}>
                              <td>{c.block}</td>
                              <td>{number(c.requested)}</td>
                              <td>{number(c.delivered)}</td>
                              <td>{number(c.pending)}</td>
                              <td>
                                <button
                                  className={styles.textButton}
                                  onClick={() =>
                                    investigate({
                                      detailKind: "request",
                                      detailBlock: c.block,
                                    })
                                  }
                                >
                                  Pedidos de {c.block}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
                <details className={`panel ops-panel ${styles.details}`}>
                  <summary>Devoluções, danos e distribuição</summary>
                  <p>
                    Conferências no período UTC. Danificado é condição da
                    devolução, não perda medida. Perdas específicas:
                    indisponíveis. Devoluções com origem filtrada exigem vínculo
                    com uma retirada daquele almoxarifado; não há rateio oficial
                    entre origens.
                  </p>
                  <div className={styles.scroll}>
                    <table>
                      <caption>Devoluções conferidas · {unit}</caption>
                      <thead>
                        <tr>
                          <th>Peça</th>
                          <th>Bloco</th>
                          <th>Condição</th>
                          <th>Quantidade</th>
                          <th>Sem pedido</th>
                          <th>Origem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.returns.map((r) => (
                          <tr key={`${r.code}:${r.block}:${r.condition}`}>
                            <td>{r.code}</td>
                            <td>{r.block}</td>
                            <td>{r.condition}</td>
                            <td>{number(r.quantity)}</td>
                            <td>{r.unlinked}</td>
                            <td>
                              <button
                                className={styles.textButton}
                                onClick={() =>
                                  investigate({
                                    detailKind: "return",
                                    detailCode: r.code,
                                    detailBlock: r.block,
                                    detailCondition: r.condition,
                                  })
                                }
                              >
                                Devoluções de {r.code}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!report.returns.length && (
                    <p>Nenhuma devolução conferida encontrada.</p>
                  )}
                  {selected && (
                    <div className={styles.scroll}>
                      <table>
                        <caption>
                          Almoxarifados que atenderam cada bloco · quantidade
                          entregue
                        </caption>
                        <thead>
                          <tr>
                            <th>Bloco</th>
                            <th>Origem</th>
                            <th>Quantidade · {unit}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.distribution.map((d) => (
                            <tr key={`${d.block}:${d.warehouse}`}>
                              <td>{d.block}</td>
                              <td>{d.warehouse}</td>
                              <td>{number(d.quantity)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </details>
                <details
                  className={`panel ops-panel ${styles.details}`}
                  open={planningOpen}
                  onToggle={(e) => setPlanningOpen(e.currentTarget.open)}
                >
                  <summary>Saldos atuais e recomendação de estoque</summary>
                  <p>
                    Saldos por almoxarifado de origem, atualizados agora; não
                    representam saldo no bloco de destino nem saldo histórico.
                  </p>
                  <div className={styles.scroll}>
                    <table>
                      <caption>
                        Estoque dos materiais desta página · {unit}
                      </caption>
                      <thead>
                        <tr>
                          <th>Peça</th>
                          <th>Almoxarifado</th>
                          <th>Físico</th>
                          <th>Disponível após reservas</th>
                          <th>Mínimo cadastrado local</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.stocks.map((s) => (
                          <tr key={`${s.code}:${s.warehouse}`}>
                            <td>{s.code}</td>
                            <td>{s.warehouse}</td>
                            <td>{number(s.physical)}</td>
                            <td>{number(s.available)}</td>
                            <td>{number(s.minimum)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p>{report.quality.coverageUnavailable}</p>
                  {!report.stocks.length && (
                    <p>
                      Saldo indisponível: não há inventário cadastrado para os
                      materiais e almoxarifados deste recorte.
                    </p>
                  )}
                  {planningOpen && selected && (
                    <PartsPlanning
                      code={selected}
                      from={report.period.from}
                      to={report.period.to}
                      warehouse={report.filters.warehouse}
                      revision={revision}
                    />
                  )}
                  <Link
                    href={`${role === "admin" ? "/admin" : "/warehouse"}/recommendations?${new URLSearchParams({ from: report.period.from, to: report.period.to, ...(selected ? { code: selected } : {}) })}`}
                  >
                    Consultar sugestões no planejamento existente
                  </Link>
                  <p>
                    Proximidade depende de locais mapeados e rotas válidas.
                    Nenhuma movimentação é criada por este painel.
                  </p>
                </details>
              </>
            )}
            <details className={`panel ops-panel ${styles.details}`}>
              <summary>Qualidade dos dados e alertas</summary>
              <div className={styles.quality}>
                <span>
                  Linhas entregues sem bloco:{" "}
                  <strong>{report.quality.missingBlock}</strong>
                </span>
                <span>
                  Materiais de outras unidades, separados sem conversão:{" "}
                  <strong>{report.quality.nonConvertible}</strong>
                </span>
                <span>
                  Materiais entregues sem custo oficial:{" "}
                  <strong>{report.quality.missingCost}</strong>
                </span>
                <span>
                  Sem preço de referência (não é custo oficial):{" "}
                  <strong>{report.quality.missingReferencePrice}</strong>
                </span>
                <span>
                  Materiais com histórico insuficiente:{" "}
                  <strong>{report.quality.insufficientHistory}</strong>
                </span>
                <span>
                  Pedidos entregues sem baixa vinculada (excluídos):{" "}
                  <strong>{report.quality.legacyWithoutLedger}</strong>
                </span>
              </div>
              <p>{report.quality.financialUnavailable}</p>
              <label>
                Alerta de aumento acima da média (%)
                <input
                  type="number"
                  min="10"
                  max="500"
                  value={filters.threshold || "50"}
                  onChange={(e) => set("threshold", e.target.value)}
                />
              </label>
              <p>
                Critério: atual maior que a média dos 3 períodos anteriores de{" "}
                {report.period.days} dias × (1 + limiar/100), exigindo entregas
                positivas nos 3 períodos, sob os mesmos filtros. Ausência de
                atividade não serve de base. Um alerta aponta aumento para
                investigação; não determina desperdício ou causa.
              </p>
              {report.items
                .filter((p) => p.alert)
                .map((p) => (
                  <p key={p.code} className={styles.alert}>
                    {p.code}: atual {number(p.alert!.quantity)} {unit};
                    anteriores {p.alert!.history.map(number).join(", ")}; média{" "}
                    {number(p.alert!.baseline)} {unit}; limiar +
                    {report.threshold}%.{" "}
                    <button
                      className={styles.textButton}
                      onClick={() => investigate({ detailCode: p.code })}
                    >
                      Investigar
                    </button>
                  </p>
                ))}
              <p>Alertas exibidos para os materiais desta página.</p>
            </details>
            <details className={`panel ops-panel ${styles.details}`}>
              <summary>Definições e limites da base</summary>
              <p>{report.methodology}</p>
              <p>
                Estornos e duplicatas de importação sem identificador/correlação
                não podem ser inferidos. Não são somados os indicadores
                históricos consumed_30/previous_30 do cadastro.
              </p>
            </details>
          </>
        )
      )}
    </div>
  );
}
