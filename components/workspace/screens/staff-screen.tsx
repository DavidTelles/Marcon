"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Pencil, Plus, UserRoundCheck, UserRoundX } from "lucide-react";
import { heading } from "../ui";
import { useDemoStore } from "../demo-store";
import type { StaffRole, StaffUser } from "@/lib/staff-data";
import { BLOCKS } from "@/lib/inventory";

const roles: StaffRole[] = [
  "Administrador",
  "Líder de bloco",
  "Almoxarife",
  "Funcionário",
];
const emptyUser: StaffUser = {
  id: "",
  name: "",
  email: "",
  sector: "",
  role: "Funcionário",
  block: "Bloco A",
  active: true,
};

export function StaffScreen({
  setMessage,
}: {
  setMessage: React.Dispatch<React.SetStateAction<string>>;
}) {
  const { staff, setStaff, persistent, runAction } = useDemoStore();
  const searchParams = useSearchParams(),
    pathname = usePathname(),
    router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffUser>(emptyUser);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [idFilter, setIdFilter] = useState(searchParams.get("id") ?? "");
  const [emailFilter, setEmailFilter] = useState(
    searchParams.get("email") ?? "",
  );
  const [sectorFilter, setSectorFilter] = useState(
    searchParams.get("sector") ?? "Todos",
  );
  const [roleFilter, setRoleFilter] = useState(
    searchParams.get("role") ?? "Todas",
  );
  const [blockFilter, setBlockFilter] = useState(
    searchParams.get("block") ?? "Todos",
  );
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("status") ?? "Todos",
  );
  useEffect(() => {
    const q = new URLSearchParams();
    for (const [k, v, empty] of [
      ["id", idFilter, ""],
      ["email", emailFilter, ""],
      ["sector", sectorFilter, "Todos"],
      ["role", roleFilter, "Todas"],
      ["block", blockFilter, "Todos"],
      ["status", statusFilter, "Todos"],
    ])
      if (v !== empty) q.set(k, v);
    router.replace(pathname + (q.size ? "?" + q : ""), { scroll: false });
  }, [
    idFilter,
    emailFilter,
    sectorFilter,
    roleFilter,
    blockFilter,
    statusFilter,
    pathname,
    router,
  ]);

  const sectors = ["Todos", ...new Set(staff.map((user) => user.sector))];
  const visibleStaff = staff.filter(
    (user) =>
      user.id.toLowerCase().includes(idFilter.trim().toLowerCase()) &&
      user.email.toLowerCase().includes(emailFilter.trim().toLowerCase()) &&
      (sectorFilter === "Todos" || user.sector === sectorFilter) &&
      (roleFilter === "Todas" || user.role === roleFilter) &&
      (blockFilter === "Todos" || user.block === blockFilter) &&
      (statusFilter === "Todos" || (statusFilter === "Ativos") === user.active),
  );

  function updateField<Key extends keyof StaffUser>(
    key: Key,
    value: StaffUser[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openForm(user?: StaffUser) {
    setEditingId(user?.id ?? null);
    setForm(user ? { ...user } : { ...emptyUser });
    setPassword("");
    setConfirmPassword("");
    setFormOpen(true);
  }

  async function saveUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (persistent && password !== confirmPassword) {
      setMessage("As senhas informadas não coincidem.");
      return;
    }
    const user: StaffUser = {
      ...form,
      id: form.id.trim(),
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      sector: form.sector.trim(),
      block: ["Funcionário", "Líder de bloco"].includes(form.role)
        ? form.block
        : undefined,
    };
    if (!user.id || !user.name || !user.email || !user.sector) {
      setMessage("Preencha ID, nome, e-mail e setor.");
      return;
    }
    if (["Funcionário", "Líder de bloco"].includes(user.role) && !user.block) {
      setMessage("Selecione o bloco de atuação do usuário.");
      return;
    }
    if (staff.some((item) => item.id !== editingId && item.id === user.id)) {
      setMessage("Este ID já está cadastrado.");
      return;
    }
    if (
      staff.some(
        (item) =>
          item.id !== editingId && item.email.toLowerCase() === user.email,
      )
    ) {
      setMessage("Este e-mail já está cadastrado.");
      return;
    }
    if (persistent) {
      try {
        await runAction({ type: "saveUser", user, editingId, password });
        setMessage(editingId ? "Usuário atualizado." : "Usuário cadastrado.");
        setFormOpen(false);
        setEditingId(null);
        setPassword("");
        setConfirmPassword("");
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o usuário.",
        );
      }
      return;
    }
    setStaff((items) =>
      editingId
        ? items.map((item) => (item.id === editingId ? user : item))
        : [...items, user],
    );
    setMessage(
      editingId
        ? "Usuário atualizado nesta sessão."
        : "Usuário cadastrado nesta sessão.",
    );
    setFormOpen(false);
    setEditingId(null);
  }

  async function toggleActive(user: StaffUser) {
    if (persistent) {
      try {
        await runAction({
          type: "toggleUser",
          id: user.id,
          active: !user.active,
        });
        setMessage(user.active ? "Usuário desativado." : "Usuário reativado.");
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível alterar o usuário.",
        );
      }
      return;
    }
    setStaff((items) =>
      items.map((item) =>
        item.id === user.id ? { ...item, active: !item.active } : item,
      ),
    );
    setMessage(
      user.active
        ? "Usuário desativado nesta sessão."
        : "Usuário reativado nesta sessão.",
    );
  }

  return (
    <>
      <div className="section-heading-actions">
        {heading(
          "ADMINISTRAÇÃO",
          "Usuários",
          "Cadastre, edite, filtre e controle o acesso dos colaboradores.",
        )}
        <Link
          className="button primary"
          href={`/admin/create/new?return=${encodeURIComponent(pathname + (searchParams.size ? "?" + searchParams.toString() : ""))}`}
        >
          <Plus size={17} aria-hidden="true" /> Novo usuário
        </Link>
      </div>
      <div className="stats staff-summary">
        <div className="stat">
          <span>Usuários cadastrados</span>
          <strong>{staff.length}</strong>
        </div>
        <div className="stat">
          <span>Ativos</span>
          <strong>{staff.filter((user) => user.active).length}</strong>
        </div>
        <div className="stat">
          <span>Desativados</span>
          <strong>{staff.filter((user) => !user.active).length}</strong>
        </div>
      </div>
      {formOpen && (
        <form className="panel staff-form" onSubmit={saveUser}>
          <div className="panel-head">
            <div>
              <h2>{editingId ? "Editar usuário" : "Cadastrar usuário"}</h2>
              <p>
                {persistent
                  ? "Dados salvos no MySQL após confirmação."
                  : "Dados demonstrativos. As alterações ficam nesta sessão."}
              </p>
            </div>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setFormOpen(false);
                setEditingId(null);
              }}
            >
              Fechar
            </button>
          </div>
          <div className="filter-grid">
            <label>
              ID do usuário
              <input
                value={form.id}
                onChange={(event) => updateField("id", event.target.value)}
                required
                maxLength={30}
                placeholder="Ex.: 1005"
              />
            </label>
            <label>
              Nome completo
              <input
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                required
                maxLength={80}
                placeholder="Nome e sobrenome"
              />
            </label>
            <label>
              E-mail
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                required
                maxLength={120}
                placeholder="usuario@empresa.com"
              />
            </label>
            <label>
              Setor
              <input
                value={form.sector}
                onChange={(event) => updateField("sector", event.target.value)}
                required
                maxLength={60}
                placeholder="Ex.: Usinagem"
                list="staff-sectors"
              />
              <datalist id="staff-sectors">
                {sectors
                  .filter((sector) => sector !== "Todos")
                  .map((sector) => (
                    <option key={sector} value={sector} />
                  ))}
              </datalist>
            </label>
            <label>
              Função
              <select
                value={form.role}
                onChange={(event) =>
                  updateField("role", event.target.value as StaffRole)
                }
              >
                {roles.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={form.active ? "Ativo" : "Desativado"}
                onChange={(event) =>
                  updateField("active", event.target.value === "Ativo")
                }
              >
                <option>Ativo</option>
                <option>Desativado</option>
              </select>
            </label>
            {["Funcionário", "Líder de bloco"].includes(form.role) && (
              <label>
                Bloco de atuação
                <select
                  value={form.block ?? ""}
                  onChange={(event) => updateField("block", event.target.value)}
                  required
                >
                  <option value="">Selecione</option>
                  {BLOCKS.map((block) => (
                    <option key={block}>{block}</option>
                  ))}
                </select>
              </label>
            )}
            {persistent && (
              <label>
                {editingId ? "Nova senha (opcional)" : "Senha inicial"}
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required={!editingId}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Pelo menos 12 caracteres"
                />
              </label>
            )}
            {persistent && (
              <label>
                Confirme a senha
                <input
                  type="password"
                  autoComplete="new-password"
                  required={!editingId || Boolean(password)}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Digite a senha novamente"
                />
              </label>
            )}
          </div>
          <div className="staff-form-actions">
            <button className="button primary" type="submit">
              {editingId ? "Salvar alterações" : "Cadastrar usuário"}
            </button>
          </div>
        </form>
      )}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Usuários cadastrados</h2>
            <p>Filtre por ID, e-mail, setor, função, bloco e status.</p>
          </div>
          <span className="count">{visibleStaff.length} resultado(s)</span>
        </div>
        <div className="filter-grid">
          <label>
            ID
            <input
              value={idFilter}
              onChange={(event) => setIdFilter(event.target.value)}
              placeholder="Buscar ID"
            />
          </label>
          <label>
            E-mail
            <input
              value={emailFilter}
              onChange={(event) => setEmailFilter(event.target.value)}
              placeholder="Buscar e-mail"
            />
          </label>
          <label>
            Setor
            <select
              value={sectorFilter}
              onChange={(event) => setSectorFilter(event.target.value)}
            >
              {sectors.map((sector) => (
                <option key={sector}>{sector}</option>
              ))}
            </select>
          </label>
          <label>
            Função
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
            >
              <option>Todas</option>
              {roles.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option>Todos</option>
              <option>Ativos</option>
              <option>Desativados</option>
            </select>
          </label>
          <label>
            Bloco
            <select
              value={blockFilter}
              onChange={(event) => setBlockFilter(event.target.value)}
            >
              <option>Todos</option>
              {BLOCKS.map((block) => (
                <option key={block}>{block}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="filter-footer">
          <button
            className="link-button"
            onClick={() => {
              setIdFilter("");
              setEmailFilter("");
              setSectorFilter("Todos");
              setRoleFilter("Todas");
              setBlockFilter("Todos");
              setStatusFilter("Todos");
            }}
          >
            Limpar filtros
          </button>
        </div>
        {visibleStaff.length ? (
          <div className="staff-list">
            {visibleStaff.map((user) => (
              <article className="staff-card" key={user.id}>
                <span className="avatar" aria-hidden="true">
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <div className="staff-card-main">
                  <div className="staff-card-title">
                    <strong>{user.name}</strong>
                    <span
                      className={
                        "staff-status " + (user.active ? "active" : "inactive")
                      }
                    >
                      {user.active ? "Ativo" : "Desativado"}
                    </span>
                  </div>
                  <span>
                    ID {user.id} · {user.email}
                  </span>
                  <small>
                    {user.sector} · {user.role}
                    {user.block ? " · " + user.block : ""}
                  </small>
                </div>
                <div className="staff-card-actions">
                  <button
                    className="button secondary"
                    onClick={() => openForm(user)}
                    aria-label={"Editar " + user.name}
                  >
                    <Pencil size={15} aria-hidden="true" /> Editar
                  </button>
                  <button
                    className={
                      "button secondary " +
                      (user.active ? "staff-deactivate" : "")
                    }
                    onClick={() => toggleActive(user)}
                    aria-label={
                      (user.active ? "Desativar " : "Reativar ") + user.name
                    }
                  >
                    {user.active ? (
                      <UserRoundX size={16} aria-hidden="true" />
                    ) : (
                      <UserRoundCheck size={16} aria-hidden="true" />
                    )}
                    {user.active ? "Desativar" : "Reativar"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            <h3>Nenhum usuário encontrado</h3>
            <p>Altere os filtros ou cadastre um novo usuário.</p>
          </div>
        )}
      </section>
    </>
  );
}
