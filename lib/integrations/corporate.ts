// Sem API/documentação/credenciais no projeto. Não confundir o nome informado
// "TOTUS" com TOTVS sem confirmação do sistema efetivamente usado pela MARCON.
export type CorporateStockEvent = {
  idempotencyKey: string;
  event: "entrada" | "saida" | "transferencia" | "devolucao" | "ajuste";
  sku: string;
  unit: string;
  quantity: number;
  warehouse: string;
  destination?: string;
  requestId?: number;
  actorId: string;
  occurredAt: string;
  reason: string;
};
export interface CorporateAdapter {
  send(event: CorporateStockEvent): Promise<{ externalId: string }>;
}
export const corporateAdapter: CorporateAdapter = {
  async send() {
    throw new Error(
      "Integração corporativa não configurada: confirmar produto, API, autenticação e mapeamento.",
    );
  },
};
export const integrationStatus = {
  officialStockSource: "Neon local MARCON",
  corporate: {
    active: false,
    name: "TOTUS — nome não confirmado",
    missing: [
      "Produto/versão",
      "Documentação e endpoint",
      "Credenciais",
      "Mapeamento de itens/locais/eventos e idempotência",
    ],
  },
  email: {
    active: false,
    reason:
      "Nenhum provedor de envio configurado no projeto. Nenhum e-mail é enviado.",
  },
  marketPrices: {
    active: false,
    reason:
      "Sem cotação ou catálogo autorizado. Valores são estimativas internas, sem frete/impostos presumidos.",
  },
};
