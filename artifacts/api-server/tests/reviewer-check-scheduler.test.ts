/**
 * Unit tests for the reviewer pass check background scheduler
 * (src/lib/reviewer-check-scheduler.ts).
 *
 * Coverage:
 *   1. Interval — check is invoked at the configured interval
 *   2. Alert dispatch — a `fail` result triggers alert dispatch
 *   3. Cooldown — consecutive failures do not re-alert within the cooldown window
 *   4. Crash handling — an exception in runReviewerPassCheck also triggers an alert
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ReviewerCheckResult } from "../src/lib/reviewer-check";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Suppress logger noise from the scheduler module
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock @workspace/db so the alert module's DB reads don't need a real DB
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    }),
  },
  appConfigTable: { key: "key" },
}));

vi.mock("drizzle-orm", () => ({
  inArray: () => ({}),
}));

// The reviewer-check module is mocked so the scheduler never hits the DB
const mockRunReviewerPassCheck = vi.fn<[], Promise<ReviewerCheckResult>>();
vi.mock("../src/lib/reviewer-check", () => ({
  runReviewerPassCheck: () => mockRunReviewerPassCheck(),
}));

// The alert module is mocked so we can assert dispatch calls
const mockDispatchAlert = vi.fn<
  [{ subject: string; body: string }],
  Promise<void>
>();
vi.mock("../src/lib/alert", () => ({
  dispatchAlert: (payload: { subject: string; body: string }) =>
    mockDispatchAlert(payload),
}));

// Import after mocks are registered
import {
  runScheduledCheck,
  startReviewerCheckScheduler,
  resetSchedulerState,
  DEFAULT_INTERVAL_MS,
  DEFAULT_COOLDOWN_MS,
} from "../src/lib/reviewer-check-scheduler";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okResult(
  overrides?: Partial<ReviewerCheckResult>,
): ReviewerCheckResult {
  return {
    ok: true,
    demoUserId: "user_demo_123",
    healed: false,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function failResult(
  reason: ReviewerCheckResult["reason"],
  overrides?: Partial<ReviewerCheckResult>,
): ReviewerCheckResult {
  return {
    ok: false,
    demoUserId: "user_demo_123",
    healed: true,
    timestamp: new Date().toISOString(),
    reason,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Reset module-level cooldown state between tests
  resetSchedulerState();
  // Default: alert dispatch resolves immediately
  mockDispatchAlert.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// 1. runScheduledCheck — behavioural unit tests (no timers needed)
//    These use injected _runCheck / _dispatch so results are deterministic.
// ---------------------------------------------------------------------------

describe("runScheduledCheck", () => {
  describe("when the check passes", () => {
    it("returns the check result without dispatching an alert", async () => {
      const dispatch = vi.fn().mockResolvedValue(undefined);
      const check = vi.fn().mockResolvedValue(okResult());

      const result = await runScheduledCheck({
        _runCheck: check,
        _dispatch: dispatch,
      });

      expect(result?.ok).toBe(true);
      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  describe("when the check fails", () => {
    it("dispatches an alert for a 'pass_revoked' failure", async () => {
      const dispatch = vi.fn().mockResolvedValue(undefined);
      const check = vi.fn().mockResolvedValue(failResult("pass_revoked"));

      const result = await runScheduledCheck({
        _runCheck: check,
        _dispatch: dispatch,
      });

      expect(result?.ok).toBe(false);
      expect(result?.reason).toBe("pass_revoked");
      expect(dispatch).toHaveBeenCalledTimes(1);
      const payload = dispatch.mock.calls[0][0];
      expect(payload.subject).toContain("failed");
      expect(payload.body).toContain("pass_revoked");
    });

    it("dispatches an alert for a 'user_missing' failure", async () => {
      const dispatch = vi.fn().mockResolvedValue(undefined);
      const check = vi.fn().mockResolvedValue(failResult("user_missing"));

      await runScheduledCheck({ _runCheck: check, _dispatch: dispatch });

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.mock.calls[0][0].body).toContain("user_missing");
    });

    it("dispatches an alert for a 'no_demo_user_id' failure", async () => {
      const dispatch = vi.fn().mockResolvedValue(undefined);
      const check = vi
        .fn()
        .mockResolvedValue(failResult("no_demo_user_id", { demoUserId: null }));

      await runScheduledCheck({ _runCheck: check, _dispatch: dispatch });

      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe("when the check throws", () => {
    it("returns null and dispatches a crash alert", async () => {
      const dispatch = vi.fn().mockResolvedValue(undefined);
      const check = vi.fn().mockRejectedValue(new Error("Clerk is down"));

      const result = await runScheduledCheck({
        _runCheck: check,
        _dispatch: dispatch,
      });

      expect(result).toBeNull();
      expect(dispatch).toHaveBeenCalledTimes(1);
      const payload = dispatch.mock.calls[0][0];
      expect(payload.subject).toContain("crashed");
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Cooldown — consecutive failures must not flood the alert channel
// ---------------------------------------------------------------------------

describe("alert cooldown", () => {
  it("suppresses the second alert when the cooldown has not elapsed", async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const check = vi.fn().mockResolvedValue(failResult("pass_revoked"));
    const opts = {
      cooldownMs: 60_000, // 1-minute cooldown for this test
      _runCheck: check,
      _dispatch: dispatch,
    };

    // First failure → alert fires
    await runScheduledCheck(opts);
    expect(dispatch).toHaveBeenCalledTimes(1);

    // Second failure immediately after → still within cooldown → suppressed
    await runScheduledCheck(opts);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("fires a new alert after the cooldown window has elapsed", async () => {
    vi.useFakeTimers();

    const dispatch = vi.fn().mockResolvedValue(undefined);
    const check = vi.fn().mockResolvedValue(failResult("pass_revoked"));
    const cooldownMs = 60_000;
    const opts = { cooldownMs, _runCheck: check, _dispatch: dispatch };

    // First failure → alert fires
    await runScheduledCheck(opts);
    expect(dispatch).toHaveBeenCalledTimes(1);

    // Advance time past the cooldown window
    vi.advanceTimersByTime(cooldownMs + 1);

    // Second failure after cooldown → alert fires again
    await runScheduledCheck(opts);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("fires a new alert once the cooldown elapses even after multiple suppressed ticks", async () => {
    vi.useFakeTimers();

    const dispatch = vi.fn().mockResolvedValue(undefined);
    const check = vi.fn().mockResolvedValue(failResult("user_missing"));
    const cooldownMs = 30_000;
    const opts = { cooldownMs, _runCheck: check, _dispatch: dispatch };

    // First failure → alert fires
    await runScheduledCheck(opts);
    expect(dispatch).toHaveBeenCalledTimes(1);

    // Three more ticks within cooldown → all suppressed
    await runScheduledCheck(opts);
    await runScheduledCheck(opts);
    await runScheduledCheck(opts);
    expect(dispatch).toHaveBeenCalledTimes(1);

    // Advance past the cooldown
    vi.advanceTimersByTime(cooldownMs + 1);

    await runScheduledCheck(opts);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("resets the cooldown after a passing check follows a failure", async () => {
    vi.useFakeTimers();

    const dispatch = vi.fn().mockResolvedValue(undefined);
    const failCheck = vi.fn().mockResolvedValue(failResult("pass_revoked"));
    const okCheck = vi.fn().mockResolvedValue(okResult());
    const cooldownMs = 60_000;

    // First failure → alert fires, cooldown starts
    await runScheduledCheck({
      cooldownMs,
      _runCheck: failCheck,
      _dispatch: dispatch,
    });
    expect(dispatch).toHaveBeenCalledTimes(1);

    // Advance past the cooldown so the next failure re-alerts regardless
    vi.advanceTimersByTime(cooldownMs + 1);

    // Passing check → no alert
    await runScheduledCheck({
      cooldownMs,
      _runCheck: okCheck,
      _dispatch: dispatch,
    });
    expect(dispatch).toHaveBeenCalledTimes(1);

    // Failure again after cooldown → alert fires
    await runScheduledCheck({
      cooldownMs,
      _runCheck: failCheck,
      _dispatch: dispatch,
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// 3. startReviewerCheckScheduler — interval invocation (fake timers)
//
// Each test owns a `stop` ref. afterEach calls stop() + vi.clearAllTimers()
// so no interval leaks across tests.
// ---------------------------------------------------------------------------

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

  it("does not call runReviewerPassCheck before the initial 30-second delay", async () => {
    const check = vi.fn().mockResolvedValue(okResult());
    stopScheduler = startReviewerCheckScheduler({
      intervalMs: 5_000,
      _runCheck: check,
      _dispatch: vi.fn().mockResolvedValue(undefined),
    });

    // Nothing should have fired yet (1 ms short of the boot delay)
    await vi.advanceTimersByTimeAsync(29_999);
    expect(check).not.toHaveBeenCalled();
  });

  it("calls runReviewerPassCheck after the initial 30-second boot delay", async () => {
    const check = vi.fn().mockResolvedValue(okResult());
    stopScheduler = startReviewerCheckScheduler({
      intervalMs: 60_000,
      _runCheck: check,
      _dispatch: vi.fn().mockResolvedValue(undefined),
    });

    await vi.advanceTimersByTimeAsync(30_000);

    expect(check).toHaveBeenCalledTimes(1);
  });

  it("calls runReviewerPassCheck repeatedly at the configured interval", async () => {
    const check = vi.fn().mockResolvedValue(okResult());
    const intervalMs = 5_000;
    stopScheduler = startReviewerCheckScheduler({
      intervalMs,
      _runCheck: check,
      _dispatch: vi.fn().mockResolvedValue(undefined),
    });

    // Boot delay (1 initial run) + 3 interval ticks
    await vi.advanceTimersByTimeAsync(30_000 + intervalMs * 3);

    // 1 initial + 3 interval ticks = 4 total
    expect(check).toHaveBeenCalledTimes(4);
  });

  it("returns a cleanup function that stops the scheduler", async () => {
    const check = vi.fn().mockResolvedValue(okResult());
    const intervalMs = 5_000;
    const stop = startReviewerCheckScheduler({
      intervalMs,
      _runCheck: check,
      _dispatch: vi.fn().mockResolvedValue(undefined),
    });
    stopScheduler = stop; // also picked up by afterEach

    // Fire the initial run
    await vi.advanceTimersByTimeAsync(30_000);
    expect(check).toHaveBeenCalledTimes(1);

    // Explicitly stop; afterEach won't double-call but that's safe
    stop();
    stopScheduler = null;

    // No additional ticks after stop()
    await vi.advanceTimersByTimeAsync(intervalMs * 5);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("does not start and logs 'disabled' when intervalMs is 0", async () => {
    const check = vi.fn().mockResolvedValue(okResult());
    stopScheduler = startReviewerCheckScheduler({
      intervalMs: 0,
      _runCheck: check,
      _dispatch: vi.fn().mockResolvedValue(undefined),
    });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(check).not.toHaveBeenCalled();
  });

  it("uses REVIEWER_CHECK_INTERVAL_MS env var to determine interval when not passed explicitly", async () => {
    const original = process.env.REVIEWER_CHECK_INTERVAL_MS;
    process.env.REVIEWER_CHECK_INTERVAL_MS = "3000";

    const check = vi.fn().mockResolvedValue(okResult());
    stopScheduler = startReviewerCheckScheduler({
      _runCheck: check,
      _dispatch: vi.fn().mockResolvedValue(undefined),
    });

    // Boot delay (1 run) + 2 interval ticks at 3 s
    await vi.advanceTimersByTimeAsync(30_000 + 3_000 * 2);

    expect(check).toHaveBeenCalledTimes(3); // 1 initial + 2 ticks

    if (original === undefined) delete process.env.REVIEWER_CHECK_INTERVAL_MS;
    else process.env.REVIEWER_CHECK_INTERVAL_MS = original;
  });

  it("dispatches an alert when the scheduled check fails", async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const check = vi.fn().mockResolvedValue(failResult("pass_revoked"));
    stopScheduler = startReviewerCheckScheduler({
      intervalMs: 5_000,
      cooldownMs: DEFAULT_COOLDOWN_MS,
      _runCheck: check,
      _dispatch: dispatch,
    });

    // Trigger the initial boot delay run
    await vi.advanceTimersByTimeAsync(30_000);

    expect(check).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].subject).toContain("failed");
  });

  it("respects the cooldown: does not re-alert on consecutive scheduled failures", async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const check = vi.fn().mockResolvedValue(failResult("pass_revoked"));
    const intervalMs = 5_000;
    const cooldownMs = 60_000; // 1 minute — longer than our test window
    stopScheduler = startReviewerCheckScheduler({
      intervalMs,
      cooldownMs,
      _runCheck: check,
      _dispatch: dispatch,
    });

    // Boot delay → 1st failure → alert fires
    await vi.advanceTimersByTimeAsync(30_000);
    expect(dispatch).toHaveBeenCalledTimes(1);

    // 5 more interval ticks within the cooldown → no new alerts
    await vi.advanceTimersByTimeAsync(intervalMs * 5);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("exports DEFAULT_INTERVAL_MS of 1 hour and DEFAULT_COOLDOWN_MS of 4 hours", () => {
    expect(DEFAULT_INTERVAL_MS).toBe(60 * 60 * 1000);
    expect(DEFAULT_COOLDOWN_MS).toBe(4 * 60 * 60 * 1000);
  });
});
