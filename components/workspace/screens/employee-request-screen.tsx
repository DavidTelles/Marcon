"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  MapPin,
  PackageSearch,
  Search,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import type { Part, Request } from "@/lib/demo-data";
import { boxLabel } from "@/lib/packaging";
import { requestAnomaly } from "@/lib/request-policy";
import { useDemoStore } from "../demo-store";
import { useEmployeeName, useEmployeeBlock } from "../employee-identity";
import { PartArt } from "./part-art";
import { PhotoCredit } from "./product-photo";
import styles from "@/app/catalogo/catalog.module.css";

type Mode = "request" | "cart" | null;
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();

function makeRequest(
  part: Part,
  quantity: number,
  priority: Request["priority"],
  justification: string,
  id: number,
  person: string,
  block: string,
): Request {
  return {
    id,
    material: part.name,
    code: part.code,
    quantity,
    person,
    block,
    date: new Date().toLocaleDateString("pt-BR"),
    status: "Pendente",
    priority,
    justification,
  };
}

export function EmployeeRequestScreen({ routePart }: { routePart?: string }) {
  const router = useRouter();
  const employeeName = useEmployeeName();
  const employeeBlock = useEmployeeBlock();
  const {
    stock: rawStock,
    requests,
    setRequests,
    cart,
    setCart,
    persistent,
    runAction,
  } = useDemoStore();
  const stock = rawStock.map((p) => ({
    ...p,
    quantity: p.available ?? p.quantity,
  }));
  const [query, setQuery] = useState("");
  const [warehouse, setWarehouse] = useState("Todos");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [quantity, setQuantity] = useState("1");
  const [requestedUnit, setRequestedUnit] = useState<"piece" | "box">("piece");
  const [confirmQuantity, setConfirmQuantity] = useState("");
  const [priority, setPriority] = useState<Request["priority"]>("Leve");
  const [justification, setJustification] = useState("");
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);

  const selectedPart =
    routePart && routePart !== "all"
      ? stock.find(
          (part) =>
            String(part.id) === routePart ||
            part.code.toLowerCase() === routePart.toLowerCase(),
        )
      : undefined;
  const isDetail = Boolean(routePart && routePart !== "all");
  const warehouses = [
    "Todos",
    ...new Set(
      stock.flatMap(
        (part) => part.locations?.map((l) => l.warehouse) ?? [part.warehouse],
      ),
    ),
  ];
  const filtered = stock.filter(
    (part) =>
      (!query ||
        normalize(
          part.name + " " + part.code + " " + (part.category ?? ""),
        ).includes(normalize(query))) &&
      (warehouse === "Todos" ||
        part.warehouse === warehouse ||
        part.locations?.some((l) => l.warehouse === warehouse)) &&
      (!availableOnly || part.quantity > 0),
  );
  const cartUnits = cart.reduce((sum, entry) => sum + entry.quantity, 0);
  const reservedForPart = selectedPart
    ? cart
        .filter((entry) => entry.code === selectedPart.code)
        .reduce((sum, entry) => sum + entry.quantity, 0)
    : 0;
  const availableForPart = selectedPart
    ? Math.max(0, selectedPart.quantity - reservedForPart)
    : 0;
  const unitMultiplier =
    requestedUnit === "box" ? (selectedPart?.packSize ?? 1) : 1;
  const unitsRequested = Number(quantity) * unitMultiplier;
  const anomaly = requestAnomaly(unitsRequested, selectedPart?.requestPattern);
  const unusual = anomaly.unusual || priority === "Urgente";

  function resetForm() {
    setQuantity("1");
    setRequestedUnit("piece");
    setConfirmQuantity("");
    setPriority("Leve");
    setJustification("");
    setError("");
    setMode(null);
  }

  async function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPart || !mode || sendingRef.current) return;
    const requestedAmount = Number(quantity);
    const amount = unitsRequested;
    if (
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      amount > availableForPart
    ) {
      setError("Informe uma quantidade inteira dentro do saldo disponível.");
      return;
    }
    if (
      Number(confirmQuantity) !== requestedAmount ||
      confirmQuantity.trim() === ""
    ) {
      setError("Digite a mesma quantidade nos dois campos.");
      return;
    }
    if (unusual && !justification.trim()) {
      setError(
        "Justifique a anormalidade identificada ou a prioridade urgente.",
      );
      return;
    }
    if (mode === "cart") {
      if (cart.some((entry) => entry.code === selectedPart.code)) {
        setError(
          "Esta peça já está no carrinho. Remova o item anterior antes de alterar a quantidade.",
        );
        return;
      }
      setCart((items) => [
        ...items,
        {
          code: selectedPart.code,
          quantity: amount,
          requestedUnit,
          requestedAmount,
          priority,
          justification: justification.trim(),
        },
      ]);
      resetForm();
      router.push("/employee/request#carrinho");
      return;
    }
    if (persistent) {
      sendingRef.current = true;
      setSending(true);
      setError("");
      try {
        const result = await runAction({
          type: "createRequests",
          entries: [
            {
              code: selectedPart.code,
              quantity: requestedAmount,
              requestedUnit,
              priority,
              justification: justification.trim(),
            },
          ],
        });
        setCreatedId((result.ids as number[])[0]);
        resetForm();
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Não foi possível criar a requisição.",
        );
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
      return;
    }
    const id = Math.max(1000, ...requests.map((request) => request.id)) + 1;
    setRequests((items) => [
      makeRequest(
        selectedPart,
        amount,
        priority,
        justification.trim(),
        id,
        employeeName,
        employeeBlock,
      ),
      ...items,
    ]);
    setCreatedId(id);
    resetForm();
  }

  async function checkoutCart() {
    if (!cart.length || sendingRef.current) return;
    const totals = new Map<string, number>();
    for (const entry of cart) {
      totals.set(entry.code, (totals.get(entry.code) ?? 0) + entry.quantity);
      if (
        !Number.isSafeInteger(entry.quantity) ||
        entry.quantity < 1 ||
        ((requestAnomaly(
          entry.quantity,
          stock.find((p) => p.code === entry.code)?.requestPattern,
        ).unusual ||
          entry.priority === "Urgente") &&
          !entry.justification.trim())
      ) {
        setError("Revise as quantidades e justificativas do carrinho.");
        return;
      }
    }
    for (const [code, amount] of totals) {
      const part = stock.find((piece) => piece.code === code);
      if (!part || amount > part.quantity) {
        setError(
          "O saldo de uma peça do carrinho mudou. Remova ou ajuste o item antes de confirmar.",
        );
        return;
      }
    }
    if (persistent) {
      sendingRef.current = true;
      setSending(true);
      setError("");
      try {
        await runAction({
          type: "createRequests",
          entries: cart.map((entry) => ({
            ...entry,
            quantity: entry.requestedAmount ?? entry.quantity,
          })),
        });
        setCart([]);
        setError("");
        router.push("/employee/requests");
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Não foi possível confirmar o carrinho.",
        );
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
      return;
    }
    const firstId =
      Math.max(1000, ...requests.map((request) => request.id)) + 1;
    const newRequests = cart.map((entry, index) => {
      const part = stock.find((piece) => piece.code === entry.code)!;
      return makeRequest(
        part,
        entry.quantity,
        entry.priority,
        entry.justification,
        firstId + index,
        employeeName,
        employeeBlock,
      );
    });
    setRequests((items) => [...newRequests, ...items]);
    setCart([]);
    setError("");
    router.push("/employee/requests");
  }

  const cartPanel = (
    <section
      id="carrinho"
      className={styles.employeeCart}
      aria-labelledby="cart-title"
      aria-busy={sending}
    >
      <div className={styles.employeeCartHeading}>
        <div>
          <span className={styles.sectionEyebrow}>SEU PEDIDO</span>
          <h2 id="cart-title">
            Carrinho · {cart.length} {cart.length === 1 ? "item" : "itens"}
          </h2>
          <p>{cartUnits} unidades aguardando confirmação.</p>
        </div>
        {cart.length > 0 && (
          <button
            type="button"
            className={styles.primaryAction}
            onClick={checkoutCart}
            disabled={sending}
          >
            {sending ? (
              <><LoaderCircle size={17} className={styles.requestSpinner} aria-hidden="true" /> Enviando pedido…</>
            ) : (
              <>Finalizar requisição <ArrowRight size={17} /></>
            )}
          </button>
        )}
      </div>
      {sending && !isDetail && <p className={styles.requestProgress} role="status">Registrando seu pedido. Aguarde a confirmação.</p>}
      {cart.length === 0 && (
        <p>
          Seu carrinho está vazio. Escolha uma peça no catálogo para começar.
        </p>
      )}
      {cart.map((entry, index) => {
        const part = stock.find((piece) => piece.code === entry.code);
        return (
          <div
            className={styles.employeeCartRow}
            key={entry.code + "-" + index}
          >
            <div>
              <strong>{part?.name ?? entry.code}</strong>
              <small>
                {entry.requestedUnit === "box"
                  ? `${entry.requestedAmount} caixas · ${entry.quantity} peças`
                  : `${entry.quantity} peças`}{" "}
                · {entry.priority} · {part?.code ?? entry.code}
              </small>
              {entry.justification && (
                <small>Justificativa: {entry.justification}</small>
              )}
            </div>
            <button
              type="button"
              className={styles.outlineButton}
              disabled={sending}
              onClick={() =>
                setCart((items) =>
                  items.filter((_, itemIndex) => itemIndex !== index),
                )
              }
            >
              Remover
            </button>
          </div>
        );
      })}
    </section>
  );

  if (isDetail && !selectedPart) {
    return (
      <main className={styles.content}>
        <Link href="/employee/request" className={styles.backLink}>
          <ArrowLeft size={18} /> Voltar ao catálogo
        </Link>
        <div className={styles.emptyState}>
          <PackageSearch size={36} />
          <h1>Peça não encontrada</h1>
          <p>Confira o ID ou escolha outra peça no catálogo.</p>
        </div>
      </main>
    );
  }

  if (isDetail && selectedPart) {
    return (
      <main className={styles.content}>
        <div className={styles.employeeDetailNav}>
          <Link
            href="/employee/request#carrinho"
            className={styles.cartShortcut}
          >
            <ShoppingCart size={17} /> Acessar carrinho ({cart.length})
          </Link>
          <Link href="/employee/request" className={styles.backLink}>
            <ArrowLeft size={18} /> Voltar ao catálogo
          </Link>
        </div>
        <div className={styles.detailGrid}>
          <div className={styles.detailArtFrame}>
            <PartArt part={selectedPart} large />
            <span className={styles.visualCaption}>
              MARCON · PEÇAS METALÚRGICAS
            </span>
            <PhotoCredit image={selectedPart.image} />
          </div>
          <div className={styles.detailInfo}>
            <div className={styles.breadcrumb}>
              {selectedPart.warehouse} <span>/</span> {selectedPart.code}
            </div>
            <h1>{selectedPart.name}</h1>
            <p className={styles.description}>
              {selectedPart.description || "Peça para manutenção e operação industrial. Confira o código, a localização e o saldo antes de solicitar."}
            </p>
            <div className={styles.stockPanel}>
              <span
                className={
                  selectedPart.quantity > 0
                    ? styles.available
                    : styles.unavailable
                }
              >
                {selectedPart.quantity > 0
                  ? "Disponível para requisição"
                  : "Sem saldo no momento"}
              </span>
              <div>
                <strong>{selectedPart.quantity}</strong>
                <span>unidades em estoque</span>
              </div>
              <small>
                {boxLabel(selectedPart.quantity, selectedPart.packSize)}
              </small>
            </div>
            <div className={styles.detailFacts}>
              <div>
                <MapPin size={18} />
                <span>
                  Localização
                  <strong>
                    {selectedPart.warehouse} · posição{" "}
                    {selectedPart.locations
                      ?.map(
                        (l) =>
                          `${l.warehouse}: ${l.aisle} / ${l.shelf} (${l.available} livres)`,
                      )
                      .join("; ") ?? selectedPart.location}
                  </strong>
                </span>
              </div>
              <div>
                <ShieldCheck size={18} />
                <span>
                  Identificação
                  <strong>
                    ID {selectedPart.code} · QR{" "}
                    {selectedPart.qrCode ?? selectedPart.code}
                  </strong>
                </span>
              </div>
            </div>
            {createdId ? (
              <div className={styles.successCard} role="status">
                <CheckCircle2 size={28} />
                <div>
                  <strong>Requisição #{createdId} registrada</strong>
                  <p>O líder do {employeeBlock} poderá analisar o pedido.</p>
                  <Link href="/employee/requests">Ver minhas requisições</Link>
                </div>
              </div>
            ) : mode ? (
              <form className={styles.requestForm} onSubmit={submitItem} aria-busy={sending}>
                <h2>
                  {mode === "request"
                    ? "Fazer requisição"
                    : "Adicionar ao carrinho"}
                </h2>
                <p>Confirme a quantidade duas vezes e informe a prioridade.</p>
                <fieldset className={styles.employeeFields} disabled={sending}>
                  <label>
                    Requisitar por
                    <select
                      value={requestedUnit}
                      onChange={(event) => {
                        setRequestedUnit(event.target.value as "piece" | "box");
                        setConfirmQuantity("");
                      }}
                    >
                      <option value="piece">Peça</option>
                      <option value="box">
                        Caixa ({selectedPart.packSize} peças)
                      </option>
                    </select>
                  </label>
                  <label>
                    Quantidade
                    <input
                      type="number"
                      min="1"
                      max={Math.floor(availableForPart / unitMultiplier)}
                      step="1"
                      inputMode="numeric"
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Confirme a quantidade
                    <input
                      type="number"
                      min="1"
                      max={Math.floor(availableForPart / unitMultiplier)}
                      step="1"
                      inputMode="numeric"
                      value={confirmQuantity}
                      onChange={(event) =>
                        setConfirmQuantity(event.target.value)
                      }
                      required
                      placeholder="Digite novamente"
                    />
                  </label>
                  <label>
                    Prioridade
                    <select
                      value={priority}
                      onChange={(event) =>
                        setPriority(event.target.value as Request["priority"])
                      }
                    >
                      <option>Leve</option>
                      <option>Moderado</option>
                      <option>Urgente</option>
                    </select>
                  </label>
                  <label>
                    Bloco
                    <input value={employeeBlock + " · seu bloco"} readOnly />
                  </label>
                  <label className={styles.employeeWideField}>
                    Justificativa {unusual && "(obrigatória)"}
                    <textarea
                      value={justification}
                      onChange={(event) => setJustification(event.target.value)}
                      required={unusual}
                      minLength={unusual ? 3 : undefined}
                      placeholder="Explique a necessidade deste material para a atividade do seu setor/bloco"
                    />
                  </label>
                </fieldset>
                <p>
                  {Number(quantity) || 0}{" "}
                  {requestedUnit === "box" ? "caixas" : "peças"} ={" "}
                  {unitsRequested || 0} peças.
                </p>
                {anomaly.reasons.map((reason) => (
                  <p key={reason} role="note">
                    {reason}
                  </p>
                ))}
                {!anomaly.historySufficient && (
                  <p>
                    Histórico ainda insuficiente para comparar o consumo do
                    setor/bloco. Pedidos urgentes exigem justificativa.
                  </p>
                )}
                <p className={styles.employeeAvailable}>
                  Disponível para novo pedido: {availableForPart} unidades{" "}
                  {reservedForPart > 0 && `(${reservedForPart} no carrinho)`}
                </p>
                {error && (
                  <p role="alert" className={styles.formError}>
                    {error}
                  </p>
                )}
                <div className={styles.formActions}>
                  <button
                    type="button"
                    className={styles.outlineButton}
                    onClick={resetForm}
                    disabled={sending}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className={styles.primaryAction} disabled={sending}>
                    {sending && <LoaderCircle size={17} className={styles.requestSpinner} aria-hidden="true" />}
                    {sending ? "Enviando requisição…" : mode === "request"
                      ? "Confirmar requisição"
                      : "Adicionar ao carrinho"}
                  </button>
                </div>
                {sending && <p className={styles.requestProgress} role="status">Registrando seu pedido. Aguarde a confirmação.</p>}
              </form>
            ) : (
              <div className={styles.employeeActions}>
                <button
                  type="button"
                  className={styles.primaryAction}
                  disabled={availableForPart === 0}
                  onClick={() => {
                    setError("");
                    setMode("request");
                  }}
                >
                  Requisitar este item <ArrowRight size={18} />
                </button>
                <button
                  type="button"
                  className={styles.outlineButton}
                  disabled={availableForPart === 0}
                  onClick={() => {
                    setError("");
                    setMode("cart");
                  }}
                >
                  <ShoppingCart size={18} /> Adicionar ao carrinho
                </button>
              </div>
            )}
          </div>
        </div>
        {cartPanel}
      </main>
    );
  }

  return (
    <main className={styles.content}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>
            <Sparkles size={14} /> MARCON · PEÇAS
          </span>
          <h1>
            As peças que você precisa
            <br />
            <span>estão por aqui.</span>
          </h1>
          <p>
            Busque por nome ou ID, confira o saldo e faça sua requisição em
            poucos passos.
          </p>
          <a href="#lista-pecas" className={styles.heroLink}>
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
            PEÇAS <strong>EM UM SÓ LUGAR</strong>
          </div>
        </div>
      </section>
      <section
        id="lista-pecas"
        className={styles.catalogSection}
        aria-labelledby="pieces-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionEyebrow}>SEU ALMOXARIFADO</span>
            <h2 id="pieces-title">Catálogo de peças</h2>
            <p>Escolha a peça certa para a sua atividade.</p>
          </div>
          <div className={styles.employeeCatalogTools}>
            <span className={styles.count}>
              {filtered.length} {filtered.length === 1 ? "peça" : "peças"}
            </span>
            <a href="#carrinho" className={styles.cartShortcut}>
              <ShoppingCart size={17} /> Acessar carrinho ({cart.length})
            </a>
          </div>
        </div>
        <div className={styles.toolbar}>
          <label className={styles.searchBox}>
            <Search size={20} aria-hidden="true" />
            <span className={styles.srOnly}>Buscar peça por nome ou ID</span>
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
          aria-label="Filtrar por almoxarifado"
        >
          {warehouses.map((name) => (
            <button
              key={name}
              type="button"
              className={warehouse === name ? styles.chipActive : styles.chip}
              aria-pressed={warehouse === name}
              onClick={() => setWarehouse(name)}
            >
              {name}
            </button>
          ))}
        </div>
        {filtered.length ? (
          <div className={styles.productGrid}>
            {filtered.map((part) => (
              <article className={styles.productCard} key={part.code}>
                <Link
                  href={`/employee/request/peca/${part.id}`}
                  className={styles.cardLink}
                  aria-label={`Ver detalhes de ${part.name}`}
                >
                  <PartArt part={part} />
                  <div className={styles.cardBody}>
                    <span className={styles.category}>
                      Peça industrial <span>· {part.code}</span>
                    </span>
                    <h3>{part.name}</h3>
                    <div className={styles.cardBottom}>
                      <span
                        className={
                          part.quantity > 0
                            ? styles.available
                            : styles.unavailable
                        }
                      >
                        {part.quantity > 0
                          ? `${part.quantity} unidades disponíveis`
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
        ) : (
          <div className={styles.emptyState}>
            <PackageSearch size={38} />
            <h3>Nenhuma peça encontrada</h3>
            <p>Tente outro nome, ID ou almoxarifado.</p>
            <button
              className={styles.outlineButton}
              onClick={() => {
                setQuery("");
                setWarehouse("Todos");
                setAvailableOnly(false);
              }}
            >
              Limpar filtros
            </button>
          </div>
        )}
      </section>
      {error && (
        <p role="alert" className={styles.formError}>
          {error}
        </p>
      )}
      {cartPanel}
    </main>
  );
}
