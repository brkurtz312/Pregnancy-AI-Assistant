import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// This suite runs against a real Postgres connection. Without DATABASE_URL
// there is nothing to run against, so it skips instead of failing the whole
// api-server run — the integration coverage is still there for anyone who sets
// DATABASE_URL and re-runs.
const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeDb = describe.skipIf(!hasDatabase);

describeDb("account_deletion_requests table", () => {
  it("exists with the durable tombstone columns used by the retry worker", async () => {
    const result = await db.execute(sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'account_deletion_requests'
    `);
    const columns = new Map(
      (
        result.rows as {
          column_name: string;
          data_type: string;
        }[]
      ).map((row) => [row.column_name, row.data_type]),
    );

    expect(Object.fromEntries(columns)).toMatchObject({
      user_id: "text",
      status: "text",
      attempt_count: "integer",
      next_attempt_at: "timestamp with time zone",
      last_attempt_at: "timestamp with time zone",
      clerk_deleted_at: "timestamp with time zone",
      completed_at: "timestamp with time zone",
    });
  });

  it("has the retry lookup index used to find due deletion jobs", async () => {
    const result = await db.execute(sql`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'account_deletion_requests'
        AND indexname = 'account_deletion_requests_retry_idx'
    `);

    expect(result.rows).toHaveLength(1);
    expect(
      (result.rows[0] as { indexdef: string }).indexdef.toLowerCase(),
    ).toContain("next_attempt_at");
  });

  it("cascades every user-owned table so an in-flight write cannot survive deletion", async () => {
    const result = await db.execute(sql`
      SELECT conrelid::regclass::text AS table_name, confdeltype
      FROM pg_constraint
      WHERE contype = 'f'
        AND confrelid = 'public.users'::regclass
    `);
    const cascadedTables = new Set(
      (
        result.rows as {
          table_name: string;
          confdeltype: string;
        }[]
      )
        .filter((row) => row.confdeltype === "c")
        .map((row) => row.table_name.replace("public.", "")),
    );

    expect([...cascadedTables]).toEqual(
      expect.arrayContaining([
        "ai_usage",
        "birth_plan_answers",
        "contraction_logs",
        "hospital_bag_state",
        "journal_entries",
        "kick_sessions",
        "prenatal_visits",
        "scribe_idempotency_keys",
        "support_contacts",
        "symptom_logs",
        "user_profiles",
      ]),
    );
  });
});
