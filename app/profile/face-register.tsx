"use client";
import { useEffect, useState } from "react";
import { faceRequest } from "@/lib/face-client";
import { FaceCapture } from "@/app/components/face/face-capture";
import styles from "@/app/components/face/face.module.css";

export function FaceRegister() {
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [capture, setCapture] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const c = new AbortController();
    void faceRequest<{ enrolled: boolean; compatible: boolean }>(
      undefined,
      c.signal,
    )
      .then((r) => {
        setEnrolled(r.enrolled);
        if (r.enrolled && !r.compatible)
          setMessage(
            "Cadastre novamente o rosto e confirme o consentimento para usar a verificação facial atual.",
          );
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, []);
  async function remove() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await faceRequest({ action: "delete", password });
      setEnrolled(false);
      setPassword("");
      setConsent(false);
      setMessage(
        "Cadastro facial excluído. Você pode cadastrar novamente quando quiser.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível excluir.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.card} aria-labelledby="face-register-heading">
      <h2 id="face-register-heading">Reconhecimento facial</h2>
      <p>
        {enrolled === null
          ? "Consultando cadastro…"
          : enrolled
            ? "Você possui um rosto cadastrado neste sistema."
            : "Cadastre seu rosto para entrar usando a câmera do computador."}
      </p>
      <p>
        As cinco fotos serão enviadas ao serviço de verificação facial. Apenas
        os vetores faciais serão guardados criptografados no sistema até você
        excluir ou substituir o cadastro. Fotos e vídeos não serão salvos. O
        login com senha continua disponível.
      </p>
      {!capture && (
        <>
          <label className={styles.field}>
            Senha atual para cadastrar ou excluir
            <input
              type="password"
              autoComplete="current-password"
              maxLength={1024}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className={styles.consent}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Autorizo o processamento das fotos e o armazenamento dos meus dados
            faciais neste sistema para autenticação. Sei que posso excluir o
            cadastro e usar minha senha.
          </label>
          <div className={styles.actions}>
            <button
              type="button"
              disabled={busy || !password || !consent}
              onClick={() => {
                setError("");
                setMessage("");
                setCapture(true);
              }}
            >
              {enrolled ? "Cadastrar rosto novamente" : "Cadastrar rosto"}
            </button>
            {enrolled && (
              <button
                type="button"
                disabled={busy || !password}
                onClick={() => void remove()}
              >
                Excluir dados faciais
              </button>
            )}
          </div>
        </>
      )}
      {capture && (
        <FaceCapture
          purpose="register"
          password={password}
          onCancel={() => setCapture(false)}
          onDone={() => {
            setCapture(false);
            setEnrolled(true);
            setPassword("");
            setConsent(false);
            setMessage(
              "Rosto cadastrado. Você já pode usar o acesso facial no login.",
            );
          }}
        />
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {message && (
        <p role="status" className={styles.success}>
          {message}
        </p>
      )}
    </section>
  );
}
