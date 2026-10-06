"use client";
import { useState } from "react";
import type { industrialLinks } from "@/lib/industrial-links";

type Data = Awaited<ReturnType<typeof industrialLinks>>;
type Row = {
  id: number | string;
  code?: string;
  name?: string;
  employee_no?: string;
  label?: string;
  branch_id?: number;
  block_id?: number;
  sector_id?: number;
  warehouse_id?: number;
  kind?: string;
};
const commands: Record<
  string,
  { label: string; fields: [string, string, string][] }
> = {
  reconcile: {
    label: "Sincronizar vínculos confirmados",
    fields: [],
  },
  branch: {
    label: "Cadastrar filial",
    fields: [
      ["code", "Código textual", "text"],
      ["name", "Nome oficial (opcional)", "text"],
    ],
  },
  blockBranch: {
    label: "Vincular bloco à filial",
    fields: [
      ["id", "Bloco", "blocks"],
      ["branchId", "Filial", "branches"],
    ],
  },
  warehouseBranch: {
    label: "Vincular almoxarifado à filial",
    fields: [
      ["id", "Almoxarifado", "warehouses"],
      ["branchId", "Filial", "branches"],
    ],
  },
  sector: {
    label: "Cadastrar setor",
    fields: [
      ["branchId", "Filial", "branches"],
      ["blockId", "Bloco", "blocks"],
      ["code", "Código", "text"],
      ["name", "Nome oficial", "text"],
    ],
  },
  workplace: {
    label: "Cadastrar local de trabalho",
    fields: [
      ["sectorId", "Setor", "sectors"],
      ["code", "Código", "text"],
      ["name", "Nome oficial", "text"],
      ["pointId", "Ponto publicado (opcional)", "points"],
    ],
  },
  workplacePoint: {
    label: "Vincular local de trabalho ao ponto de entrega",
    fields: [
      ["id", "Local de trabalho", "workplaces"],
      ["pointId", "Ponto de entrega publicado", "points"],
    ],
  },
  userSector: {
    label: "Vincular funcionário ao setor",
    fields: [
      ["id", "Funcionário", "users"],
      ["sectorId", "Setor", "sectors"],
    ],
  },
  userWorkplace: {
    label: "Vincular funcionário ao local de trabalho",
    fields: [
      ["id", "Funcionário", "users"],
      ["workplaceId", "Local de trabalho", "workplaces"],
    ],
  },
  inventoryPoint: {
    label: "Vincular posição de estoque à planta",
    fields: [
      ["partId", "Peça", "parts"],
      ["warehouseId", "Almoxarifado da peça", "warehouses"],
      ["pointId", "Ponto de estoque publicado", "points"],
    ],
  },
};

