"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type LoginStatus = "idle" | "submitting" | "success";

export function useLogin() {
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<LoginStatus>("idle");
  const requestRef = useRef<AbortController | null>(null);
  const isBusy = status !== "idle";

  useEffect(() => () => requestRef.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestRef.current || isBusy) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 15_000);
    setStatus("submitting");
    setError("");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity, password }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Não foi possível entrar. Tente novamente.");
        setStatus("idle");
        return;
      }
      if (
        typeof result.destination !== "string" ||
        !/^\/inicio\/[a-z]+$/.test(result.destination)
      ) {
        throw new Error("Invalid login destination");
      }
      setStatus("success");
      window.location.assign(result.destination);
    } catch {
      setError(
        "Não foi possível conectar. Verifique sua conexão e tente novamente.",
      );
      setStatus("idle");
    } finally {
      window.clearTimeout(timeoutId);
      requestRef.current = null;
    }
  }

  return {
    isBusy,
    status,
    identity,
    password,
    error,
    setIdentity,
    setPassword,
    submit,
  };
}
