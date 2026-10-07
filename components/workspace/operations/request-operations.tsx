"use client";
import { useState } from "react";
import type { Role } from "@/lib/workspace-routes";
import { can } from "@/lib/permissions";
import { useDemoStore } from "../demo-store";
import { CodeScanner } from "./code-scanner";
import { DeliveryRoute } from "./delivery-route";
import styles from "../screens/workflow.module.css";
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
  const { requests, runAction, accountId } = useDemoStore(),
    r = requests.find((r) => r.id === id) ?? request;
  const [confirmation, setConfirmation] = useState("");
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
      const result = await runAction({ type, id, ...extra });
      if (type !== "preparePick") onComplete?.();
      setMessage("Operação confirmada.");
      return result;
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
      {r.requestedQuantity !== undefined && (
        <p>
          Solicitado: {r.requestedQuantity} · Aprovado:{" "}
          {r.approvedQuantity ?? 0} · Retirado do estoque:{" "}
          {r.deliveredQuantity ?? 0}. A entrega no bloco encerra o pedido.
        </p>
      )}
      {r.anomaly?.unusual && (
        <div className={styles.anomaly} role="note">
          <strong>Pedido fora do padrão do setor/bloco</strong>
          {r.anomaly.reasons.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
          <p>
            <strong>Justificativa do solicitante:</strong>{" "}
            {r.justification || "Não registrada no pedido legado."}
          </p>
        </div>
      )}
      {!r.anomaly?.unusual && r.justification && (
        <p>
          <strong>Justificativa:</strong> {r.justification}
        </p>
      )}
      {r.allocations?.map((a) => (
        <p key={a.warehouse}>
          {r.pickedAt ? "Retirado" : "Separar"} {a.quantity} em {a.warehouse} ·{" "}
          {a.location}
        </p>
      ))}
      {r.cancellationReason && (
        <p>
          {r.status === "Rejeitada" ? "Motivo da rejeição" : "Cancelamento"}:{" "}
          {r.cancellationReason}
        </p>
      )}
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
            <label>
              Justificativa da alteração (obrigatória para pedidos fora do
              padrão)
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <div className="head-actions">
              <button
                className="button primary"
                disabled={busy || !quantity}
                onClick={() =>
                  void action("editRequest", {
                    quantity: Number(quantity),
                    justification: reason.trim() || r.justification,
                  })
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
      {can(role, "approve") && r.status === "Pendente" && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() =>
            void action("changeRequestStatus", { status: "Em análise" })
          }
        >
          Iniciar análise
        </button>
      )}
      {can(role, "approve") &&
        ["Pendente", "Em análise"].includes(r.status) && (
          <>
            <label>
              Motivo da rejeição
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={3}
              />
            </label>
            <button
              className="button secondary"
              disabled={busy || reason.trim().length < 3}
              onClick={() =>
                void action("changeRequestStatus", {
                  status: "Rejeitada",
                  reason,
                })
              }
            >
              Rejeitar solicitação
            </button>
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
        ["Aprovada", "Cancelamento solicitado"].includes(r.status) && (
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
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void action("claimRequest")}
        >
          Pegar para entrega
        </button>
      )}
      {can(role, "stock") &&
        r.status === "Em separação" &&
        r.fulfilledBy === accountId && (
          <>
            <CodeScanner
              expectedCode={r.code}
              onInvalid={() => {
                setCode("");
                setConfirmation("");
              }}
              onCode={(value) => {
                setCode(value);
                setConfirmation("");
              }}
            />
            <label>
              Código conferido
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setConfirmation("");
                }}
              />
            </label>
            <label>
              Quantidade separada
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  setConfirmation("");
                }}
              />
            </label>
            <button
              className="button primary"
              disabled={busy || !code || Number(quantity) !== r.quantity}
              onClick={() =>
                void action(confirmation ? "confirmPick" : "preparePick", {
                  qrCode: code,
                  confirmedQuantity: Number(quantity),
                  confirmation,
                }).then((result) => {
                  if (result?.confirmation)
                    setConfirmation(String(result.confirmation));
                  else setConfirmation("");
                })
              }
            >
              {confirmation
                ? "Confirmar novamente e baixar estoque"
                : "Confirmar retirada"}
            </button>
          </>
        )}
      {can(role, "stock") &&
        r.status === "Em entrega" &&
        r.fulfilledBy === accountId && (
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              void action("changeRequestStatus", { status: "Entregue" })
            }
          >
            Confirmar entrega
          </button>
        )}
      {r.fulfilledBy &&
        r.fulfilledBy !== accountId &&
        ["Em separação", "Em entrega"].includes(r.status) && (
          <p>
            Atendimento assumido pelo almoxarife de matrícula {r.fulfilledBy}.
          </p>
        )}
      {message && <p role="status">{message}</p>}
      {can(role, "stock") &&
        ["Aprovada", "Em separação", "Em entrega", "Entregue"].includes(
          r.status,
        ) && <DeliveryRoute key={r.id} request={r} />}
    </section>
  );
}
