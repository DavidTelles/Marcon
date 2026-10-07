"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useDemoStore } from "../demo-store";
import { CodeScanner } from "../operations/code-scanner";
import { heading, badge } from "../ui";
import type { Role } from "@/lib/workspace-routes";
import styles from "./pcp.module.css";
import type { WorkspaceSnapshot } from "@/lib/workspace-db";

type Warehouse = {
  id: number;
  name: string;
  pcp_kind: string;
  is_central?: number;
};
type RecordRow = {
  id: number;
  part_id: number;
  name: string;
  code: string;
  unit: string;
  status: string;
  invoice_quantity?: number;
  invoice_weight?: number;
  counted_quantity?: number;
  invoice?: string;
  lot?: string;
  totus_reference?: string;
  quantity?: number;
  transfer_id?: number;
};
type Field = {
  key: string;
  label: string;
  type?: "number" | "weight" | "qr" | "warehouse";
  optional?: boolean;
  kind?: string;
};
type Operation = {
  title: string;
  route: string;
  method: "POST" | "PATCH";
  data?: Record<string, unknown>;
  fields: Field[];
  itemId?: number;
};
const counted: Field = {
  key: "quantidadeConferida",
  label: "Quantidade física conferida",
  type: "number",
};
const qr: Field = { key: "qrCode", label: "Código da etiqueta", type: "qr" };
const destination: Field = {
  key: "destinoId",
  label: "Almoxarifado de destino",
  type: "warehouse",
  kind: "almoxarifado",
};

