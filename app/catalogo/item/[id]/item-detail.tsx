"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  MapPin,
  Minus,
  Package,
  Plus,
  ShieldCheck,
} from "lucide-react";
import type { CatalogItem } from "@/lib/catalog";
import { ItemArt } from "../../item-art";
import styles from "../../catalog.module.css";

type DetailState = "loading" | "ready" | "error" | "missing";
type RequestState = "idle" | "submitting" | "success";

export function ItemDetail({
  id,
  canRequest,
}: {
  id: string;
  canRequest: boolean;
}) {
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [state, setState] = useState<DetailState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [persisted, setPersisted] = useState(false);
  const submission = useRef<{ signature: string; key: string } | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [showRequest, setShowRequest] = useState(false);
  const [error, setError] = useState("");
  const [protocol, setProtocol] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/items/${encodeURIComponent(id)}`, {
          signal: controller.signal,
        });
        if (response.status === 404) {
          setState("missing");
          return;
        }
        if (!response.ok) throw new Error("Item unavailable");
        const data = await response.json();
        if (!data.item) throw new Error("Invalid item");
        setItem(data.item);
        setState("ready");
      } catch {
        if (!controller.signal.aborted) setState("error");
      }
    }
    load();
    return () => controller.abort();
  }, [id, attempt]);

  function retry() {
    setState("loading");
    setAttempt((value) => value + 1);
  }

  async function requestItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item || requestState !== "idle") return;
    setError("");
    setRequestState("submitting");
    const justification = String(new FormData(event.currentTarget).get("justification") ?? "");
    const signature = JSON.stringify([item.id, quantity, justification]);
    if (submission.current?.signature !== signature) submission.current = { signature, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/requisicoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, quantity, justification, requestKey: submission.current.key }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Não foi possível iniciar a requisição.");
        setRequestState("idle");
        return;
      }
      setProtocol(result.protocol);
      setPersisted(result.persistent === true);
      window.dispatchEvent(new CustomEvent("marcon:workspace-updated"));
      setRequestState("success");
    } catch {
      setError("Não foi possível conectar. Tente novamente.");
      setRequestState("idle");
    }
  }

  return (
    <main className={styles.content}>
      <Link href="/catalogo" className={styles.backLink}>
        <ArrowLeft size={18} /> Voltar ao catálogo
      </Link>
      {state === "loading" && (
        <div className={styles.detailLoading} role="status">
          Carregando detalhes do item…
        </div>
      )}
      {state === "error" && (
        <div className={styles.emptyState} role="alert">
          <CircleAlert size={36} />
          <h1>Não foi possível carregar o item.</h1>
          <p>Verifique sua conexão e tente novamente.</p>
          <button className={styles.outlineButton} onClick={retry}>
            Tentar novamente
          </button>
        </div>
      )}
      {state === "missing" && (
        <div className={styles.emptyState}>
          <Package size={36} />
          <h1>Item não encontrado</h1>
          <p>Confira o ID ou volte ao catálogo.</p>
          <Link href="/catalogo" className={styles.outlineButton}>
            Ver catálogo
          </Link>
        </div>
      )}
      {state === "ready" && item && (
        <>
          <div className={styles.detailGrid}>
            <div className={styles.detailArtFrame}>
              <ItemArt item={item} large />
              <span className={styles.visualCaption}>MARCON · MATERIAIS</span>
            </div>
            <div className={styles.detailInfo}>
              <div className={styles.breadcrumb}>
                {item.category} <span>/</span> {item.id}
              </div>
              <h1>{item.name}</h1>
              <p className={styles.description}>{item.description}</p>
              <div className={styles.stockPanel}>
                <span
                  className={
                    item.stock > 0 ? styles.available : styles.unavailable
                  }
                >
                  {item.stock > 0
                    ? "Disponível para requisição"
                    : "Sem saldo no momento"}
                </span>
                <div>
                  <strong>{item.stock}</strong>
                  <span>{item.unit} em estoque</span>
                </div>
              </div>
              <div className={styles.detailFacts}>
                <div>
                  <MapPin size={18} />
                  <span>
                    Localização<strong>{item.location}</strong>
                  </span>
                </div>
                <div>
                  <ShieldCheck size={18} />
                  <span>
                    Especificação<strong>{item.specification}</strong>
                  </span>
                </div>
              </div>
              {requestState === "success" ? (
                <div className={styles.successCard} role="status">
                  <CheckCircle2 size={28} />
                  <div>
                    <strong>Requisição iniciada!</strong>
                    <p>
                      Protocolo {protocol} · {quantity} {item.unit}
                    </p>
                    <small>
                      {persisted ? "Requisição registrada; aguarde aprovação e atendimento." : "Demonstração: solicitação registrada temporariamente, sem envio ao almoxarifado."}
                    </small>
                  </div>
                </div>
              ) : !canRequest ? (
                <p className={styles.roleNotice}>
                  Este perfil pode consultar o catálogo. Para requisitar
                  materiais, entre com uma conta de funcionário.
                </p>
              ) : !showRequest ? (
                <button
                  type="button"
                  className={styles.primaryAction}
                  disabled={item.stock === 0}
                  onClick={() => setShowRequest(true)}
                >
                  {item.stock > 0
                    ? "Requisitar este item"
                    : "Indisponível no momento"}{" "}
                  <Plus size={18} />
                </button>
              ) : (
                <form className={styles.requestForm} onSubmit={requestItem}>
                  <h2>Iniciar requisição</h2>
                  <p>Escolha a quantidade desejada.</p>
                  <div className={styles.quantityRow}>
                    <label htmlFor="quantity">Quantidade</label>
                    <div className={styles.stepper}>
                      <button
                        type="button"
                        disabled={
                          quantity <= 1 || requestState === "submitting"
                        }
                        onClick={() => setQuantity((value) => value - 1)}
                        aria-label="Diminuir quantidade"
                      >
                        <Minus size={18} />
                      </button>
                      <input
                        id="quantity"
                        type="number"
                        min="1"
                        max={item.stock}
                        step="1"
                        value={quantity}
                        onChange={(event) =>
                          setQuantity(Number(event.target.value))
                        }
                        required
                      />
                      <button
                        type="button"
                        disabled={
                          quantity >= item.stock ||
                          requestState === "submitting"
                        }
                        onClick={() => setQuantity((value) => value + 1)}
                        aria-label="Aumentar quantidade"
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  </div>
                  {quantity > 10 && <label>Justificativa<textarea name="justification" required minLength={3} maxLength={1000} /></label>}
                  {error && (
                    <p role="alert" className={styles.formError}>
                      {error}
                    </p>
                  )}
                  <div className={styles.formActions}>
                    <button
                      type="button"
                      className={styles.outlineButton}
                      disabled={requestState === "submitting"}
                      onClick={() => {
                        setShowRequest(false);
                        setError("");
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className={styles.primaryAction}
                      disabled={
                        requestState === "submitting" ||
                        !Number.isSafeInteger(quantity) ||
                        quantity < 1 ||
                        quantity > item.stock
                      }
                    >
                      {requestState === "submitting"
                        ? "Enviando…"
                        : "Confirmar requisição"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
