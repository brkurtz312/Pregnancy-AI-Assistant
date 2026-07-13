/**
 * Integration tests for PostgresRateLimitStore.
 *
 * These tests exercise the real PostgresRateLimitStore against an actual
 * Postgres connection (DATABASE_URL provided by Replit). They verify:
 *
 *   1. increment/decrement/resetKey work correctly end-to-end.
 *   2. Window-reset logic: a row whose expiresAt is in the past is treated as
 *      a fresh window on the next hit (hits resets to 1).
 *   3. Prefix isolation: two stores with different prefixes on the same client
 *      key maintain independent counters and do not bleed into each other.
 *
 * This is the test the in-memory mock cannot provide — a regression in store
 * initialisation, SQL upsert logic, or key-prefix scoping would only surface
 * here (or in production).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db, rateLimitsTable } from "@workspace/db";
import { like } from "drizzle-orm";
import { PostgresRateLimitStore } from "../src/lib/rate-limit-store";

// Use a test-only prefix namespace so these rows never collide with real
// limiter keys and are easy to wipe between test cases.
const TEST_NS = "test-rl-integration";
const PREFIX_A = `${TEST_NS}-a`;
const PREFIX_B = `${TEST_NS}-b`;

// A representative client key (e.g. a normalised IPv6 /56 or an IPv4 address).
const CLIENT_KEY = "192.0.2.1";

// Window long enough that no test will accidentally cross its boundary.
const WINDOW_MS = 60_000;

/** Remove all rows whose key starts with our test namespace. */
async function cleanTestRows() {
  await db
    .delete(rateLimitsTable)
    .where(like(rateLimitsTable.key, `${TEST_NS}%`));
}

beforeEach(async () => {
  await cleanTestRows();
});

afterEach(async () => {
  await cleanTestRows();
});

// ─── Helper ──────────────────────────────────────────────────────────────────

function makeStore(prefix: string): PostgresRateLimitStore {
  const store = new PostgresRateLimitStore(prefix);
  // Simulate express-rate-limit calling init() after construction.
  store.init({ windowMs: WINDOW_MS } as Parameters<
    PostgresRateLimitStore["init"]
  >[0]);
  return store;
}

// ─── increment ────────────────────────────────────────────────────────────────

describe("PostgresRateLimitStore — increment", () => {
  it("returns totalHits=1 on the first call and a future resetTime", async () => {
    const store = makeStore(PREFIX_A);
    const result = await store.increment(CLIENT_KEY);

    expect(result.totalHits).toBe(1);
    expect(result.resetTime.getTime()).toBeGreaterThan(Date.now());
  });

  it("increments the counter on successive calls within the same window", async () => {
    const store = makeStore(PREFIX_A);

    const r1 = await store.increment(CLIENT_KEY);
    const r2 = await store.increment(CLIENT_KEY);
    const r3 = await store.increment(CLIENT_KEY);

    expect(r1.totalHits).toBe(1);
    expect(r2.totalHits).toBe(2);
    expect(r3.totalHits).toBe(3);
    // All three calls share the same window expiry (monotonically non-decreasing).
    expect(r3.resetTime.getTime()).toBeGreaterThanOrEqual(
      r1.resetTime.getTime(),
    );
  });

  it("resets the counter to 1 when the existing row's window has already expired", async () => {
    // Directly insert a row that is already expired (expiresAt in the past).
    // The store's upsert must detect this and treat the next hit as a new window.
    await db.insert(rateLimitsTable).values({
      key: `${PREFIX_A}:${CLIENT_KEY}`,
      hits: 42,
      // 10 seconds in the past — the window is definitely over.
      expiresAt: new Date(Date.now() - 10_000),
    });

    const store = makeStore(PREFIX_A);
    const result = await store.increment(CLIENT_KEY);

    // The upsert's CASE expression should have reset hits to 1 and pushed
    // expiresAt forward, not incremented the stale 42.
    expect(result.totalHits).toBe(1);
    expect(result.resetTime.getTime()).toBeGreaterThan(Date.now());
  });
});

// ─── decrement ────────────────────────────────────────────────────────────────

describe("PostgresRateLimitStore — decrement", () => {
  it("reduces totalHits by 1 after an increment", async () => {
    const store = makeStore(PREFIX_A);

    await store.increment(CLIENT_KEY);
    await store.increment(CLIENT_KEY);
    await store.decrement(CLIENT_KEY);

    // Re-increment to read the current value back.
    const after = await store.increment(CLIENT_KEY);
    // Was at 2, decremented to 1, then incremented again → should be 2.
    expect(after.totalHits).toBe(2);
  });

  it("does not decrement below 0", async () => {
    const store = makeStore(PREFIX_A);

    await store.increment(CLIENT_KEY);
    // Decrement more times than there were increments.
    await store.decrement(CLIENT_KEY);
    await store.decrement(CLIENT_KEY);
    await store.decrement(CLIENT_KEY);

    const after = await store.increment(CLIENT_KEY);
    // greatest(hits - 1, 0) means the floor is 0, then +1 → 1.
    expect(after.totalHits).toBe(1);
  });

  it("is a no-op when no row exists yet", async () => {
    const store = makeStore(PREFIX_A);
    // Should not throw on a missing key.
    await expect(store.decrement(CLIENT_KEY)).resolves.toBeUndefined();
  });
});