export function PcpScreen({ role }: { role: Role }) {
  const { stock, setStock, setBalances } = useDemoStore();
  const stockUser = role === "admin" || role === "almoxarifado";
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [receipts, setReceipts] = useState<RecordRow[]>([]);
  const [requests, setRequests] = useState<RecordRow[]>([]);
  const [consumables, setConsumables] = useState<RecordRow[]>([]);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [configuredWarehouse, setConfiguredWarehouse] = useState("");
  const [binding, setBinding] = useState("");
  const [bindingConfirmed, setBindingConfirmed] = useState(false);
  const [readCode, setReadCode] = useState("");
  const [validation, setValidation] = useState<{
    id: number;
    saldoTotal: number;
    saldoOrigem: number;
    pedidoCompraSuficiente: boolean;
    podeLiberar: boolean;
  } | null>(null);
  const [transferStatuses, setTransferStatuses] = useState<
    Record<number, string>
  >({});
  const retryKeys = useRef(new Map<string, string>());
  const pending = useRef(false);
  const selected = stock.find((p) => String(p.id) === selectedId);

  const load = useCallback(async () => {
    async function get<T>(path: string): Promise<T> {
      const response = await fetch(`/api/pcp/${path}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Dados PCP indisponíveis.");
      return data;
    }
    const [w, r, c, incoming, snapshot] = await Promise.all([
      get<Warehouse[]>("armazens"),
      get<RecordRow[]>("requisicoes"),
      get<RecordRow[]>("consumiveis/requisicoes"),
      stockUser ? get<RecordRow[]>("recebimentos") : Promise.resolve([]),
      fetch("/api/workspace", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error("Catálogo indisponível.");
        return (await response.json()) as WorkspaceSnapshot;
      }),
    ]);
    setStock(snapshot.stock);
    setBalances(snapshot.balances);
    setWarehouses(w);
    setRequests(r);
    setConsumables(c);
    setReceipts(incoming);
    const parts = [
      ...new Set(
        r
          .filter((row) => row.transfer_id && row.status === "Liberada")
          .map((row) => row.part_id),
      ),
    ];
    const histories = stockUser
      ? await Promise.all(
          parts.map((id) =>
            get<{ transferencias: { id: number; status: string }[] }>(
              `estoque/${id}/historico-transferencias`,
            ),
          ),
        )
      : [];
    setTransferStatuses(
      Object.fromEntries(
        histories.flatMap((h) => h.transferencias.map((t) => [t.id, t.status])),
      ),
    );
  }, [stockUser, setStock, setBalances]);
  useEffect(() => {
    void Promise.resolve()
      .then(load)
      .catch((error) => setMessage(error.message));
  }, [load]);
  function open(value: Operation) {
    setOperation(value);
    setReadCode("");
    setMessage("");
  }
  async function send(
    route: string,
    method: "POST" | "PATCH",
    data: Record<string, unknown>,
  ) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    const identity = JSON.stringify({ route, method, data });
    const requestKey = retryKeys.current.get(identity) || crypto.randomUUID();
    retryKeys.current.set(identity, requestKey);
    try {
      const response = await fetch(`/api/pcp/${route}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, requestKey }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Operação não concluída.");
      retryKeys.current.delete(identity);
      setOperation(null);
      setBinding("");
      setBindingConfirmed(false);
      setMessage("Operação registrada. Saldos e status atualizados.");
      try {
        await load();
      } catch {
        setMessage(
          "Operação registrada. Use Atualizar para consultar os dados novamente.",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Falha ao registrar.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!operation) return;
    const form = new FormData(event.currentTarget);
    const data = { ...operation.data };
    for (const field of operation.fields) {
      const value = String(form.get(field.key) ?? "");
      if (field.optional && !value) continue;
      data[field.key] = ["number", "weight", "warehouse"].includes(
        field.type || "",
      )
        ? Number(value)
        : value;
    }
    void send(operation.route, operation.method, data);
  }
  async function validate(row: RecordRow) {
    try {
      const response = await fetch(`/api/pcp/requisicoes/${row.id}/validacao`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setValidation({ ...data, id: row.id });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha na consulta.");
    }
  }
  function newRequest(consumable: boolean) {
    if (!selected || (selected.materialKind === "consumivel") !== consumable) {
      setMessage("Selecione um item do tipo correto no catálogo abaixo.");
      return;
    }
    open({
      title: `Requisitar ${selected.code} · ${selected.name}`,
      route: consumable ? "consumiveis/requisicoes" : "requisicoes",
      method: "POST",
      itemId: selected.id,
      data: { itemId: selected.id },
      fields: [
        { key: "quantidade", label: "Quantidade solicitada", type: "number" },
        {
          key: "origemId",
          label: "Almoxarifado de origem",
          type: "warehouse",
          kind: "almoxarifado",
        },
        ...(!consumable
          ? [
              {
                key: "destinoId",
                label: "Armazém de produção",
                type: "warehouse",
                kind: "producao",
              } as Field,
            ]
          : []),
        { key: "centroCusto", label: "Centro de custo" },
        { key: "ordemProducao", label: "Ordem de produção", optional: true },
      ],
    });
  }
  const product = operation
    ? stock.find((p) => p.id === operation.itemId)
    : null;
  return (
    <div className={styles.screen}>
      {heading(
        "PCP Marcon",
        "Recebimento, qualidade e produção",
        "Conferência da nota e qualidade liberam o lote. Produção exige saldo, pedido e retirada conferida. Consumíveis têm baixa direta.",
      )}
      <button
        className="button secondary"
        disabled={busy}
        onClick={() => void load().catch((error) => setMessage(error.message))}
      >
        Atualizar
      </button>
      {message && (
        <p role="status" className={styles.message}>
          {message}
        </p>
      )}
      {role === "admin" && (
        <details className={styles.card}>
          <summary>Configurar armazém de produção</summary>
          <p>
            Selecione um armazém físico já cadastrado ou cadastre um novo.
            Vincule sua posição na planta para planejar percursos.
          </p>
          <label>
            Armazém físico{" "}
            <select
              value={configuredWarehouse}
              onChange={(event) => setConfiguredWarehouse(event.target.value)}
            >
              <option value="">Selecione</option>
              {warehouses
                .filter((w) => !w.is_central)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} · {w.pcp_kind}
                  </option>
                ))}
            </select>
          </label>
          <div className={styles.actions}>
            <button
              className="button secondary"
              disabled={busy || !configuredWarehouse}
              onClick={() =>
                void send(`armazens/${configuredWarehouse}`, "PATCH", {
                  tipo: "producao",
                })
              }
            >
              Definir como produção
            </button>
            <button
              className="button secondary"
              disabled={busy || !configuredWarehouse}
              onClick={() =>
                void send(`armazens/${configuredWarehouse}`, "PATCH", {
                  tipo: "almoxarifado",
                })
              }
            >
              Definir como almoxarifado
            </button>
            <button
              className="button secondary"
              onClick={() =>
                open({
                  title: "Cadastrar armazém de produção",
                  route: "armazens",
                  method: "POST",
                  data: { tipo: "producao" },
                  fields: [
                    { key: "codigo", label: "Código do armazém" },
                    { key: "nome", label: "Nome do armazém físico" },
                  ],
                })
              }
            >
              Cadastrar armazém
            </button>
          </div>
        </details>
      )}
      <section className={styles.card}>
        <h2>Produto e etiqueta</h2>
        <label>
          Produto{" "}
          <select
            id="pcp-product"
            aria-label="Produto"
            value={selectedId}
            onChange={(event) => {
              setSelectedId(event.target.value);
              setBinding("");
              setBindingConfirmed(false);
            }}
          >
            <option value="">Selecione o produto</option>
            {stock.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
        </label>
        <CodeScanner
          onCode={(code) => {
            const p = stock.find((item) => item.code === code);
            if (p) {
              setSelectedId(String(p.id));
              setBinding("");
              setBindingConfirmed(false);
            } else
              setMessage("Atualize o catálogo para consultar este produto.");
          }}
        />
        {selected && (
          <>
            <p>
              <strong>
                {selected.code} · {selected.name}
              </strong>{" "}
              · {selected.unit || "un"} ·{" "}
              {selected.materialKind || "componente"}
            </p>
            <p>
              Conteúdo vinculado:{" "}
              <code>{selected.qrCode || selected.code}</code>
            </p>
            <a
              className="button secondary"
              href={`/api/items/${selected.id}/label`}
              target="_blank"
              rel="noreferrer"
            >
              Abrir QR para impressão
            </a>
            <div className={styles.actions}>
              <button className="button" onClick={() => newRequest(false)}>
                Requisitar para produção
              </button>
              <button
                className="button secondary"
                onClick={() => newRequest(true)}
              >
                Requisitar consumível
              </button>
              {stockUser && selected.materialKind !== "consumivel" && (
                <button
                  className="button"
                  onClick={() =>
                    open({
                      title: `Receber ${selected.code} · ${selected.name}`,
                      route: "recebimentos",
                      method: "POST",
                      itemId: selected.id,
                      data: { itemId: selected.id },
                      fields: [
                        { key: "notaFiscal", label: "Nota fiscal" },
                        { key: "lote", label: "Lote" },
                        {
                          key: "quantidadeNota",
                          label: "Quantidade na nota",
                          type: "number",
                        },
                        {
                          key: "pesoNota",
                          label: "Peso na nota (kg, se aplicável)",
                          type: "weight",
                          optional: true,
                        },
                      ],
                    })
                  }
                >
                  Registrar recebimento
                </button>
              )}
            </div>
            {stockUser && (
              <details>
                <summary>Vincular o QR da etiqueta deste produto</summary>
                <p>
                  Leia uma única etiqueta de{" "}
                  <strong>
                    {selected.code} · {selected.name}
                  </strong>{" "}
                  e confirme o vínculo.
                </p>
                <CodeScanner
                  raw
                  onCode={(value) => {
                    setBinding(value);
                    setBindingConfirmed(false);
                  }}
                />
                <label>
                  Conteúdo exato lido{" "}
                  <input
                    value={binding}
                    maxLength={128}
                    onChange={(event) => {
                      setBinding(event.target.value);
                      setBindingConfirmed(false);
                    }}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={bindingConfirmed}
                    onChange={(event) =>
                      setBindingConfirmed(event.target.checked)
                    }
                  />{" "}
                  A etiqueta corresponde a {selected.code} · {selected.name}.
                </label>
                <button
                  className="button"
                  disabled={busy || !binding || !bindingConfirmed}
                  onClick={() =>
                    void send(`produtos/${selected.id}/qr`, "PATCH", {
                      qrCode: binding,
                      confirmado: true,
                    })
                  }
                >
                  Salvar vínculo
                </button>
              </details>
            )}
          </>
        )}
      </section>
      {stockUser && (
        <section className={styles.card}>
          <h2>Recebimentos e qualidade</h2>
          {!receipts.length && <p>Nenhum recebimento registrado.</p>}
          {receipts.map((r) => (
            <article
              key={r.id}
              className={styles.row}
              data-marco-record-kind="recebimento"
              data-marco-record-id={r.id}
            >
              <h3>
                #{r.id} · {r.code} · {r.name}
              </h3>
              <p>
                NF {r.invoice} · Lote {r.lot} · {r.invoice_quantity} {r.unit}{" "}
                {r.invoice_weight != null && `· ${r.invoice_weight} kg`}
              </p>
              {badge(r.status)}
              <div className={styles.actions}>
                {[
                  "Aguardando conferência",
                  "Pendente",
                  "Aguardando qualidade",
                ].includes(r.status) && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      open({
                        title: `Conferir recebimento #${r.id}`,
                        route: `recebimentos/${r.id}/conferencia`,
                        method: "PATCH",
                        itemId: r.part_id,
                        fields: [
                          counted,
                          ...(r.invoice_weight != null
                            ? [
                                {
                                  key: "pesoConferido",
                                  label: "Peso físico conferido (kg)",
                                  type: "weight",
                                } as Field,
                              ]
                            : []),
                        ],
                      })
                    }
                  >
                    Conferir nota
                  </button>
                )}
                {r.status === "Aguardando qualidade" && !r.totus_reference && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      open({
                        title: "Registrar lançamento manual no Totus",
                        route: `recebimentos/${r.id}/lancamento-totus`,
                        method: "POST",
                        data: { modo: "manual" },
                        fields: [
                          {
                            key: "referencia",
                            label: "Protocolo ou comprovante do lançamento",
                          },
                        ],
                      })
                    }
                  >
                    Lançamento Totus
                  </button>
                )}
                {r.status === "Aguardando qualidade" &&
                  r.totus_reference &&
                  ["aprovado", "reprovado"].map((result) => (
                    <button
                      key={result}
                      className="button secondary"
                      onClick={() =>
                        open({
                          title: `${result === "aprovado" ? "Aprovar" : "Reprovar"} qualidade do lote #${r.id}`,
                          route: `recebimentos/${r.id}/validacao-qualidade`,
                          method: "PATCH",
                          data: { resultado: result },
                          fields: [
                            { key: "motivo", label: "Parecer da qualidade" },
                          ],
                        })
                      }
                    >
                      {result === "aprovado"
                        ? "Aprovar qualidade"
                        : "Reprovar qualidade"}
                    </button>
                  ))}
                {r.status === "Aprovado" && (
                  <button
                    className="button"
                    onClick={() =>
                      open({
                        title: `Liberar lote #${r.id} ao almoxarifado`,
                        route: "estoque/transferencias",
                        method: "POST",
                        itemId: r.part_id,
                        data: { recebimentoId: r.id },
                        fields: [destination, counted, qr],
                      })
                    }
                  >
                    Transferir ao almoxarifado
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
      <section className={styles.card}>
        <h2>Requisições de produção</h2>
        {validation && (
          <p role="status">
            Requisição #{validation.id}: saldo total {validation.saldoTotal};
            origem disponível {validation.saldoOrigem}; pedido{" "}
            {validation.pedidoCompraSuficiente ? "suficiente" : "pendente"};
            liberação {validation.podeLiberar ? "permitida" : "pendente"}.
          </p>
        )}
        {!requests.length && <p>Nenhuma requisição registrada.</p>}
        {requests.map((r) => (
          <article
            key={r.id}
            className={styles.row}
            data-marco-record-kind="requisicao"
            data-marco-record-id={r.id}
          >
            <h3>
              #{r.id} · {r.code} · {r.name}
            </h3>
            <p>
              {r.quantity} {r.unit}
            </p>
            {badge(r.status)}
            <div className={styles.actions}>
              <button
                className="button secondary"
                onClick={() => void validate(r)}
              >
                Consultar validação
              </button>
              {stockUser && ["Pendente", "Separada"].includes(r.status) && (
                <>
                  <button
                    className="button secondary"
                    onClick={() =>
                      open({
                        title: `Pedido para requisição #${r.id}`,
                        route: "pedidos-compra",
                        method: "POST",
                        data: { requisicaoId: r.id },
                        fields: [
                          {
                            key: "quantidade",
                            label: "Quantidade do pedido",
                            type: "number",
                          },
                          {
                            key: "referencia",
                            label: "Referência do pedido de compra",
                          },
                        ],
                      })
                    }
                  >
                    Registrar pedido
                  </button>
                  <button
                    className="button secondary"
                    onClick={() =>
                      open({
                        title: `Conferir retirada #${r.id}`,
                        route: `requisicoes/${r.id}/confirmar-retirada`,
                        method: "PATCH",
                        itemId: r.part_id,
                        fields: [counted, qr],
                      })
                    }
                  >
                    Conferir retirada
                  </button>
                </>
              )}
              {stockUser && r.status === "Separada" && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void send(`requisicoes/${r.id}/liberar`, "PATCH", {})
                  }
                >
                  Liberar requisição
                </button>
              )}
              {stockUser && r.status === "Liberada" && (
                <button
                  className="button"
                  onClick={() =>
                    open({
                      title: `${transferStatuses[Number(r.transfer_id)] === "Em trânsito" ? "Receber na produção" : "Expedir à produção"} · #${r.id}`,
                      route: "estoque/transferencias",
                      method: "POST",
                      itemId: r.part_id,
                      data: {
                        requisicaoId: r.id,
                        etapa:
                          transferStatuses[Number(r.transfer_id)] ===
                          "Em trânsito"
                            ? "receber"
                            : "expedir",
                      },
                      fields: [counted, qr],
                    })
                  }
                >
                  {transferStatuses[Number(r.transfer_id)] === "Em trânsito"
                    ? "Receber na produção"
                    : "Expedir à produção"}
                </button>
              )}
            </div>
          </article>
        ))}
      </section>
      <section className={styles.card}>
        <h2>Consumíveis</h2>
        <p>
          Classifique o produto como Consumível no cadastro de estoque para usar
          este fluxo.
        </p>
        {!consumables.length && (
          <p>Nenhuma requisição de consumível registrada.</p>
        )}
        {consumables.map((r) => (
          <article
            key={r.id}
            className={styles.row}
            data-marco-record-kind="consumivel"
            data-marco-record-id={r.id}
          >
            <h3>
              #{r.id} · {r.code} · {r.name}
            </h3>
            <p>
              {r.quantity} {r.unit}
            </p>
            {badge(r.status)}
            {stockUser && r.status === "Pendente" && (
              <button
                className="button"
                onClick={() =>
                  open({
                    title: `Baixar consumível #${r.id}`,
                    route: `consumiveis/requisicoes/${r.id}/baixa`,
                    method: "PATCH",
                    itemId: r.part_id,
                    fields: [counted, qr],
                  })
                }
              >
                Conferir e dar baixa
              </button>
            )}
          </article>
        ))}
      </section>
      {operation && (
        <div className={styles.overlay}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={operation.title}
            className={styles.dialog}
          >
            <h2>{operation.title}</h2>
            {product && (
              <p>
                Produto esperado:{" "}
                <strong>
                  {product.code} · {product.name}
                </strong>
              </p>
            )}
            <form onSubmit={submit}>
              {operation.fields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  {field.optional ? " (opcional)" : ""}
                  {field.type === "warehouse" ? (
                    <select name={field.key} required>
                      <option value="">Selecione</option>
                      {warehouses
                        .filter((w) => w.pcp_kind === field.kind)
                        .map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                    </select>
                  ) : field.type === "qr" ? (
                    <input
                      name={field.key}
                      value={readCode}
                      required
                      maxLength={128}
                      onChange={(event) => setReadCode(event.target.value)}
                    />
                  ) : (
                    <input
                      name={field.key}
                      type={
                        field.type === "number" || field.type === "weight"
                          ? "number"
                          : "text"
                      }
                      min={field.type === "number" ? 0 : undefined}
                      step={
                        field.type === "weight"
                          ? "0.000001"
                          : field.type === "number"
                            ? "1"
                            : undefined
                      }
                      required={!field.optional}
                      maxLength={field.key === "motivo" ? 1000 : 120}
                    />
                  )}
                </label>
              ))}
              {operation.fields.some((f) => f.type === "qr") && (
                <CodeScanner
                  onCode={(code) => {
                    if (product && product.code !== code)
                      setMessage(
                        `Etiqueta de ${code} não corresponde ao produto esperado ${product.code}.`,
                      );
                    else setReadCode(code);
                  }}
                />
              )}
              {message && <p role="alert">{message}</p>}
              <div className={styles.actions}>
                <button className="button" disabled={busy} type="submit">
                  {busy ? "Registrando…" : "Confirmar operação"}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  type="button"
                  onClick={() => setOperation(null)}
                >
                  Fechar
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
