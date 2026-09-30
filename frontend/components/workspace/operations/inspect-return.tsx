"use client";
import { useState } from "react";
import type { ReturnRecord } from "@/lib/demo-data";
import { useDemoStore } from "../demo-store";
export function InspectReturn({ record }: { record: ReturnRecord }) {
  const { runAction } = useDemoStore();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      className="ops-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        try {
          await runAction({
            type: "inspectReturn",
            id: record.id,
            condition: f.get("condition"),
            reason: f.get("reason"),
          });
          setMessage("Conferência registrada.");
        } catch (e) {
          setMessage(e instanceof Error ? e.message : "Falha na conferência.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        #{record.id} · {record.partCode} · {record.quantity} unidades ·{" "}
        {record.warehouse} · Pedido {record.requestId ?? "manual"}
      </p>
      <label>
        Condição conferida
        <select name="condition" defaultValue={record.condition}>
          <option>Apto</option>
          <option>Danificado</option>
        </select>
      </label>
      <label>
        Justificativa da conferência
        <input name="reason" required minLength={3} />
      </label>
      <button className="button primary" disabled={busy}>
        Confirmar conferência
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
