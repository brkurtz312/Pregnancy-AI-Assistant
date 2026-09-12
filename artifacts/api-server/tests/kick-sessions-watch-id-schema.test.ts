/**
 * Real-Postgres schema + idempotency tests for kick_sessions.watch_session_id.
 *
 * The mocked route test (kick-session-idempotency.test.ts) proves the route
 * logic; this suite proves the DATABASE actually enforces it — running against
 * the real DATABASE_URL (same convention as rate-limits-table-schema.test.ts):
 *
 *   1. The `watch_session_id` column exists (a missing column would make every
 *      Watch kick save fail at runtime with a missing-column error).
 *   2. The partial unique index `kick_sessions_user_watch_session_uniq` exists
 *      with the expected predicate — without it, ON CONFLICT DO NOTHING never
 *      fires and duplicates are silently inserted.
 *   3. A live duplicate insert with the same (user_id, watch_session_id) is
 *      suppressed by ON CONFLICT — exactly the Watch force-quit retry path —
 *      while rows with NULL watch_session_id are unconstrained.
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { db, kickSessionsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const TEST_USER = `test_watch_idem_${Date.now()}`;

// This suite runs against a real Postgres connection. Without DATABASE_URL
// there is nothing to run against, so it skips instead of failing the whole
// api-server run — the integration coverage is still there for anyone who sets
// DATABASE_URL and re-runs.
const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeDb = describe.skipIf(!hasDatabase);

beforeAll(async () => {
  if (!hasDatabase) return;
  await db.insert(usersTable).values({ id: TEST_USER }).onConflictDoNothing();
});

afterAll(async () => {
  if (!hasDatabase) return;
  await db
    .delete(kickSessionsTable)
    .where(eq(kickSessionsTable.userId, TEST_USER));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER));
});

describeDb("kick_sessions.watch_session_id — schema", () => {
  it("the watch_session_id column exists with type text", async () => {
    const result = await db.execute(sql`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'kick_sessions'
        AND column_name  = 'watch_session_id'
    `);
    const rows = result.rows ?? result;
    expect(rows.length).toBe(1);
    expect((rows[0] as { data_type: string }).data_type).toBe("text");
  });

  it("the partial unique index on (user_id, watch_session_id) exists", async () => {
    const result = await db.execute(sql`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename  = 'kick_sessions'
        AND indexname  = 'kick_sessions_user_watch_session_uniq'
    `);
    const rows = result.rows ?? result;
    expect(rows.length).toBe(1);
    const def = (rows[0] as { indexdef: string }).indexdef;
    expect(def).toContain("UNIQUE");
    expect(def).toContain("user_id");
    expect(def).toContain("watch_session_id");
    expect(def).toMatch(/WHERE.*watch_session_id IS NOT NULL/i);
  });
});

describeDb("kick_sessions.watch_session_id — live idempotency", () => {
  it("a duplicate (user_id, watch_session_id) insert is suppressed by ON CONFLICT DO NOTHING", async () => {
    const watchSessionId = "2026-08-11T10:00:00.000Z";
    const values = {
      userId: TEST_USER,
      startedAt: new Date("2026-08-11T10:00:00.000Z"),
      endedAt: new Date("2026-08-11T10:20:00.000Z"),
      kickCount: 10,
      watchSessionId,
    };

    const [first] = await db
      .insert(kickSessionsTable)
      .values(values)
      .onConflictDoNothing()
      .returning();
    expect(first).toBeDefined();

    // Simulated Watch retry after force-quit + relaunch.
    const [second] = await db
      .insert(kickSessionsTable)
      .values(values)
      .onConflictDoNothing()
      .returning();
    expect(second).toBeUndefined();

    const rows = await db
      .select()
      .from(kickSessionsTable)
      .where(eq(kickSessionsTable.userId, TEST_USER));
    expect(rows.filter((r) => r.watchSessionId === watchSessionId).length).toBe(
      1,
    );
  });

  it("rows with NULL watch_session_id (manual sessions) are not constrained", async () => {
    const values = {
      userId: TEST_USER,
      startedAt: new Date("2026-08-11T08:00:00.000Z"),
      kickCount: 3,
      watchSessionId: null,
    };
    const [a] = await db
      .insert(kickSessionsTable)
      .values(values)
      .onConflictDoNothing()
      .returning();
    const [b] = await db
      .insert(kickSessionsTable)
      .values(values)
      .onConflictDoNothing()
      .returning();
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(b.id).not.toBe(a.id);
  });
});
