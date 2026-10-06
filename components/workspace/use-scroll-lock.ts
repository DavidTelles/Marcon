"use client";

import { useEffect } from "react";

let locks = 0;
let restore: (() => void) | undefined;

export function useScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return;
    if (locks++ === 0) {
      const root = document.documentElement;
      const body = document.body;
      const x = window.scrollX;
      const y = window.scrollY;
      const rootStyles = {
        overflow: root.style.overflow,
        overscrollBehavior: root.style.overscrollBehavior,
      };
      const bodyStyles = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        width: body.style.width,
        overflow: body.style.overflow,
        paddingRight: body.style.paddingRight,
      };
      const scrollbar = window.innerWidth - root.clientWidth;
      const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
      Object.assign(root.style, { overflow: "hidden", overscrollBehavior: "none" });
      Object.assign(body.style, {
        position: "fixed",
        top: `${-y}px`,
        left: `${-x}px`,
        width: "100%",
        overflow: "hidden",
        paddingRight: `${padding + scrollbar}px`,
      });
      restore = () => {
        Object.assign(root.style, rootStyles);
        Object.assign(body.style, bodyStyles);
        window.scrollTo({ left: x, top: y, behavior: "instant" });
      };
    }
    return () => {
      if (--locks === 0) {
        restore?.();
        restore = undefined;
      }
    };
  }, [open]);
}
