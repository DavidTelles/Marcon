"use client";
import { useRef, useState } from "react";
import { TransferQueue } from "./transfer-queue";
import { useDemoStore } from "../demo-store";
import { WAREHOUSES } from "@/lib/inventory";
import { CodeScanner } from "./code-scanner";
export function StockOperations() {
  const { stock, runAction } = useDemoStore();
  const requestKey = useRef("");
  const [mode, setMode] = useState("stockEntry"),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget,
      d = new FormData(f);
    setBusy(true);
    setMessage("");
    try {
      requestKey.current ||= crypto.randomUUID();
      await runAction({
        requestKey: requestKey.current,
        type: mode,
        code: d.get("part"),
        warehouse: d.get("warehouse"),
        from: d.get("warehouse"),
        to: d.get("to"),
        quantity: Number(d.get("quantity")),
        qrCode: code,
        reason: d.get("reason"),
        dueDate: d.get("dueDate"),
        supplier: d.get("supplier"),
        reference: d.get("reference"),
      });
      setMessage("Operação registrada no Neon.");
      requestKey.current = "";
      f.reset();
      setCode("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel ops-panel">
      <div className="panel-head">
        <div>
          <h2>Movimentar estoque</h2>
          <p>
            Entradas e ajustes exigem justificativa. Reservas de outros pedidos
            são protegidas.
          </p>
        </div>
      </div>
      <form onSubmit={submit} className="ops-form">
        <label>
          Operação
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="stockEntry">Entrada conferida</option>
            <option value="adjustStock">Ajustar saldo físico</option>
            <option value="transfer">
              Solicitar transferência entre locais
            </option>
            <option value="confirmInbound">
              Registrar entrada futura confirmada
            </option>
          </select>
        </label>
        <label>
          Item
          <select name="part">
            {stock.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Almoxarifado / origem
          <select name="warehouse">
            {WAREHOUSES.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </label>
        {mode === "transfer" && (
          <label>
            Destino
            <select name="to">
              {WAREHOUSES.map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          {mode === "adjustStock" ? "Novo saldo físico" : "Quantidade"}
          <input
            name="quantity"
            type="number"
            min={mode === "adjustStock" ? 0 : 1}
            step="1"
            required
          />
        </label>
        <label>
          Justificativa
          <input name="reason" required minLength={3} maxLength={1000} />
        </label>
        {mode === "transfer" && (
          <>
            <CodeScanner onCode={setCode} />
            <label>
              Código lido
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </label>
          </>
        )}
        {mode === "confirmInbound" && (
          <>
            <label>
              Data prevista
              <input name="dueDate" type="date" required />
            </label>
            <label>
              Fornecedor
              <input name="supplier" required minLength={3} />
            </label>
            <label>
              Documento de confirmação
              <input name="reference" required minLength={3} />
            </label>
          </>
        )}
        <button className="button primary" disabled={busy}>
          Confirmar operação
        </button>
        {message && <p role="status">{message}</p>}
      </form>
      <TransferQueue />
    </section>
  );
}
