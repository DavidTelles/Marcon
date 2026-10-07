export type Role = "admin" | "lider" | "almoxarifado" | "funcionario";
export type Page =
  | "pcp"
  | "mapa"
  | "dashboard"
  | "requisicoes"
  | "funcionarios"
  | "historico"
  | "solicitacoes"
  | "estoque"
  | "devolucoes"
  | "compra"
  | "recomendacoes"
  | "nova"
  | "materiais"
  | "pecas"
  | "por-peca";
export const roleLanding: Record<Role, string> = {
  admin: "/admin/dashboard",
  lider: "/department-head/dashboard",
  almoxarifado: "/warehouse/dashboard",
  funcionario: "/employee/request",
};
export const pagePaths: Record<Role, Partial<Record<Page, string>>> = {
  admin: {
    pcp: "/admin/pcp",
    pecas: "/admin/dashboard/parts",
    "por-peca": "/admin/dashboard/by-part",
    compra: "/admin/purchases",
    recomendacoes: "/admin/recommendations",
    mapa: "/admin/map",
    dashboard: "/admin/dashboard",
    requisicoes: "/admin/all-requests",
    funcionarios: "/admin/create",
    historico: "/admin/history",
  },
  lider: {
    pcp: "/department-head/pcp",
    materiais: "/department-head/materials",
    dashboard: "/department-head/dashboard",
    solicitacoes: "/department-head/requests",
    historico: "/department-head/history",
  },
  almoxarifado: {
    pcp: "/warehouse/pcp",
    pecas: "/warehouse/dashboard/parts",
    "por-peca": "/warehouse/dashboard/by-part",
    dashboard: "/warehouse/dashboard",
    requisicoes: "/warehouse/requests",
    estoque: "/warehouse/stock/all/all",
    devolucoes: "/warehouse/returns",
    compra: "/warehouse/purchases",
    recomendacoes: "/warehouse/recommendations",
    historico: "/warehouse/history",
  },
  funcionario: { pcp: "/employee/pcp", nova: "/employee/request", historico: "/employee/history" },
};
export function pathFor(role: Role, page: Page) {
  return pagePaths[role][page] ?? roleLanding[role];
}
