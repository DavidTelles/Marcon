"use client";
import { heading } from "../ui";
export function RecommendationScreen() {
  return (
    <>
      {heading(
        "PLANEJAMENTO",
        "Recomendação de estoque",
        "Distribuição baseada em baixas reais e saldos persistidos.",
      )}
      <section className="panel ops-panel">
        <h2>Planejamento indisponível no modo de demonstração</h2>
        <p role="status">
          Configure o Neon e execute as migrações para analisar consumo,
          solicitar transferências e conferir saída e recebimento. Nenhum saldo
          é movimentado neste modo.
        </p>
      </section>
    </>
  );
}
