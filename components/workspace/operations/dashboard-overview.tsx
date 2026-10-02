"use client";

import Link from "next/link";
import type { DetailRecord } from "@/lib/dashboard-report";
import styles from "./dashboard-overview.module.css";

type Inventory = { warehouse: string; unit: string; available: number };
export function DashboardOverview({
  inventory,
  records,
  onRecord,
  onWarehouse,
  requestDescription = "Registros no período selecionado",
}: {
  inventory: Inventory[];
  records?: Pick<
    DetailRecord,
    "id" | "item" | "quantity" | "unit" | "status" | "person"
  >[];
  onRecord?: (id: string) => void;
  onWarehouse?: (warehouse: string) => void;
  requestDescription?: string;
}) {
  const units = [...new Set(inventory.map((row) => row.unit))];
  return (
    <div className={styles.overview}>
      <section
        className={styles.inventory}
        aria-label="Disponibilidade por almoxarifado"
      >
        <header>
          <div>
            <h2>Estoque disponível</h2>
            <p>Saldo atual por almoxarifado</p>
          </div>
          <Link href="/admin/dashboard?dashboard=estoque&metric=stock">
            Consultar
          </Link>
        </header>
        {units.length ? (
          units.map((unit) => {
            const rows = inventory.filter((row) => row.unit === unit);
            const maximum = Math.max(
              1,
              ...rows.map((row) => Math.max(0, row.available)),
            );
            return (
              <div className={styles.unitGroup} key={unit}>
                <span className={styles.unit}>{unit}</span>
                {rows.map((row) => (
                  <div className={styles.barRow} key={row.warehouse}>
                    {onWarehouse ? (
                      <button
                        type="button"
                        onClick={() => onWarehouse(row.warehouse)}
                      >
                        {row.warehouse}
                      </button>
                    ) : (
                      <span>{row.warehouse}</span>
                    )}
                    <span className={styles.track} aria-hidden="true">
                      <i
                        style={{
                          width: `${(Math.max(0, row.available) / maximum) * 100}%`,
                        }}
                      />
                    </span>
                    <strong>
                      {row.available.toLocaleString("pt-BR")}{" "}
                      <small>{unit}</small>
                    </strong>
                  </div>
                ))}
              </div>
            );
          })
        ) : (
          <p className={styles.empty}>Sem saldos para este escopo.</p>
        )}
      </section>
      <section className={styles.requests} aria-label="Resumo das requisições">
        <header>
          <div>
            <h2>Requisições</h2>
            <p>{requestDescription}</p>
          </div>
          <Link href="/admin/dashboard?dashboard=requisicoes&metric=requests">
            Consultar
          </Link>
        </header>
        {records?.length ? (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Material / solicitante</th>
                  <th scope="col">Quantidade</th>
                  <th scope="col">Situação</th>
                </tr>
              </thead>
              <tbody>
                {records.slice(0, 4).map((record) => (
                  <tr key={record.id}>
                    <td>
                      {onRecord ? (
                        <button
                          type="button"
                          onClick={() => onRecord(record.id)}
                          aria-label={`Abrir requisição #${record.id}`}
                        >
                          {record.item}
                        </button>
                      ) : (
                        <strong>{record.item}</strong>
                      )}
                      <small>{record.person}</small>
                    </td>
                    <td>
                      {record.quantity.toLocaleString("pt-BR")} {record.unit}
                    </td>
                    <td>
                      <span
                        className="dashboard-badge"
                        data-status={record.status}
                      >
                        {record.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.empty}>
            {records
              ? "Nenhuma requisição neste período."
              : "Consulte a lista para acompanhar as requisições."}
          </p>
        )}
      </section>
    </div>
  );
}
