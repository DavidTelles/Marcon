"use client";

import { useEffect, useRef, useState } from "react";
import { faceRequest } from "@/lib/face-client";
import { FACE_CONSENT, FACE_COUNT, FACE_MODEL } from "@/lib/face-policy";
import styles from "./face.module.css";

function captureError(cause: unknown): string {
  if (cause instanceof Error) {
    if (cause.name === "NotAllowedError")
      return "Permita o acesso à câmera no navegador e tente novamente.";
    if (cause.name === "NotFoundError")
      return "Nenhuma câmera encontrada. Conecte uma câmera e tente novamente.";
    return cause.message;
  }
  return "Falha na captura.";
}

export function FaceCapture({
  purpose,
  identity,
  password,
  adminTarget,
  onDone,
  onCancel,
}: {
  purpose: "register" | "login";
  identity?: string;
  password?: string;
  adminTarget?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const operation = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    "A câmera será usada somente durante esta verificação.",
  );
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const initialStart = useRef(start);

  function stop() {
    operation.current?.abort();
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }

  useEffect(() => {
    const startTimer = window.setTimeout(() => void initialStart.current(), 0);
    const hide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", stop);
    return () => {
      window.clearTimeout(startTimer);
      stop();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", stop);
    };
  }, []);

  async function start() {
    if (busy) return;
    stop();
    const controller = new AbortController();
    operation.current = controller;
    const signal = controller.signal;
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error("A câmera exige localhost ou HTTPS.");
      const challenge = await faceRequest<{ model: string }>(
        {
          action: "start",
          purpose,
          identity,
          password,
          adminTarget,
          consent: purpose === "register" ? FACE_CONSENT : undefined,
        },
        signal,
      );
      if (challenge.model !== FACE_MODEL)
        throw new Error("Modelo facial atualizado. Recarregue a página.");
      setStatus("Autorize a câmera para continuar.");
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      if (signal.aborted) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      video.current!.srcObject = media;
      await video.current!.play();
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const images: string[] = [];
      for (let i = 0; i < FACE_COUNT; i++) {
        if (signal.aborted) return;
        setStatus(`Olhe para a câmera. Foto ${i + 1} de ${FACE_COUNT}.`);
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        if (signal.aborted || !video.current?.videoWidth) return;
        canvas.getContext("2d")!.drawImage(video.current, 0, 0, 640, 480);
        images.push(canvas.toDataURL("image/jpeg", 0.75).split(",")[1]);
        setProgress(images.length / FACE_COUNT);
      }
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      setStatus("Analisando as cinco fotos no servidor…");
      const result = await faceRequest<{ ok?: boolean; destination?: string }>(
        {
          action: "finish",
          model: FACE_MODEL,
          images,
        },
        signal,
      );
      if (signal.aborted) return;
      if (purpose === "login") {
        if (
          !result.destination ||
          !/^\/inicio\/(admin|lider|almoxarifado|funcionario)$/.test(
            result.destination,
          )
        )
          throw new Error("Destino de acesso inválido.");
        window.location.assign(result.destination);
      } else if (result.ok) onDone();
      else throw new Error("Cadastro não confirmado.");
    } catch (cause) {
      if (!signal.aborted) setError(captureError(cause));
    } finally {
      if (operation.current === controller) {
        stop();
        setBusy(false);
      }
    }
  }

  return (
    <section className={styles.capture} aria-label="Captura facial">
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        className={styles.video}
        aria-label="Prévia da câmera"
      />
      <p role="status">{status}</p>
      <progress value={progress} max={1} aria-label="Progresso da captura" />
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        {error && !busy && (
          <button type="button" onClick={() => void start()}>
            Tentar novamente
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            stop();
            onCancel();
          }}
        >
          Cancelar
        </button>
      </div>
    </section>
  );
}
