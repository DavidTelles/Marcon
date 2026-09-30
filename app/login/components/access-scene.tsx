"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "../login.module.css";

export function AccessScene({ children }: { children: ReactNode }) {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)",
    );
    let frameId = 0;

    function resetTilt() {
      cancelAnimationFrame(frameId);
      scene!.style.removeProperty("--pointer-x");
      scene!.style.removeProperty("--pointer-y");
    }

    function updateTilt(event: PointerEvent) {
      if (!motionPreference.matches) return;
      const { left, top, width, height } = scene!.getBoundingClientRect();
      const x = Math.max(
        -1,
        Math.min(1, ((event.clientX - left) / width - 0.5) * 2),
      );
      const y = Math.max(
        -1,
        Math.min(1, ((event.clientY - top) / height - 0.5) * 2),
      );

      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        scene!.style.setProperty("--pointer-x", `${x * 7}deg`);
        scene!.style.setProperty("--pointer-y", `${-y * 5}deg`);
      });
    }

    scene.addEventListener("pointermove", updateTilt);
    scene.addEventListener("pointerleave", resetTilt);
    motionPreference.addEventListener("change", resetTilt);

    return () => {
      scene.removeEventListener("pointermove", updateTilt);
      scene.removeEventListener("pointerleave", resetTilt);
      motionPreference.removeEventListener("change", resetTilt);
      cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div ref={sceneRef} className={styles.scene} aria-hidden="true">
      {children}
    </div>
  );
}
