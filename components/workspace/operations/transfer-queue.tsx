"use client";
import { useEffect, useState } from "react";
import { useDemoStore } from "../demo-store";
import { DashboardDialog } from "./dashboard-dialog";
import { CodeScanner } from "./code-scanner";
import { DistributionMap } from "./distribution-map";
import type { RouteOptions } from "@/lib/routing";
type Transfer = {
  id: number;
  code: string;
  quantity: number;
  unit: string;
  sourceNode?: string;
  destinationNode?: string;
  source: string;
  destination: string;
  status: string;
  reason: string;
  requester: string;
  shipper: string | null;
  receiver: string | null;
  created_at: string;
  shipped_at: string | null;
  received_at: string | null;
};
export function TransferQueue({
  mode = "all",
  codeFilter = "",
  warehouseFilter = "",
  blockFilter = "",
  from = "",
  to = "",
}: {
  mode?: "all" | "analysis" | "history";
  codeFilter?: string;
  warehouseFilter?: string;
  blockFilter?: string;
  from?: string;
  to?: string;
}) {
  const { runAction } = useDemoStore();
  const [items, setItems] = useState<Transfer[]>([]),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [mapVersion, setMapVersion] = useState<number | null>(null);
  const [routeOptions, setRouteOptions] = useState<Record<number, RouteOptions>>({});
  useEffect(() => {
    const update = () => setRevision((r) => r + 1);
    window.addEventListener("marcon:workspace-updated", update);
    window.addEventListener("marcon:map-published", update);
    return () => { window.removeEventListener("marcon:workspace-updated", update); window.removeEventListener("marcon:map-published", update); };
  }, []);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Transfer | null>(null),
    [code, setCode] = useState(""),
    [quantity, setQuantity] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/workspace?${new URLSearchParams({ transfers: "1", page: String(page), mode, code: codeFilter, warehouse: warehouseFilter, block: blockFilter, from, to })}`,
      {
        signal: controller.signal,
      },
    )
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        setItems(b.transfers);
        setMapVersion(b.mapVersion);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    page,
    revision,
    mode,
    codeFilter,
    warehouseFilter,
    blockFilter,
    from,
    to,
  ]);
  async function confirm(cancel = false) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await runAction({
        type: cancel
          ? "cancelTransfer"
          : selected.status === "Solicitada"
            ? "dispatchTransfer"
            : "receiveTransfer",
        id: selected.id,
        qrCode: code,
        confirmedQuantity: Number(quantity),
        ...routeOptions[selected.id],
        reason: "Solicitação cancelada pelo responsável",
      });
      setMessage(
        cancel
          ? "Solicitação cancelada."
          : selected.status === "Solicitada"
            ? "Saída confirmada. Próximo passo: conferir o recebimento no destino."
            : "Recebimento confirmado. Transferência concluída.",
      );
      setSelected(null);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na confirmação.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="map-route-summary">
      {mode === "analysis" && (
        <p>
          Solicitações e transferências ainda em andamento, inclusive anteriores
          ao período selecionado.
        </p>
      )}
      {mode === "history" && (
        <p>
          Transferências encerradas, solicitadas no período {from || "inicial"}{" "}
          a {to || "atual"}.
        </p>
      )}
      <h3>Transferências: solicitação → saída → recebimento</h3>
      <p>
        A solicitação compromete o disponível sem movimentar o físico. A saída confere novamente
        reservas e mínimo da origem; o destino só recebe saldo após conferência.
      </p>
      <button
        className="button secondary"
        onClick={() => {
          setLoading(true);
          setRevision((v) => v + 1);
        }}
      >
        Atualizar transferências
      </button>
      {loading && <p role="status">Carregando transferências…</p>}
      {message && <p role="status">{message}</p>}
      {error && !selected && <p role="alert">{error}</p>}
      {!loading && !items.length && <p>Nenhuma transferência nesta página.</p>}
      {items.map((t) => (
        <article className="ops-suggestion" key={t.id}>
          <div>
            <strong>
              #{t.id} · {t.code} · {t.quantity} {t.unit} · {t.status}
            </strong>
            <p>
              {t.source} → {t.destination}
              <br />
              {t.reason}
            </p>
            <ol
              className="workflow-steps"
              aria-label={`Etapas da transferência ${t.id}`}
            >
              <li className="complete">
                Solicitada<small>{t.created_at}</small>
              </li>
              <li className={t.shipped_at ? "complete" : ""}>
                Saída confirmada
                <small>
                  {t.shipped_at ??
                    (t.status === "Cancelada"
                      ? "Não realizada"
                      : "Aguardando conferência")}
                </small>
              </li>
              <li className={t.received_at ? "complete" : ""}>
                Recebimento confirmado
                <small>
                  {t.received_at ??
                    (t.status === "Cancelada"
                      ? "Não realizado"
                      : "Aguardando chegada")}
                </small>
              </li>
            </ol>
            <details>
              <summary>Responsáveis e horários</summary>
              <p>
                Solicitação: {t.requester} · {t.created_at}
                <br />
                Saída: {t.shipper ?? "Não registrada"} · {t.shipped_at ?? "—"}
                <br />
                Recebimento: {t.receiver ?? "Não registrado"} ·{" "}
                {t.received_at ?? "—"}
              </p>
            </details>
            {["Solicitada", "Em trânsito"].includes(t.status) && <DistributionMap key={`${mapVersion}:${t.id}`} version={mapVersion} from={t.source} to={t.destination} fromNode={t.sourceNode} toNode={t.destinationNode} onStart={(_node, parameters) => setRouteOptions((old) => ({ ...old, [t.id]: parameters }))} />}
          </div>
          {["Solicitada", "Em trânsito"].includes(t.status) && (
            <button
              className="button secondary"
              onClick={() => {
                setSelected(t);
                setCode("");
                setQuantity("");
                setError("");
              }}
            >
              {t.status === "Solicitada"
                ? "Conferir saída"
                : "Conferir recebimento"}
            </button>
          )}
        </article>
      ))}
      <button
        className="button secondary"
        disabled={page === 1}
        onClick={() => setPage((p) => p - 1)}
      >
        Página anterior
      </button>
      <button
        className="button secondary"
        disabled={items.length < 50}
        onClick={() => setPage((p) => p + 1)}
      >
        Próxima página
      </button>
      <DashboardDialog
        compact
        open={!!selected}
        title="Conferir transferência"
        onClose={() => {
          if (!busy) setSelected(null);
        }}
      >
        <p>
          {selected?.code} · {selected?.quantity} unidades · {selected?.source}{" "}
          → {selected?.destination}. Confirme somente após a conferência física.
        </p>
        <CodeScanner expectedCode={selected?.code} onCode={setCode} onInvalid={() => setCode("")} />
        <label>
          Código conferido
          <input value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <label>
          Quantidade conferida
          <input
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button
          className="button primary"
          disabled={busy || !code || Number(quantity) !== selected?.quantity}
          onClick={() => void confirm()}
        >
          Confirmar{" "}
          {selected?.status === "Solicitada" ? "saída" : "recebimento"}
        </button>
        {selected?.status === "Solicitada" && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void confirm(true)}
          >
            Cancelar solicitação
          </button>
        )}
      </DashboardDialog>
    </section>
  );
}
