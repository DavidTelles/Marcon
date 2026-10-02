"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const key = "marcon-workspace-theme";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("marcon:theme", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("marcon:theme", callback);
  };
}
let fallback: "light" | "dark" = "light";
function snapshot() {
  try {
    const saved = localStorage.getItem(key);
    if (saved === "dark" || saved === "light") return saved;
  } catch { /* Keep the control usable when browser storage is unavailable. */ }
  return fallback;
}
export function useWorkspaceTheme() {
  return useSyncExternalStore(subscribe, snapshot, () => "light" as const);
}
export function ThemeSync() {
  const theme = useWorkspaceTheme();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return null;
}
export function ThemeToggle() {
  const theme = useWorkspaceTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label="Modo escuro"
      aria-pressed={dark}
      title={dark ? "Ativar modo claro" : "Ativar modo escuro"}
      onClick={() => {
        fallback = dark ? "light" : "dark";
        try { localStorage.setItem(key, fallback); } catch { /* Use memory fallback. */ }
        window.dispatchEvent(new Event("marcon:theme"));
      }}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <Sun size={14} /><Moon size={14} /><i />
      </span>
      <span>{dark ? "Escuro" : "Claro"}</span>
    </button>
  );
}
