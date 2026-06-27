/**
 * Unit tests for runReviewerPassCheck (src/lib/reviewer-check.ts).
 *
 * These tests mock @workspace/db at the query level so the actual
 * healing/upsert logic is exercised and any DB-write regressions are caught.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// ---------------------------------------------------------------------------
// DB mock — chained query builder at select / update / insert granularity
// ---------------------------------------------------------------------------

const dbSelectImpl = vi.fn();
const dbUpdateSet = vi.fn();
const dbUpdateWhere = vi.fn(async () => undefined);
const dbInsertValues = vi.fn();
const dbInsertOnConflictDoUpdate = vi.fn(async () => undefined);

vi.mock("@workspace/db", () => {
  const appConfigTable = { key: "key" };
  const usersTable = {
    id: "id",
    hasPass: "hasPass",
    passPurchasedAt: "passPurchasedAt",
    updatedAt: "updatedAt",
  };

  return {
    appConfigTable,
    usersTable,
    db: {
      select: (_projection?: unknown) => ({
        from: (_table: unknown) => ({
          where: (_cond: unknown) => dbSelectImpl(),
        }),
      }),
      update: (_table: unknown) => ({
        set: (payload: unknown) => {
          dbUpdateSet(payload);
          return {
            where: (cond: unknown) => dbUpdateWhere(cond),
          };
        },
      }),
      insert: (_table: unknown) => ({
        values: (payload: unknown) => {
          dbInsertValues(payload);
          return {
            onConflictDoUpdate: (opts: unknown) =>
              dbInsertOnConflictDoUpdate(opts),
          };
        },
      }),
    },
  };
});

// Suppress logger output in tests
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Prevent sendAlert from making real HTTP calls
vi.stubGlobal(
  "fetch",
  vi.fn(async () => ({ ok: true, text: async () => "" })),
);

import { runReviewerPassCheck } from "../src/lib/reviewer-check";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set up dbSelectImpl to return sequential results per call.
 *   call 1 → appConfigTable row for reviewer_demo_user_id
 *   call 2 → usersTable row for the demo user
 */
function setupDbSelects(configRow: unknown[], userRow: unknown[]): void {
  dbSelectImpl.mockResolvedValueOnce(configRow).mockResolvedValueOnce(userRow);
}

const ORIGINAL_DEMO_USER_ID = process.env.REVIEWER_DEMO_USER_ID;
const DEMO_USER_ID = "user_demo_test_123";

beforeEach(() => {
  vi.clearAllMocks();
  // Pin the demo user ID via env so getConfig() returning [] still resolves it
  process.env.REVIEWER_DEMO_USER_ID = DEMO_USER_ID;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runReviewerPassCheck", () => {
  describe("healthy account (hasPass = true)", () => {
    it("returns { ok: true, healed: false } and makes no DB writes", async () => {
      setupDbSelects(
        [], // appConfigTable → no DB override; env REVIEWER_DEMO_USER_ID is used
        [{ hasPass: true }],
      );

      const result = await runReviewerPassCheck();

      expect(result.ok).toBe(true);
      expect(result.healed).toBe(false);
      expect(result.demoUserId).toBe(DEMO_USER_ID);
      expect(result.reason).toBeUndefined();
      expect(result.timestamp).toBeTruthy();

      // No writes should occur for a healthy account
      expect(dbUpdateSet).not.toHaveBeenCalled();
      expect(dbInsertValues).not.toHaveBeenCalled();
    });
  });

  describe("revoked pass (hasPass = false)", () => {
    it("returns { ok: false, healed: true, reason: 'pass_revoked' } and updates the DB row", async () => {
      setupDbSelects([], [{ hasPass: false }]);

      const result = await runReviewerPassCheck();

      expect(result.ok).toBe(false);
      expect(result.healed).toBe(true);
      expect(result.reason).toBe("pass_revoked");
      expect(result.demoUserId).toBe(DEMO_USER_ID);

      // DB update must set hasPass to true (the actual set payload contains
      // drizzle sql expressions for other fields — we only verify hasPass)
      expect(dbUpdateSet).toHaveBeenCalledTimes(1);
      const setPayload = dbUpdateSet.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(setPayload.hasPass).toBe(true);

      // where() must have been called to scope the update to the right user
      expect(dbUpdateWhere).toHaveBeenCalledTimes(1);

      // No insert should occur — only an update
      expect(dbInsertValues).not.toHaveBeenCalled();
    });
  });

  describe("missing demo account (user row not found)", () => {
    it("returns { ok: false, healed: true, reason: 'user_missing' } and upserts the user row", async () => {
      setupDbSelects(
        [], // no app_config row
        [], // no user row → user is missing
      );

      const result = await runReviewerPassCheck();

      expect(result.ok).toBe(false);
      expect(result.healed).toBe(true);
      expect(result.reason).toBe("user_missing");
      expect(result.demoUserId).toBe(DEMO_USER_ID);

      // An insert (upsert) must have been performed with hasPass: true
      expect(dbInsertValues).toHaveBeenCalledTimes(1);
      const insertPayload = dbInsertValues.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(insertPayload.id).toBe(DEMO_USER_ID);
      expect(insertPayload.hasPass).toBe(true);

      // onConflictDoUpdate must also be called (this is the "upsert" path)
      expect(dbInsertOnConflictDoUpdate).toHaveBeenCalledTimes(1);

      // No plain update should occur
      expect(dbUpdateSet).not.toHaveBeenCalled();
    });
  });

  describe("demo user ID resolution priority", () => {
    it("uses the DB app_config value over the env var when both are set", async () => {
      const DB_CONFIGURED_ID = "user_from_db_config";
      // First select returns the DB-configured demo user ID
      dbSelectImpl
        .mockResolvedValueOnce([{ value: DB_CONFIGURED_ID }])
        .mockResolvedValueOnce([{ hasPass: true }]);

      const result = await runReviewerPassCheck();

      expect(result.ok).toBe(true);
      expect(result.demoUserId).toBe(DB_CONFIGURED_ID);
    });

    afterAll(() => {
      if (ORIGINAL_DEMO_USER_ID === undefined)
        delete process.env.REVIEWER_DEMO_USER_ID;
      else process.env.REVIEWER_DEMO_USER_ID = ORIGINAL_DEMO_USER_ID;
    });
  });

  describe("alert side effects", () => {
    it("calls fetch (sendAlert) when the pass is revoked", async () => {
      setupDbSelects([], [{ hasPass: false }]);
      // Set an alert channel so sendAlert fires
      const ORIGINAL = process.env.ALERT_SLACK_WEBHOOK_URL;
      process.env.ALERT_SLACK_WEBHOOK_URL =
        "https://hooks.slack.com/test-webhook";

      await runReviewerPassCheck();

      expect(fetch).toHaveBeenCalled();

      if (ORIGINAL === undefined) delete process.env.ALERT_SLACK_WEBHOOK_URL;
      else process.env.ALERT_SLACK_WEBHOOK_URL = ORIGINAL;
    });

    it("does NOT call fetch when the pass is healthy", async () => {
      setupDbSelects([], [{ hasPass: true }]);

      await runReviewerPassCheck();

      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
