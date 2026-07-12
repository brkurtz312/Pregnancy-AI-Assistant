/**
 * Unit tests for runReviewerPassCheck (src/lib/reviewer-check.ts).
 *
 * The check looks up the demo user ID from DB config (preferred) or an env
 * var, then reads the user row's hasPass flag. A revoked or missing pass is
 * healed with a DB write and reported back so callers can alert.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// DB mock
//
// Two db.select() calls are made per run:
//   call 1 — getConfig("reviewer_demo_user_id")   → app_config row or []
//   call 2 — user row lookup                       → users row or []
//
// db.update().set().where() is called when hasPass=false (heal).
// db.insert().values().onConflictDoUpdate() is called when row is missing.
// ---------------------------------------------------------------------------

const dbSelectImpl = vi.fn();
const dbUpdateImpl = vi.fn(async () => []);
const dbInsertImpl = vi.fn(async () => []);

vi.mock("@workspace/db", () => {
  return {
    appConfigTable: { key: "key" },
    usersTable: { id: "id" },
    db: {
      select: () => ({
        from: () => ({
          where: () => dbSelectImpl(),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => dbUpdateImpl(),
        }),
      }),
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => dbInsertImpl(),
        }),
      }),
    },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  sql: () => ({}),
}));

// Suppress logger output in tests
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { runReviewerPassCheck, getReviewerCheckStatus } from "../src/lib/reviewer-check";

// ---------------------------------------------------------------------------
// Env snapshot helpers
// ---------------------------------------------------------------------------

const ORIGINAL_DEMO_USER_ID = process.env.REVIEWER_DEMO_USER_ID;

const DEMO_USER_ID = "user_demo_123";

function setupHappyPath() {
  // call 1: getConfig returns null (no DB row for reviewer_demo_user_id)
  // call 2: user row found with hasPass=true
  dbSelectImpl
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ id: DEMO_USER_ID, hasPass: true }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.REVIEWER_DEMO_USER_ID = DEMO_USER_ID;
  setupHappyPath();
});

afterEach(() => {
  if (ORIGINAL_DEMO_USER_ID === undefined) delete process.env.REVIEWER_DEMO_USER_ID;
  else process.env.REVIEWER_DEMO_USER_ID = ORIGINAL_DEMO_USER_ID;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runReviewerPassCheck", () => {
  describe("demo user ID resolution", () => {
    it("uses the env var when no DB config row exists", async () => {
      // Default beforeEach: DB returns no config row, env var is set
      const result = await runReviewerPassCheck();

      expect(result.ok).toBe(true);
      expect(result.demoUserId).toBe(DEMO_USER_ID);
      expect(result.healed).toBe(false);
    });

    it("prefers the demo user ID from app_config DB over the env var", async () => {
      const dbUserId = "user_from_db_config";
      // call 1: DB config has reviewer_demo_user_id
      // call 2: user row found with hasPass=true
      dbSelectImpl
        .mockReset()
        .mockResolvedValueOnce([{ value: dbUserId }])
        .mockResolvedValueOnce([{ id: dbUserId, hasPass: true }]);
      process.env.REVIEWER_DEMO_USER_ID = "user_from_env_should_not_be_used";

      const result = await runReviewerPassCheck();

      expect(result.ok).toBe(true);
      expect(result.demoUserId).toBe(dbUserId);
    });

    it("returns ok=false with reason='no_demo_user_id' when neither DB nor env provides an ID", async () => {
      dbSelectImpl.mockReset().mockResolvedValueOnce([]); // no DB config row
      delete process.env.REVIEWER_DEMO_USER_ID;

      const result = await runReviewerPassCheck();

      expect(result.ok).toBe(false);
      expect(result.reason).toBe("no_demo_user_id");
      expect(result.demoUserId).toBeNull();
      expect(result.healed).toBe(false);
      // Should not reach user row lookup
      expect(dbSelectImpl).toHaveBeenCalledTimes(1);
    });

    it("falls back to env var when the DB select throws", async () => {
      // DB throws during getConfig — should gracefully fall back to env var
      dbSelectImpl
        .mockReset()
        .mockRejectedValueOnce(new Error("DB connection lost"))
        .mockResolvedValueOnce([{ id: DEMO_USER_ID, hasPass: true }]);

      const result = await runReviewerPassCheck();

      expect(result.ok).toBe(true);
      expect(result.demoUserId).toBe(DEMO_USER_ID);
    });
  });

  describe("pass is present (hasPass = true)", () => {
    it("returns { ok: true, healed: false } and performs no DB writes", async () => {
      const result = await runReviewerPassCheck();

      expect(result.ok).toBe(true);
      expect(result.healed).toBe(false);
      expect(result.demoUserId).toBe(DEMO_USER_ID);
      expect(result.reason).toBeUndefined();
      expect(result.timestamp).toBeTruthy();

      expect(dbUpdateImpl).not.toHaveBeenCalled();
      expect(dbInsertImpl).not.toHaveBeenCalled();
    });
  });

  describe("pass is revoked (hasPass = false)", () => {
    it("calls db.update with { hasPass: true } and returns { ok: false, healed: true, reason: 'pass_revoked' }", async () => {
      dbSelectImpl
        .mockReset()
        .mockResolvedValueOnce([]) // getConfig → no DB row for user ID
        .mockResolvedValueOnce([{ id: DEMO_USER_ID, hasPass: false }]); // user exists but hasPass=false

      const result = await runReviewerPassCheck();

      expect(result.ok).toBe(false);
      expect(result.healed).toBe(true);
      expect(result.reason).toBe("pass_revoked");
      expect(result.demoUserId).toBe(DEMO_USER_ID);

      // DB update must have been called to heal the pass
      expect(dbUpdateImpl).toHaveBeenCalledTimes(1);
      expect(dbInsertImpl).not.toHaveBeenCalled();
    });
  });

  describe("user row is missing", () => {
    it("calls db.insert (upsert) and returns { ok: false, healed: true, reason: 'user_missing' }", async () => {
      dbSelectImpl
        .mockReset()
        .mockResolvedValueOnce([]) // getConfig → no DB row for user ID
        .mockResolvedValueOnce([]); // user lookup → no row

      const result = await runReviewerPassCheck();

      expect(result.ok).toBe(false);
      expect(result.healed).toBe(true);
      expect(result.reason).toBe("user_missing");
      expect(result.demoUserId).toBe(DEMO_USER_ID);

      // DB insert (upsert) must have been called
      expect(dbInsertImpl).toHaveBeenCalledTimes(1);
      expect(dbUpdateImpl).not.toHaveBeenCalled();
    });
  });

  describe("getReviewerCheckStatus state recording", () => {
    it("records lastResult='ok' and lastRunAt after a passing check", async () => {
      await runReviewerPassCheck();

      const status = getReviewerCheckStatus();
      expect(status.lastResult).toBe("ok");
      expect(status.lastReason).toBeNull();
      expect(status.lastRunAt).toBeTruthy();
    });

    it("records lastResult='fail' and the reason after a revoked-pass check", async () => {
      dbSelectImpl
        .mockReset()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: DEMO_USER_ID, hasPass: false }]);

      await runReviewerPassCheck();

      const status = getReviewerCheckStatus();
      expect(status.lastResult).toBe("fail");
      expect(status.lastReason).toBe("pass_revoked");
      expect(status.lastRunAt).toBeTruthy();
    });

    it("records lastResult='fail' and reason='user_missing' when the user row is absent", async () => {
      dbSelectImpl
        .mockReset()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await runReviewerPassCheck();

      const status = getReviewerCheckStatus();
      expect(status.lastResult).toBe("fail");
      expect(status.lastReason).toBe("user_missing");
    });
  });
});
