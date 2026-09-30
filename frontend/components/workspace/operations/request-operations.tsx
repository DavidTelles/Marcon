"use client";
import { useState } from "react";
import type { Role } from "@/lib/workspace-routes";
import { can } from "@/lib/permissions";
import { useDemoStore } from "../demo-store";
import { CodeScanner } from "./code-scanner";
import { DeliveryRoute } from "./delivery-route";
export function RequestOperations({
  id,
  role,
  request,
  beforeAction,
  onComplete,
}: {
  id: number;
  role: Role;
  request?: import("@/lib/demo-data").Request;
  beforeAction?: () => Promise<boolean>;
  onComplete?: () => void;
}) {
  const { requests, runAction } = useDemoStore(),
    r = request ?? requests.find((r) => r.id === id);
  const [quantity, setQuantity] = useState(""),
    [reason, setReason] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  if (!r) return null;
  async function action(type: string, extra: object = {}) {
    if (beforeAction && !(await beforeAction())) return;
    setBusy(true);
    setMessage("");
    try {
      await runAction({ type, id, ...extra });
      onComplete?.();
      setMessage("Operação confirmada.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ops-actions">
      <p>
        Etapa atual: <strong>{r.status}</strong> · Reserva: {r.reserved ?? 0} ·
        Setor: {r.sector || "Não informado"}
        {r.batchId && <> · Carrinho {r.batchId.slice(0, 8)}</>}
      </p>
      {r.allocations?.map((a) => (
        <p key={a.warehouse}>
          Separar {a.quantity} em {a.warehouse} · {a.location}
        </p>
      ))}
      {r.cancellationReason && <p>Cancelamento: {r.cancellationReason}</p>}
      {role === "funcionario" &&
        ["Pendente", "Em análise"].includes(r.status) && (
          <>
            <label>
              Nova quantidade
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            <div className="head-actions">
              <button
                className="button primary"
                disabled={busy || !quantity}
                onClick={() =>
                  void action("editRequest", { quantity: Number(quantity) })
                }
              >
                Salvar quantidade
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void action("deleteRequest")}
              >
                Excluir pedido
              </button>
            </div>
          </>
        )}
      {role === "funcionario" && r.status === "Aprovada" && (
        <>
          <label>
            Motivo do cancelamento
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            className="button secondary"
            disabled={busy || reason.trim().length < 3}
            onClick={() => void action("requestCancellation", { reason })}
          >
            Solicitar cancelamento
          </button>
        </>
      )}
      {role === "funcionario" && r.status === "Entregue" && (
        <>
          {r.receivedAt ? (
            <p>Recebimento confirmado: {r.receivedAt}</p>
          ) : (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void action("confirmReceipt")}
            >
              Confirmar recebimento
            </button>
          )}
          <p>
            Para devolver, encaminhe o material ao almoxarife informando o
            pedido #{r.id}. O saldo só aumenta após conferência.
          </p>
        </>
      )}
      {can(role, "approve") &&
        ["Pendente", "Em análise", "Aprovada"].includes(r.status) && (
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              void action("changeRequestStatus", { status: "Aprovada" })
            }
          >
            {r.status === "Aprovada"
              ? "Revalidar reserva"
              : "Aprovar e reservar"}
          </button>
        )}
      {(can(role, "approve") || can(role, "stock")) &&
        [
          "Pendente",
          "Em análise",
          "Aprovada",
          "Cancelamento solicitado",
        ].includes(r.status) && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void action("changeRequestStatus", {
                status: "Cancelada",
                reason: reason || "Cancelamento confirmado pelo responsável",
              })
            }
          >
            Confirmar cancelamento
          </button>
        )}
      {can(role, "stock") && r.status === "Aprovada" && (
        <>
          <CodeScanner onCode={setCode} />
          <label>
            Código conferido
            <input value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <label>
            Quantidade separada
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <button
            className="button primary"
            disabled={busy || !code || Number(quantity) !== r.quantity}
            onClick={() =>
              void action("changeRequestStatus", {
                status: "Entregue",
                qrCode: code,
                confirmedQuantity: Number(quantity),
              })
            }
          >
            Confirmar entrega e baixa
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
      {can(role, "stock") && ["Aprovada", "Entregue"].includes(r.status) && (
        <DeliveryRoute key={r.id} request={r} />
      )}
    </section>
  );
}
