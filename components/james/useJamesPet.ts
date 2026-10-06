"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export type Dock = "right" | "left" | "inline";
type Preferences = {
  still: boolean;
  quiet: boolean;
  dock: Dock;
  voice: boolean;
};
const defaults: Preferences = {
  still: true,
  quiet: false,
  dock: "right",
  voice: true,
};
export function useJamesPet(userId: string, path: string, open: boolean) {
  const [preferences, setPreferences] = useState(defaults),
    [dock, setDock] = useState<Dock>("inline"),
    [tip, setTip] = useState("");
  const root = useRef<HTMLDivElement>(null),
    seen = useRef(new Set<string>()),
    lastInput = useRef(0),
    highlight = useRef<HTMLElement | null>(null),
    highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const value = JSON.parse(
          localStorage.getItem("marco-pet:" + userId) || localStorage.getItem("james-pet:" + userId) || "null",
        );
        if (
          value &&
          typeof value.still === "boolean" &&
          typeof value.quiet === "boolean" &&
          ["right", "left", "inline"].includes(value.dock)
        ) {
          setPreferences({
            ...defaults,
            ...value,
            voice: typeof value.voice === "boolean" ? value.voice : true,
          });
          localStorage.setItem("marco-pet:" + userId, JSON.stringify(value));
        }
      } catch {
        /* Ignore invalid preferences. */
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [userId]);
  const update = (patch: Partial<Preferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    try {
      localStorage.setItem("marco-pet:" + userId, JSON.stringify(next));
    } catch {
      /* Preferences remain usable in memory. */
    }
  };
  const clearHighlight = useCallback(() => {
    highlight.current?.removeAttribute("data-james-highlight");
    highlight.current = null;
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
  }, []);
  const currentDock = useRef<Dock>("inline");
  const previousPosition = useRef<DOMRect | null>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || open) return;
    const next = element.getBoundingClientRect(),
      previous = previousPosition.current;
    previousPosition.current = next;
    if (
      !previous ||
      preferences.still ||
      document.activeElement?.matches(
        "input,textarea,select,[contenteditable=true]",
      ) ||
      matchMedia("(prefers-reduced-motion:reduce), (update:slow)").matches
    )
      return;
    const swept = {
      left: Math.min(previous.left, next.left),
      right: Math.max(previous.right, next.right),
      top: Math.min(previous.top, next.top),
      bottom: Math.max(previous.bottom, next.bottom),
    };
    const clear = [
      ...document.querySelectorAll("button,input,a,select,textarea,form,table"),
    ]
      .filter(
        (e) => !e.closest("[data-james-pet]") && e.getClientRects().length,
      )
      .every((e) => {
        const b = e.getBoundingClientRect();
        return (
          b.right <= swept.left ||
          b.left >= swept.right ||
          b.bottom <= swept.top ||
          b.top >= swept.bottom
        );
      });
    const animation = element.animate(
      clear
        ? [
            {
              transform: `translate(${previous.x - next.x}px,${previous.y - next.y}px)`,
            },
            { transform: "none" },
          ]
        : [{ opacity: 0.6 }, { opacity: 1 }],
      { duration: 400, easing: "ease-out" },
    );
    return () => animation.cancel();
  }, [dock, preferences.still, open]);
  useEffect(() => {
    lastInput.current = Date.now();
    const activity = () => {
      lastInput.current = Date.now();
    };
    window.addEventListener("keydown", activity, true);
    window.addEventListener("pointerdown", activity, true);
    window.addEventListener("scroll", activity, true);
    const position = (roam = false) => {
      const visual = window.visualViewport;
      root.current?.toggleAttribute(
        "data-compact",
        (visual?.height || innerHeight) <= 500,
      );
      root.current?.style.setProperty(
        "--james-visible-height",
        `${visual?.height || innerHeight}px`,
      );
      root.current?.style.setProperty(
        "--james-keyboard-inset",
        `${Math.max(0, innerHeight - (visual?.height || innerHeight) - (visual?.offsetTop || 0))}px`,
      );
      if (open || document.hidden) return;
      const protectedElements = Array.from(
        document.querySelectorAll<HTMLElement>(
          "button,a,input,select,textarea,table,form,article,.panel,.heading,[role=dialog],dialog[open]",
        ),
      ).filter(
        (e) => !e.closest("[data-james-pet]") && e.getClientRects().length,
      );
      const width = root.current?.getBoundingClientRect().width || 180,
        height = root.current?.getBoundingClientRect().height || 80;
      const viewport = window.visualViewport;
      const bottom =
        (viewport?.offsetTop || 0) + (viewport?.height || innerHeight) - 12;
      const safe = (side: Dock) => {
        if (side === "inline") return true;
        const left = side === "left" ? 12 : innerWidth - width - 12;
        return protectedElements.every((e) => {
          const b = e.getBoundingClientRect();
          return (
            b.right <= left ||
            b.left >= left + width ||
            b.bottom <= bottom - height ||
            b.top >= bottom
          );
        });
      };
      const editable = document.activeElement?.matches(
        "input,textarea,select,[contenteditable=true]",
      );
      const candidates: Dock[] =
        roam &&
        !preferences.still &&
        !editable &&
        Date.now() - lastInput.current > 60000 &&
        !getSelection()?.toString() &&
        !matchMedia("(prefers-reduced-motion: reduce), (update: slow)").matches
          ? [
              currentDock.current === "left" ? "right" : "left",
              preferences.dock,
              "inline",
            ]
          : [preferences.dock, "inline"];
      currentDock.current = candidates.find(safe) || "inline";
      setDock(currentDock.current);
    };
    const check = () => position(false);
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(check);
    };
    // New panels and dialogs can occupy a previously free corner without scrolling.
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          (r) =>
            !(
              r.target instanceof Element &&
              r.target.closest("[data-james-pet]")
            ),
        )
      )
        schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const visibility = () => {
      root.current?.toggleAttribute("data-motion-paused", document.hidden);
      if (!document.hidden) schedule();
    };
    const first = setTimeout(check, 0);
    const timer = setInterval(() => position(true), 65000);
    window.addEventListener("resize", check);
    window.addEventListener("scroll", schedule, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("focusin", schedule);
    window.visualViewport?.addEventListener("resize", check);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("focusin", schedule);
      window.removeEventListener("keydown", activity, true);
      window.removeEventListener("pointerdown", activity, true);
      window.removeEventListener("scroll", activity, true);
      window.removeEventListener("resize", check);
      window.removeEventListener("scroll", schedule);
      window.visualViewport?.removeEventListener("resize", check);
    };
  }, [open, preferences, path, tip]);
  const context = path.includes("recommendations")
    ? "Confira o consumo dos blocos e a rota antes de confirmar uma transferência sugerida."
    : path.includes("purchases")
      ? "Revise consumo, mínimos e entradas confirmadas antes de decidir a compra."
      : path.includes("dashboard")
        ? "Use os filtros para conferir período e escopo antes de comparar indicadores."
        : path.includes("request")
          ? "Busque o material, confira a embalagem e revise o carrinho antes de enviar."
          : path.includes("map")
            ? "Revise caminhos e bloqueios antes de publicar a planta."
            : "Posso orientar sobre esta tela. Nenhuma animação executa ações.";
  useEffect(() => {
    clearHighlight();
    const timer = setTimeout(() => {
      if (
        !preferences.quiet &&
        !seen.current.has(path) &&
        !document.activeElement?.matches(
          "input,textarea,select,[contenteditable=true]",
        )
      ) {
        seen.current.add(path);
        setTip(context);
      } else setTip("");
    }, 2500);
    return () => {
      clearTimeout(timer);
      clearHighlight();
    };
  }, [path, preferences.quiet, context, clearHighlight]);
  const point = () => {
    clearHighlight();
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>("input,button,select,summary"),
    );
    const target = elements.find(
      (e) =>
        !e.closest("[data-james-pet]") &&
        e.getClientRects().length &&
        /busque|pesquis|período|filtros|carrinho/i.test(
          (e.getAttribute("placeholder") || "") +
            " " +
            (e.getAttribute("aria-label") || "") +
            " " +
            e.textContent,
        ),
    );
    if (!target) {
      setTip(
        "Abra a tela de catálogo ou uma dashboard para localizar seus controles.",
      );
      return;
    }
    target.scrollIntoView({
      block: "center",
      behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
        ? "instant"
        : "smooth",
    });
    target.setAttribute("data-james-highlight", "true");
    highlight.current = target;
    highlightTimer.current = setTimeout(clearHighlight, 6000);
    setTip(
      "O controle destacado é o próximo passo. Você pode usar os comandos de campo ou a tarefa guiada; operações exigem revisão e confirmação.",
    );
  };
  return {
    root,
    dock,
    preferences,
    update,
    tip: preferences.quiet ? "" : tip,
    point,
    clearHighlight,
  };
}
