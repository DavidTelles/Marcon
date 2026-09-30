"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  PackageSearch,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import type { CatalogItem } from "@/lib/catalog";
import { ItemArt } from "./item-art";
import styles from "./catalog.module.css";

type LoadState = "loading" | "ready" | "error";
const categories = [
  "Todos",
  "Proteção",
  "Ferramentas",
  "Elétrica",
  "Escritório",
] as const;
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export function CatalogView() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("Todos");
  const [availableOnly, setAvailableOnly] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/items", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Catalog unavailable");
        const data = await response.json();
        if (!Array.isArray(data.items)) throw new Error("Invalid catalog");
        setItems(data.items);
        setState("ready");
      } catch {
        if (!controller.signal.aborted) setState("error");
      }
    }
    load();
    return () => controller.abort();
  }, [attempt]);

  const filtered = useMemo(() => {
    const term = normalize(query);
    return items.filter(
      (item) =>
        (!term ||
          normalize(item.name).includes(term) ||
          normalize(item.id).includes(term)) &&
        (category === "Todos" || item.category === category) &&
        (!availableOnly || item.stock > 0),
    );
  }, [items, query, category, availableOnly]);

  function retry() {
    setState("loading");
    setAttempt((value) => value + 1);
  }

  function clearFilters() {
    setQuery("");
    setCategory("Todos");
    setAvailableOnly(false);
  }

  return (
    <main className={styles.content}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>
            <Sparkles size={14} /> MARCON · MATERIAIS
          </span>
          <h1>
            O que você precisa
            <br />
            <span>está por aqui.</span>
          </h1>
          <p>
            Encontre materiais, confira o saldo e inicie uma requisição em
            poucos passos.
          </p>
          <a href="#lista-itens" className={styles.heroLink}>
            Explorar catálogo <ArrowRight size={17} />
          </a>
        </div>
        <div className={styles.heroGraphic} aria-hidden="true">
          <div className={styles.heroOrbit} />
          <div className={styles.heroCube}>
            <span />
            <span />
            <span />
          </div>
          <div className={styles.heroFloat}>
            MATERIAIS <strong>EM UM SÓ LUGAR</strong>
          </div>
        </div>
      </section>

      <section
        id="lista-itens"
        className={styles.catalogSection}
        aria-labelledby="catalog-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionEyebrow}>SEU ALMOXARIFADO</span>
            <h2 id="catalog-title">Catálogo de materiais</h2>
            <p>Escolha o item certo para sua atividade.</p>
          </div>
          <span className={styles.count}>
            {state === "ready" ? `${filtered.length} itens` : "Catálogo"}
          </span>
        </div>

        <div className={styles.toolbar}>
          <label className={styles.searchBox}>
            <Search size={20} aria-hidden="true" />
            <span className={styles.srOnly}>Buscar item por nome ou ID</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Busque por nome ou ID"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Limpar busca"
              >
                <X size={17} />
              </button>
            )}
          </label>
          <label className={styles.availabilityToggle}>
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(event) => setAvailableOnly(event.target.checked)}
            />
            <SlidersHorizontal size={16} /> Somente disponíveis
          </label>
        </div>
        <div
          className={styles.chips}
          role="group"
          aria-label="Filtrar por categoria"
        >
          {categories.map((name) => (
            <button
              key={name}
              type="button"
              className={category === name ? styles.chipActive : styles.chip}
              aria-pressed={category === name}
              onClick={() => setCategory(name)}
            >
              {name}
            </button>
          ))}
        </div>

        {state === "loading" && (
          <div
            className={styles.skeletonGrid}
            aria-label="Carregando itens"
            role="status"
          >
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className={styles.skeletonCard} />
            ))}
          </div>
        )}
        {state === "error" && (
          <div className={styles.emptyState} role="alert">
            <CircleAlert size={34} />
            <h3>Não foi possível carregar o catálogo.</h3>
            <p>Verifique sua conexão e tente novamente.</p>
            <button className={styles.outlineButton} onClick={retry}>
              Tentar novamente
            </button>
          </div>
        )}
        {state === "ready" && filtered.length === 0 && (
          <div className={styles.emptyState}>
            <PackageSearch size={38} />
            <h3>Nenhum item encontrado</h3>
            <p>Tente outro nome, ID ou categoria.</p>
            <button className={styles.outlineButton} onClick={clearFilters}>
              Limpar filtros
            </button>
          </div>
        )}
        {state === "ready" && filtered.length > 0 && (
          <div className={styles.productGrid}>
            {filtered.map((item) => (
              <article className={styles.productCard} key={item.id}>
                <Link
                  href={`/catalogo/item/${item.id}`}
                  className={styles.cardLink}
                  aria-label={`Ver detalhes de ${item.name}`}
                >
                  <ItemArt item={item} />
                  <div className={styles.cardBody}>
                    <span className={styles.category}>
                      {item.category} <span>· {item.id}</span>
                    </span>
                    <h3>{item.name}</h3>
                    <div className={styles.cardBottom}>
                      <span
                        className={
                          item.stock > 0 ? styles.available : styles.unavailable
                        }
                      >
                        {item.stock > 0
                          ? `${item.stock} ${item.unit} disponíveis`
                          : "Sem saldo"}
                      </span>
                      <span className={styles.cardArrow}>
                        <ArrowRight size={18} />
                      </span>
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
