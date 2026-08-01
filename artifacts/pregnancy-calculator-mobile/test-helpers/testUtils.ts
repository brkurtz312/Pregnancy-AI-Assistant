/**
 * Shared test utilities for Expo/React Native screen tests.
 *
 * Root-cause background
 * ─────────────────────
 * Two recurring failures in the sync tests share the same pair of causes:
 *
 * 1. Insufficient async flushing — useEffect chains (e.g. the hospital-bag
 *    and birth-plan load sequences) contain several nested .then / inner
 *    awaits.  A single macrotask tick (setTimeout 0 or Promise.resolve) is
 *    not enough to drain them.  When the test body returns with in-flight
 *    callbacks, Jest tears down the module registry and those callbacks try
 *    to import React Native modules that no longer exist → "import after
 *    environment torn down" errors.  `flushAsync` solves this by pumping
 *    multiple macrotask rounds (default 5, cheap < 1 ms each).
 *
 * 2. jest.useFakeTimers() without doNotFake options — React's internal
 *    scheduler (and the jest-expo environment) uses setImmediate internally.
 *    Replacing it with a fake stalls the work-loop so that even
 *    `await Promise.resolve()` never drives state updates forward.
 *    `useFakeTimersWithScheduler` preserves setImmediate and nextTick while
 *    still faking setTimeout / setInterval so the test can advance the clock.
 *
 * 3. Fake timers + async act() interaction — React's async act() can hang
 *    indefinitely waiting for its internal setTimeout(0) readiness check to
 *    fire.  When fake timers are active that callback never fires unless
 *    timers are advanced explicitly, so act() never returns and the test
 *    times out.  The fix is to call jest.advanceTimersByTime(0) INSIDE the
 *    act() callback so that React's scheduler callbacks fire within the scope
 *    of the same act() call, allowing act() to drain the work and return.
 *
 * Fake-timer audit result
 * ───────────────────────
 * Every test file in __tests__/ has been audited for bare jest.useFakeTimers()
 * calls.  None exist — all fake-timer setup goes through
 * `useFakeTimersWithScheduler` (currently used by syncColdReinstall and
 * syncSuccessToast).  The `flushAsync` fix (items 1–3 above) therefore covers
 * all active fake-timer callers automatically.
 *
 * Rule for future test files
 * ──────────────────────────
 * If you need to control setTimeout in a new test file, use
 * `useFakeTimersWithScheduler()` — never call `jest.useFakeTimers()` directly.
 * `useFakeTimersWithScheduler` automatically raises the Jest test timeout to
 * 15 000 ms (via a beforeAll hook) so callers always have headroom under
 * concurrent CI load.  There is no need to add `jest.setTimeout(15000)` by
 * hand in test files that already call `useFakeTimersWithScheduler()`.
 *
 * Usage
 * ─────
 *   // Replace bare setTimeout(r, 0) or inline process.nextTick flushes:
 *   await flushAsync();      // 5 rounds (default) — safe for deep useEffect chains
 *   await flushAsync(1);     // 1 round — when a single tick is sufficient
 *
 *   // In describe blocks that need to control setTimeout-based timers:
 *   describe("my suite", () => {
 *     useFakeTimersWithScheduler();
 *     it("...", async () => {
 *       // jest.advanceTimersByTime(...) works here; flushAsync() still works too
 *     });
 *   });
 */

import { act } from "react-test-renderer";

/**
 * Flush all pending async work across multiple macrotask rounds.
 *
 * Uses process.nextTick (never faked by jest.useFakeTimers) so it is safe
 * whether real or fake timers are active.  Each round is a single resolved
 * promise, adding < 1 ms of wall-clock time in a non-loaded test run.
 *
 * When fake timers are active (detected via jest.isMockFunction(global.setTimeout)),
 * each round also calls jest.advanceTimersByTime(0) INSIDE the act() callback
 * before awaiting the nextTick.  This fires any pending setTimeout(0) callbacks
 * that React's scheduler enqueued so that act() can see the work, drain it,
 * and return — rather than hanging indefinitely waiting for a faked timer that
 * would never fire on its own.
 */
export async function flushAsync(rounds = 5): Promise<void> {
  const usingFakeTimers = jest.isMockFunction(global.setTimeout);
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      // When fake timers are active, fire any pending setTimeout(0) callbacks
      // (e.g. React's internal scheduler readiness check) before awaiting the
      // nextTick promise.  Doing this inside act() ensures the resulting React
      // work is flushed within the same act() scope so act() can return cleanly.
      if (usingFakeTimers) {
        jest.advanceTimersByTime(0);
      }
      await new Promise<void>((r) => process.nextTick(r));
    });
  }
}

/**
 * Install fake-timer lifecycle hooks for a describe block.
 *
 * Call once at the top level of a describe block; do NOT wrap it in
 * beforeEach/afterEach yourself — this function registers those hooks
 * internally.
 *
 * Preserves setImmediate and nextTick so that:
 *   - React's internal scheduler (which uses setImmediate in the RN/jest-expo
 *     environment) keeps driving component updates.
 *   - flushAsync() continues to work (it relies on process.nextTick).
 *
 * setTimeout / setInterval are still faked, so tests can call
 * jest.advanceTimersByTime() to control dismiss timers, debounces, etc.
 * flushAsync() automatically advances the fake clock by 0 ms per round to
 * drain React scheduler's setTimeout(0) callbacks — no manual timer
 * advancement is needed in most tests.
 */
export function useFakeTimersWithScheduler(): void {
  // Raise the Jest timeout for the whole describe block so that the multiple
  // flushAsync() rounds this helper enables never exceed the default 5 s limit
  // under concurrent CI load.  Callers do not need to add jest.setTimeout()
  // themselves — this beforeAll handles it automatically.
  //
  // NOTE: 30 000 ms is intentionally higher than 15 000 ms so that test files
  // which set a longer file-level jest.setTimeout() (e.g. syncColdReinstall
  // sets 25 000 ms) are never silently reduced by this beforeAll hook.  A
  // file-level call executes before beforeAll, so a smaller value here would
  // inadvertently shrink the timeout back down.
  beforeAll(() => {
    jest.setTimeout(30000);
  });
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
  });
  afterEach(() => {
    jest.useRealTimers();
  });
}
