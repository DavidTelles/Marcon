import type { Pool, PoolConnection } from "./db-types";
import { databaseConfigured as neonConfigured, getPool as neonPool, transaction as neonTransaction } from "./neon-db.mjs";

export function databaseEnabled() {
  return neonConfigured();
}

export function getPool(): Pool {
  return neonPool() as unknown as Pool;
  // Alinha DEFAULT CURRENT_TIMESTAMP às datas UTC das transições e relatórios.
}

export async function transaction<T>(
  work: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  return neonTransaction(work);
}
