import { getPool } from "../lib/db";
import type { Pool } from "../lib/db-types";

export interface RowDataPacket { [column: string]: unknown }
export interface ResultSetHeader {
  insertId: number;
  affectedRows: number;
  changedRows: number;
  warningStatus: number;
}

class neon {
  static createPool(): Pool {
    return getPool();
  }
}

namespace neon {
  export type RowDataPacket = import("../lib/db-types").RowDataPacket;
  export type ResultSetHeader = import("../lib/db-types").ResultSetHeader;
}

export default neon;
