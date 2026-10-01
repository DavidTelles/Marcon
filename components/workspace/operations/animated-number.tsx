"use client";

import { useEffect, useRef, useState } from "react";

export function AnimatedNumber({
  value,
  decimals = 0,
}: {
  value: number;
  decimals?: number;
}) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(0);
  useEffect(() => {
    const startValue = previous.current;
    previous.current = value;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let frame = 0;
    let start: number | null = null;
    const animate = (time: number) => {
      start ??= time;
      const progress = reduced ? 1 : Math.min(1, (time - start) / 450);
      setDisplay(startValue + (value - startValue) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  const format = (number: number) =>
    Number(number.toFixed(decimals)).toLocaleString("pt-BR");
  return (
    <>
      <span aria-hidden="true">{format(display)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
