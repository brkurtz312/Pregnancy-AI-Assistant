import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

/**
 * Resolves the connection string, or fails with a message that says what is
 * actually wrong. Without this check a missing `DATABASE_URL` surfaces much
 * later as an ECONNREFUSED against pg's default localhost.
 */
function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
  return url;
}

let poolInstance: InstanceType<typeof Pool> | undefined;
function resolvePool(): InstanceType<typeof Pool> {
  poolInstance ??= new Pool({ connectionString: databaseUrl() });
  return poolInstance;
}

function createDb() {
  return drizzle(resolvePool(), { schema });
}

let dbInstance: ReturnType<typeof createDb> | undefined;
function resolveDb(): ReturnType<typeof createDb> {
  dbInstance ??= createDb();
  return dbInstance;
}

/**
 * Presents `resolve()`'s result as an ordinary object, but does not call it
 * until something is actually read from it.
 *
 * **Why:** `db` and `pool` used to be built at import time, so importing this
 * module at all required `DATABASE_URL`. That made the module's own error
 * throw during import, before any consumer could guard against it — test
 * files that check `if (!process.env.DATABASE_URL) return` never reached the
 * check, and nine api-server suites failed to load rather than skipping.
 * Deferring construction lets a consumer import the schema, or a type, or a
 * sibling export, without needing a database at all; anything that genuinely
 * touches the connection still fails with the same message as before.
 */
function lazy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const instance = resolve();
      const value: unknown = Reflect.get(instance, property);
      return typeof value === "function" ? value.bind(instance) : value;
    },
    set(_target, property, value) {
      return Reflect.set(resolve(), property, value);
    },
    has(_target, property) {
      return property in resolve();
    },
    ownKeys(_target) {
      return Reflect.ownKeys(resolve());
    },
    getOwnPropertyDescriptor(_target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(resolve(), property);
      // Proxy invariant: a descriptor reported for a property the target does
      // not have must be configurable.
      return descriptor && { ...descriptor, configurable: true };
    },
    getPrototypeOf(_target) {
      return Reflect.getPrototypeOf(resolve());
    },
  });
}

export const pool = lazy(resolvePool);
export const db = lazy(resolveDb);

export * from "./schema";
