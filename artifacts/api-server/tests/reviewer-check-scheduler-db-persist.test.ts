/**
 * Integration tests for the DB-persist failure path in the reviewer-check
 * scheduler (src/lib/reviewer-check-scheduler.ts).
 *
 * These tests exercise the real runReviewerPassCheck → record() → setConfig
 * code path with DB write operations mocked to reject *only* for the
 * appConfigTable (what setConfig writes to). Writes to usersTable (pass
 * healing) are allowed to succeed so the function reaches record() and
 * exercises the setConfig error-handling path.
 *
 * This proves that:
 *   1. setConfig's own try/catch swallows the DB error and emits logger.warn.
 *   2. runScheduledCheck does not throw — it still returns the check result.
 *   3. startReviewerCheckScheduler is not stalled; subsequent interval ticks
 *      fire as normal even when every setConfig write fails.
 *
 * Contrast with reviewer-check-scheduler.test.ts which uses injected _runCheck
 * mocks to exercise scheduler-level branching (cooldown, alert dispatch, etc.)
 * independently of the DB layer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// DB mock
//
// Reads always succeed (dbSelectImpl is configured per-test).
// Writes are split by table:
//   appConfigTable writes → reject (simulating a DB outage during setConfig)
//   usersTable writes     → resolve (pass-healing must succeed so we reach record())
// ---------------------------------------------------------------------------

const dbSelectImpl = vi.fn();
const dbUpdateUsersImpl = vi.fn(async () => []);
const dbInsertUsersImpl = vi.fn(async () => []);

vi.mock("@workspace/db", () => {
  const appConfigTable = { key: "key" };
  const usersTable = { id: "id" };

  return {
    appConfigTable,
    usersTable,
    db: {
      select: () => ({ from: () => ({ where: () => dbSelectImpl() }) }),

      // insert: appConfigTable (setConfig) → reject; usersTable (healing) → resolve
      insert: (table: unknown) => ({
        values: () => ({
          onConflictDoUpdate: () =>
            table === appConfigTable
              ? Promise.reject(new Error("DB write failed: connection refused"))
              : dbInsertUsersImpl(),
        }),
      }),

      // delete: only called by setConfig (appConfigTable) with value=null → reject
      delete: () => ({
        where: () =>
          Promise.reject(new Error("DB write failed: connection refused")),
      }),

      // update: only called for pass healing (usersTable) → resolve
      update: () => ({
        set: () => ({
          where: () => dbUpdateUsersImpl(),
        }),
      }),
    },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  sql: () => ({}),
  inArray: () => ({}),
}));

// Capture logger calls so we can assert on warn messages
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Suppress alert dispatch; individual tests inject _dispatch when needed
vi.mock("../src/lib/alert", () => ({
  dispatchAlert: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports — after mocks are registered
// ---------------------------------------------------------------------------

import {
  runScheduledCheck,
  startReviewerCheckScheduler,
  resetSchedulerState,
} from "../src/lib/reviewer-check-scheduler";
import { logger } from "../src/lib/logger";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEMO_USER_ID = "user_demo_123";
const ORIGINAL_DEMO_USER_ID = process.env.REVIEWER_DEMO_USER_ID;

/** Two select calls for a passing check (getConfig + user row with hasPass=true). */
function setupPassingSelects() {
  dbSelectImpl
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ id: DEMO_USER_ID, hasPass: true }]);
}

/** Two select calls for a revoked-pass check (getConfig + user row with hasPass=false). */
function setupRevokedSelects() {
  dbSelectImpl
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ id: DEMO_USER_ID, hasPass: false }]);
}

/** Two select calls for a missing-user check (getConfig + no user row). */
function setupMissingUserSelects() {
  dbSelectImpl.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
}

