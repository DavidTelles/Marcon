"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { BrandLogo } from "@/app/components/brand-logo";
import { roleLanding, type Role } from "@/lib/workspace-routes";
import { ThemeToggle } from "./theme-toggle";
import styles from "./mobile-brand-menu.module.css";

export function MobileBrandMenu({ role }: { role: Role }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const id = useId();
  function close() {
    dialog.current?.close();
    setOpen(false);
  }
  return (
    <div className={`mobile-brand-menu ${styles.root}`}>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Abrir menu"
        title="Abrir menu Marcon"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        <BrandLogo compact decorative />
      </button>
      <dialog
        id={id}
        ref={dialog}
        className={styles.dialog}
        aria-label="Menu Marcon"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <header>
          <BrandLogo compact />
          <button
            type="button"
            autoFocus
            aria-label="Fechar menu"
            onClick={close}
          >
            <X size={18} />
          </button>
        </header>
        <nav aria-label="Navegação principal">
          <Link href={roleLanding[role]} onClick={close}>
            Página inicial
          </Link>
          {role === "funcionario" && (
            <Link href="/employee/requests" onClick={close}>
              Meus pedidos
            </Link>
          )}
          <Link
            href={
              role === "funcionario"
                ? "/employee/history"
                : role === "admin"
                  ? "/admin/history"
                  : role === "lider"
                    ? "/department-head/history"
                    : "/warehouse/history"
            }
            onClick={close}
          >
            {role === "funcionario" ? "Meu histórico" : "Histórico"}
          </Link>
          <Link href="/profile" onClick={close}>
            Editar perfil
          </Link>
        </nav>
        <ThemeToggle />
        <form action="/api/logout" method="post">
          <button type="submit" className={styles.logout}>
            Sair da conta
          </button>
        </form>
      </dialog>
    </div>
  );
}
