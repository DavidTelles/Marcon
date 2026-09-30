"use client";
import { useEffect, useRef, useState } from "react";
export function CodeScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null),
    stop = useRef<(() => void) | null>(null),
    generation = useRef(0);
  const [active, setActive] = useState(false),
    [error, setError] = useState("");
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
            onCode(result.getText());
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
        onClick={() => (active ? close() : void start())}
      >
        {active ? "Fechar câmera" : "Escanear QR / barras"}
      </button>
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
