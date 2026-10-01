export interface RowDataPacket { [column: string]: any }
export interface ResultSetHeader {
  insertId: number;
  affectedRows: number;
  changedRows: number;
  warningStatus: number;
}
export interface QueryExecutor {
  execute<T = RowDataPacket[]>(sql: string, params?: readonly unknown[]): Promise<[T]>;
  query<T = RowDataPacket[]>(sql: string, params?: readonly unknown[]): Promise<[T]>;
}
export interface PoolConnection extends QueryExecutor {}
export interface Pool extends QueryExecutor { end(): Promise<void> }