// ─── resetKey ─────────────────────────────────────────────────────────────────

describe("PostgresRateLimitStore — resetKey", () => {
  it("removes the counter row so the next increment starts fresh at 1", async () => {
    const store = makeStore(PREFIX_A);

    await store.increment(CLIENT_KEY);
    await store.increment(CLIENT_KEY);
    await store.resetKey(CLIENT_KEY);

    const after = await store.increment(CLIENT_KEY);
    expect(after.totalHits).toBe(1);
  });

  it("is a no-op when no row exists", async () => {
    const store = makeStore(PREFIX_A);
    await expect(store.resetKey(CLIENT_KEY)).resolves.toBeUndefined();
  });
});

// ─── Prefix isolation ─────────────────────────────────────────────────────────

describe("PostgresRateLimitStore — prefix isolation", () => {
  it("two stores with different prefixes maintain independent counters for the same client key", async () => {
    const storeA = makeStore(PREFIX_A);
    const storeB = makeStore(PREFIX_B);

    // Drive storeA up to 3 hits.
    await storeA.increment(CLIENT_KEY);
    await storeA.increment(CLIENT_KEY);
    const a3 = await storeA.increment(CLIENT_KEY);

    // storeB has never seen this key — must start at 1.
    const b1 = await storeB.increment(CLIENT_KEY);

    expect(a3.totalHits).toBe(3);
    expect(b1.totalHits).toBe(1);
  });

  it("resetKey on one prefix does not affect the other prefix's counter", async () => {
    const storeA = makeStore(PREFIX_A);
    const storeB = makeStore(PREFIX_B);

    await storeA.increment(CLIENT_KEY);
    await storeA.increment(CLIENT_KEY);
    await storeB.increment(CLIENT_KEY);
    await storeB.increment(CLIENT_KEY);
    await storeB.increment(CLIENT_KEY);

    // Reset only storeA.
    await storeA.resetKey(CLIENT_KEY);

    // storeA counter is gone — next hit starts at 1.
    const aAfter = await storeA.increment(CLIENT_KEY);
    expect(aAfter.totalHits).toBe(1);

    // storeB counter is untouched — next hit is 4.
    const bAfter = await storeB.increment(CLIENT_KEY);
    expect(bAfter.totalHits).toBe(4);
  });

  it("mirrors the production key-prefix naming used by the real limiters", async () => {
    // Regression guard: the production store uses "<prefix>:<clientKey>" as
    // the DB primary key. Two limiters — "redeem-code" and "reviewer-sign-in"
    // — must not share a counter even though they key on the same client IP.
    const redeemStore = makeStore("redeem-code");
    const reviewerStore = makeStore("reviewer-sign-in");

    // Clean up these production-prefixed rows too.
    const ip = "198.51.100.1";
    try {
      await redeemStore.resetKey(ip);
      await reviewerStore.resetKey(ip);

      await redeemStore.increment(ip);
      await redeemStore.increment(ip);
      const redeem = await redeemStore.increment(ip);

      const reviewer = await reviewerStore.increment(ip);

      expect(redeem.totalHits).toBe(3);
      expect(reviewer.totalHits).toBe(1);
    } finally {
      await redeemStore.resetKey(ip);
      await reviewerStore.resetKey(ip);
    }
  });
});

// ─── Server-restart / deploy continuity ──────────────────────────────────────

describe("PostgresRateLimitStore — cross-instance persistence (server restart)", () => {
  it("a second store instance with the same prefix sees the counter written by the first instance", async () => {
    // Simulate what happens across a deploy or server restart: the first
    // Node process (instanceA) increments a counter and writes it to Postgres.
    // A new process starts (instanceB, a completely fresh object) and must
    // continue from the persisted value rather than resetting to 0.
    // This is the core guarantee that makes PostgresRateLimitStore suitable
    // for autoscaled, multi-instance deployments.
    const instanceA = makeStore(PREFIX_A);
    await instanceA.increment(CLIENT_KEY);
    await instanceA.increment(CLIENT_KEY);

    // New process / new object — same prefix, no shared in-process state.
    const instanceB = makeStore(PREFIX_A);
    const result = await instanceB.increment(CLIENT_KEY);

    // Counter must continue from where instanceA left off (2 + 1 = 3),
    // not restart at 1 as an in-memory store would.
    expect(result.totalHits).toBe(3);
  });
});
