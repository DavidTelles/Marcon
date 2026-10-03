import type { Movement, Part, Request } from "./demo-data";

export const WAREHOUSES = [
  "Central",
  "Almoxarifado 1",
  "Almoxarifado 2",
  "Almoxarifado 3",
  "Almoxarifado 4",
] as readonly string[];
export const BLOCKS: readonly string[] = ["Bloco A", "Bloco B", "Bloco C", "Bloco D"];
export type Warehouse = string;
export type InventoryBalance = {
  partCode: string;
  warehouse: Warehouse;
  quantity: number;
  reserved?: number;
  available?: number;
  committed?: number;
  minimum?: number;
  aisle?: string;
  shelf?: string;
  capacity?: number | null;
  warehouseId?: number;
  nodeId?: string;
};
export type Transfer = {
  id: number;
  partCode: string;
  from: Warehouse;
  to: Warehouse;
  quantity: number;
  date: string;
  qrCode: string;
};

export const blockForWarehouse = (warehouse: Warehouse) =>
  BLOCKS[WAREHOUSES.indexOf(warehouse) - 1];
export const warehouseForBlock = (block: string): Warehouse =>
  WAREHOUSES[BLOCKS.indexOf(block as (typeof BLOCKS)[number]) + 1] ?? "Central";
export const balanceOf = (
  balances: InventoryBalance[],
  code: string,
  warehouse: Warehouse,
) =>
  balances.find((row) => row.partCode === code && row.warehouse === warehouse)
    ?.quantity ?? 0;

export const initialBalances: InventoryBalance[] = [
  ["ROL-6205-ZZ", [26, 4, 4, 4, 4]],
  ["PAR-M12-040", [20, 4, 4, 4, 4]],
  ["COR-A42", [10, 2, 2, 2, 2]],
  ["RET-35527", [15, 3, 3, 3, 3]],
].flatMap(([code, amounts]) =>
  WAREHOUSES.map((warehouse, index) => ({
    partCode: code as string,
    warehouse,
    quantity: (amounts as number[])[index],
  })),
);

export type DistributionSuggestion = {
  part: Part;
  to: Warehouse;
  available: number;
  current: number;
  target: number;
  suggested: number;
  demand: number;
  open: number;
  shortage: number;
};

export function distributionSuggestions(
  parts: Part[],
  balances: InventoryBalance[],
  movements: Movement[],
  requests: Request[],
): DistributionSuggestion[] {
  const rows: DistributionSuggestion[] = [];
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  for (const part of parts) {
    const central = balanceOf(balances, part.code, "Central");
    const candidates = WAREHOUSES.slice(1)
      .map((to) => {
        const block = blockForWarehouse(to);
        const demand = movements
          .filter(
            (movement) =>
              movement.partCode === part.code &&
              movement.type === "saida" &&
              movement.block === block &&
              movement.date >= cutoff &&
              !movement.transferId,
          )
          .reduce((sum, movement) => sum + movement.quantity, 0);
        const open = requests
          .filter(
            (request) =>
              (request.code === part.code || request.material === part.name) &&
              request.block === block &&
              ["Pendente", "Em análise", "Aprovada"].includes(request.status),
          )
          .reduce((sum, request) => sum + request.quantity, 0);
        const current = balanceOf(balances, part.code, to);
        const target = Math.max(
          2,
          Math.ceil(demand * 0.5) + open,
          Math.ceil(part.minimum / 8),
        );
        return {
          part,
          to,
          available: central,
          current,
          target,
          suggested: 0,
          demand,
          open,
          shortage: Math.max(0, target - current),
        };
      })
      .sort(
        (a, b) =>
          b.open * 2 +
          b.demand +
          b.shortage -
          (a.open * 2 + a.demand + a.shortage),
      );
    let distributable = Math.max(0, central - Math.ceil(part.minimum / 4));
    for (const candidate of candidates) {
      candidate.suggested = Math.min(candidate.shortage, distributable);
      distributable -= candidate.suggested;
      rows.push(candidate);
    }
  }
  return rows.sort(
    (a, b) =>
      b.open * 2 + b.demand + b.shortage - (a.open * 2 + a.demand + a.shortage),
  );
}
