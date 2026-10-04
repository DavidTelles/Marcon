"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/app/components/brand-logo";
import { useDemoStore } from "./demo-store";
import { useEmployeeName, useEmployeeBlock } from "./employee-identity";
import { badge } from "./ui";
import { can } from "@/lib/permissions";
import { RequestOperations } from "./operations/request-operations";
import { OperationsPanel } from "./operations/operations-panel";
import { InsightChart } from "./operations/insight-chart";
import { MapEditor } from "./operations/map-editor";
import { PurchaseScreen } from "./screens/purchase-screen";
import { RecommendationScreen } from "./screens/recommendation-screen";
import { StockMovementHistory } from "./screens/stock-movement-history";
import { balanceOf, warehouseForBlock } from "@/lib/inventory";
import { EmployeeRequestScreen } from "./screens/employee-request-screen";
import { StaffScreen } from "./screens/staff-screen";
import { StaffCreateScreen } from "./screens/staff-create-screen";
import { StockScreen } from "./screens/stock-screen";
import { ReturnsScreen } from "./screens/returns-screen";
import { DashboardScreen } from "./screens/dashboard-screen";
import { AdminDashboard } from "./screens/admin-dashboard";
import dashboardStyles from "./dashboard.module.css";
import appearance from "./appearance.module.css";
import compactStyles from "./compact.module.css";
import adminShell from "./admin-shell.module.css";
import { ThemeToggle, useWorkspaceTheme } from "./theme-toggle";
import { WarehouseDashboard } from "./screens/warehouse-dashboard";
import { RequestsScreen } from "./screens/requests-screen";
import { RequestWorkflowScreen } from "./screens/request-workflow-screen";
import { MaterialsScreen } from "./screens/materials-screen";
import { PartsConsumptionScreen } from "./screens/parts-consumption-screen";
import { type Request, type Part } from "@/lib/demo-data";
import {
  pathFor,
  roleLanding,
  type Role,
  type Page,
} from "@/lib/workspace-routes";
import {
  Boxes,
  MapPinned,
  ArrowLeft,
  RotateCcw,
  ChartNoAxesCombined,
  ClipboardList,
  History,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Plus,
  UsersRound,
  X,
} from "lucide-react";

const roles: Record<
  Role,
  { name: string; pages: { id: Page; label: string }[] }
