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
import { eq, or } from "drizzle-orm";
import {
  PostgresRateLimitStore,
  RATE_LIMIT_PREFIXES,
  type RateLimitPrefix,
} from "../src/lib/rate-limit-store";

// Use two registry prefixes as test namespaces. Using real registry values
// satisfies the allowlist check in the constructor while keeping this file
// hermetic — the test IPs (documentation range) ensure rows created here
// never collide with real traffic.
const PREFIX_A = RATE_LIMIT_PREFIXES.redeemCode;
const PREFIX_B = RATE_LIMIT_PREFIXES.reviewerSignIn;

// A representative client key (e.g. a normalised IPv6 /56 or an IPv4 address).
// Using the documentation range (RFC 5737) so rows never collide with real traffic.
const CLIENT_KEY = "192.0.2.1";

// Window long enough that no test will accidentally cross its boundary.
const WINDOW_MS = 60_000;

// Documentation-range IP used exclusively for the AI limiter test cases so
// those rows are easy to isolate and won't collide with any real traffic.
const AI_TEST_IP = "203.0.113.99";

// IP used by the "mirrors production key-prefix naming" test (also RFC 5737).
const MIRRORS_IP = "198.51.100.1";

// Production window values — must stay in sync with rate-limit.ts.
const AI_BURST_WINDOW_MS = 60 * 1000;
const AI_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Remove all rows written by this test file. */
async function cleanTestRows() {
  await db
    .delete(rateLimitsTable)
    .where(
      or(
        eq(rateLimitsTable.key, `${PREFIX_A}:${CLIENT_KEY}`),
        eq(rateLimitsTable.key, `${PREFIX_B}:${CLIENT_KEY}`),
        eq(rateLimitsTable.key, `ai-burst:${AI_TEST_IP}`),
        eq(rateLimitsTable.key, `ai-daily:${AI_TEST_IP}`),
        eq(
          rateLimitsTable.key,
          `${RATE_LIMIT_PREFIXES.redeemCode}:${MIRRORS_IP}`,
        ),
        eq(
          rateLimitsTable.key,
          `${RATE_LIMIT_PREFIXES.reviewerSignIn}:${MIRRORS_IP}`,
        ),
      ),
    );
}

beforeEach(async () => {
  await cleanTestRows();
});

afterEach(async () => {
  await cleanTestRows();
});

// ─── Helper ──────────────────────────────────────────────────────────────────

