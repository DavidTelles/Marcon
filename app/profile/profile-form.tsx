"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AccountRole } from "@/lib/accounts";
import styles from "./profile.module.css";
import { BrandLogo } from "@/app/components/brand-logo";
import { roleLanding } from "@/lib/workspace-routes";
import { FaceRegister } from "./face-register";
import { PasskeyRegister } from "./passkey-register";

export default function ProfileForm({ name: initialName, email: initialEmail, role, persistent }: {
  name: string; email: string; role: AccountRole; persistent: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage("");
    if (newPassword !== confirmPassword) { setError("As novas senhas não coincidem."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, currentPassword, newPassword }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar o perfil.");
      if (newPassword) {
        router.push("/login");
        router.refresh();
        return;
      }
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setMessage("Perfil atualizado com sucesso.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o perfil.");
    } finally { setBusy(false); }
  }

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <Link href={roleLanding[role]} className={styles.brandLink} aria-label="Marcon — página inicial"><BrandLogo compact decorative /><span>SMARTWAY</span></Link>
      <Link href={roleLanding[role]} className={styles.topbarLink}>Página inicial</Link>
    </header>
    <div className={styles.container}>
      <div className={styles.header}>
        <div><span className={styles.eyebrow}>CONTA MARCON</span><h1>Editar perfil</h1><p>Atualize seus dados e suas credenciais de acesso.</p></div>
        <Link href={roleLanding[role]} className={styles.back}>Voltar</Link>
      </div>
      {!persistent && <p role="note" className={styles.notice}>Configure o Neon para salvar alterações no perfil.</p>}
      <form className={styles.card} onSubmit={save}>
        <div className={styles.cardSection}>
          <div className={styles.sectionHeading}><h2>Dados pessoais</h2><p>Mantenha suas informações de contato atualizadas.</p></div>
          <div className={styles.grid}>
            <label className={styles.field}>Nome completo<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} autoComplete="name" /></label>
            <label className={styles.field}>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={190} autoComplete="email" /></label>
          </div>
        </div>
        <div className={styles.cardSection}>
          <div className={styles.sectionHeading}><h2>Senha da conta</h2><p>Informe a senha atual para salvar. Preencha os demais campos somente se quiser trocá-la.</p></div>
          <div className={styles.passwordGrid}>
            <label className={styles.field}>Senha atual<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
            <label className={styles.field}>Nova senha (opcional)<input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Mínimo de 12 caracteres" /></label>
            <label className={styles.field}>Confirme a nova senha<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
          </div>
        </div>
        {error && <p role="alert" className={`${styles.feedback} ${styles.error}`}>{error}</p>}
        {message && <p role="status" className={`${styles.feedback} ${styles.success}`}>{message}</p>}
        <div className={styles.actions}><button className={styles.button} type="submit" disabled={!persistent || busy}>{busy ? "Salvando…" : "Salvar perfil"}</button></div>
      </form>
      {persistent && <FaceRegister />}
      {persistent && <PasskeyRegister />}
    </div>
  </main>;
}
