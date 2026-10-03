"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import { usePathname } from "next/navigation";
import {
  initialRequests,
  initialStock,
  initialMovements,
  type Movement,
  type Request,
  type Part,
  type ReturnRecord,
} from "@/lib/demo-data";
import { initialStaff, type StaffUser } from "@/lib/staff-data";
import {
  initialBalances,
  WAREHOUSES,
  BLOCKS,
  type InventoryBalance,
  type Transfer,
} from "@/lib/inventory";
import type { WorkspaceSnapshot } from "@/lib/workspace-db";
type CartItem = {
  code: string;
  quantity: number;
  priority: Request["priority"];
  justification: string;
};
type Store = {
  persistent: boolean;
  warehouseOptions: string[];
  blockOptions: string[];
  runAction: (
    action: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  requests: Request[];
  setRequests: React.Dispatch<React.SetStateAction<Request[]>>;
  stock: Part[];
  balances: InventoryBalance[];
  setBalances: React.Dispatch<React.SetStateAction<InventoryBalance[]>>;
  transfers: Transfer[];
  setTransfers: React.Dispatch<React.SetStateAction<Transfer[]>>;
  movements: Movement[];
  setMovements: React.Dispatch<React.SetStateAction<Movement[]>>;
  setStock: React.Dispatch<React.SetStateAction<Part[]>>;
  returns: ReturnRecord[];
  setReturns: React.Dispatch<React.SetStateAction<ReturnRecord[]>>;
  staff: StaffUser[];
  setStaff: React.Dispatch<React.SetStateAction<StaffUser[]>>;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
};
const Context = createContext<Store | null>(null);
export function DemoProvider({
  children,
  persistent = false,
  accountId,
}: {
  children: React.ReactNode;
  persistent?: boolean;
  accountId?: string;
}) {
  const pathname = usePathname();
  const reportPage =
    persistent &&
    /\/(dashboard|history|all-requests|requests)(\/|$)/.test(pathname);
  const publicPage = pathname === "/login" || pathname.startsWith("/inicio/");
  const [ready, setReady] = useState(!persistent);
  const [loadError, setLoadError] = useState("");
  const [warehouseOptions, setWarehouseOptions] = useState<string[]>(persistent ? [] : [...WAREHOUSES]);
  const [blockOptions, setBlockOptions] = useState<string[]>(persistent ? [] : [...BLOCKS]);
  const [requests, setRequests] = useState<Request[]>(persistent ? [] : initialRequests);
  const [stock, setStock] = useState<Part[]>(persistent ? [] : initialStock);
  const [balances, setBalances] = useState<InventoryBalance[]>(persistent ? [] : initialBalances);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [movements, setMovements] = useState<Movement[]>(persistent ? [] : initialMovements);
  const [staff, setStaff] = useState<StaffUser[]>(persistent ? [] : initialStaff);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const pendingActions = useRef(new Map<string, Promise<Record<string, unknown>>>());
  const retryKeys = useRef(new Map<string, string>());
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      try {
        const saved = accountId
          ? window.sessionStorage.getItem(`marcon-employee-cart:${accountId}`)
          : null;
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (
            Array.isArray(parsed) &&
            parsed.every(
              (item) =>
                item &&
                typeof item.code === "string" &&
                Number.isSafeInteger(item.quantity) &&
                item.quantity > 0 &&
                ["Leve", "Moderado", "Urgente"].includes(item.priority) &&
                typeof item.justification === "string",
            )
          )
            setCart(parsed as CartItem[]);
        }
      } catch {
        /* Discard an invalid saved cart. */
      }
      setCartLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [accountId]);
  useEffect(() => {
    if (cartLoaded && accountId)
      window.sessionStorage.setItem(
        `marcon-employee-cart:${accountId}`,
        JSON.stringify(cart),
      );
  }, [cart, cartLoaded, accountId]);
  const refresh = useCallback(async () => {
    if (reportPage) return;
    const response = await fetch("/api/workspace", { cache: "no-store" });
    if (response.status === 401) {
      window.location.replace("/login");
      return;
    }
    if (!response.ok)
      throw new Error("Não foi possível carregar os dados do Neon.");
    const data: WorkspaceSnapshot = await response.json();
    setWarehouseOptions(data.warehouses.map((w) => w.name));
    setBlockOptions(data.blocks.map((b) => b.name));
    setRequests(data.requests);
    setStock(data.stock);
    setBalances(data.balances);
    setMovements(data.movements);
    setTransfers(data.transfers);
    setReturns(data.returns);
    setStaff(data.staff);
    setReady(true);
    setLoadError("");
  }, [reportPage]);
  useEffect(() => {
    if (!persistent || publicPage) return;
    const timer = window.setTimeout(() => {
      refresh().catch((error) => {
        setReady(true);
        setLoadError(error.message);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [persistent, refresh, publicPage]);
  useEffect(() => {
    if (!persistent || publicPage) return;
    const update = (event?: Event) => {
      if (event instanceof CustomEvent && event.detail?.source === "store") return;
      if (document.visibilityState === "visible")
        refresh().catch(() => undefined);
    };
    window.addEventListener("focus", update);
    window.addEventListener("marcon:workspace-updated", update);
    const interval = window.setInterval(update, 30_000);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("marcon:workspace-updated", update);
      window.clearInterval(interval);
    };
  }, [persistent, refresh, publicPage]);
  const runAction = useCallback(
    async (action: Record<string, unknown>) => {
      if (!persistent)
        throw new Error(
          "Ação persistente indisponível no modo de demonstração.",
        );
      const signature = JSON.stringify(action);
      const pending = pendingActions.current.get(signature);
      if (pending) return pending;
      const key = action.requestKey ?? retryKeys.current.get(signature) ?? crypto.randomUUID();
      retryKeys.current.set(signature, String(key));
      const operation = (async () => {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...action, requestKey: key }),
      });
      const result = await response.json();
      if (response.status === 401) window.location.replace("/login");
      if (!response.ok)
        throw new Error(result.error || "A operação não foi concluída.");
      retryKeys.current.delete(signature);
      // Persistence already succeeded: a refresh failure must not invite the
      // user to execute an additive stock mutation again.
      try { await refresh(); } catch {
        setLoadError("Operação registrada. Falha ao atualizar a tela; recarregue os dados sem repetir a operação.");
      }
      window.dispatchEvent(new CustomEvent("marcon:workspace-updated", { detail: { source: "store" } }));
      return result as Record<string, unknown>;
      })();
      pendingActions.current.set(signature, operation);
      try { return await operation; } finally { pendingActions.current.delete(signature); }
    },
    [persistent, refresh],
  );
  if (!publicPage && !reportPage && loadError)
    return (
      <div className="app-loading" role="alert">
        {loadError}{" "}
        <button
          onClick={() =>
            refresh().catch((error) => setLoadError(error.message))
          }
        >
          Tentar novamente
        </button>
      </div>
    );
  if (!publicPage && !reportPage && !ready)
    return (
      <div className="app-loading" role="status">
        Carregando dados do sistema…
      </div>
    );
  return (
    <Context.Provider
      value={{
        persistent,
        warehouseOptions,
        blockOptions,
        runAction,
        requests,
        setRequests,
        stock,
        balances,
        setBalances,
        transfers,
        setTransfers,
        setStock,
        movements,
        setMovements,
        staff,
        setStaff,
        returns,
        setReturns,
        cart,
        setCart,
      }}
    >
      {reportPage && loadError && <div role="alert">{loadError} <button onClick={() => void refresh().catch((error) => setLoadError(error.message))}>Atualizar dados</button></div>}
      {children}
    </Context.Provider>
  );
}
export function useDemoStore() {
  const store = useContext(Context);
  if (!store) throw new Error("DemoProvider missing");
  return store;
}
