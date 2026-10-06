"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CircleAlert,
  MapPin,
  Package,
  Plus,
  ShieldCheck,
} from "lucide-react";
import type { CatalogItem } from "@/lib/catalog";
import { ItemArt } from "../../item-art";
import styles from "../../catalog.module.css";
import { PhotoCredit } from "@/components/workspace/screens/product-photo";

type DetailState = "loading" | "ready" | "error" | "missing";

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
              <PhotoCredit image={item.image} />
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
              {!canRequest ? (
                <p className={styles.roleNotice}>
                  Este perfil pode consultar o catálogo. Para requisitar
                  materiais, entre com uma conta de funcionário.
                </p>
              ) : item.stock > 0 ? (
                <Link
                  href={`/employee/request/material/${encodeURIComponent(item.id)}`}
                  className={styles.primaryAction}
                >
                  Requisitar este item <Plus size={18} />
                </Link>
              ) : (
                <p className={styles.roleNotice}>Indisponível no momento</p>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
