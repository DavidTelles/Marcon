"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, ScanFace } from "lucide-react";
import { FaceCapture } from "@/app/components/face/face-capture";
import { useDemoStore } from "../demo-store";
import type { StaffRole, StaffUser } from "@/lib/staff-data";

const roles: StaffRole[] = [
  "Administrador",
  "Líder de bloco",
  "Almoxarife",
  "Funcionário",
];
const initial: StaffUser = {
  id: "",
  name: "",
  email: "",
  sector: "",
  role: "Funcionário",
  block: "Bloco A",
  active: true,
};
type Errors = Partial<
  Record<
    | "id"
    | "name"
    | "email"
    | "sector"
    | "role"
    | "block"
    | "password"
    | "confirm",
    string
  >
>;

export function StaffCreateScreen() {
  const { runAction, persistent, blockOptions } = useDemoStore(),
    router = useRouter(),
    params = useSearchParams();
  const back = useMemo(() => {
    const value = params.get("return") || "/admin/create";
    return value.startsWith("/admin/create") && !value.startsWith("//")
      ? value
      : "/admin/create";
  }, [params]);
  const [form, setForm] = useState<StaffUser>({ ...initial, block: blockOptions[0] ?? "" }),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [errors, setErrors] = useState<Errors>({}),
    [serverError, setServerError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [savedId, setSavedId] = useState(""),
    [face, setFace] = useState(false),
    [faceDone, setFaceDone] = useState(false),
    [facePassword, setFacePassword] = useState(""),
    [consent, setConsent] = useState(false),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty && !saved) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty, saved]);
  useEffect(() => {
    const state = window as typeof window & { __marconUnsavedUser?: boolean };
    state.__marconUnsavedUser = dirty && !saved;
    const links = (event: MouseEvent) => {
      const anchor = (event.target as Element)?.closest?.("a[href]");
      if (
        anchor &&
        state.__marconUnsavedUser &&
        !window.confirm("Há alterações não salvas. Deseja sair mesmo assim?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", links, true);
    return () => {
      state.__marconUnsavedUser = false;
      document.removeEventListener("click", links, true);
    };
  }, [dirty, saved]);
  function change<K extends keyof StaffUser>(key: K, value: StaffUser[K]) {
    setDirty(true);
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }
  function goBack() {
    if (
      dirty &&
      !saved &&
      !window.confirm("Há alterações não salvas. Deseja sair mesmo assim?")
    )
      return;
    router.push(back);
  }
  function validate() {
    const next: Errors = {};
    if (!/^[A-Za-z0-9_-]{1,30}$/.test(form.id.trim()))
      next.id = "Use até 30 letras, números, _ ou -.";
    if (form.name.trim().length < 3) next.name = "Informe o nome completo.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      next.email = "Informe um e-mail válido.";
    if (!form.sector.trim()) next.sector = "Informe o setor.";
    if (!roles.includes(form.role)) next.role = "Função não permitida.";
    if (["Funcionário", "Líder de bloco"].includes(form.role) && !form.block)
      next.block = "Selecione o bloco.";
    if (password.length < 12) next.password = "Use pelo menos 12 caracteres.";
    if (password !== confirm) next.confirm = "As senhas não coincidem.";
    setErrors(next);
    return !Object.keys(next).length;
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;
    setBusy(true);
    try {
      const user = {
        ...form,
        id: form.id.trim(),
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        sector: form.sector.trim(),
        block: ["Funcionário", "Líder de bloco"].includes(form.role)
          ? form.block
          : undefined,
      };
      await runAction({ type: "saveUser", user, password });
      setSavedId(user.id);
      setSaved(true);
      setDirty(false);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Não foi possível cadastrar.";
      setServerError(message);
      if (/matrícula|ID|Código/i.test(message))
        setErrors((v) => ({ ...v, id: message }));
      if (/e-mail/i.test(message)) setErrors((v) => ({ ...v, email: message }));
    } finally {
      setBusy(false);
    }
  }
  function another() {
    setForm(initial);
    setPassword("");
    setConfirm("");
    setErrors({});
    setServerError("");
    setSaved(false);
    setSavedId("");
    setFace(false);
    setFaceDone(false);
    setConsent(false);
    setDirty(false);
  }
  if (saved)
    return (
      <div className="staff-create-page">
        <button className="link-button staff-back" onClick={goBack}>
          <ArrowLeft size={18} /> Voltar para usuários
        </button>
        <section className="panel staff-success">
          <CheckCircle2 size={38} aria-hidden="true" />
          <div>
            <h1>Usuário cadastrado</h1>
            <p>
              A conta <strong>{savedId}</strong> foi salva. O login com
              matrícula/e-mail e senha já está disponível.
            </p>
          </div>
        </section>
        <section className="panel staff-face-step">
          <div className="panel-head">
            <div>
              <span className="eyebrow">ETAPA OPCIONAL</span>
              <h2>
                <ScanFace size={21} /> Cadastrar acesso facial
              </h2>
              <p>
                A câmera só pedirá permissão ao iniciar. Cinco fotos são
                analisadas no servidor local e descartadas. Apenas vetores
                criptografados são salvos, e a senha continua disponível.
              </p>
            </div>
          </div>
          {faceDone ? (
            <p role="status" className="staff-success-message">
              Acesso facial cadastrado para {savedId}.
            </p>
          ) : face ? (
            <FaceCapture
              purpose="register"
              adminTarget={savedId}
              password={facePassword}
              onCancel={() => { setFace(false); setFacePassword(""); }}
              onDone={() => {
                setFace(false);
                setFaceDone(true);
                setFacePassword("");
              }}
            />
          ) : (
            <>
              <label>
                Sua senha de administrador para autorizar o cadastro facial
                <input type="password" autoComplete="current-password" maxLength={1024}
                  value={facePassword} onChange={(event) => setFacePassword(event.target.value)} />
              </label>
              <label className="staff-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />{" "}
                O funcionário presente autoriza o uso e armazenamento local dos
                embeddings faciais para autenticação e sabe que poderá
                removê-los no perfil.
              </label>
              <div className="staff-form-actions">
                <button
                  className="button primary"
                  disabled={!consent || !facePassword}
                  onClick={() => setFace(true)}
                >
                  Iniciar cadastro facial
                </button>
                <button className="button secondary" onClick={goBack}>
                  Pular e voltar à lista
                </button>
              </div>
            </>
          )}
        </section>
        <div className="staff-form-actions">
          <button className="button secondary" onClick={goBack}>
            Voltar à lista
          </button>
          <button className="button primary" onClick={another}>
            Cadastrar outro usuário
          </button>
        </div>
      </div>
    );
  return (
    <div className="staff-create-page">
      <button className="link-button staff-back" onClick={goBack}>
        <ArrowLeft size={18} /> Voltar para usuários
      </button>
      <div className="section-heading-actions">
        <div className="page-heading heading">
          <p className="kicker">ADMINISTRAÇÃO</p>
          <h1>Novo usuário</h1>
          <p>
            Cadastre a conta primeiro. O acesso facial será oferecido depois,
            sem impedir a criação.
          </p>
        </div>
      </div>
      <form className="staff-create-form" onSubmit={save} noValidate>
        <fieldset className="panel">
          <legend>Identificação e contato</legend>
          <div className="filter-grid">
            <Field label="Matrícula / ID" error={errors.id}>
              <input
                value={form.id}
                onChange={(e) => change("id", e.target.value)}
                maxLength={30}
                autoFocus
                aria-invalid={!!errors.id}
              />
            </Field>
            <Field label="Nome completo" error={errors.name}>
              <input
                value={form.name}
                onChange={(e) => change("name", e.target.value)}
                maxLength={120}
                aria-invalid={!!errors.name}
              />
            </Field>
            <Field label="E-mail" error={errors.email}>
              <input
                type="email"
                value={form.email}
                onChange={(e) => change("email", e.target.value)}
                maxLength={190}
                aria-invalid={!!errors.email}
              />
            </Field>
            <Field label="Setor" error={errors.sector}>
              <input
                value={form.sector}
                onChange={(e) => change("sector", e.target.value)}
                maxLength={80}
                aria-invalid={!!errors.sector}
              />
            </Field>
          </div>
        </fieldset>
        <fieldset className="panel">
          <legend>Função e acesso</legend>
          <div className="filter-grid">
            <Field label="Função" error={errors.role}>
              <select
                value={form.role}
                onChange={(e) => change("role", e.target.value as StaffRole)}
              >
                {roles.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </Field>
            {["Funcionário", "Líder de bloco"].includes(form.role) && (
              <Field label="Bloco de atuação" error={errors.block}>
                <select
                  value={form.block || ""}
                  onChange={(e) => change("block", e.target.value)}
                >
                  <option value="">Selecione</option>
                  {blockOptions.map((block) => (
                    <option key={block}>{block}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Status">
              <select
                value={form.active ? "Ativo" : "Desativado"}
                onChange={(e) => change("active", e.target.value === "Ativo")}
              >
                <option>Ativo</option>
                <option>Desativado</option>
              </select>
            </Field>
          </div>
        </fieldset>
        {persistent && (
          <fieldset className="panel">
            <legend>Senha inicial</legend>
            <p>
              O funcionário poderá usar esta senha mesmo se não cadastrar
              biometria.
            </p>
            <div className="filter-grid">
              <Field label="Senha" error={errors.password}>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setDirty(true);
                    setErrors((v) => ({ ...v, password: undefined }));
                  }}
                  aria-invalid={!!errors.password}
                />
              </Field>
              <Field label="Confirmar senha" error={errors.confirm}>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    setDirty(true);
                    setErrors((v) => ({ ...v, confirm: undefined }));
                  }}
                  aria-invalid={!!errors.confirm}
                />
              </Field>
            </div>
          </fieldset>
        )}
        {serverError && (
          <p role="alert" className="staff-field-error">
            {serverError}
          </p>
        )}
        <div className="staff-form-actions">
          <button type="button" className="button secondary" onClick={goBack}>
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar usuário"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="staff-field">
      <label>
        {label}
        {children}
      </label>
      {error && (
        <span className="staff-field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
