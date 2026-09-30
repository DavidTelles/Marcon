"use client";
import { useEffect, useRef } from "react";
export function DashboardDialog({
  open,
  title,
  onClose,
  children,
  compact = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const resize = () => {
      ref.current?.style.setProperty(
        "--dialog-height",
        `${viewport?.height ?? innerHeight}px`,
      );
      ref.current?.style.setProperty(
        "--dialog-top",
        `${(viewport?.offsetTop ?? 0) + 12}px`,
      );
      ref.current?.style.setProperty(
        "--dialog-bottom",
        `${Math.max(0, innerHeight - (viewport?.height ?? innerHeight) - (viewport?.offsetTop ?? 0)) + 12}px`,
      );
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
    };
  }, [open]);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={"dashboard-dialog" + (compact ? " compact" : "")}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          className="button secondary"
          onClick={onClose}
          aria-label={"Fechar " + title}
        >
          Fechar
        </button>
      </header>
      <div className="dashboard-dialog-body">{open ? children : null}</div>
    </dialog>
  );
}
