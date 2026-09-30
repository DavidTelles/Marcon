"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Boxes,
  Package,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { StockOperations } from "../operations/stock-operations";
import { heading, badge } from "../ui";
import { useDemoStore } from "../demo-store";
import type { Part } from "@/lib/demo-data";
import { boxLabel } from "@/lib/packaging";
import { WAREHOUSES, balanceOf, type Warehouse } from "@/lib/inventory";

const warehouses = WAREHOUSES;
const asNumber = (value: FormDataEntryValue | null) => Number(value ?? 0);

export function StockScreen({
  routePart,
  setMessage,
}: {
  routePart?: string;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
}) {
  const {
    stock,
    setStock,
    balances,
    setBalances,
    requests,
    setMovements,
    persistent,
    runAction,
  } = useDemoStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Part | null>(null);
  const [query, setQuery] = useState("");
  const [warehouse, setWarehouse] = useState<Warehouse>("Central");
  const [level, setLevel] = useState("Todos");
  const [sort, setSort] = useState("name");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const requested = new URLSearchParams(window.location.search).get(
        "warehouse",
      );
      if (requested && WAREHOUSES.includes(requested as Warehouse))
        setWarehouse(requested as Warehouse);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [routePart]);

  const visibleStock = useMemo(
    () =>
      stock
        .map((item) => ({
          ...item,
          quantity: balanceOf(balances, item.code, warehouse),
          minimum:
            balances.find(
              (b) => b.partCode === item.code && b.warehouse === warehouse,
            )?.minimum ??
            Math.max(
              2,
              Math.ceil(item.minimum / (warehouse === "Central" ? 4 : 8)),
            ),
          reserved:
            balances.find(
              (b) => b.partCode === item.code && b.warehouse === warehouse,
            )?.reserved ?? 0,
          available:
            balances.find(
              (b) => b.partCode === item.code && b.warehouse === warehouse,
            )?.available ?? balanceOf(balances, item.code, warehouse),
          warehouse,
        }))
        .filter((item) => {
          const routeMatch =
            !routePart ||
            routePart === "all" ||
            String(item.id) === routePart ||
            item.code.toLocaleLowerCase("pt-BR") ===
              routePart.toLocaleLowerCase("pt-BR");
          const textMatch = (
            item.name +
            " " +
            item.code +
            " " +
            (item.qrCode ?? "")
          )
            .toLocaleLowerCase("pt-BR")
            .includes(query.toLocaleLowerCase("pt-BR"));
          return (
            routeMatch &&
            textMatch &&
            (level === "Todos" ||
              (level === "Crítico") === item.available < item.minimum)
          );
        })
        .sort((a, b) =>
          sort === "quantity-asc"
            ? a.quantity - b.quantity
            : sort === "quantity-desc"
              ? b.quantity - a.quantity
              : a.name.localeCompare(b.name, "pt-BR"),
        ),
    [stock, balances, routePart, query, warehouse, level, sort],
  );

  async function savePart(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const code = String(data.get("code") ?? "")
      .trim()
      .toUpperCase();
    const qrCode = String(data.get("qrCode") ?? "")
      .trim()
      .toUpperCase();
    const photo = data.get("photo") as File;
    const quantity = asNumber(data.get("quantity"));
    const minimum = asNumber(data.get("minimum"));
    const packSize = asNumber(data.get("packSize"));
    if (
      !name ||
      !code ||
      !qrCode ||
      !Number.isInteger(quantity) ||
      quantity < 0 ||
      !Number.isInteger(packSize) ||
      packSize < 1 ||
      !Number.isInteger(minimum) ||
      minimum < 1 ||
      stock.some(
        (item) =>
          item.id !== editing?.id &&
          [item.code, item.qrCode ?? item.code].some(
            (value) => value === code || value === qrCode,
          ),
      ) ||
      (!editing && !photo?.size)
    ) {
      setMessage(
        "Confira os campos, a foto e a exclusividade do ID e do QR Code.",
      );
      return;
    }
    const image =
      photo?.size && !persistent ? URL.createObjectURL(photo) : editing?.image;
    const oldBalance = editing
      ? balanceOf(balances, editing.code, warehouse)
      : 0;
    const change = quantity - oldBalance;
    const part: Part = {
      id: editing?.id ?? Math.max(0, ...stock.map((item) => item.id)) + 1,
      name,
      code,
      qrCode,
      description: String(data.get("description") ?? "").trim(),
      purpose: String(data.get("purpose") ?? "").trim(),
      material: String(data.get("material") ?? "").trim(),
      dimensions: String(data.get("dimensions") ?? "").trim(),
      approvedAliases: String(data.get("approvedAliases") ?? "").split(",").map((alias) => alias.trim()).filter(Boolean),
      quantity:
        (stock.find((item) => item.id === editing?.id)?.quantity ?? 0) + change,
      packSize,
      minimum,
      warehouse,
      location: String(data.get("location") ?? "").trim(),
      leadDays: asNumber(data.get("leadDays")),
      estimatedCost: asNumber(data.get("cost")),
      consumed30: editing?.consumed30 ?? 0,
      previous30: editing?.previous30 ?? 0,
      image,
    };
    if (persistent) {
      try {
        if (photo?.size && photo.size > 1_000_000)
          throw new Error("A foto deve ter até 1 MB.");
        const imageData = photo?.size
          ? await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () =>
                reject(new Error("Não foi possível ler a foto."));
              reader.readAsDataURL(photo);
            })
          : editing?.image;
        await runAction({
          type: "savePart",
          part: {
            ...part,
            id: editing?.id ?? null,
            image: imageData,
            unit: data.get("unit"),
            category: data.get("category"),
            criticality: Number(data.get("criticality") || 1),
            aisle: data.get("aisle"),
            shelf: data.get("shelf"),
            capacity: data.get("capacity"),
            localMinimum: Number(data.get("localMinimum") || 0),
            mapNodeId: data.get("mapNodeId"),
          },
          warehouse,
          localQuantity: quantity,
          reason: data.get("reason"),
        });
        setEditing(null);
        setFormOpen(false);
        setMessage(editing ? "Peça atualizada." : "Peça cadastrada.");
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível salvar a peça.",
        );
      }
      return;
    }
    setStock((items) =>
      editing
        ? items.map((item) => (item.id === editing.id ? part : item))
        : [...items, part],
    );
    setBalances((items) => {
      const rest = items.filter(
        (item) =>
          !(item.partCode === editing?.code && item.warehouse === warehouse),
      );
      const renamed =
        editing && editing.code !== code
          ? rest.map((item) =>
              item.partCode === editing.code
                ? { ...item, partCode: code }
                : item,
            )
          : rest;
      return [...renamed, { partCode: code, warehouse, quantity }];
    });
    if (change !== 0)
      setMovements((items) => [
        {
          id: Date.now(),
          partCode: code,
          type: change > 0 ? "entrada" : "saida",
          quantity: Math.abs(change),
          date: new Date().toISOString().slice(0, 10),
          warehouse: part.warehouse,
        },
        ...items,
      ]);
    setEditing(null);
    setFormOpen(false);
    setMessage(
      editing
        ? "Peça atualizada nesta sessão."
        : "Peça cadastrada nesta sessão.",
    );
  }

  async function remove(part: Part) {
    const linked = requests.some(
      (request) => request.code === part.code || request.material === part.name,
    );
    if (linked) {
      setMessage(
        "Esta peça possui requisições registradas. Edite os dados em vez de excluí-la.",
      );
      return;
    }
    if (
      !window.confirm(
        (persistent ? "Desativar " : "Excluir ") +
          part.name +
          (persistent ? " do catálogo?" : " do estoque desta sessão?"),
      )
    )
      return;
    if (persistent) {
      try {
        await runAction({ type: "deletePart", id: part.id });
        setMessage("Peça desativada.");
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível desativar a peça.",
        );
      }
      return;
    }
    setStock((items) => items.filter((item) => item.id !== part.id));
    setBalances((items) => items.filter((item) => item.partCode !== part.code));
    setMessage("Peça excluída desta sessão.");
  }

  return (
    <>
      <div className="section-heading-actions">
        {heading(
          "ALMOXARIFADO",
          "Estoque de peças",
          "Cadastre, edite e acompanhe o saldo dos almoxarifados.",
        )}
        <button
          className="button primary"
          onClick={() => {
            setEditing(null);
            setFormOpen((open) => !open);
          }}
        >
          <Plus size={17} aria-hidden="true" /> Nova peça
        </button>
      </div>
      {persistent && <StockOperations />}
      <div
        className="warehouse-tabs"
        role="tablist"
        aria-label="Estoque por almoxarifado"
      >
        {WAREHOUSES.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={warehouse === item}
            className={
              warehouse === item ? "warehouse-tab active" : "warehouse-tab"
            }
            onClick={() => {
              setWarehouse(item);
              setEditing(null);
              setFormOpen(false);
            }}
          >
            {item}
            <strong>
              {stock.reduce(
                (sum, part) => sum + balanceOf(balances, part.code, item),
                0,
              )}{" "}
              un.
            </strong>
          </button>
        ))}
      </div>
      <div className="stats stock-summary">
        <div className="stat">
          <span className="stat-icon blue">
            <Boxes size={20} aria-hidden="true" />
          </span>
          <span>Peças cadastradas</span>
          <strong>{stock.length}</strong>
          <small>{WAREHOUSES.length} almoxarifados</small>
        </div>
        <div className="stat">
          <span className="stat-icon green">
            <Package size={20} aria-hidden="true" />
          </span>
          <span>Saldo físico</span>
          <strong>
            {stock.reduce(
              (sum, item) => sum + balanceOf(balances, item.code, warehouse),
              0,
            )}
          </strong>
          <small>Saldo do {warehouse}</small>
        </div>
        <div className="stat">
          <span className="stat-icon coral">
            <TriangleAlert size={20} aria-hidden="true" />
          </span>
          <span>Abaixo do mínimo</span>
          <strong>
            {
              stock.filter(
                (item) =>
                  balanceOf(balances, item.code, warehouse) <
                  Math.max(
                    2,
                    Math.ceil(item.minimum / (warehouse === "Central" ? 4 : 8)),
                  ),
              ).length
            }
          </strong>
          <small>Necessitam reposição</small>
        </div>
      </div>
      {formOpen && (
        <form
          key={editing?.id ?? "new"}
          className="panel stock-entry"
          onSubmit={savePart}
        >
          <div className="panel-head">
            <div>
              <h2>{editing ? "Editar peça" : "Cadastrar nova peça"}</h2>
              <p>Informações de identificação, localização e reposição.</p>
            </div>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setFormOpen(false);
                setEditing(null);
              }}
            >
              Fechar
            </button>
          </div>
          <div className="form-grid">
            {persistent && (
              <>
                <label>
                  Unidade
                  <input
                    name="unit"
                    defaultValue={editing?.unit ?? "un"}
                    required
                    maxLength={24}
                  />
                </label>
                <label>
                  Categoria
                  <input
                    name="category"
                    defaultValue={editing?.category ?? "Peças"}
                    required
                    maxLength={80}
                  />
                </label>
                <label>
                  Descrição da peça
                  <textarea name="description" defaultValue={editing?.description ?? ""} maxLength={1000} />
                </label>
                <label>
                  Finalidade conhecida
                  <input name="purpose" defaultValue={editing?.purpose ?? ""} maxLength={500} placeholder="Ex.: prender tampa de inspeção" />
                </label>
                <label>
                  Material
                  <input name="material" defaultValue={editing?.material ?? ""} maxLength={120} />
                </label>
                <label>
                  Dimensões e rosca oficiais
                  <input name="dimensions" defaultValue={editing?.dimensions ?? ""} maxLength={120} placeholder="Ex.: M8 × 30 mm" />
                </label>
                <label>
                  Apelidos revisados (separados por vírgula)
                  <input name="approvedAliases" defaultValue={editing?.approvedAliases?.join(", ") ?? ""} maxLength={960} />
                </label>
                <label>
                  Criticidade
                  <select
                    name="criticality"
                    defaultValue={editing?.criticality ?? 1}
                  >
                    <option value="1">Normal</option>
                    <option value="2">Importante</option>
                    <option value="3">Crítica</option>
                  </select>
                </label>
                <label>
                  Corredor
                  <input
                    name="aisle"
                    defaultValue={
                      editing?.locations?.find((l) => l.warehouse === warehouse)
                        ?.aisle
                    }
                    maxLength={80}
                  />
                </label>
                <label>
                  Prateleira
                  <input
                    name="shelf"
                    defaultValue={
                      editing?.locations?.find((l) => l.warehouse === warehouse)
                        ?.shelf
                    }
                    maxLength={80}
                  />
                </label>
                <label>
                  Mínimo neste local
                  <input
                    name="localMinimum"
                    type="number"
                    min="0"
                    defaultValue={
                      editing?.locations?.find((l) => l.warehouse === warehouse)
                        ?.minimum ?? 1
                    }
                  />
                </label>
                <label>
                  Capacidade neste local (opcional)
                  <input
                    name="capacity"
                    type="number"
                    min="1"
                    defaultValue={
                      editing?.locations?.find((l) => l.warehouse === warehouse)
                        ?.capacity ?? ""
                    }
                  />
                </label>
                <label>
                  ID do ponto na planta (opcional)
                  <input
                    name="mapNodeId"
                    defaultValue={
                      editing?.locations?.find((l) => l.warehouse === warehouse)
                        ?.nodeId
                    }
                    maxLength={64}
                  />
                </label>
                <label>
                  Justificativa da alteração
                  <input
                    name="reason"
                    required={!!editing}
                    minLength={3}
                    maxLength={1000}
                  />
                </label>
              </>
            )}
            <label>
              Nome da peça
              <input
                name="name"
                defaultValue={editing?.name}
                required
                maxLength={80}
              />
            </label>
            <label>
              ID da peça
              <input
                name="code"
                defaultValue={editing?.code}
                required
                maxLength={40}
              />
            </label>
            <label>
              Conteúdo do QR Code
              <input
                name="qrCode"
                defaultValue={editing?.qrCode ?? editing?.code}
                required
                maxLength={80}
                placeholder="Valor lido ao escanear o QR"
              />
              <small>Cadastre o ID gravado no QR da embalagem.</small>
            </label>
            <label>
              Foto {editing && "(opcional ao editar)"}
              <input
                name="photo"
                type="file"
                accept="image/*"
                required={!editing}
              />
            </label>
            <label>
              Almoxarifado
              <select name="warehouse" value={warehouse} disabled>
                {warehouses.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Localização
              <input
                name="location"
                defaultValue={editing?.location}
                required
                placeholder="Ex.: A-03"
              />
            </label>
            <label>
              Quantidade em estoque
              <input
                name="quantity"
                type="number"
                min="0"
                required
                defaultValue={
                  editing ? balanceOf(balances, editing.code, warehouse) : 0
                }
                inputMode="numeric"
              />
            </label>
            <label>
              Unidades por caixa
              <input
                name="packSize"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                required
                defaultValue={editing?.packSize ?? 1}
                aria-describedby="pack-size-help"
              />
              <small id="pack-size-help">
                Ex.: 100 parafusos por caixa. O saldo continua em unidades.
              </small>
            </label>
            <label>
              Estoque mínimo
              <input
                name="minimum"
                type="number"
                min="1"
                required
                defaultValue={editing?.minimum ?? 1}
              />
            </label>
            <label>
              Prazo de reposição (dias)
              <input
                name="leadDays"
                type="number"
                min="1"
                required
                defaultValue={editing?.leadDays ?? 7}
              />
            </label>
            <label>
              Custo unitário estimado (R$)
              <input
                name="cost"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue={editing?.estimatedCost ?? 0}
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="button primary">
              {editing ? "Salvar alterações" : "Cadastrar peça"}
            </button>
          </div>
        </form>
      )}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Peças em estoque</h2>
            <p>Filtre por identificação, almoxarifado e nível de reposição.</p>
          </div>
          <span className="count">{visibleStock.length} resultado(s)</span>
        </div>
        <div className="filter-grid stock-filter-grid">
          <label>
            Buscar peça ou ID
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome ou código QR"
            />
          </label>
          <label>
            Almoxarifado
            <select
              value={warehouse}
              onChange={(event) =>
                setWarehouse(event.target.value as Warehouse)
              }
            >
              {warehouses.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Nível
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value)}
            >
              <option>Todos</option>
              <option>Crítico</option>
              <option>Disponível</option>
            </select>
          </label>
          <label>
            Ordenar
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="name">Nome A–Z</option>
              <option value="quantity-asc">Menor saldo</option>
              <option value="quantity-desc">Maior saldo</option>
            </select>
          </label>
        </div>
        {visibleStock.length ? (
          <div className="stock-grid stock-result-grid">
            {visibleStock.map((item) => (
              <article
                className={
                  "stock-result" +
                  (item.available < item.minimum ? " is-critical" : "")
                }
                key={item.id}
              >
                {item.image ? (
                  <div
                    className="part-photo"
                    role="img"
                    aria-label={"Foto de " + item.name}
                    style={{ backgroundImage: "url(" + item.image + ")" }}
                  />
                ) : (
                  <div className="part-placeholder" aria-hidden="true">
                    <Package size={28} />
                  </div>
                )}
                <div className="stock-result-content">
                  <div className="card-line">
                    <strong>{item.name}</strong>
                    {badge(
                      item.available < item.minimum ? "Crítico" : "Disponível",
                    )}
                  </div>
                  <p>
                    ID: {item.code} · QR: {item.qrCode ?? item.code} ·{" "}
                    {item.warehouse} · posição {item.location}
                  </p>
                  <div className="stock-balance">
                    <strong>{item.quantity}</strong>
                    {persistent && (
                      <small>
                        Reservado: {item.reserved} | Disponível:{" "}
                        {item.available}
                      </small>
                    )}
                    <span>
                      unidades em estoque
                      <br />
                      Mínimo: {item.minimum}
                    </span>
                  </div>
                  <p className="stock-boxes">
                    {boxLabel(item.quantity, item.packSize)}
                  </p>
                  <div className="stock-mini-track">
                    <span
                      style={{
                        width:
                          Math.min(100, (item.quantity / item.minimum) * 100) +
                          "%",
                        background:
                          item.available < item.minimum
                            ? "var(--coral)"
                            : "var(--green)",
                      }}
                    />
                  </div>
                  <div className="stock-result-actions">
                    <Link
                      className="link-button"
                      href={
                        "/warehouse/stock/peca/" +
                        item.id +
                        "?warehouse=" +
                        encodeURIComponent(warehouse)
                      }
                    >
                      Detalhes
                    </Link>
                    <button
                      className="link-button"
                      onClick={() => {
                        setEditing(
                          stock.find((part) => part.id === item.id) ?? item,
                        );
                        setFormOpen(true);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      aria-label={"Editar " + item.name}
                    >
                      <Pencil size={16} /> Editar
                    </button>
                    <button
                      className="link-button danger"
                      onClick={() => remove(item)}
                      aria-label={"Excluir " + item.name}
                    >
                      <Trash2 size={16} />{" "}
                      {persistent ? "Desativar" : "Excluir"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            <h3>Nenhuma peça encontrada</h3>
            <p>Altere os filtros ou cadastre uma nova peça.</p>
            <button
              className="button secondary"
              onClick={() => {
                setQuery("");
                setWarehouse("Central");
                setLevel("Todos");
              }}
            >
              Limpar filtros
            </button>
          </div>
        )}
      </section>
    </>
  );
}
