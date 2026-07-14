/**
 * Unit tests for the duplicate-prefix guard in `PostgresRateLimitStore`.
 *
 * `PostgresRateLimitStore` keeps a module-scoped Set of every prefix that has
 * been constructed in the current process. Constructing a second store with
 * the same prefix throws synchronously so a copy-paste typo is caught at
 * server startup rather than silently merging two rate-limiter counters in
 * production.
 *
 * These tests import `PostgresRateLimitStore` and `RATE_LIMIT_PREFIXES`
 * directly and construct store instances to verify the guard. No mocks are
 * required because the constructor check fires before any DB call is made.
 *
 * `_resetPrefixRegistryForTesting` (exported for test use only) is called in
 * `beforeEach` to simulate the clean registry a fresh server process would
 * have, allowing each test to start from a known empty state.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  PostgresRateLimitStore,
  RATE_LIMIT_PREFIXES,
  _resetPrefixRegistryForTesting,
} from "../src/lib/rate-limit-store";

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Simulate the clean registry a fresh server process would have.
  _resetPrefixRegistryForTesting();
});

// ─── Duplicate-prefix guard ───────────────────────────────────────────────────

describe("PostgresRateLimitStore — duplicate-prefix guard", () => {
  it("throws with the expected message when the same prefix is constructed twice", () => {
    new PostgresRateLimitStore(RATE_LIMIT_PREFIXES.aiBurst);

    expect(
      () => new PostgresRateLimitStore(RATE_LIMIT_PREFIXES.aiBurst),
    ).toThrowError(
      `PostgresRateLimitStore: prefix "${RATE_LIMIT_PREFIXES.aiBurst}" is already registered. ` +
        `Each entry in RATE_LIMIT_PREFIXES must be used by exactly one limiter.`,
    );
  });

  it("throws for every RATE_LIMIT_PREFIXES value, not just the first one registered", () => {
    for (const prefix of Object.values(RATE_LIMIT_PREFIXES)) {
      _resetPrefixRegistryForTesting();

      new PostgresRateLimitStore(prefix);

      expect(() => new PostgresRateLimitStore(prefix)).toThrowError(
        `PostgresRateLimitStore: prefix "${prefix}" is already registered. ` +
          `Each entry in RATE_LIMIT_PREFIXES must be used by exactly one limiter.`,
      );
    }
  });

  it("does not throw when stores are constructed with different prefixes", () => {
    expect(() => {
      new PostgresRateLimitStore(RATE_LIMIT_PREFIXES.aiBurst);
      new PostgresRateLimitStore(RATE_LIMIT_PREFIXES.aiDaily);
    }).not.toThrow();
  });

  it("does not throw when all four production prefixes are each constructed exactly once", () => {
    expect(() => {
      for (const prefix of Object.values(RATE_LIMIT_PREFIXES)) {
        new PostgresRateLimitStore(prefix);
      }
    }).not.toThrow();
  });

  it("correctly tracks the registry — a duplicate after several distinct registrations also throws", () => {
    new PostgresRateLimitStore(RATE_LIMIT_PREFIXES.redeemCode);
    new PostgresRateLimitStore(RATE_LIMIT_PREFIXES.reviewerSignIn);

    expect(
      () => new PostgresRateLimitStore(RATE_LIMIT_PREFIXES.redeemCode),
    ).toThrowError(
      `PostgresRateLimitStore: prefix "${RATE_LIMIT_PREFIXES.redeemCode}" is already registered`,
    );
  });
});

// ─── Unknown-prefix guard ─────────────────────────────────────────────────────

describe("PostgresRateLimitStore — unknown-prefix guard", () => {
  it("throws with the expected message for an unrecognised prefix string", () => {
    expect(
      () =>
        new PostgresRateLimitStore(
          "totally-unknown-prefix" as (typeof RATE_LIMIT_PREFIXES)[keyof typeof RATE_LIMIT_PREFIXES],
        ),
    ).toThrowError(
      `PostgresRateLimitStore: unknown prefix "totally-unknown-prefix". ` +
        `Add it to RATE_LIMIT_PREFIXES in rate-limit-store.ts before use.`,
    );
  });

  it("does not throw when constructed with any value from RATE_LIMIT_PREFIXES", () => {
    for (const prefix of Object.values(RATE_LIMIT_PREFIXES)) {
      _resetPrefixRegistryForTesting();
      expect(() => new PostgresRateLimitStore(prefix)).not.toThrow();
    }
  });
});