/** All logger.warn calls that match the setConfig persist-failure message. */
function persistWarnCalls(): Array<unknown[]> {
  return (logger.warn as ReturnType<typeof vi.fn>).mock.calls.filter(
    ([, msg]) =>
      msg === "Failed to persist reviewer check status to app_config",
  );
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  resetSchedulerState();
  process.env.REVIEWER_DEMO_USER_ID = DEMO_USER_ID;
  setupPassingSelects();
});

afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL_DEMO_USER_ID === undefined) {
    delete process.env.REVIEWER_DEMO_USER_ID;
  } else {
    process.env.REVIEWER_DEMO_USER_ID = ORIGINAL_DEMO_USER_ID;
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DB-persist failure (real runReviewerPassCheck, appConfigTable writes reject)", () => {
  describe("runScheduledCheck", () => {
    it("does not throw and returns the check result when setConfig writes fail on a passing check", async () => {
      // No _runCheck injection — uses the real runReviewerPassCheck
      const result = await runScheduledCheck({
        _dispatch: vi.fn().mockResolvedValue(undefined),
      });

      // setConfig errors are swallowed inside setConfig's own try/catch;
      // the check result still comes back correctly.
      expect(result).not.toBeNull();
      expect(result?.ok).toBe(true);
      expect(result?.demoUserId).toBe(DEMO_USER_ID);
    });

    it("emits a logger.warn for each setConfig write failure on a passing check", async () => {
      await runScheduledCheck({
        _dispatch: vi.fn().mockResolvedValue(undefined),
      });

      // A passing check calls setConfig three times inside record():
      //   setConfig(lastRunAt,   timestamp)  → insert on appConfigTable → rejects → warn
      //   setConfig(lastResult,  "ok")        → insert on appConfigTable → rejects → warn
      //   setConfig(lastReason,  null)         → delete on appConfigTable → rejects → warn
      const warns = persistWarnCalls();
      expect(warns.length).toBe(3);
      for (const args of warns) {
        expect(args[0]).toMatchObject({ err: expect.any(Error) });
        expect(args[1]).toBe(
          "Failed to persist reviewer check status to app_config",
        );
      }
    });

    it("still dispatches a fail alert and emits persist warns when pass is revoked and DB persist fails", async () => {
      // User row with hasPass=false — healing update on usersTable succeeds,
      // but record()'s setConfig writes on appConfigTable all reject.
      dbSelectImpl.mockReset();
      setupRevokedSelects();

      const dispatch = vi.fn().mockResolvedValue(undefined);
      const result = await runScheduledCheck({ _dispatch: dispatch });

      // runReviewerPassCheck returns the real revoked-pass result
      expect(result?.ok).toBe(false);
      expect(result?.reason).toBe("pass_revoked");

      // Scheduler still dispatches the fail alert (separate from DB persist)
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.mock.calls[0][0].subject).toContain("failed");

      // setConfig called 3 times for record() → 3 persist warnings
      expect(persistWarnCalls().length).toBe(3);
    });

    it("still dispatches a fail alert and emits persist warns when user is missing and DB persist fails", async () => {
      // User row absent — user-row upsert on usersTable succeeds (healing),
      // but record()'s setConfig writes on appConfigTable all reject.
      dbSelectImpl.mockReset();
      setupMissingUserSelects();

      const dispatch = vi.fn().mockResolvedValue(undefined);
      const result = await runScheduledCheck({ _dispatch: dispatch });

      expect(result?.ok).toBe(false);
      expect(result?.reason).toBe("user_missing");

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.mock.calls[0][0].subject).toContain("failed");

      // 3 setConfig calls in record() → 3 persist warnings
      expect(persistWarnCalls().length).toBe(3);
    });

    it("clears the crash cooldown after a passing check so the next failure immediately re-alerts (real runReviewerPassCheck)", async () => {
      vi.useFakeTimers();

      const dispatch = vi.fn().mockResolvedValue(undefined);
      const cooldownMs = 60_000;

      // runReviewerPassCheck makes two dbSelectImpl calls per tick:
      //   call N+0: getConfig("reviewer_demo_user_id") — error caught inside
      //             getConfig's own try/catch; returns null → env var used
      //   call N+1: user-row lookup — NO try/catch; a rejection throws from
      //             runReviewerPassCheck itself, triggering the crash path

      dbSelectImpl
        .mockReset()
        // ── Step 1: crash ─────────────────────────────────────────────────
        .mockResolvedValueOnce([]) // getConfig → null (env var used)
        .mockRejectedValueOnce(new Error("DB connection lost")) // user lookup → throws
        // ── Step 2: fail within cooldown (verify suppression) ────────────
        .mockResolvedValueOnce([]) // getConfig
        .mockResolvedValueOnce([{ id: DEMO_USER_ID, hasPass: false }]) // pass revoked
        // ── Step 3: passing check → clears cooldown ───────────────────────
        .mockResolvedValueOnce([]) // getConfig
        .mockResolvedValueOnce([{ id: DEMO_USER_ID, hasPass: true }]) // pass ok
        // ── Step 4: failure immediately after recovery → re-alerts ────────
        .mockResolvedValueOnce([]) // getConfig
        .mockResolvedValueOnce([{ id: DEMO_USER_ID, hasPass: false }]); // pass revoked

      // Step 1: crash — runReviewerPassCheck throws; crash alert dispatched;
      //          cooldown is armed.
      const result1 = await runScheduledCheck({
        cooldownMs,
        _dispatch: dispatch,
      });
      expect(result1).toBeNull();
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.mock.calls[0][0].subject).toContain("crashed");

      // Step 2: advance 5 s (still inside the 60 s cooldown window).
      //          A failing check must be suppressed, confirming the cooldown is active.
      vi.advanceTimersByTime(5_000);
      const result2 = await runScheduledCheck({
        cooldownMs,
        _dispatch: dispatch,
      });
      expect(result2?.ok).toBe(false);
      expect(result2?.reason).toBe("pass_revoked");
      expect(dispatch).toHaveBeenCalledTimes(1); // still suppressed

      // Step 3: passing check within the cooldown window → no alert (passes
      //          never alert), but the cooldown must be cleared.
      const result3 = await runScheduledCheck({
        cooldownMs,
        _dispatch: dispatch,
      });
      expect(result3?.ok).toBe(true);
      expect(dispatch).toHaveBeenCalledTimes(1); // pass never alerts

      // Step 4: immediate failure right after the passing check → fresh alert
      //          fires because the cooldown was cleared by the pass.
      const result4 = await runScheduledCheck({
        cooldownMs,
        _dispatch: dispatch,
      });
      expect(result4?.ok).toBe(false);
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch.mock.calls[1][0].subject).toContain("failed");
      expect(dispatch.mock.calls[1][0].body).toContain("pass_revoked");
    });
  });

  describe("startReviewerCheckScheduler", () => {
    let stopScheduler: (() => void) | null = null;

    beforeEach(() => {
      vi.useFakeTimers();
      stopScheduler = null;
    });

    afterEach(() => {
      stopScheduler?.();
      vi.clearAllTimers();
    });

    it("continues scheduling the next tick even when every setConfig write fails", async () => {
      const intervalMs = 5_000;
      const dispatch = vi.fn().mockResolvedValue(undefined);

      // Three interval ticks → six select calls (2 per tick)
      dbSelectImpl
        .mockReset()
        // tick 1 (boot delay)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: DEMO_USER_ID, hasPass: true }])
        // tick 2 (first interval)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: DEMO_USER_ID, hasPass: true }])
        // tick 3 (second interval)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: DEMO_USER_ID, hasPass: true }]);

      // No _runCheck — uses the real runReviewerPassCheck
      stopScheduler = startReviewerCheckScheduler({
        intervalMs,
        _dispatch: dispatch,
      });

      // Boot delay fires the first run
      await vi.advanceTimersByTimeAsync(30_000);

      // Persist warnings present after the first tick (3 per passing tick)
      expect(persistWarnCalls().length).toBe(3);

      // Advance through two more interval ticks — scheduler must not be stalled
      await vi.advanceTimersByTimeAsync(intervalMs * 2);

      // 3 ticks × 3 persist warns each = 9 total
      expect(persistWarnCalls().length).toBe(9);

      // No alerts (all three ticks returned ok)
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("clears the crash cooldown after a passing tick and re-alerts on the next failure tick driven by the interval timer", async () => {
      const intervalMs = 5_000;
      const cooldownMs = 60_000;
      const dispatch = vi.fn().mockResolvedValue(undefined);

      // Sequence of dbSelectImpl calls across three ticks:
      //   Tick 1 (boot delay – crash): getConfig → [], user lookup → rejects (throws)
      //   Tick 2 (first interval – pass): getConfig → [], user → hasPass:true
      //   Tick 3 (second interval – fail): getConfig → [], user → hasPass:false
      dbSelectImpl
        .mockReset()
        // Tick 1: crash
        .mockResolvedValueOnce([]) // getConfig
        .mockRejectedValueOnce(new Error("DB connection lost")) // user lookup → throws
        // Tick 2: pass (clears cooldown)
        .mockResolvedValueOnce([]) // getConfig
        .mockResolvedValueOnce([{ id: DEMO_USER_ID, hasPass: true }]) // user ok
        // Tick 3: fail (should re-alert since cooldown was cleared by the pass)
        .mockResolvedValueOnce([]) // getConfig
        .mockResolvedValueOnce([{ id: DEMO_USER_ID, hasPass: false }]); // pass revoked

      stopScheduler = startReviewerCheckScheduler({
        intervalMs,
        cooldownMs,
        _dispatch: dispatch,
      });

      // Tick 1: boot delay fires — runReviewerPassCheck throws → crash alert
      // dispatched; cooldown is armed.
      await vi.advanceTimersByTimeAsync(30_000);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.mock.calls[0][0].subject).toContain("crashed");

      // Tick 2: first interval — passing check; cooldown is cleared; no alert.
      await vi.advanceTimersByTimeAsync(intervalMs);
      expect(dispatch).toHaveBeenCalledTimes(1); // a pass never alerts

      // Tick 3: second interval — failure immediately after recovery; cooldown
      // was cleared by the passing tick → fresh alert fires without waiting.
      await vi.advanceTimersByTimeAsync(intervalMs);
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch.mock.calls[1][0].subject).toContain("failed");
      expect(dispatch.mock.calls[1][0].body).toContain("pass_revoked");
    });

    it("dispatches a fail alert and continues scheduling when pass is revoked and DB persist fails", async () => {
      const intervalMs = 5_000;
      const dispatch = vi.fn().mockResolvedValue(undefined);

      // Tick 1: pass revoked → fail alert fires; tick 2: still revoked → cooldown suppresses
      dbSelectImpl
        .mockReset()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: DEMO_USER_ID, hasPass: false }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: DEMO_USER_ID, hasPass: false }]);

      stopScheduler = startReviewerCheckScheduler({
        intervalMs,
        cooldownMs: 60_000,
        _dispatch: dispatch,
      });

      // Boot delay — tick 1: revoked-pass check; alert fires
      await vi.advanceTimersByTimeAsync(30_000);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.mock.calls[0][0].subject).toContain("failed");

      // Persist warns still emitted despite alert firing
      expect(persistWarnCalls().length).toBeGreaterThan(0);

      // Tick 2 within cooldown — alert suppressed but scheduler alive
      await vi.advanceTimersByTimeAsync(intervalMs);
      expect(dispatch).toHaveBeenCalledTimes(1); // not re-alerted
      // Persist warns increased (second tick also ran)
      expect(persistWarnCalls().length).toBeGreaterThan(3);
    });
  });
});
