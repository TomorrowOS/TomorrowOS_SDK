import path from "path";
import type { PoolConfig } from "pg";

import { MemoryStore } from "./memory-store.js";
import { PostgresStore } from "./postgres-store.js";
import { SQLiteStore } from "./sqlite-store.js";
import type { TomorrowOSStore } from "./types.js";

export type TomorrowOSStoreDriver = "sqlite" | "postgres" | "supabase" | "memory";

export interface CreateTomorrowOSStoreOptions {
  /**
   * Defaults to TOMORROWOS_STORE, then postgres when DATABASE_URL is set,
   * otherwise sqlite. Use memory only for tests or throwaway demos.
   */
  driver?: TomorrowOSStoreDriver;
  /** Defaults to TOMORROWOS_DB_PATH, then ./data/tomorrowos.db. */
  sqlitePath?: string;
  /** Supabase/Postgres connection string. Defaults to DATABASE_URL. */
  databaseUrl?: string;
  /** Defaults from DATABASE_SSL / DATABASE_URL. */
  postgresSsl?: PoolConfig["ssl"];
  env?: NodeJS.ProcessEnv;
}

export function defaultSQLitePath(cwd = process.cwd()): string {
  return path.join(cwd, "data", "tomorrowos.db");
}

export function createTomorrowOSStore(
  options: CreateTomorrowOSStoreOptions = {}
): TomorrowOSStore {
  const env = options.env ?? process.env;
  const databaseUrl = options.databaseUrl ?? env.DATABASE_URL;
  const driver = (
    options.driver ??
    env.TOMORROWOS_STORE ??
    (databaseUrl ? "postgres" : "sqlite")
  ).toLowerCase();

  if (driver === "memory") {
    return new MemoryStore();
  }

  if (driver === "postgres" || driver === "supabase") {
    if (!databaseUrl) {
      throw new Error(
        `TOMORROWOS_STORE=${driver} requires DATABASE_URL. Set DATABASE_URL in .env or unset TOMORROWOS_STORE to use SQLite.`
      );
    }

    return new PostgresStore({
      connectionString: databaseUrl,
      ssl: options.postgresSsl ?? resolvePostgresSsl(env, databaseUrl)
    });
  }

  if (driver === "sqlite") {
    return new SQLiteStore({
      databasePath: options.sqlitePath ?? env.TOMORROWOS_DB_PATH ?? defaultSQLitePath()
    });
  }

  throw new Error(
    `Unsupported TOMORROWOS_STORE "${driver}". Use "sqlite", "supabase", "postgres", "memory", or pass a custom TomorrowOSStore to new TomorrowOS({ store }).`
  );
}

function resolvePostgresSsl(
  env: NodeJS.ProcessEnv,
  databaseUrl: string
): PoolConfig["ssl"] {
  const raw = env.DATABASE_SSL?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") return false;
  if (raw === "true" || raw === "1" || raw === "on") {
    return { rejectUnauthorized: false };
  }

  if (/supabase\.(co|com)|sslmode=require/i.test(databaseUrl)) {
    return { rejectUnauthorized: false };
  }

  return undefined;
}