export function IndustrialLinks() {
  const [data, setData] = useState<Data | null>(null);
  const [type, setType] = useState("branch");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    const response = await fetch("/api/industrial-links", {
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error || "Falha ao carregar vínculos.");
    setData(body);
    return body as Data;
  }
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload: Record<string, unknown> = { type };
      for (const [key, , source] of commands[type].fields)
        payload[key] =
          source === "text" || key === "pointId"
            ? values[key] || ""
            : Number(values[key]);
      const response = await fetch("/api/industrial-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Não foi possível salvar o vínculo.");
      setMessage(
        body.reconciled
          ? `Sincronização salva no banco: ${body.reconciled.employees} funcionários e ${body.reconciled.inventory} posições de estoque vinculados. Os demais exigem cadastro ou escolha do ponto.`
          : "Vínculo salvo no banco de dados.",
      );
      setValues({});
      window.dispatchEvent(new Event("marcon:workspace-updated"));
      window.dispatchEvent(new Event("marcon:industrial-links-updated"));
      // Reload errors must not turn a successful write into a request to repeat it.
      try {
        await load();
      } catch {
        setError(
          "O vínculo foi salvo. Atualize para consultar os dados atuais.",
        );
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function options(source: string): Row[] {
    if (!data) return [];
    const catalogRows = (rows: Data["branches"]) =>
      rows.map((row) => ({ ...row, id: String(row.id) }));
    const sources: Record<string, Row[]> = {
      branches: catalogRows(data.branches),
      blocks: catalogRows(data.blocks),
      sectors: catalogRows(data.sectors),
      workplaces: catalogRows(data.workplaces),
      points: catalogRows(data.points),
      users: catalogRows(data.users),
      warehouses: catalogRows(data.warehouses),
      parts: [
        ...new Map(
          data.inventory.map((i) => [
            i.part_id,
            { id: i.part_id, code: i.code, name: i.name },
          ]),
        ).values(),
      ],
    };
    let result = sources[source] || [];
    if (type === "sector" && source === "blocks")
      result = result.filter(
        (r) => Number(r.branch_id) === Number(values.branchId),
      );
    if (type === "inventoryPoint" && source === "warehouses")
      result = result.filter((r) =>
        data.inventory.some(
          (i) =>
            Number(i.part_id) === Number(values.partId) &&
            Number(i.warehouse_id) === Number(r.id),
        ),
      );
    if (source === "points") {
      if (type === "inventoryPoint")
        result = result.filter(
          (r) => Number(r.warehouse_id) === Number(values.warehouseId),
        );
      else {
        const location =
          type === "workplacePoint"
            ? data.workplaces.find((w) => Number(w.id) === Number(values.id))
            : data.sectors.find(
                (s) => Number(s.id) === Number(values.sectorId),
              );
        result = result.filter(
          (r) =>
            location &&
            Number(r.block_id) === Number(location.block_id) &&
            (!r.sector_id ||
              Number(r.sector_id) ===
                Number(
                  type === "workplacePoint" ? location.sector_id : location.id,
                )) &&
            [
              "block",
              "sector",
              "production_line",
              "delivery",
              "replenishment",
            ].includes(r.kind || ""),
        );
      }
    }
    return result;
  }
  function change(key: string, value: string) {
    setValues((current) => ({
      ...current,
      [key]: value,
      ...(key === "partId" ? { warehouseId: "", pointId: "" } : {}),
      ...(["warehouseId", "sectorId", "id"].includes(key)
        ? { pointId: "" }
        : {}),
      ...(key === "branchId" && type === "sector" ? { blockId: "" } : {}),
    }));
  }
  return (
    <details
      className="panel"
      onToggle={(event) => {
        if (event.currentTarget.open && !data && !busy) void refresh();
      }}
    >
      <summary>Integração de funcionários, estoques e planta</summary>
      <p>
        Associe os cadastros aos locais reais. Alterar um vínculo não movimenta
        o estoque nem modifica o destino de pedidos já criados.
      </p>
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" disabled={busy} onClick={() => void refresh()}>
            Atualizar vínculos
          </button>
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {data && (
        <>
          <p role="status">
            {data.readiness.ready
              ? "Vínculos e caminhos configurados na planta publicada."
              : "Integração de localização pendente."}{" "}
            Planta publicada: {data.readiness.mapPublished ? "sim" : "não"}.
            Escala calibrada: {data.readiness.scaleCalibrated ? "sim" : "não"}.
            Cadastros sem filial: {data.readiness.hierarchyPending}. Estoques
            sem ponto transitável: {data.readiness.inventoryPending} de{" "}
            {data.readiness.inventoryTotal}. Funcionários sem setor ou caminho:{" "}
            {
              data.readiness.employees.filter(
                (u) => !u.configured || !u.reachable,
              ).length
            }
            .
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void refresh()}
          >
            Verificar integração
          </button>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label>
              Ação{" "}
              <select
                aria-label="Ação"
                value={type}
                disabled={busy}
                onChange={(event) => {
                  setType(event.target.value);
                  setValues({});
                  setMessage("");
                }}
              >
                {Object.entries(commands).map(([key, command]) => (
                  <option key={key} value={key}>
                    {command.label}
                  </option>
                ))}
              </select>
            </label>
            {type === "reconcile" && (
              <p>
                Vincula nomes exatos a setores oficiais do mesmo bloco e filial
                e estoques a pontos únicos e transitáveis da planta publicada.
                Preserva os vínculos existentes.
              </p>
            )}
            <div className="form-grid">
              {commands[type].fields.map(([key, label, source]) => (
                <label key={`${type}-${key}`}>
                  {label}
                  {source === "text" ? (
                    <input
                      aria-label={label}
                      name={key}
                      value={values[key] || ""}
                      onChange={(event) => change(key, event.target.value)}
                      maxLength={key === "code" ? 64 : 160}
                      required={key !== "name" || type !== "branch"}
                      disabled={busy}
                    />
                  ) : (
                    <select
                      aria-label={label}
                      name={key}
                      value={values[key] || ""}
                      onChange={(event) => change(key, event.target.value)}
                      required={key !== "pointId" || type !== "workplace"}
                      disabled={busy}
                    >
                      <option value="">Selecione</option>
                      {options(source).map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.employee_no ?? row.code ?? row.id} ·{" "}
                          {row.name ?? row.label}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              ))}
            </div>
            <button type="submit" className="button primary" disabled={busy}>
              {type === "reconcile"
                ? "Sincronizar vínculos no banco"
                : "Salvar vínculo no banco"}
            </button>
          </form>
          <details>
            <summary>Localizações pendentes</summary>
            <ul>
              {data.readiness.unmappedWarehouses.map((w) => (
                <li key={`w-${w.id}`}>Almoxarifado sem ponto: {w.name}</li>
              ))}
              {data.readiness.unmappedBlocks.map((b) => (
                <li key={`b-${b.id}`}>Bloco sem ponto: {b.name}</li>
              ))}
              {data.readiness.employees
                .filter((u) => !u.configured || !u.reachable)
                .map((u) => (
                  <li key={`u-${u.id}`}>
                    {u.employee_no} · {u.name}:{" "}
                    {!u.configured
                      ? "setor oficial não vinculado"
                      : "destino sem caminho transitável"}
                  </li>
                ))}
              {data.pending.map((p, i) => (
                <li key={`i-${i}`}>
                  {p.code} · {p.warehouse} · {p.map_node_id ?? "Sem ponto"}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
      {busy && <p role="status">Consultando o banco…</p>}
    </details>
  );
}
