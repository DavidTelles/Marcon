"use client";

import { InspectReturn } from "../operations/inspect-return";
import { WAREHOUSES } from "@/lib/inventory";
import { useState } from "react";
import {
  ClipboardList,
  PackageCheck,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { heading, badge } from "../ui";
import { useDemoStore } from "../demo-store";
import type { ReturnRecord } from "@/lib/demo-data";

const blocks = ["Bloco A", "Bloco B", "Bloco C", "Bloco D"];
const today = () => new Date().toISOString().slice(0, 10);
const displayDate = (date: string) => date.split("-").reverse().join("/");

export function ReturnsScreen({
  setMessage,
}: {
  setMessage: React.Dispatch<React.SetStateAction<string>>;
}) {
  const {
    requests,
    stock,
    setStock,
    setBalances,
    returns,
    setReturns,
    setMovements,
    persistent,
    runAction,
  } = useDemoStore();
  const [partCode, setPartCode] = useState(stock[0]?.code ?? "");
  const [boxes, setBoxes] = useState("");
  const [looseUnits, setLooseUnits] = useState("");
  const [fromBlock, setFromBlock] = useState(blocks[0]);
  const [returnedBy, setReturnedBy] = useState("");
  const [condition, setCondition] = useState<ReturnRecord["condition"]>("Apto");
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState("");
  const [warehouse, setWarehouse] = useState("Central");
  const [query, setQuery] = useState("");
  const [conditionFilter, setConditionFilter] = useState("Todas");

  const part = stock.find((item) => item.code === partCode);
  const boxCount = Number(boxes || 0);
  const looseCount = Number(looseUnits || 0);
  const quantity = boxCount * (part?.packSize ?? 1) + looseCount;
  const visibleReturns = returns.filter((item) => {
    const returnedPart = stock.find((piece) => piece.code === item.partCode);
    const text = [
      item.partCode,
      returnedPart?.name ?? "",
      item.fromBlock,
      item.returnedBy,
    ]
      .join(" ")
      .toLocaleLowerCase("pt-BR");
    return (
      text.includes(query.toLocaleLowerCase("pt-BR")) &&
      (conditionFilter === "Todas" || item.condition === conditionFilter)
    );
  });
  const returnedUnits = returns.reduce((sum, item) => sum + item.quantity, 0);
  const restockedUnits = returns
    .filter(
      (item) =>
        item.condition === "Apto" &&
        (!persistent || item.inspectionStatus === "Conferida"),
    )
    .reduce((sum, item) => sum + item.quantity, 0);

  async function registerReturn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !part ||
      !Number.isInteger(boxCount) ||
      boxCount < 0 ||
      !Number.isInteger(looseCount) ||
      looseCount < 0 ||
      looseCount >= part.packSize ||
      quantity < 1 ||
      !returnedBy.trim()
    ) {
      setMessage(
        "Confira a peça, a quantidade de caixas e as unidades avulsas.",
      );
      return;
    }
    if (persistent) {
      try {
        await runAction({
          type: "registerReturn",
          code: part.code,
          block: fromBlock,
          quantity,
          condition,
          requestId: Number(requestId) || undefined,
          warehouse,
          returnedBy: returnedBy.trim(),
          note: note.trim(),
        });
        setBoxes("");
        setLooseUnits("");
        setReturnedBy("");
        setNote("");
        setMessage("Devolução pendente de conferência; saldo preservado.");
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível registrar a devolução.",
        );
      }
      return;
    }
    const record: ReturnRecord = {
      id: Date.now(),
      partCode: part.code,
      packSize: part.packSize,
      boxes: boxCount,
      looseUnits: looseCount,
      quantity,
      fromBlock,
      returnedBy: returnedBy.trim(),
      condition,
      note: note.trim(),
      date: today(),
    };
    setReturns((items) => [record, ...items]);
    if (condition === "Apto") {
      setBalances((items) =>
        items.some(
          (item) => item.partCode === part.code && item.warehouse === "Central",
        )
          ? items.map((item) =>
              item.partCode === part.code && item.warehouse === "Central"
                ? { ...item, quantity: item.quantity + quantity }
                : item,
            )
          : [...items, { partCode: part.code, warehouse: "Central", quantity }],
      );
      setStock((items) =>
        items.map((item) =>
          item.code === part.code
            ? { ...item, quantity: item.quantity + quantity }
            : item,
        ),
      );
      setMovements((items) => [
        {
          id: record.id,
          partCode: part.code,
          type: "entrada",
          quantity,
          date: record.date,
          warehouse: "Central",
          block: fromBlock,
          requester: returnedBy.trim(),
        },
        ...items,
      ]);
    }
    setBoxes("");
    setLooseUnits("");
    setReturnedBy("");
    setNote("");
    setMessage(
      condition === "Apto"
        ? "Devolução registrada e estoque atualizado nesta sessão."
        : "Devolução danificada registrada sem entrada no estoque.",
    );
  }

  return (
    <>
      {heading(
        "ALMOXARIFADO",
        "Itens devolvidos",
        "Registre devoluções e acompanhe caixas, unidades e origem das peças.",
      )}
      <div className="stats return-summary">
        <div className="stat">
          <span className="stat-icon blue">
            <RotateCcw size={20} aria-hidden="true" />
          </span>
          <span>Devoluções</span>
          <strong>{returns.length}</strong>
          <small>
            {persistent ? "Registros do MySQL" : "Registros desta sessão"}
          </small>
        </div>
        <div className="stat">
          <span className="stat-icon green">
            <PackageCheck size={20} aria-hidden="true" />
          </span>
          <span>Unidades devolvidas</span>
          <strong>{returnedUnits}</strong>
          <small>{restockedUnits} aptas, devolvidas ao estoque</small>
        </div>
        <div className="stat">
          <span className="stat-icon coral">
            <TriangleAlert size={20} aria-hidden="true" />
          </span>
          <span>Sem reposição ao estoque</span>
          <strong>{returnedUnits - restockedUnits}</strong>
          <small>Registradas sem alterar o saldo</small>
        </div>
      </div>
      <form className="panel return-form" onSubmit={registerReturn}>
        <div className="panel-head">
          <div>
            <h2>Registrar devolução</h2>
            <p>
              Informe caixas completas e peças avulsas. Apenas itens aptos
              voltam ao estoque.
            </p>
          </div>
        </div>
        <div className="filter-grid">
          {persistent && (
            <>
              <label>
                Pedido entregue
                <select
                  value={requestId}
                  onChange={(e) => {
                    setRequestId(e.target.value);
                    const r = requests.find(
                      (r) => r.id === Number(e.target.value),
                    );
                    if (r) {
                      setPartCode(r.code ?? "");
                      setFromBlock(r.block);
                      setReturnedBy(r.person);
                    }
                  }}
                >
                  <option value="">Devolução manual / legado</option>
                  {requests
                    .filter((r) => r.status === "Entregue")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        #{r.id} {r.code} - {r.person}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Destino
                <select
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                >
                  {WAREHOUSES.map((w) => (
                    <option key={w}>{w}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label>
            Peça / ID
            <select
              value={partCode}
              onChange={(event) => {
                setPartCode(event.target.value);
                setBoxes("");
                setLooseUnits("");
              }}
              required
            >
              {stock.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name} · {item.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            Caixas completas
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={boxes}
              onChange={(event) => setBoxes(event.target.value)}
              placeholder="0"
            />
          </label>
          <label>
            Peças avulsas
            <input
              type="number"
              min="0"
              max={part ? part.packSize - 1 : undefined}
              step="1"
              inputMode="numeric"
              value={looseUnits}
              onChange={(event) => setLooseUnits(event.target.value)}
              placeholder="0"
            />
          </label>
          <label>
            Origem
            <select
              value={fromBlock}
              onChange={(event) => setFromBlock(event.target.value)}
            >
              {blocks.map((block) => (
                <option key={block}>{block}</option>
              ))}
            </select>
          </label>
          <label>
            Devolvido por
            <input
              value={returnedBy}
              onChange={(event) => setReturnedBy(event.target.value)}
              required
              maxLength={80}
              placeholder="Nome do responsável"
            />
          </label>
          <label>
            Condição
            <select
              value={condition}
              onChange={(event) =>
                setCondition(event.target.value as ReturnRecord["condition"])
              }
            >
              <option>Apto</option>
              <option>Danificado</option>
            </select>
          </label>
          <label className="return-note">
            Observação
            <input
              required={persistent}
              minLength={persistent ? 3 : undefined}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={180}
              placeholder="Motivo ou detalhes da devolução"
            />
          </label>
        </div>
        <div className="return-preview">
          <strong>
            {quantity} {quantity === 1 ? "unidade" : "unidades"}
          </strong>
          <span>
            {part
              ? `1 caixa = ${part.packSize} unidades · Saldo atual: ${part.quantity} unidades`
              : "Selecione uma peça"}
          </span>
        </div>
        <div className="return-actions">
          <button
            className="button primary"
            type="submit"
            disabled={!part || quantity < 1}
          >
            <RotateCcw size={17} aria-hidden="true" /> Registrar devolução
          </button>
        </div>
      </form>
      {persistent && (
        <section className="panel ops-panel">
          <h2>Conferir devoluções pendentes</h2>
          {returns
            .filter((r) => r.inspectionStatus === "Pendente")
            .map((r) => (
              <InspectReturn key={r.id} record={r} />
            ))}
          {!returns.some((r) => r.inspectionStatus === "Pendente") && (
            <p>Nenhuma devolução aguardando conferência.</p>
          )}
        </section>
      )}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Histórico de devoluções</h2>
            <p>Confira o que foi devolvido, a quantidade e quem entregou.</p>
          </div>
          <span className="count">{visibleReturns.length} registro(s)</span>
        </div>
        <div className="filter-grid return-filters">
          <label>
            Buscar peça, ID, bloco ou pessoa
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar devolução"
            />
          </label>
          <label>
            Condição
            <select
              value={conditionFilter}
              onChange={(event) => setConditionFilter(event.target.value)}
            >
              <option>Todas</option>
              <option>Apto</option>
              <option>Danificado</option>
            </select>
          </label>
        </div>
        {visibleReturns.length ? (
          <div className="return-list">
            {visibleReturns.map((item) => {
              const returnedPart = stock.find(
                (piece) => piece.code === item.partCode,
              );
              return (
                <article className="return-item" key={item.id}>
                  <span className="return-icon">
                    <ClipboardList size={20} aria-hidden="true" />
                  </span>
                  <div className="return-item-main">
                    <strong>{returnedPart?.name ?? item.partCode}</strong>
                    <small>
                      {item.partCode} · {item.fromBlock} ·{" "}
                      {displayDate(item.date)}
                    </small>
                    <span>Devolvido por {item.returnedBy}</span>
                    {item.note && <p>{item.note}</p>}
                  </div>
                  <div className="return-item-quantity">
                    <strong>{item.quantity} un.</strong>
                    <small>
                      {item.boxes} {item.boxes === 1 ? "caixa" : "caixas"} de{" "}
                      {item.packSize} + {item.looseUnits} avulsas
                    </small>
                    {badge(item.condition)}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty">
            <h3>Nenhuma devolução encontrada</h3>
            <p>Registre um item devolvido ou altere os filtros.</p>
          </div>
        )}
      </section>
    </>
  );
}