function makeStore(prefix: RateLimitPrefix): PostgresRateLimitStore {
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
    const redeemStore = makeStore(RATE_LIMIT_PREFIXES.redeemCode);
    const reviewerStore = makeStore(RATE_LIMIT_PREFIXES.reviewerSignIn);

    try {
      await redeemStore.resetKey(MIRRORS_IP);
      await reviewerStore.resetKey(MIRRORS_IP);

      await redeemStore.increment(MIRRORS_IP);
      await redeemStore.increment(MIRRORS_IP);
      const redeem = await redeemStore.increment(MIRRORS_IP);

      const reviewer = await reviewerStore.increment(MIRRORS_IP);

      expect(redeem.totalHits).toBe(3);
      expect(reviewer.totalHits).toBe(1);
    } finally {
      await redeemStore.resetKey(MIRRORS_IP);
      await reviewerStore.resetKey(MIRRORS_IP);
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

// ─── AI limiter — ai-burst prefix and 60-second window ───────────────────────

describe("AI limiter — ai-burst prefix and 60-second window", () => {
  function makeBurstStore(): PostgresRateLimitStore {
    const store = new PostgresRateLimitStore("ai-burst");
    store.init({ windowMs: AI_BURST_WINDOW_MS } as Parameters<
      PostgresRateLimitStore["init"]
    >[0]);
    return store;
  }

  it("starts at totalHits=1 with a resetTime roughly 60 seconds out", async () => {
    const store = makeBurstStore();
    const before = Date.now();
    const result = await store.increment(AI_TEST_IP);
    const after = Date.now();

    expect(result.totalHits).toBe(1);

    // resetTime must fall within the 60-second burst window (with a small
    // buffer to account for query latency).
    const resetMs = result.resetTime.getTime();
    expect(resetMs).toBeGreaterThan(before + AI_BURST_WINDOW_MS - 2_000);
    expect(resetMs).toBeLessThan(after + AI_BURST_WINDOW_MS + 2_000);
  });

  it("accumulates hits within the same burst window", async () => {
    const store = makeBurstStore();
    await store.increment(AI_TEST_IP);
    await store.increment(AI_TEST_IP);
    const r = await store.increment(AI_TEST_IP);

    expect(r.totalHits).toBe(3);
  });

  it("survives a simulated server restart — a fresh store object continues from the persisted count", async () => {
    const storeA = makeBurstStore();
    await storeA.increment(AI_TEST_IP);
    await storeA.increment(AI_TEST_IP);

    // Brand-new object, same prefix — simulates the store being reconstructed
    // after a process restart or autoscale spin-up.
    const storeB = makeBurstStore();
    const result = await storeB.increment(AI_TEST_IP);

    // Must read 3, not 1 (which an in-memory store would return).
    expect(result.totalHits).toBe(3);
  });
});

// ─── AI limiter — ai-daily prefix and 24-hour window ─────────────────────────

describe("AI limiter — ai-daily prefix and 24-hour window", () => {
  function makeDailyStore(): PostgresRateLimitStore {
    const store = new PostgresRateLimitStore("ai-daily");
    store.init({ windowMs: AI_DAILY_WINDOW_MS } as Parameters<
      PostgresRateLimitStore["init"]
    >[0]);
    return store;
  }

  it("starts at totalHits=1 with a resetTime roughly 24 hours out", async () => {
    const store = makeDailyStore();
    const before = Date.now();
    const result = await store.increment(AI_TEST_IP);
    const after = Date.now();

    expect(result.totalHits).toBe(1);

    // resetTime must fall within the 24-hour daily window.
    const resetMs = result.resetTime.getTime();
    expect(resetMs).toBeGreaterThan(before + AI_DAILY_WINDOW_MS - 5_000);
    expect(resetMs).toBeLessThan(after + AI_DAILY_WINDOW_MS + 5_000);
  });

  it("accumulates hits within the same daily window", async () => {
    const store = makeDailyStore();
    await store.increment(AI_TEST_IP);
    await store.increment(AI_TEST_IP);
    const r = await store.increment(AI_TEST_IP);

    expect(r.totalHits).toBe(3);
  });

  it("survives a simulated server restart — a fresh store object continues from the persisted count", async () => {
    const storeA = makeDailyStore();
    await storeA.increment(AI_TEST_IP);
    await storeA.increment(AI_TEST_IP);

    const storeB = makeDailyStore();
    const result = await storeB.increment(AI_TEST_IP);

    expect(result.totalHits).toBe(3);
  });
});

// ─── AI limiter — burst and daily counters are independent ────────────────────

describe("AI limiter — ai-burst and ai-daily counters are independent", () => {
  function makeBurstStore(): PostgresRateLimitStore {
    const store = new PostgresRateLimitStore("ai-burst");
    store.init({ windowMs: AI_BURST_WINDOW_MS } as Parameters<
      PostgresRateLimitStore["init"]
    >[0]);
    return store;
  }

  function makeDailyStore(): PostgresRateLimitStore {
    const store = new PostgresRateLimitStore("ai-daily");
    store.init({ windowMs: AI_DAILY_WINDOW_MS } as Parameters<
      PostgresRateLimitStore["init"]
    >[0]);
    return store;
  }

  it("burst and daily counters for the same IP are tracked separately", async () => {
    const burst = makeBurstStore();
    const daily = makeDailyStore();

    // Drive the burst counter up.
    await burst.increment(AI_TEST_IP);
    await burst.increment(AI_TEST_IP);
    const burstResult = await burst.increment(AI_TEST_IP);

    // The daily counter has only ever seen one hit.
    const dailyResult = await daily.increment(AI_TEST_IP);

    expect(burstResult.totalHits).toBe(3);
    expect(dailyResult.totalHits).toBe(1);
  });

  it("resetting the burst counter does not affect the daily counter", async () => {
    const burst = makeBurstStore();
    const daily = makeDailyStore();

    await burst.increment(AI_TEST_IP);
    await burst.increment(AI_TEST_IP);
    await daily.increment(AI_TEST_IP);
    await daily.increment(AI_TEST_IP);
    await daily.increment(AI_TEST_IP);

    // Clear the burst window (mimics the window expiring or a manual reset).
    await burst.resetKey(AI_TEST_IP);

    // Burst starts fresh at 1.
    const burstAfter = await burst.increment(AI_TEST_IP);
    expect(burstAfter.totalHits).toBe(1);

    // Daily counter is untouched — next hit is 4.
    const dailyAfter = await daily.increment(AI_TEST_IP);
    expect(dailyAfter.totalHits).toBe(4);
  });

  it("burst exhaustion does not bleed into the daily budget", async () => {
    // Simulate a client hitting the burst ceiling (15 req/min in production).
    // After burst is exhausted, the daily counter should reflect only the
    // requests that actually reached the daily limiter — not the burst count.
    // Here we just confirm the two stores stay numerically independent
    // regardless of how many hits the burst store has absorbed.
    const burst = makeBurstStore();
    const daily = makeDailyStore();

    // Simulate burst window being exhausted with 5 rapid hits.
    for (let i = 0; i < 5; i++) {
      await burst.increment(AI_TEST_IP);
    }

    // Daily counter was only hit twice (requests that passed the burst check).
    await daily.increment(AI_TEST_IP);
    const dailyResult = await daily.increment(AI_TEST_IP);

    expect(dailyResult.totalHits).toBe(2);

    // Confirm the burst counter is genuinely at 5, not polluted by the daily.
    const burstResult = await burst.increment(AI_TEST_IP);
    expect(burstResult.totalHits).toBe(6);
  });

  it("burst and daily resetTime values reflect their respective window lengths", async () => {
    const burst = makeBurstStore();
    const daily = makeDailyStore();

    const before = Date.now();
    const burstResult = await burst.increment(AI_TEST_IP);
    const dailyResult = await daily.increment(AI_TEST_IP);
    const after = Date.now();

    const burstReset = burstResult.resetTime.getTime();
    const dailyReset = dailyResult.resetTime.getTime();

    // Burst window is ~60 s — well under an hour.
    expect(burstReset).toBeLessThan(before + 60 * 60 * 1000);

    // Daily window is ~24 h — more than 12 hours from now.
    expect(dailyReset).toBeGreaterThan(after + 12 * 60 * 60 * 1000);

    // Daily reset must always be later than burst reset.
    expect(dailyReset).toBeGreaterThan(burstReset);
  });
});
