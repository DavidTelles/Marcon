"use client";

import { useEffect, useRef, useState } from "react";
import {
  detectFace,
  faceRequest,
  getFaceModel,
  measureFace,
} from "@/lib/face-client";
import {
  FACE_CONSENT,
  FACE_MODEL,
  FACE_TTL,
  poseMatches,
  qualityProblem,
  similarity,
  type FacePose,
  type FaceSample,
} from "@/lib/face-policy";
import styles from "./face.module.css";

const instructions: Record<FacePose, string> = {
  center: "Olhe de frente para a câmera e fique parado um instante.",
  left: "Vire levemente o rosto para um lado. Se não avançar, tente o outro lado.",
  right:
    "Vire levemente o rosto para o outro lado. Mantenha os olhos visíveis.",
  light:
    "Volte ao centro e varie um pouco a iluminação: aproxime uma luz suave ou mude levemente de posição.",
};

function cameraError(cause: unknown) {
  if (cause instanceof Error) {
    if (cause.name === "NotAllowedError")
      return "Permita o acesso à câmera no navegador e tente novamente.";
    if (cause.name === "NotFoundError")
      return "Nenhuma câmera encontrada. Conecte uma câmera ou entre com senha.";
    if (["NotReadableError", "TrackStartError"].includes(cause.name))
      return "A câmera está ocupada ou indisponível. Feche outros aplicativos e tente novamente.";
    return cause.message;
  }
  return "Não foi possível iniciar a câmera.";
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

  function stop() {
    operation.current?.abort();
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        stop();
        setBusy(false);
        setStatus("Captura interrompida. Inicie novamente.");
      }
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", stop);
    return () => {
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
    const check = () => {
      if (signal.aborted) throw new DOMException("Cancelado", "AbortError");
    };
    setBusy(true);
    setError("");
    setProgress(0);
    const frame = document.createElement("canvas"),
      crop = document.createElement("canvas");
    const samples: FaceSample[] = [];
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "A câmera exige localhost ou HTTPS. Use o login com senha neste endereço.",
        );
      setStatus("Carregando o reconhecimento local…");
      const human = await getFaceModel();
      check();
      setStatus("Autorize a câmera para continuar.");
      watchdog = setTimeout(() => {
        if (operation.current !== controller || signal.aborted) return;
        controller.abort();
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
        setBusy(false);
        setError("Tempo esgotado. Autorize a câmera e tente novamente.");
      }, 30_000);
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
        check();
      }
      stream.current = media;
      video.current!.srcObject = media;
      await video.current!.play();
      clearTimeout(watchdog);
      check();
      const challenge = await faceRequest<{ poses: FacePose[]; model: string }>(
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
        throw new Error("Modelo atualizado. Recarregue a página.");
      const started = performance.now();
      watchdog = setTimeout(() => {
        if (operation.current !== controller || signal.aborted) return;
        controller.abort();
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
        setBusy(false);
        setError("Captura expirada. Tente novamente com boa iluminação.");
      }, FACE_TTL);
      let stable = 0;
      while (samples.length < challenge.poses.length) {
        check();
        if (
          !media.getVideoTracks()[0]?.enabled ||
          media.getVideoTracks()[0]?.readyState !== "live"
        )
          throw new Error(
            "A câmera foi desconectada. Reconecte e tente novamente.",
          );
        const target = challenge.poses[samples.length];
        setStatus(instructions[target]);
        const v = video.current!;
        frame.width = 640;
        frame.height = Math.round((640 * v.videoHeight) / v.videoWidth);
        frame.getContext("2d")!.drawImage(v, 0, 0, frame.width, frame.height);
        const result = await detectFace(human, frame);
        check();
        if (result.face.length !== 1) {
          setStatus("Mantenha apenas um rosto visível na câmera.");
          stable = 0;
        } else {
          const sample = measureFace(
            result.face[0],
            frame,
            crop,
            performance.now() - started,
            result.face.length,
          );
          const issue = qualityProblem(sample);
          if (issue) {
            setStatus(issue);
            stable = 0;
          } else if (!poseMatches(target, sample, samples[0] ?? sample))
            stable = 0;
          else if (
            samples.some((s) => similarity(s.embedding, sample.embedding) < 0.8)
          ) {
            setStatus(
              "O rosto mudou muito. Volte à posição inicial ou reinicie a captura.",
            );
            stable = 0;
          } else if (++stable >= 2) {
            samples.push(sample);
            stable = 0;
            setProgress(samples.length / challenge.poses.length);
          }
        }
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", done);
            resolve();
          };
          const timer = setTimeout(done, 400);
          signal.addEventListener("abort", done, { once: true });
        });
      }
      check();
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      setStatus("Conferindo as capturas no servidor local…");
      const result = await faceRequest<{ ok?: boolean; destination?: string }>(
        { action: "finish", model: FACE_MODEL, samples },
        signal,
      );
      check();
      if (purpose === "login") {
        if (
          !result.destination ||
          !/^\/inicio\/(admin|lider|almoxarifado|funcionario)$/.test(
            result.destination,
          )
        )
          throw new Error("Destino de acesso inválido.");
        window.location.assign(result.destination);
      } else {
        if (result.ok !== true) throw new Error("Cadastro não confirmado.");
        onDone();
      }
    } catch (cause) {
      if (!signal.aborted) setError(cameraError(cause));
    } finally {
      clearTimeout(watchdog);
      samples.length = 0;
      frame.width = crop.width = 0;
      // Uma operação antiga nunca deve desligar a câmera de uma tentativa nova.
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
        <button type="button" disabled={busy} onClick={() => void start()}>
          {busy ? "Verificando…" : "Iniciar captura"}
        </button>
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
      <small>
        Movimentos ajudam a confirmar presença, mas não impedem falsificações
        sofisticadas. Nenhuma foto ou vídeo será salvo.
      </small>
    </section>
  );
}
