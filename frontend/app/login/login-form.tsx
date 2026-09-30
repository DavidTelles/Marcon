"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  ScanFace,
  LoaderCircle,
  LockKeyhole,
  Radio,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useLogin } from "./use-login";
import { RfidAccess } from "./components/rfid-access";
import { FaceLogin } from "./components/face-login";
import { PasskeyLogin } from "./components/passkey-login";
import styles from "./login.module.css";

export default function LoginForm({ children, demoMode = true }: { children: ReactNode; demoMode?: boolean }) {
  const {
    isBusy,
    status,
    identity,
    password,
    error,
    setIdentity,
    setPassword,
    submit,
  } = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  const [rfidActive, setRfidActive] = useState(false);
  const [faceActive, setFaceActive] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const identityRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef(false);
  const errorDescription = error ? "login-error" : undefined;
  const buttonLabel =
    status === "success"
      ? "Acesso confirmado"
      : isBusy
        ? "Validando acesso…"
        : "Entrar";

  function startRfid() {
    setPassword("");
    setShowPassword(false);
    setRfidActive(true);
  }

  function cancelRfid() {
    returnFocus.current = true;
    setRfidActive(false);
  }

  return (
    <>
      {rfidActive ? (
        <RfidAccess onCancel={cancelRfid} />
      ) : cameraActive ? (
        <FaceLogin identity={identity} onCancel={() => setCameraActive(false)} />
      ) : faceActive ? (
        <PasskeyLogin identity={identity} onCancel={() => setFaceActive(false)} />
      ) : (
        <>
          <form className={styles.form} onSubmit={submit} aria-busy={isBusy}>
            <div className={styles.field}>
              <label htmlFor="identity">E-mail ou matrícula</label>
              <div className={styles.inputWrapper}>
                <UserRound size={18} aria-hidden="true" />
                <input
                  ref={(element) => {
                    identityRef.current = element;
                    if (element && returnFocus.current) {
                      element.focus();
                      returnFocus.current = false;
                    }
                  }}
                  id="identity"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Seu e-mail ou matrícula"
                  required
                  value={identity}
                  onChange={(event) => setIdentity(event.target.value)}
                  disabled={isBusy}
                  aria-invalid={Boolean(error)}
                  aria-describedby={errorDescription}
                />
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="password">Senha</label>
              <div className={styles.inputWrapper}>
                <LockKeyhole size={18} aria-hidden="true" />
                <input
                  className={styles.passwordInput}
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Sua senha"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isBusy}
                  aria-invalid={Boolean(error)}
                  aria-describedby={errorDescription}
                />
                <button
                  type="button"
                  className={styles.revealButton}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
            {error && (
              <p id="login-error" role="alert" className={styles.errorMessage}>
                <CircleAlert size={18} aria-hidden="true" />
                {error}
              </p>
            )}
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={isBusy}
            >
              <span aria-live="polite">{buttonLabel}</span>
              {status === "submitting" ? (
                <LoaderCircle
                  className={styles.spinner}
                  size={18}
                  aria-hidden="true"
                />
              ) : status === "success" ? (
                <Check size={18} aria-hidden="true" />
              ) : (
                <ArrowRight size={18} aria-hidden="true" />
              )}
            </button>
          </form>
          <div className={styles.alternativeAccess}>
            <div className={styles.divider}>
              <span />
              outras formas de acesso
              <span />
            </div>
            <button className={styles.rfidButton} type="button" disabled={demoMode || isBusy || !identity.trim()} onClick={() => { setPassword(""); setCameraActive(true); }} aria-describedby="camera-access-note">
              <ScanFace size={20} aria-hidden="true" /><span>Entrar com reconhecimento facial</span>
            </button>
            <p id="camera-access-note" className={styles.rfidNote}>{demoMode ? "Acesso facial disponível com MySQL configurado." : "Informe e-mail ou matrícula. Cadastre seu rosto no perfil após entrar com senha."}</p>
            <button className={styles.rfidButton} type="button" disabled={demoMode || isBusy || !identity.trim()}
              onClick={() => setFaceActive(true)} aria-describedby="face-access-note">
              <ScanFace size={20} aria-hidden="true" />
              <span>Entrar com passkey</span>
            </button>
            <p id="face-access-note" className={styles.rfidNote}>
              {demoMode ? "Disponível com MySQL configurado." : "Informe seu e-mail ou matrícula. Cadastre sua passkey no perfil após entrar com senha."}
            </p>
            {demoMode && <>
              <button
                className={styles.rfidButton}
                type="button"
                disabled={isBusy}
                onClick={startRfid}
              >
                <Radio size={20} aria-hidden="true" />
                <span>Ativar leitor RFID</span>
                <span className={styles.simulationTag}>Simulação</span>
              </button>
              <p className={styles.rfidNote}>
                Leitura simulada do cartão, sem confirmação por senha.
              </p>
            </>}
          </div>
        </>
      )}
      <p className={styles.securityNote}>
        <ShieldCheck size={15} aria-hidden="true" /> {demoMode ? "Acesso por credenciais ou cartão RFID." : "Acesso por credenciais protegidas."}
      </p>
      {children}
    </>
  );
}
