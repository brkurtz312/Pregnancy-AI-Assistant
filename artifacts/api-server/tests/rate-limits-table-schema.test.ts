/**
 * Schema-existence tests for the `rate_limits` table.
 *
 * ## Why this test exists
 *
 * `PostgresRateLimitStore` already has guards for unknown and duplicate
 * prefixes, but there is a third failure mode: a developer adds a new entry to
 * `RATE_LIMIT_PREFIXES`, constructs a store successfully (the prefix guards
 * pass), and only discovers at runtime under load that the backing table or
 * index is missing — because they forgot to run the DB migration.
 *
 * These tests query PostgreSQL's `information_schema` and `pg_catalog` to
 * assert that:
 *
 *   1. The `rate_limits` table exists in the public schema.
 *   2. Every column used by `PostgresRateLimitStore` (`key`, `hits`,
 *      `expires_at`) is present with the expected data type.
 *   3. `key` is the primary key (the upsert ON CONFLICT target).
 *   4. The housekeeping index (`rate_limits_expires_at_idx`) on `expires_at`
 *      exists, since a missing index wouldn't stop inserts but would silently
 *      cause full-table scans on the periodic cleanup sweep.
 *
 * Running against the real DATABASE_URL (the same one used in CI and in the
 * Replit dev environment) means the failure is surfaced before a deploy rather
 * than in production under load.
 */

import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// ─── Table existence ──────────────────────────────────────────────────────────

// This suite runs against a real Postgres connection. Without DATABASE_URL
// there is nothing to run against, so it skips instead of failing the whole
// api-server run — the integration coverage is still there for anyone who sets
// DATABASE_URL and re-runs.
const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeDb = describe.skipIf(!hasDatabase);

describeDb("rate_limits table — existence", () => {
  it("the rate_limits table exists in the public schema", async () => {
    const result = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name   = 'rate_limits'
    `);

    expect(result.rows.length).toBe(1);
  });
});

// ─── Column presence and types ────────────────────────────────────────────────

describeDb("rate_limits table — columns", () => {
  /**
   * Fetch all columns for the `rate_limits` table from information_schema and
   * return a map of column_name → data_type for easy assertions.
   */
  async function fetchColumns(): Promise<Map<string, string>> {
    const result = await db.execute(sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'rate_limits'
    `);

    return new Map(
      (result.rows as { column_name: string; data_type: string }[]).map(
        (r) => [r.column_name, r.data_type] as [string, string],
      ),
    );
  }

  it("has a 'key' column of type text", async () => {
    const cols = await fetchColumns();
    expect(cols.get("key")).toBe("text");
  });

  it("has a 'hits' column of type integer", async () => {
    const cols = await fetchColumns();
    expect(cols.get("hits")).toBe("integer");
  });

  it("has an 'expires_at' column of type timestamp with time zone", async () => {
    const cols = await fetchColumns();
    expect(cols.get("expires_at")).toBe("timestamp with time zone");
  });

  it("has exactly the expected columns (no extras, none missing)", async () => {
    const cols = await fetchColumns();
    expect([...cols.keys()].sort()).toEqual(["expires_at", "hits", "key"]);
  });
});

// ─── Primary key ──────────────────────────────────────────────────────────────

describeDb("rate_limits table — primary key", () => {
  it("'key' is the primary key column", async () => {
    // The ON CONFLICT target used in PostgresRateLimitStore.increment() is
    // rateLimitsTable.key. If 'key' loses its PK constraint, the upsert throws
    // at runtime but passes all type-checks and startup guards.
    const result = await db.execute(sql`
      SELECT kcu.column_name
      FROM information_schema.table_constraints  tc
      JOIN information_schema.key_column_usage   kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema    = tc.table_schema
       AND kcu.table_name      = tc.table_name
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema    = 'public'
        AND tc.table_name      = 'rate_limits'
    `);

    const pkColumns = (result.rows as { column_name: string }[]).map(
      (r) => r.column_name,
    );
    expect(pkColumns).toEqual(["key"]);
  });
});

// ─── Index ────────────────────────────────────────────────────────────────────

describeDb("rate_limits table — index", () => {
  it("the housekeeping index rate_limits_expires_at_idx exists on expires_at", async () => {
    // PostgresRateLimitStore runs periodic DELETE … WHERE expires_at <= now().
    // Without an index on expires_at this becomes a full-table scan. The index
    // being absent doesn't break correctness, but it will degrade under load.
    // Catching it here means a missing migration is surfaced in CI.
    const result = await db.execute(sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename  = 'rate_limits'
        AND indexname  = 'rate_limits_expires_at_idx'
    `);

    expect(result.rows.length).toBe(1);
    const row = result.rows[0] as { indexname: string; indexdef: string };
    // The definition must reference the expires_at column.
    expect(row.indexdef.toLowerCase()).toContain("expires_at");
  });
});
