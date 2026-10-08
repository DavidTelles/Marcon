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
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useLogin } from "./use-login";
import { FaceLogin } from "./components/face-login";
import styles from "./login.module.css";

export default function LoginForm({ children, demoMode = false }: { children?: ReactNode; demoMode?: boolean }) {
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
  const [faceCredentials, setFaceCredentials] = useState<{ identity: string; password: string } | null>(null);
  const [faceError, setFaceError] = useState("");
  const identityRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef(false);
  const displayedError = faceError || error;
  const errorDescription = displayedError ? "login-error" : undefined;
  const buttonLabel =
    status === "success"
      ? "Acesso confirmado"
      : isBusy
        ? "Validando acesso…"
        : "Entrar";

  function openFaceLogin() {
    // Password managers can fill the inputs without updating React state.
    const currentIdentity = identityRef.current?.value.trim() ?? identity.trim();
    const currentPassword = passwordRef.current?.value ?? password;
    setIdentity(currentIdentity);
    setPassword(currentPassword);
    if (!currentIdentity || !currentPassword) {
      setFaceError("Informe e-mail ou matrícula e senha para entrar com reconhecimento facial.");
      const missingInput = !currentIdentity ? identityRef.current : passwordRef.current;
      missingInput?.focus();
      missingInput?.scrollIntoView({ block: "center" });
      return;
    }
    setFaceError("");
    identityRef.current?.blur();
    passwordRef.current?.blur();
    setFaceCredentials({ identity: currentIdentity, password: currentPassword });
  }

  return (
    <>
      {faceCredentials ? (
        <FaceLogin {...faceCredentials} onCancel={() => {
          returnFocus.current = true;
          setFaceCredentials(null);
        }} />
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
                  onChange={(event) => { setIdentity(event.target.value); setFaceError(""); }}
                  disabled={isBusy}
                  aria-invalid={Boolean(displayedError)}
                  aria-describedby={errorDescription}
                />
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="password">Senha</label>
              <div className={styles.inputWrapper}>
                <LockKeyhole size={18} aria-hidden="true" />
                <input
                  ref={passwordRef}
                  className={styles.passwordInput}
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Sua senha"
                  required
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); setFaceError(""); }}
                  disabled={isBusy}
                  aria-invalid={Boolean(displayedError)}
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
            {displayedError && (
              <p id="login-error" role="alert" className={styles.errorMessage}>
                <CircleAlert size={18} aria-hidden="true" />
                {displayedError}
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
            <button className={styles.alternativeButton} type="button" disabled={demoMode || isBusy} onClick={openFaceLogin} aria-describedby="camera-access-note">
              <ScanFace size={20} aria-hidden="true" /><span>Entrar com reconhecimento facial</span>
            </button>
            <p id="camera-access-note" className={styles.accessNote}>{demoMode ? "Acesso facial disponível com Neon configurado." : "Informe e-mail ou matrícula e senha. Cadastre seu rosto no perfil após entrar com senha."}</p>

          </div>
        </>
      )}
      <p className={styles.securityNote}>
        <ShieldCheck size={15} aria-hidden="true" /> {demoMode ? "Acesso por credenciais protegidas." : "Acesso por credenciais protegidas."}
      </p>
      {children}
    </>
  );
}
