import type { PoolConnection } from "./db-types";
import type { RowDataPacket } from "./db-types";
import { ActionError, text } from "./permissions";
export type Row = RowDataPacket & Record<string, unknown>;
export async function rows(
  c: PoolConnection,
  sql: string,
  args: unknown[] = [],
) {
  const [r] = await c.execute<Row[]>(sql, args as (string | number | null)[]);
  return r;
}
export const first = async (
  c: PoolConnection,
  sql: string,
  args: unknown[] = [],
) => (await rows(c, sql, args))[0];
export async function audit(
  c: PoolConnection,
  actor: number,
  entity: string,
  id: number,
  event: string,
  data: unknown,
) {
  await c.execute(
    "INSERT INTO audit_log(actor_id,entity_type,entity_id,action,details) VALUES(?,?,?,?,?)",
    [actor, entity, id, event, JSON.stringify(data)],
  );
}
export async function movement(
  c: PoolConnection,
  actor: number,
  part: number,
  warehouse: number,
  kind: string,
  quantity: number,
  note: string,
  request: number | null = null,
  block: number | null = null,
  returned: number | null = null,
  transfer: number | null = null,
) {
  if (quantity)
    await c.execute(
      "INSERT INTO stock_movements(part_id,warehouse_id,kind,quantity,actor_id,reason,request_id,block_id,return_id,transfer_id) VALUES(?,?,?,?,?,?,?,?,?,?)",
      [
        part,
        warehouse,
        kind,
        quantity,
        actor,
        note,
        request,
        block,
        returned,
        transfer,
      ],
    );
}
export async function stock(c: PoolConnection, part: number): Promise<Row[]> {
  const balances = await rows(
    c,
    "SELECT i.*, w.name, w.block_id, w.is_central FROM inventory i JOIN warehouses w ON w.id=i.warehouse_id WHERE i.part_id=? AND w.active=TRUE ORDER BY i.warehouse_id FOR UPDATE",
    [part],
  );
  // Locking reads see the latest committed reservations even under REPEATABLE READ.
  const reservations = await rows(
    c,
    "SELECT warehouse_id,quantity FROM request_reservations WHERE part_id=? FOR UPDATE",
    [part],
  );
  const pending = await rows(c,
    "SELECT id,source_warehouse_id,quantity FROM stock_transfers WHERE part_id=? AND status='Solicitada' ORDER BY id FOR UPDATE", [part]);
  return balances.map((b) => ({
    ...b,
    reserved: reservations
      .filter((r) => Number(r.warehouse_id) === Number(b.warehouse_id))
      .reduce((sum, r) => sum + Number(r.quantity), 0),
    pending_outgoing: pending.filter((t) => Number(t.source_warehouse_id) === Number(b.warehouse_id)).reduce((sum, t) => sum + Number(t.quantity), 0),
  }));
}
export const available = (r: Row) => Number(r.quantity) - Number(r.reserved) - Number(r.pending_outgoing ?? 0);
export async function partLock(c: PoolConnection, code: unknown, id?: unknown) {
  const p = await first(
    c,
    `SELECT * FROM parts WHERE ${id ? "id" : "code"}=? AND active=TRUE FOR UPDATE`,
    [id ?? text(code, 64).toUpperCase()],
  );
  if (!p) throw new ActionError("Peça não encontrada.", 404);
  return p;
}
export async function place(c: PoolConnection, value: unknown) {
  const w = await first(
    c,
    "SELECT * FROM warehouses WHERE name=? AND active=TRUE",
    [text(value, 80)],
  );
  if (!w) throw new ActionError("Almoxarifado inválido.");
  return w;
}
export function scan(p: Row, code: unknown) {
  if (
    ![p.code, p.qr_code].some(
      (v) => String(v).toUpperCase() === text(code, 128).toUpperCase(),
    )
  )
    throw new ActionError("Código lido não corresponde à peça.", 422);
}
export function capacity(row: Row, quantity: number) {
  if (
    row.capacity !== null &&
    row.capacity !== undefined &&
    quantity > Number(row.capacity)
  )
    throw new ActionError("Capacidade do local excedida.", 409);
}
