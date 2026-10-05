"use client";
import { ArrowUp } from "lucide-react";

export function BackToTop() {
  return <footer className="workspace-back-top">
    <button type="button" className="button secondary" onClick={(event) => {
      const main = event.currentTarget.closest("main");
      let container: Element | null = main;
      while (container && !(container.scrollHeight > container.clientHeight && /auto|scroll/.test(getComputedStyle(container).overflowY))) container = container.parentElement;
      const target = container || document.scrollingElement;
      target?.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
      main?.focus({ preventScroll: true });
    }}><ArrowUp size={18} aria-hidden="true" />Voltar ao topo</button>
  </footer>;
}
