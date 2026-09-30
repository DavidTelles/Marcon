"use client";

import { useEffect, useState } from "react";
import { platformAuthenticatorIsAvailable, startRegistration } from "@simplewebauthn/browser";
import { passkeyRequest, passkeyError } from "@/lib/passkey-client";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import styles from "./profile.module.css";

export function PasskeyRegister() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null);

  async function checkAvailability() {
    setAvailable(null);
    const supported = await platformAuthenticatorIsAvailable().catch(() => false);
    setAvailable(supported);
    if (!supported) setPassword("");
  }

  useEffect(() => {
    let active = true;
    void platformAuthenticatorIsAvailable().then(
      (supported) => { if (active) setAvailable(supported); },
      () => { if (active) setAvailable(false); },
    );
    return () => { active = false; };
  }, []);

  async function register() {
    setBusy(true); setError(""); setMessage("");
    try {
      if (!(await platformAuthenticatorIsAvailable())) throw new Error("A passkey integrada não está disponível neste dispositivo.");
      const options = await passkeyRequest<PublicKeyCredentialCreationOptionsJSON>({ action: "register-options", password });
      const attestation = await startRegistration({ optionsJSON: options });
      const result = await passkeyRequest<{ ok: boolean }>({ action: "register-verify", response: attestation });
      if (result.ok !== true) throw new Error("Não foi possível confirmar o cadastro da passkey.");
      setPassword("");
      setMessage("Passkey cadastrada. Ela já pode ser usada no login.");
    } catch (cause) { setError(passkeyError(cause)); }
    finally { setBusy(false); }
  }

  return <section className={styles.card} aria-labelledby="passkey-heading">
    <div className={styles.sectionHeading}>
      <h2 id="passkey-heading">Passkey do dispositivo</h2>
      <p>Use o Windows Hello ou a biometria integrada do aparelho para entrar sem digitar sua senha.</p>
    </div>
    {available === null && <p role="status" className={styles.hint}>Verificando a disponibilidade neste dispositivo…</p>}
    {available === false && <div className={styles.unavailable} role="note">
      <strong>Passkey integrada indisponível</strong>
      <p>Ative o Windows Hello em Configurações → Contas → Opções de entrada. Depois, verifique novamente. Este cadastro depende do navegador e do dispositivo.</p>
      <button className={styles.secondaryButton} type="button" onClick={() => void checkAvailability()}>Verificar novamente</button>
    </div>}
    {available && <div className={styles.passkeyFields}>
      <label className={styles.field}>Confirme sua senha atual<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <p className={styles.hint}>O dispositivo precisa oferecer uma passkey integrada. Nenhuma chave USB é necessária.</p>
    </div>}
    {error && <p role="alert" className={`${styles.feedback} ${styles.error}`}>{error}</p>}
    {message && <p role="status" className={`${styles.feedback} ${styles.success}`}>{message}</p>}
    {available && <div className={styles.actions}><button className={styles.button} type="button" onClick={register} disabled={busy || !password}>{busy ? "Cadastrando…" : "Cadastrar passkey"}</button></div>}
  </section>;
}
