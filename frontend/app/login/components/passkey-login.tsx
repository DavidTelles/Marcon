"use client";

import { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { passkeyRequest, passkeyError } from "@/lib/passkey-client";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import styles from "../login.module.css";

export function PasskeyLogin({ identity, onCancel }: { identity: string; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setBusy(true); setError("");
    try {
      const options = await passkeyRequest<PublicKeyCredentialRequestOptionsJSON>({ action: "login-options", identity });
      const assertion = await startAuthentication({ optionsJSON: options });
      const result = await passkeyRequest<{ destination: string }>({ action: "login-verify", response: assertion });
      if (typeof result.destination !== "string" || !/^\/inicio\/[a-z]+$/.test(result.destination)) throw new Error("Destino inválido.");
      window.location.assign(result.destination);
    } catch (cause) { setError(passkeyError(cause)); setBusy(false); }
  }

  return <section className={styles.faceTest} aria-labelledby="passkey-title">
    <h2 id="passkey-title">Entrar com passkey</h2>
    <p>Use a credencial cadastrada no seu perfil. O dispositivo pode solicitar reconhecimento facial, digital ou PIN.</p>
    {error && <p role="alert" className={styles.faceTestError}>{error}</p>}
    <div className={styles.faceTestActions}>
      <button type="button" onClick={signIn} disabled={busy}>{busy ? "Validando…" : "Continuar"}</button>
      <button type="button" onClick={onCancel} disabled={busy}>Voltar ao login</button>
    </div>
  </section>;
}
