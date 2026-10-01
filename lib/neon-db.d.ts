import type { Pool, PoolConnection } from "./db-types";

export function databaseConfigured(env?: NodeJS.ProcessEnv): boolean;
export function getPool(): Pool;
export function transaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T>;
export function migrateDatabase(): Promise<void>;
export function closeDatabase(): Promise<void>;
