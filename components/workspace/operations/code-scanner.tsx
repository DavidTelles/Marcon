"use client";
import { useEffect, useRef, useState } from "react";
export type ResolvedPiece = {
  material: { id: number; code: string; name: string; unit: string };
  balances: {
    warehouseId: number;
    warehouse: string;
    physical: number;
    available: number;
    unit: string;
  }[];
  scope: string;
};
export function CodeScanner({
  onCode,
  onResolved,
  onInvalid,
  expectedCode,
  allowManual = false,
}: {
  onCode: (code: string) => void;
  onResolved?: (piece: ResolvedPiece) => void;
  onInvalid?: () => void;
  expectedCode?: string;
  allowManual?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null),
    stop = useRef<(() => void) | null>(null),
    generation = useRef(0);
  const [active, setActive] = useState(false),
    [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [manual, setManual] = useState("");
  const [confirmed, setConfirmed] = useState("");
  const resolving = useRef(false);
  const request = useRef<AbortController | null>(null);
  const decoding = useRef(false);
  async function createReader(rotateFrames = false) {
    const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] =
      await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
    const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.ITF,
    ]);
    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 150,
      delayBetweenScanSuccess: 1500,
    });
    if (rotateFrames) {
      const decode = reader.decodeFromCanvas.bind(reader);
      const rotated = document.createElement("canvas");
      let frame = 0;
      reader.decodeFromCanvas = (canvas) => {
        const orientation = frame++ % 8;
        if (!orientation) return decode(canvas);
        const turn = orientation % 4;
        rotated.width = turn % 2 ? canvas.height : canvas.width;
        rotated.height = turn % 2 ? canvas.width : canvas.height;
        const context = rotated.getContext("2d", { willReadFrequently: true });
        if (!context) return decode(canvas);
        context.translate(rotated.width / 2, rotated.height / 2);
        context.rotate((turn * Math.PI) / 2);
        context.filter = orientation >= 4 ? "invert(1)" : "none";
        context.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
        return decode(rotated);
      };
    }
    return reader;
  }
  async function resolveCode(raw: string) {
    if (resolving.current) return;
    resolving.current = true;
    setReading(true);
    setError("");
    setConfirmed("");
    onInvalid?.();
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    try {
      const response = await fetch("/api/items/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: raw }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Falha ao consultar o código.");
      if (expectedCode && data.material.code !== expectedCode)
        throw new Error("Código lido não corresponde à peça desta entrega.");
      if (!controller.signal.aborted) {
        setConfirmed(
          `${data.material.code} · ${data.material.name}. ${data.balances.length ? data.balances.map((balance: { warehouse: string; available: number; unit: string }) => `${balance.warehouse}: ${balance.available} ${balance.unit} disponíveis`).join("; ") : "Sem saldo cadastrado no escopo autorizado."}`,
        );
        onCode(data.material.code);
        onResolved?.(data);
        return true;
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "Código não confirmado.",
        );
    } finally {
      if (request.current === controller) {
        resolving.current = false;
        setReading(false);
      }
    }
  }
  async function acceptCode(value: string) {
    return resolveCode(value);
  }
  async function readImage(file: File | undefined) {
    if (!file || reading || decoding.current) return;
    setConfirmed("");
    onInvalid?.();
    if (!file.type.startsWith("image/") || file.size > 10_000_000) {
      setError("Selecione uma imagem de até 10 MB.");
      return;
    }
    const local = URL.createObjectURL(file);
    const id = generation.current;
    decoding.current = true;
    setReading(true);
    setError("");
    try {
      const reader = await createReader();
      const picture = new Image();
      picture.src = local;
      await picture.decode();
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas indisponível");
      const scale = Math.min(1, 2400 / Math.max(picture.width, picture.height));
      const w = Math.round(picture.width * scale),
        h = Math.round(picture.height * scale);
      let value: string | undefined;
      // Try both polarities and every orientation; the printed sheet may be rotated.
      for (const inverted of [false, true]) {
        for (let turn = 0; turn < 4 && !value; turn++) {
          canvas.width = turn % 2 ? h : w;
          canvas.height = turn % 2 ? w : h;
          context.save();
          context.translate(canvas.width / 2, canvas.height / 2);
          context.rotate((turn * Math.PI) / 2);
          context.filter = inverted ? "invert(1)" : "none";
          context.drawImage(picture, -w / 2, -h / 2, w, h);
          context.restore();
          try {
            value = reader.decodeFromCanvas(canvas).getText();
          } catch {
            /* Try the next orientation. */
          }
        }
      }
      if (!value) throw new Error("Código ilegível");
      if (id === generation.current) await acceptCode(value);
    } catch {
      if (id === generation.current)
        setError(
          "Imagem ilegível ou sem código compatível. Tente outra captura.",
        );
    } finally {
      decoding.current = false;
      setReading(false);
      URL.revokeObjectURL(local);
    }
  }
  function close() {
    generation.current++;
    stop.current?.();
    stop.current = null;
    const media = video.current?.srcObject as MediaStream | null;
    media?.getTracks().forEach((t) => t.stop());
    request.current?.abort();
    resolving.current = false;
    setReading(false);
    setActive(false);
  }
  useEffect(() => {
    const token = generation;
    const element = video.current;
    const hidden = () => {
      if (document.hidden) close();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      token.current++;
      request.current?.abort();
      stop.current?.();
      (element?.srcObject as MediaStream | null)
        ?.getTracks()
        .forEach((track) => track.stop());
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  async function start() {
    const id = ++generation.current;
    setActive(true);
    setError("");
    setConfirmed("");
    onInvalid?.();
    try {
      if (!window.isSecureContext)
        throw new Error("Use localhost ou HTTPS para acessar a câmera.");
      const reader = await createReader(true);
      if (id !== generation.current) return;
      const controls = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        },
        video.current!,
        (result, _error, controls) => {
          if (result && id === generation.current) {
            void acceptCode(result.getText()).then((accepted) => {
              if (accepted && id === generation.current) {
                controls.stop();
                close();
              }
            });
          }
        },
      );
      if (id !== generation.current) controls.stop();
      else stop.current = () => controls.stop();
    } catch (cause) {
      if (id === generation.current) {
        close();
        setError(
          cause instanceof Error && cause.message.includes("HTTPS")
            ? cause.message
            : "Câmera indisponível ou permissão negada. Use leitor USB ou digite o código.",
        );
      }
    }
  }
  return (
    <div className="code-scanner">
      {allowManual && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void resolveCode(manual);
          }}
        >
          <label>
            QR ou ID da peça
            <input
              value={manual}
              maxLength={1024}
              required
              onChange={(event) => {
                setManual(event.target.value);
                request.current?.abort();
                setConfirmed("");
                setError("");
                onInvalid?.();
              }}
            />
          </label>
          <button className="button primary" disabled={reading || !manual}>
            Pesquisar peça
          </button>
        </form>
      )}
      <button
        type="button"
        className="button secondary"
        disabled={reading}
        onClick={() => (active ? close() : void start())}
      >
        {active ? "Fechar câmera" : "Escanear QR / barras"}
      </button>
      <label>
        {" "}
        Ler código de uma imagem{" "}
        <input
          type="file"
          accept="image/*"
          disabled={reading}
          onChange={(event) => {
            void readImage(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      <small>
        Use uma imagem de uma única etiqueta. Confirme o material retornado
        antes de continuar.
      </small>
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
        {allowManual
          ? "A pesquisa consulta a peça e seus saldos, sem movimentar estoque."
          : "A leitura apenas preenche o código; confirme a entrega para alterar saldo."}
      </small>
    </div>
  );
}
