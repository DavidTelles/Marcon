// Legacy SQL adapter accepts heterogeneous driver rows; domain boundaries validate values.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
export type PoolConnection = QueryExecutor;
export interface Pool extends QueryExecutor { end(): Promise<void> }
