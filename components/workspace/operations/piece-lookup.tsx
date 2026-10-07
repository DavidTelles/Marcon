"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { Role } from "@/lib/workspace-routes";
import { DashboardDialog } from "./dashboard-dialog";
import { CodeScanner, type ResolvedPiece } from "./code-scanner";

export function PieceLookup({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const [piece, setPiece] = useState<ResolvedPiece | null>(null);
  return (
    <>
      <button
        type="button"
        className="icon-button workspace-piece-lookup"
        aria-label="Pesquisar peça por QR ou ID"
        title="Pesquisar peça por QR ou ID"
        onClick={() => {
          setPiece(null);
          setOpen(true);
        }}
      >
        <Search size={20} aria-hidden="true" />
      </button>
      <DashboardDialog
        compact
        open={open}
        title="Pesquisar peça por QR ou ID"
        onClose={() => setOpen(false)}
      >
        <CodeScanner
          allowManual
          onCode={() => {}}
          onResolved={setPiece}
          onInvalid={() => setPiece(null)}
        />
        {piece && (
          <section aria-label="Peça encontrada">
            <h3>
              {piece.material.code} · {piece.material.name}
            </h3>
            <p>{piece.scope}</p>
            {piece.balances.map((balance) => (
              <p key={balance.warehouseId}>
                <strong>{balance.warehouse}</strong>: {balance.available}{" "}
                {balance.unit} disponíveis · {balance.physical} {balance.unit}{" "}
                no estoque físico
              </p>
            ))}
            {role === "funcionario" && (
              <Link
                className="button primary"
                href={`/employee/request/peca/${piece.material.id}`}
                onClick={() => setOpen(false)}
              >
                Ver peça no catálogo
              </Link>
            )}
            {role === "almoxarifado" && (
              <Link
                className="button primary"
                href={`/warehouse/stock/all/${encodeURIComponent(piece.material.code)}`}
                onClick={() => setOpen(false)}
              >
                Ver peça no estoque
              </Link>
            )}
          </section>
        )}
      </DashboardDialog>
    </>
  );
}
