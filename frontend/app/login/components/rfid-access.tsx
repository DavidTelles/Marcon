"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Radio } from "lucide-react";
import styles from "../login.module.css";

const READING_SECONDS = 5;
type ReaderStatus = "waiting" | "submitting" | "success" | "error";

export function RfidAccess({ onCancel }: { onCancel: () => void }) {
  const [remaining, setRemaining] = useState(READING_SECONDS);
  const [status, setStatus] = useState<ReaderStatus>("waiting");
  const [attempt, setAttempt] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    const controller = new AbortController();
    let requestTimeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + READING_SECONDS * 1000;
    const interval = window.setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }, 200);

    async function readDemoCard() {
      window.clearInterval(interval);
      setRemaining(0);
      setStatus("submitting");
      requestTimeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch("/api/login/rfid", {
          method: "POST",
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok || result.destination !== "/inicio/funcionario") {
          throw new Error("RFID simulation failed");
        }
        if (controller.signal.aborted) return;
        setStatus("success");
        window.location.assign(result.destination);
      } catch {
        setStatus("error");
      } finally {
        clearTimeout(requestTimeout);
      }
    }

    const timer = window.setTimeout(readDemoCard, READING_SECONDS * 1000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timer);
      clearTimeout(requestTimeout);
      controller.abort();
    };
  }, [attempt]);

  function retry() {
    setStatus("waiting");
    setRemaining(READING_SECONDS);
    setAttempt((value) => value + 1);
  }

  const processing = status === "submitting" || status === "success";

  return (
    <section className={styles.rfidReader} aria-labelledby="rfid-title">
      <span className={styles.simulationTag}>RFID · Simulação</span>
      <div className={styles.readerIcon} aria-hidden="true">
        {processing ? (
          status === "success" ? (
            <Check size={32} />
          ) : (
            <LoaderCircle className={styles.spinner} size={32} />
          )
        ) : (
          <Radio size={32} />
        )}
      </div>
      <h2 id="rfid-title" ref={headingRef} tabIndex={-1}>
        Aproxime o cartão do leitor
      </h2>
      <div role="status" aria-live="polite">
        {status === "waiting" && (
          <p>
            Aguardando leitura…
            <br />
            Leitura simulada em {remaining} s.
          </p>
        )}
        {status === "submitting" && <p>Cartão identificado. Entrando…</p>}
        {status === "success" && <p>Acesso confirmado. Bem-vinda, Ana!</p>}
      </div>
      {status === "waiting" && (
        <progress
          className={styles.readerProgress}
          max={READING_SECONDS}
          value={READING_SECONDS - remaining}
          aria-label="Tempo de espera da leitura simulada"
        />
      )}
      {status === "error" && (
        <p role="alert" className={styles.errorMessage}>
          Não foi possível concluir a leitura. Tente novamente.
        </p>
      )}
      <p className={styles.rfidNote}>
        Esta demonstração identifica Ana Souza automaticamente. Não utiliza um
        leitor físico nem solicita senha.
      </p>
      {status === "error" && (
        <button type="button" className={styles.primaryButton} onClick={retry}>
          Tentar leitura novamente
        </button>
      )}
      <button
        type="button"
        className={styles.textButton}
        onClick={onCancel}
        disabled={processing}
      >
        Cancelar e usar credenciais
      </button>
    </section>
  );
}
