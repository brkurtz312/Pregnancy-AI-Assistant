/**
 * Schema-existence test for `funnel_events`, against a real Postgres.
 *
 * The route tests mock the database, so they would pass happily against a
 * database where `pnpm --filter @workspace/db run push` was never run. This
 * asserts the table and its columns are really there — and that no column
 * capable of holding an identity (user id, email, device id, IP) has crept in.
 *
 * Skips without DATABASE_URL, like the other schema suites.
 */

import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const describeDb = describe.skipIf(!process.env.DATABASE_URL);

describeDb("funnel_events table", () => {
  async function fetchColumns(): Promise<Map<string, string>> {
    const result = await db.execute(sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'funnel_events'
    `);
    return new Map(
      (result.rows as { column_name: string; data_type: string }[]).map(
        (r) => [r.column_name, r.data_type] as [string, string],
      ),
    );
  }

  it("has exactly the expected columns and types", async () => {
    const cols = await fetchColumns();
    expect(Object.fromEntries(cols)).toEqual({
      id: "integer",
      event: "text",
      source: "text",
      signed_in: "boolean",
      platform: "text",
      app_version: "text",
      error_code: "text",
      created_at: "timestamp with time zone",
    });
  });

  it("has the created_at index the report's date filters use", async () => {
    const result = await db.execute(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename  = 'funnel_events'
        AND indexname  = 'funnel_events_created_at_idx'
    `);
    expect(result.rows.length).toBe(1);
  });
});
