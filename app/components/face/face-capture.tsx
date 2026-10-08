"use client";

import { useEffect, useRef, useState } from "react";
import { faceRequest, validChallenge, type FaceChallenge } from "@/lib/face-client";
import { FACE_CONSENT, FACE_MODEL, captureDelayMs } from "@/lib/face-policy";
import { roleLanding } from "@/lib/workspace-routes";
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
  initialChallenge,
  onDone,
  onCancel,
}: {
  purpose: "register" | "login";
  identity?: string;
  password?: string;
  adminTarget?: string;
  initialChallenge?: FaceChallenge;
  onDone: () => void;
  onCancel: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const operation = useRef<AbortController | null>(null);
  const pendingPlayback = useRef<{ resolve: () => void; reject: (cause: Error) => void } | null>(null);
  const [busy, setBusy] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [status, setStatus] = useState(
    "A câmera será usada somente durante esta verificação.",
  );
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const initialStart = useRef(start);
  const prepared = useRef(initialChallenge);

  function stop() {
    operation.current?.abort();
    pendingPlayback.current?.reject(new DOMException("Captura cancelada.", "AbortError"));
    pendingPlayback.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }

  useEffect(() => {
    // The login form may have been scrolled below the new preview on a phone.
    video.current?.scrollIntoView({ block: "center" });
    const startTimer = window.setTimeout(() => void initialStart.current(), 0);
    const hide = () => {
      if (document.hidden && operation.current && !operation.current.signal.aborted) {
        stop();
        setBusy(false);
        setPlaybackBlocked(false);
        setError("Captura interrompida ao sair da página. Tente novamente para iniciar uma nova verificação.");
      }
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

  function resumePlayback() {
    const pending = pendingPlayback.current;
    if (!pending || !video.current) return;
    // Invoke play directly in the tap handler for browsers blocking autoplay.
    void video.current.play().then(() => {
      if (pendingPlayback.current !== pending) return;
      pendingPlayback.current = null;
      setPlaybackBlocked(false);
      pending.resolve();
    }).catch(() => {
      if (pendingPlayback.current !== pending) return;
      pendingPlayback.current = null;
      setPlaybackBlocked(false);
      pending.reject(new Error("Não foi possível iniciar a prévia da câmera. Tente novamente."));
    });
  }

  async function start() {
    if (operation.current && !operation.current.signal.aborted) return;
    stop();
    const controller = new AbortController();
    operation.current = controller;
    const signal = controller.signal;
    setBusy(true);
    setPlaybackBlocked(false);
    setError("");
    setProgress(0);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error("A câmera exige localhost ou HTTPS.");
      const previous = prepared.current;
      prepared.current = undefined;
      const challenge = previous ?? await faceRequest<FaceChallenge>(
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
      if (!validChallenge(challenge, purpose))
        throw new Error("Desafio facial inválido. Inicie novamente.");
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
      const preview = video.current!;
      preview.muted = true;
      preview.defaultMuted = true;
      preview.playsInline = true;
      preview.srcObject = media;
      try {
        await preview.play();
      } catch (cause) {
        if (!(cause instanceof Error) || cause.name !== "NotAllowedError") throw cause;
        if (signal.aborted) return;
        setStatus("Toque em Ativar prévia da câmera para continuar a captura automática.");
        setPlaybackBlocked(true);
        await new Promise<void>((resolve, reject) => {
          pendingPlayback.current = { resolve, reject };
        });
      }
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const images: string[] = [];
      const count = challenge.poses.length;
      for (let i = 0; i < count; i++) {
        if (signal.aborted) return;
        const pose = challenge.poses?.[i];
        if (!["center", "left", "right"].includes(pose)) throw new Error("Desafio facial inválido. Inicie novamente.");
        setStatus(purpose === "login" ? "Olhe para a câmera. A captura é automática." :
          `${pose === "center" ? "Olhe de frente" : pose === "left" ? "Vire levemente o rosto para sua direita" : "Vire levemente o rosto para sua esquerda"}. Foto ${i + 1} de ${count}.`);
        await new Promise<void>((resolve) => setTimeout(resolve, captureDelayMs(purpose, pose, i)));
        if (signal.aborted) return;
        if (!video.current?.videoWidth || !video.current.videoHeight)
          throw new Error("A câmera não enviou imagens. Verifique a conexão e tente novamente.");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Não foi possível capturar a imagem da câmera.");
        const sourceWidth = video.current.videoWidth, sourceHeight = video.current.videoHeight;
        const scale = Math.min(640 / sourceWidth, 480 / sourceHeight);
        const w = sourceWidth * scale, h = sourceHeight * scale;
        context.fillStyle = "black";
        context.fillRect(0, 0, 640, 480);
        context.drawImage(video.current, (640 - w) / 2, (480 - h) / 2, w, h);
        images.push(canvas.toDataURL("image/jpeg", 0.75).split(",")[1]);
        setProgress(images.length / count);
      }
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      setStatus(purpose === "login" ? "Verificando seu rosto…" : "Conferindo seu cadastro facial…");
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
          !Object.values(roleLanding).includes(result.destination)
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
        setPlaybackBlocked(false);
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
        {playbackBlocked && (
          <button type="button" onClick={resumePlayback}>
            Ativar prévia da câmera
          </button>
        )}
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