> = {
  admin: {
    name: "Admin",
    pages: [
      { id: "dashboard", label: "Dashboard" },
      { id: "mapa", label: "Planta e rotas" },
      { id: "compra", label: "Compra preditiva" },
      { id: "recomendacoes", label: "Recomendação de estoque" },
      { id: "funcionarios", label: "Funcionários" },
      { id: "historico", label: "Histórico" },
    ],
  },
  lider: {
    name: "Líder de bloco",
    pages: [
      { id: "dashboard", label: "Dashboard" },
      { id: "solicitacoes", label: "Solicitações" },
      { id: "historico", label: "Histórico geral" },
    ],
  },
  almoxarifado: {
    name: "Almoxarifado",
    pages: [
      { id: "dashboard", label: "Dashboard" },
      { id: "requisicoes", label: "Requisições" },
      { id: "estoque", label: "Estoque" },
      { id: "devolucoes", label: "Devoluções" },
      { id: "compra", label: "Compra preditiva" },
      { id: "recomendacoes", label: "Recomendação de estoque" },
      { id: "historico", label: "Histórico" },
    ],
  },
  funcionario: {
    name: "Funcionário",
    pages: [
      { id: "nova", label: "Fazer requisição" },
      { id: "historico", label: "Histórico geral" },
    ],
  },
};
const pageIcons = {
  pecas: Boxes,
  "por-peca": ChartNoAxesCombined,
  materiais: Boxes,
  mapa: MapPinned,
  dashboard: LayoutDashboard,
  requisicoes: ClipboardList,
  funcionarios: UsersRound,
  historico: History,
  solicitacoes: Inbox,
  estoque: Boxes,
  devolucoes: RotateCcw,
  compra: ChartNoAxesCombined,
  recomendacoes: Lightbulb,
  nova: Plus,
};
function forecast(part: Part) {
  const daily = part.consumed30 / 30;
  return {
    arrival: Math.round(part.quantity - daily * part.leadDays),
    buy: Math.max(
      0,
      Math.ceil(daily * (part.leadDays + 15) + part.minimum - part.quantity),
    ),
    growth: part.previous30
      ? Math.round((part.consumed30 / part.previous30 - 1) * 100)
      : 0,
  };
}
function NavIcon({ page }: { page: Page }) {
  const Icon = pageIcons[page];
  return <Icon size={19} strokeWidth={1.9} aria-hidden="true" />;
}
function navigationGroup(page: Page) {
  return ["compra", "recomendacoes"].includes(page)
    ? "Planejamento"
    : page === "funcionarios"
      ? "Administração"
      : "Operação";
}
export default function Workspace({
  role,
  page,
  routePart,
  dashboardView,
}: {
  role: Role;
  page: Page;
  routePart?: string;
  dashboardView?: string;
}) {
  const router = useRouter();
  const theme = useWorkspaceTheme();
  const searchParams = useSearchParams();
  const selectedDashboard =
    searchParams.get("dashboard") ??
    (dashboardView === "block" || role === "lider"
      ? "bloco"
      : ["stock", "warehouse", "parts"].includes(dashboardView ?? "")
        ? "estoque"
        : dashboardView === "sector"
          ? "requisicoes"
          : "geral");
  const employeeName = useEmployeeName();
  const employeeBlock = useEmployeeBlock();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [dashboardExpanded, setDashboardExpanded] = useState(
    ["dashboard", "materiais", "pecas", "por-peca"].includes(page),
  );
  const {
    requests,
    setRequests,
    stock,
    setStock,
    movements,
    setMovements,
    balances,
    setBalances,
    persistent,
    runAction,
  } = useDemoStore();
  const [detail, setDetail] = useState<Request | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todas");
  const [message, setMessage] = useState("");
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const pagePermissions = {
    materiais: "history",
    pecas: "stock",
    "por-peca": "stock",
    mapa: "map",
    funcionarios: "people",
    compra: "planning",
    recomendacoes: "planning",
    estoque: "stock",
    devolucoes: "stock",
    nova: "request",
    solicitacoes: "approve",
    dashboard: "history",
    historico: "history",
    requisicoes: "history",
  } as const;
  const current = {
    ...roles[role],
    pages: roles[role].pages.filter((p) => can(role, pagePermissions[p.id])),
  };
  const backHref =
    routePart && routePart !== "all"
      ? pathFor(role, page)
      : dashboardView
        ? roleLanding[role]
        : page === "dashboard" || (role === "funcionario" && page === "nova")
          ? roleLanding[role]
          : roleLanding[role];
  const active =
    current.pages.find((item) => item.id === page) ??
    (page === "requisicoes"
      ? { id: page, label: "Requisições" }
      : current.pages[0]);
  const roleRequests = requests.filter((item) =>
    role === "funcionario"
      ? item.person === employeeName || item.person === "Você"
      : role === "lider"
        ? item.block === employeeBlock
        : true,
  );
  const shownRequests = roleRequests.filter(
    (item) =>
      (page !== "historico" ||
        role === "funcionario" ||
        item.status === "Entregue" ||
        item.status === "Cancelada") &&
      (statusFilter === "Todas" || item.status === statusFilter) &&
      (item.material + item.person + item.id)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const sortedRequests = [...shownRequests].sort(
    (a, b) =>
      ({ Urgente: 0, Moderado: 1, Leve: 2 })[a.priority] -
      { Urgente: 0, Moderado: 1, Leve: 2 }[b.priority],
  );
  const requestRows =
    role === "almoxarifado" && page === "requisicoes"
      ? sortedRequests.filter((item) =>
          ["Aprovada", "Cancelamento solicitado"].includes(item.status),
        )
      : shownRequests;
  const purchaseItems = stock
    .map((item) => ({ item, projection: forecast(item) }))
    .filter(({ projection }) => projection.buy > 0)
    .sort((a, b) => a.projection.arrival - b.projection.arrival);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!drawerOpen) return;
    sidebar.current?.querySelector<HTMLElement>("button")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
      if (event.key !== "Tab" || !sidebar.current) return;
      const focusable = [
        ...sidebar.current.querySelectorAll<HTMLElement>("button, a[href]"),
      ];
      if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault();
        focusable.at(-1)?.focus();
      }
      if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
        event.preventDefault();
        focusable[0]?.focus();
      }
    }
    const trigger = menuButton.current;
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [drawerOpen]);
  function navigate(next: Page) {
    const state = window as typeof window & { __marconUnsavedUser?: boolean };
    if (
      state.__marconUnsavedUser &&
      !window.confirm("Há alterações não salvas. Deseja sair mesmo assim?")
    )
      return;
    router.push(pathFor(role, next));
    setDrawerOpen(false);
    setSearch("");
    setStatusFilter("Todas");
  }
  async function updateStatus(
    id: number,
    status: Request["status"],
  ): Promise<boolean> {
    const request = requests.find((item) => item.id === id);
    if (!request) return false;
    const leaderAllowed =
      role === "lider" &&
      request.block === employeeBlock &&
      request.status === "Pendente" &&
      ["Aprovada", "Cancelada"].includes(status);
    const warehouseAllowed =
      role === "almoxarifado" &&
      request.status === "Aprovada" &&
      ["Entregue", "Cancelada"].includes(status);
    if (!leaderAllowed && !warehouseAllowed) {
      setMessage("Ação indisponível para este perfil ou etapa.");
      return false;
    }
    if (persistent) {
      try {
        await runAction({
          type: "changeRequestStatus",
          id,
          status,
          qrCode: qrCode.trim(),
          confirmedQuantity: request.quantity,
        });
        setQrCode("");
        setMessage("Situação atualizada.");
        return true;
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível atualizar a requisição.",
        );
        return false;
      }
    }
    if (status === "Entregue") {
      const part = stock.find(
        (item) => item.code === request.code || item.name === request.material,
      );
      if (!part || qrCode.trim().toUpperCase() !== (part.qrCode ?? part.code)) {
        setMessage("Confira o código QR/ID da embalagem antes da baixa.");
        return false;
      }
      const source = warehouseForBlock(request.block);
      const sourceBalance = balanceOf(balances, part.code, source);
      const actualSource =
        sourceBalance >= request.quantity ? source : "Central";
      if (balanceOf(balances, part.code, actualSource) < request.quantity) {
        setMessage("Saldo insuficiente para esta separação.");
        return false;
      }
      setStock((items) =>
        items.map((item) =>
          item.code === part.code
            ? { ...item, quantity: item.quantity - request.quantity }
            : item,
        ),
      );
      setBalances((items) =>
        items.map((item) =>
          item.partCode === part.code && item.warehouse === actualSource
            ? { ...item, quantity: item.quantity - request.quantity }
            : item,
        ),
      );
      setMovements((items) => [
        {
          id: Date.now(),
          partCode: part.code,
          type: "saida",
          quantity: request.quantity,
          date: new Date().toISOString().slice(0, 10),
          warehouse: actualSource,
          block: request.block,
          requester: request.person,
        },
        ...items,
      ]);
      setQrCode("");
    }
    setRequests((items) =>
      items.map((item) => (item.id === id ? { ...item, status } : item)),
    );
    setMessage("Situação atualizada nesta sessão.");
    return true;
  }
  function exportCsv(exportRows: Request[]) {
    const rows = [
      [
        "ID",
        "Peça",
        "Código",
        "Quantidade",
        "Solicitante",
        "Bloco",
        "Prioridade",
        "Situação",
        "Data",
      ],
      ...exportRows.map((item) => [
        item.id,
        item.material,
        item.code || "",
        item.quantity,
        item.person,
        item.block,
        item.priority,
        item.status,
        item.date,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => JSON.stringify(String(value))).join(";"))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "marcon-requisicoes.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  function allowedStatuses(item: Request): Request["status"][] {
    if (role === "lider" && item.status === "Pendente")
      return ["Pendente", "Aprovada", "Cancelada"];
    if (role === "almoxarifado" && item.status === "Aprovada")
      return ["Aprovada", "Entregue", "Cancelada"];
    return [item.status];
  }
  function requestCard(item: Request) {
    return (
      <article className="request-card" key={item.id}>
        <div className="card-line">
          <strong>{item.material}</strong>
          {badge(item.status)}
        </div>
        <p>
          #{item.id} · {item.quantity} un. · {item.block}
        </p>
        <div className="card-line">
          <span>
            {item.date} · {item.person}
          </span>
          {badge(item.priority)}
        </div>
        {item.justification && (
          <p className="alert-note">
            Justificativa atípica: {item.justification}
          </p>
        )}
        <button className="link-button" onClick={() => setDetail(item)}>
          Ver detalhes
        </button>
        {role === "lider" && page !== "historico" && (
          <label className="mobile-status">
            Atualizar situação
            <select
              value={item.status}
              onChange={(event) =>
                updateStatus(item.id, event.target.value as Request["status"])
              }
            >
              {allowedStatuses(item).map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
        )}
      </article>
    );
  }
  const navigationPages = [...current.pages].sort((a, b) => {
    const groups = ["Operação", "Planejamento", "Administração"];
    return (
      groups.indexOf(navigationGroup(a.id)) -
      groups.indexOf(navigationGroup(b.id))
    );
  });
  return (
    <div
      data-theme={theme}
      className={`shell ${appearance.workspace} ${compactStyles.compact} ${adminShell.shell} ${role === "funcionario" && page === "historico" ? appearance.employeeHistory : ""} ${page === "dashboard" ? dashboardStyles.dashboard : ""}`}
    >
      <a className="workspace-skip" href="#workspace-content">
        Ir para o conteúdo
      </a>
      <div
        className={"overlay " + (drawerOpen ? "visible" : "")}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      <aside
        id="workspace-menu"
        ref={sidebar}
        inert={isMobile && !drawerOpen}
        className={"sidebar " + (drawerOpen ? "open" : "")}
        aria-label="Menu principal"
      >
        <div className="brand">
          {isMobile ? (
            <button
              type="button"
              className={adminShell.logoClose}
              aria-label="Fechar menu Marcon"
              onClick={() => setDrawerOpen(false)}
            >
              <BrandLogo compact decorative />
            </button>
          ) : (
            <BrandLogo compact />
          )}
          <div>
            <strong>MARCON</strong>
            <small>Gestão de materiais</small>
          </div>
          <button
            className="icon-button close"
            onClick={() => setDrawerOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Navegação principal">
          {navigationPages.map((item, index) => (
            <div key={item.id}>
              {(index === 0 ||
                navigationGroup(navigationPages[index - 1].id) !==
                  navigationGroup(item.id)) && (
                <p className="nav-caption">{navigationGroup(item.id)}</p>
              )}
              <button
                className={
                  "nav-link " + (active.id === item.id ? "active" : "")
                }
                onClick={() => {
                  if (item.id === "dashboard") {
                    setDashboardExpanded((expanded) => !expanded);
                  } else {
                    navigate(item.id);
                  }
                }}
                aria-current={active.id === item.id ? "page" : undefined}
                aria-expanded={
                  item.id === "dashboard" ? dashboardExpanded : undefined
                }
                aria-controls={
                  item.id === "dashboard" ? "dashboard-submenu" : undefined
                }
              >
                <span aria-hidden="true">
                  <NavIcon page={item.id} />
                </span>
                {item.label}
                {item.id === "dashboard" && (
                  <span
                    className={compactStyles.dashboardArrow}
                    aria-hidden="true"
                  >
                    {dashboardExpanded ? "↓" : ">"}
                  </span>
                )}
              </button>
              {item.id === "dashboard" && dashboardExpanded && (
                <nav
                  id="dashboard-submenu"
                  className={dashboardStyles.submenu}
                  aria-label="Visões da dashboard"
                >
                  {[
                    ["geral", "Geral"],
                    ["bloco", "Por bloco"],
                    ["estoque", "Estoque"],
                    ["requisicoes", "Requisições"],
                    ["materiais", "Materiais"],
                    ["pecas", "Peças"],
                    ["por-peca", "Por peça"],
                  ]
                    .filter(
                      ([view]) =>
                        role === "lider" ? ["bloco", "materiais"].includes(view) : role === "almoxarifado" ? ["geral", "estoque", "pecas", "por-peca"].includes(view) : view !== "materiais",
                    )
                    .map(([view, label]) => (
                      <Link
                        key={view}
                        href={["materiais", "pecas", "por-peca"].includes(view) ? pathFor(role, view as Page) : `${pathFor(role, "dashboard")}?dashboard=${view}&metric=${view === "estoque" ? "stock" : "requests"}`}
                        aria-current={
                          (page === "dashboard" && selectedDashboard === view) || page === view
                            ? "page"
                            : undefined
                        }
                        onClick={() => setDrawerOpen(false)}
                      >
                        <span aria-hidden="true">
                          {view === "estoque" ? (
                            <Boxes size={15} />
                          ) : view === "requisicoes" ? (
                            <ClipboardList size={15} />
                          ) : view === "bloco" ? (
                            <ChartNoAxesCombined size={15} />
                          ) : (
                            <LayoutDashboard size={15} />
                          )}
                        </span>
                        {label}
                      </Link>
                    ))}
                </nav>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {isMobile && (
            <div className={compactStyles.mobileAccount}>
              <ThemeToggle />
              <Link href="/profile" onClick={() => setDrawerOpen(false)}>
                Editar perfil
              </Link>
              <form action="/api/logout" method="post">
                <button type="submit" className="workspace-logout">
                  <LogOut size={16} aria-hidden="true" />
                  Sair da conta
                </button>
              </form>
            </div>
          )}
          <div className="side-note">
            <strong>Seu espaço, seu ritmo.</strong>
            <p>Organize materiais e acompanhe solicitações em um só lugar.</p>
          </div>
          <div className="user">
            <span className="avatar">{current.name[0]}</span>
            <div>
              <strong>{current.name}</strong>
              <small>
                {persistent ? "Conta ativa" : "Visualização de demonstração"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="top-left">
            <Link
              className="workspace-top-brand"
              href={roleLanding[role]}
              aria-label="Marcon — página inicial"
            >
              <BrandLogo compact decorative />
              <span>SMARTWAY</span>
            </Link>
            <Link
              className="icon-button"
              aria-label="Voltar"
              title="Voltar"
              href={backHref}
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </Link>
            <button
              ref={menuButton}
              className={`icon-button menu ${compactStyles.logoMenu}`}
              type="button"
              onClick={() => setDrawerOpen((open) => !open)}
              aria-label="Abrir menu"
              aria-expanded={drawerOpen}
              aria-controls="workspace-menu"
              title="Abrir menu Marcon"
            >
              <BrandLogo compact decorative />
            </button>
            <span className="workspace-location">
              <span>
                Área de trabalho <b>/</b>{" "}
              </span>
              <strong>{active.label}</strong>
            </span>
          </div>
          <div className="role-control">
            <ThemeToggle />
            <strong>{current.name}</strong>
            <Link href="/profile" className="workspace-profile">
              Editar perfil
            </Link>
            <form action="/api/logout" method="post">
              <button
                type="submit"
                className="workspace-logout"
                aria-label="Sair da conta"
                title="Sair da conta"
              >
                <LogOut size={18} aria-hidden="true" />
                <span>Sair da conta</span>
              </button>
            </form>
          </div>
        </header>
        <main className="content" id="workspace-content" tabIndex={-1}>
          {message && (
            <div className="notice" role="status">
              ✓ {message}
              <button
                onClick={() => setMessage("")}
                aria-label="Dispensar aviso"
              >
                ×
              </button>
            </div>
          )}
          {!persistent && page === "dashboard" && role === "almoxarifado" && (
            <WarehouseDashboard
              stock={stock}
              requests={roleRequests}
              movements={movements}
            />
          )}
          {!persistent && page === "dashboard" && role === "admin" && (
            <AdminDashboard
              dashboardView={dashboardView}
              routePart={routePart}
            />
          )}
          {!persistent &&
            page === "dashboard" &&
            role !== "almoxarifado" &&
            role !== "admin" && (
              <DashboardScreen
                role={role}
                current={current}
                roleRequests={roleRequests}
                stock={stock}
                requests={requests}
                dashboardView={dashboardView}
                routePart={routePart}
                navigate={navigate}
                NavIcon={NavIcon}
              />
            )}
          {!persistent && role === "funcionario" && page === "historico" && (
            <InsightChart
              title="Suas requisições"
              description="Acompanhe rapidamente o andamento dos seus pedidos."
              rows={[
                {
                  label: "Aguardando",
                  value: roleRequests.filter((item) =>
                    ["Pendente", "Em análise"].includes(item.status),
                  ).length,
                },
                {
                  label: "Aprovadas",
                  value: roleRequests.filter((item) => item.status === "Aprovada").length,
                },
                {
                  label: "Entregues",
                  value: roleRequests.filter((item) => item.status === "Entregue").length,
                },
              ]}
              unit="pedidos"
            />
          )}
          {!persistent &&
            ["requisicoes", "solicitacoes", "historico"].includes(page) && (
              <RequestsScreen
                role={role}
                page={page}
                current={current}
                active={active}
                requestRows={requestRows}
                search={search}
                setSearch={setSearch}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                qrCode={qrCode}
                setQrCode={setQrCode}
                exportCsv={exportCsv}
                updateStatus={updateStatus}
                setDetail={setDetail}
                allowedStatuses={allowedStatuses}
                requestCard={requestCard}
              />
            )}
          {!persistent &&
            page === "historico" &&
            (role === "admin" || role === "almoxarifado") && (
              <StockMovementHistory />
            )}
          {page === "nova" && <EmployeeRequestScreen routePart={routePart} />}
          {page === "funcionarios" && routePart === "new" && (
            <StaffCreateScreen />
          )}
          {page === "funcionarios" && routePart !== "new" && (
            <StaffScreen setMessage={setMessage} />
          )}
          {page === "estoque" && (
            <StockScreen routePart={routePart} setMessage={setMessage} />
          )}
          {page === "devolucoes" && <ReturnsScreen setMessage={setMessage} />}
          {page === "mapa" && <MapEditor />}
          {page === "materiais" && role === "lider" && <MaterialsScreen />}
          {persistent && ["requisicoes", "solicitacoes", "historico"].includes(page) && <RequestWorkflowScreen role={role} history={page === "historico"} />}
          {["pecas", "por-peca"].includes(page) && <PartsConsumptionScreen key={`${page}:${searchParams.get("code") ?? ""}`} role={role} mode={page === "pecas" ? "comparison" : "share"} initialCode={searchParams.get("code") ?? undefined} />}
          {persistent &&
            [
              "dashboard",
              "compra",
              "recomendacoes",
            ].includes(page) && (
              <OperationsPanel
                key={
                  page +
                  dashboardView +
                  routePart +
                  (page === "dashboard" ? selectedDashboard : "")
                }
                role={role}
                mode={page}
                dashboardView={dashboardView}
                routePart={routePart}
              />
            )}
          {!persistent && page === "compra" && (
            <PurchaseScreen purchaseItems={purchaseItems} />
          )}
          {!persistent && page === "recomendacoes" && <RecommendationScreen />}
        </main>
      </div>
      {detail && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setDetail(null)}
        >
          <section
            className="detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label={"Requisição " + detail.id}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              aria-label="Fechar detalhes"
              onClick={() => setDetail(null)}
            >
              <X size={20} />
            </button>
            {persistent && <RequestOperations id={detail.id} role={role} />}
            <p className="kicker">REQUISIÇÃO #{detail.id}</p>
            <h2>{detail.material}</h2>
            <p>Código: {detail.code || "Não informado"}</p>
            <p>
              Quantidade: {detail.quantity} unidades · {detail.block}
            </p>
            <p>
              Solicitante: {detail.person} · {detail.date}
            </p>
            <p>
              Prioridade: {detail.priority} · Situação: {detail.status}
            </p>
            {detail.justification && (
              <p className="alert-note">
                <strong>Justificativa de atipicidade:</strong>{" "}
                {detail.justification}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
