"use client";
import { useEffect, useRef, useState } from "react";
export function CodeScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null),
    stop = useRef<(() => void) | null>(null),
    generation = useRef(0);
  const [active, setActive] = useState(false),
    [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [confirmed, setConfirmed] = useState("");
  const resolving = useRef(false);
  const request = useRef<AbortController | null>(null);
  const last = useRef<{ code: string; at: number } | null>(null);
  const decoding = useRef(false);
  async function resolveCode(raw: string) {
    if (resolving.current || (last.current?.code === raw && Date.now() - last.current.at < 1500)) return;
    resolving.current = true;
    setReading(true);
    setError("");
    setConfirmed("");
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    try {
      const response = await fetch("/api/items/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: raw }), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao consultar o código.");
      if (!controller.signal.aborted) {
        setConfirmed(`${data.material.code} · ${data.material.name}. ${data.balances.length ? data.balances.map((balance: { warehouse: string; available: number; unit: string }) => `${balance.warehouse}: ${balance.available} ${balance.unit} disponíveis`).join("; ") : "Sem saldo cadastrado no escopo autorizado."}`);
        last.current = { code: raw, at: Date.now() };
        onCode(data.material.code);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Código não confirmado.");
    } finally {
      if (request.current === controller) { resolving.current = false; setReading(false); }
    }
  }
  async function readImage(file: File | undefined) {
    if (!file || reading || decoding.current) return;
    if (!file.type.startsWith("image/") || file.size > 10_000_000) { setError("Selecione uma imagem de até 10 MB."); return; }
    const local = URL.createObjectURL(file);
    const id = generation.current;
    decoding.current = true;
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const result = await new BrowserMultiFormatReader().decodeFromImageUrl(local);
      if (id === generation.current) await resolveCode(result.getText());
    } catch { if(id === generation.current)setError("Imagem ilegível ou sem código compatível. Tente outra captura."); }
    finally { decoding.current = false;URL.revokeObjectURL(local); }
  }
  function close() {
    generation.current++;
    stop.current?.();
    stop.current = null;
    const media = video.current?.srcObject as MediaStream | null;
    media?.getTracks().forEach((t) => t.stop());
    setActive(false);
  }
  useEffect(() => {
    const token = generation;
    const hidden = () => {
      if (document.hidden) close();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      token.current++;
      request.current?.abort();
      stop.current?.();
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  async function start() {
    const id = ++generation.current;
    setActive(true);
    setError("");
    try {
      if (!window.isSecureContext)
        throw new Error("Use localhost ou HTTPS para acessar a câmera.");
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (id !== generation.current) return;
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromConstraints(
        {
          video: { facingMode: "environment", width: { ideal: 640 } },
          audio: false,
        },
        video.current!,
        (result, _error, controls) => {
          if (result && id === generation.current) {
            void resolveCode(result.getText());
            controls.stop();
            close();
          }
        },
      );
      if (id !== generation.current) controls.stop();
      else stop.current = () => controls.stop();
    } catch {
      if (id === generation.current) {
        close();
        setError(
          "Câmera indisponível ou permissão negada. Use leitor USB ou digite o código.",
        );
      }
    }
  }
  return (
    <div className="code-scanner">
      <button
        type="button"
        className="button secondary"
        disabled={reading}
        onClick={() => (active ? close() : void start())}
      >
        {active ? "Fechar câmera" : "Escanear QR / barras"}
      </button>
      <label> Ler código de uma imagem <input type="file" accept="image/*" disabled={reading} onChange={(event) => { void readImage(event.target.files?.[0]); event.target.value = ""; }} /></label>
      <small>Use uma imagem de uma única etiqueta. Confirme o material retornado antes de continuar.</small>
      {reading && <p role="status">Confirmando material e saldo autorizado…</p>}
      {confirmed && <p role="status">{confirmed}</p>}
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        hidden={!active}
        style={{ width: "100%", maxHeight: 240 }}
        aria-label="Leitor de código"
      />
      {error && <p role="alert">{error}</p>}
      <small>
        A leitura apenas preenche o código; confirme a operação para alterar
        saldo.
      </small>
    </div>
  );
}
