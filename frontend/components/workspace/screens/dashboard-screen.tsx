import Link from "next/link";
import { useState } from "react";
import {
  ClipboardList,
  Clock3,
  CircleCheck,
  Package,
  ArrowRight,
} from "lucide-react";
import type { Request, Part } from "@/lib/demo-data";
import type { Role, Page } from "@/lib/workspace-routes";
import { heading, badge } from "../ui";
import { useDemoStore } from "../demo-store";
import { WAREHOUSES, balanceOf } from "@/lib/inventory";
export function DashboardScreen({
  role,
  current,
  roleRequests,
  stock,
  requests,
  dashboardView,
  routePart,
  navigate,
  NavIcon,
}: {
  role: Role;
  current: { name: string; pages: { id: Page; label: string }[] };
  roleRequests: Request[];
  stock: Part[];
  requests: Request[];
  dashboardView?: string;
  routePart?: string;
  navigate: (page: Page) => void;
  NavIcon: React.ComponentType<{ page: Page }>;
}) {
  const { balances } = useDemoStore();
  const [chart, setChart] = useState<"status" | "blocos" | "estoque">("status");
  const statusRows = ["Pendente", "Em análise", "Aprovada", "Entregue", "Cancelada"].map((name) => ({ name, value: roleRequests.filter((item) => item.status === name).length }));
  const blockRows = ["Bloco A", "Bloco B", "Bloco C", "Bloco D"].map((name) => ({ name, value: roleRequests.filter((item) => item.block === name).length }));
  const warehouseRows = WAREHOUSES.map((name) => ({ name, value: stock.reduce((sum, part) => sum + balanceOf(balances, part.code, name), 0) }));
  const chartRows = chart === "status" ? statusRows : chart === "blocos" ? blockRows : warehouseRows;
  const chartMax = Math.max(1, ...chartRows.map((row) => row.value));
  const dashboardTitle: Record<string, string> = {
    warehouse: "Almoxarifado",
    stock: "Estoque",
    parts: "Peças",
    block: "Blocos",
    sector: "Setores",
  };
  const lowStock = stock.filter((item) => item.quantity < item.minimum);
  const focusedPart =
    routePart && routePart !== "all"
      ? stock.find(
          (item) =>
            String(item.id) === routePart ||
            item.code.toLowerCase() === routePart.toLowerCase() ||
            item.name.toLowerCase().includes(routePart.toLowerCase()),
        )
      : undefined;
  return (
    <>
      {heading(
        "VISÃO GERAL",
        dashboardView
          ? "Dashboard · " + (dashboardTitle[dashboardView] ?? "Visão geral")
          : "Olá, " + current.name.toLowerCase() + "!",
        "Veja o que precisa da sua atenção hoje.",
      )}
      {role === "admin" && (
        <div className="dashboard-subnav">
          <Link href="/admin/dashboard">Geral</Link>
          <Link href="/admin/dashboard/warehouse">Almoxarifado</Link>
          <Link href="/admin/dashboard/stock">Estoque</Link>
          <Link href="/admin/dashboard/block">Blocos</Link>
          <Link href="/admin/dashboard/sector/metalurgia">Setor</Link>
        </div>
      )}
      {role === "admin" && dashboardView && (
        <section className="panel dashboard-focus">
          <div className="panel-head">
            <div>
              <h2>{dashboardTitle[dashboardView] ?? "Visão segmentada"}</h2>
              <p>
                {dashboardView === "warehouse"
                  ? "Entradas, saídas e peças em falta do almoxarifado."
                  : dashboardView === "block"
                    ? "Requisições por bloco da operação."
                    : dashboardView === "sector"
                      ? "Visão por setor identificada na URL."
                      : "Saldos e movimentação das peças."}
              </p>
            </div>
          </div>
          <div className="focus-grid">
            {dashboardView === "block" ? (
              ["Bloco A", "Bloco B", "Bloco C"].map((block) => (
                <div className="stat" key={block}>
                  <span>{block}</span>
                  <strong>
                    {requests.filter((item) => item.block === block).length}
                  </strong>
                  <small>requisições</small>
                </div>
              ))
            ) : focusedPart ? (
              <div className="stat">
                <span>{focusedPart.code}</span>
                <strong>{focusedPart.quantity}</strong>
                <small>
                  {focusedPart.name} · posição {focusedPart.location}
                </small>
              </div>
            ) : dashboardView === "sector" ? (
              <div className="empty">
                <h3>Setor {routePart ?? ""}</h3>
                <p>
                  Sem dados setoriais nesta demonstração. A visão ficará
                  disponível quando o backend fornecer os vínculos entre peças e
                  setores.
                </p>
              </div>
            ) : (
              stock.map((part) => (
                <Link
                  className="focus-part"
                  key={part.code}
                  href={
                    "/admin/dashboard/stock/peca/" + encodeURIComponent(part.id)
                  }
                >
                  <strong>{part.name}</strong>
                  <small>
                    {part.quantity} unidades · {part.code}
                  </small>
                </Link>
              ))
            )}
          </div>
        </section>
      )}
      <div className="stats">
        <div className="stat">
          <span className="stat-icon blue">
            <ClipboardList size={20} aria-hidden="true" />
          </span>
          <span>Total de requisições</span>
          <strong>{roleRequests.length}</strong>
          <small>Registros disponíveis</small>
        </div>
        <div className="stat">
          <span className="stat-icon coral">
            <Clock3 size={20} aria-hidden="true" />
          </span>
          <span>Aguardando análise</span>
          <strong>
            {roleRequests.filter((item) => item.status === "Pendente").length}
          </strong>
          <small>Precisam de atenção</small>
        </div>
        <div className="stat">
          <span className="stat-icon green">
            <CircleCheck size={20} aria-hidden="true" />
          </span>
          <span>Concluídas</span>
          <strong>
            {roleRequests.filter((item) => item.status === "Entregue").length}
          </strong>
          <small>Materiais entregues</small>
        </div>
        {role === "almoxarifado" && (
          <div className="stat">
            <span className="stat-icon blue">
              <Package size={20} aria-hidden="true" />
            </span>
            <span>Estoque baixo</span>
            <strong>{lowStock.length}</strong>
            <small>Itens abaixo do mínimo</small>
          </div>
        )}
      </div>
      <div className="dashboard-grid">
        <section className="panel visual-panel">
          <div className="panel-head"><div><h2>Entenda os números</h2><p>Selecione uma visão para comparar os dados.</p></div></div>
          <div className="dashboard-subnav" role="tablist" aria-label="Visualização dos dados">
            {([["status", "Etapas"], ["blocos", "Blocos"], ["estoque", "Estoque"]] as const).map(([value, label]) => <button type="button" role="tab" aria-selected={chart === value} className={chart === value ? "active" : ""} key={value} onClick={() => setChart(value)}>{label}</button>)}
          </div>
          <div className="visual-bars">{chartRows.map((row) => <div className="visual-bar" key={row.name}><span>{row.name}</span><div className="metric-track"><i className={row.name === "Pendente" ? "exit" : "entry"} style={{ width: `${row.value / chartMax * 100}%` }} /></div><strong>{row.value}</strong></div>)}</div>
          <small>{chart === "estoque" ? "Unidades disponíveis em cada almoxarifado" : "Quantidade de requisições em cada grupo"}</small>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Atividade recente</h2>
              <p>Últimas movimentações.</p>
            </div>
            <button
              className="link-button"
              onClick={() =>
                navigate(role === "lider" ? "solicitacoes" : "requisicoes")
              }
            >
              Ver todas <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
          {roleRequests.slice(0, 3).map((item) => (
            <div className="activity" key={item.id}>
              <span className="activity-icon">
                <ClipboardList size={18} aria-hidden="true" />
              </span>
              <div>
                <strong>{item.material}</strong>
                <small>
                  #{item.id} · {item.person}
                </small>
              </div>
              {badge(item.status)}
            </div>
          ))}
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Acesso rápido</h2>
              <p>Vá direto ao que precisa.</p>
            </div>
          </div>
          {current.pages
            .filter((item) => item.id !== "dashboard")
            .slice(0, 4)
            .map((item) => (
              <button
                className="quick-link"
                key={item.id}
                onClick={() => navigate(item.id)}
              >
                <span className="activity-icon">
                  <NavIcon page={item.id} />
                </span>
                {item.label}
                <span>→</span>
              </button>
            ))}
        </section>
      </div>
      {role === "lider" && (
        <div className="info">
          <strong>Avisos por e-mail</strong>
          <p>
            O fluxo prevê avisos para novas requisições e anormalidades. O envio
            depende da integração com o backend.
          </p>
        </div>
      )}
    </>
  );
}
