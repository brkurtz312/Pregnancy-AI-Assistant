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
 */
export async function flushAsync(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
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
 */
export function useFakeTimersWithScheduler(): void {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
  });
  afterEach(() => {
    jest.useRealTimers();
  });
}
