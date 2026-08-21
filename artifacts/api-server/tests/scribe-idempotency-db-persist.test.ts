/**
 * Integration tests for scribe-idempotency DB persistence (cross-instance durability).
 *
 * These tests exercise the real `beginIdempotency` → DB upsert → `checkIdempotency`
 * round-trip against an actual Postgres connection (DATABASE_URL provided by Replit).
 *
 * The core scenario being proven:
 *
 *   Instance A  — calls beginIdempotency + commit → row written to DB.
 *   Instance B  — a brand-new process (or a second autoscale replica) has an empty
 *                 in-process cache.  It calls checkIdempotency and must find the row
 *                 in the DB → returns { found: true }.  Because it finds the cached
 *                 result it NEVER calls reserveUsage, preventing double-charging.
 *
 * What a unit test with a mocked DB cannot cover:
 *   - The real Drizzle INSERT … ON CONFLICT DO UPDATE round-trip.
 *   - The WHERE clause that filters out expired rows (gt(expiresAt, now())).
 *   - Clock-sensitive expiry: an actually-expired row must not be returned.
 *   - The full lifecycle that crosses a simulated process boundary, including
 *     explicit proof that reserveUsage is bypassed on instance B.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db, scribeIdempotencyKeysTable, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import supertest from "supertest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// Only non-DB dependencies are mocked. @workspace/db is NOT mocked so the real
// Postgres connection is used throughout.

// Prevents the pino worker thread from spawning in the test process.
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ai-usage: we spy on reserveUsage to assert it is NOT called on instance B.
const mockReserveUsage = vi.fn(async () => ({ reserved: true, count: 1 }));
const mockRefundUsage = vi.fn(async () => undefined);

vi.mock("../src/lib/ai-usage", () => ({
  reserveUsage: (...args: unknown[]) => mockReserveUsage(...args),
  refundUsage: (...args: unknown[]) => mockRefundUsage(...args),
  getUsage: vi.fn(),
  incrementUsage: vi.fn(),
  currentPeriodKey: vi.fn(),
}));

// Entitlement: default to free user so reserveUsage would be called if not
// short-circuited by the idempotency cache.
const mockUserHasPass = vi.fn(async () => false);
vi.mock("../src/lib/entitlement", () => ({
  userHasPass: () => mockUserHasPass(),
}));

// Auth middleware: inject userId without a real Clerk session.
vi.mock("../src/middlewares/auth", () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// Anthropic: not needed for cache-hit tests but required for the module to load.
vi.mock("@workspace/integrations-anthropic-ai", () => ({
  isAnthropicConfigured: () => true,
  getAnthropic: () => ({ messages: { create: vi.fn() } }),
}));

vi.mock("@workspace/integrations-openai-ai-server/audio", () => ({
  speechToText: vi.fn(),
  ensureCompatibleFormat: vi.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import scribeRouter from "../src/routes/scribe/index";
import {
  beginIdempotency,
  checkIdempotency,
  _clearIdempotencyCache,
  _stopSweepInterval,
  IDEMPOTENCY_TTL_MS,
} from "../src/lib/scribe-idempotency";

// ─── Test constants ───────────────────────────────────────────────────────────

// Use a unique userId prefix so rows created here are trivially identifiable
// and can never collide with real traffic.
const TEST_USER = "test_idempotency_persist_user";

// A representative response object (mirrors the shape the scribe route returns).
const RESPONSE_A = {
  mode: "summary",
  note: {
    headline: "Instance A wrote this.",
    whatWasDiscussed: "This came from the first server instance.",
    nextSteps: ["Follow up in 2 weeks"],
    rememberTo: "Rest and hydrate.",
  },
};

const RESPONSE_B = {
  mode: "soap",
  note: {
    headline: "A different response.",
    whatWasDiscussed: "Second entry used only to test key isolation.",
    nextSteps: [],
    rememberTo: "",
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal Express app that mounts the scribe router with a fixed userId. */
function buildApp(userId = TEST_USER) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as Request & { userId?: string }).userId = userId;
    (req as Request & { log: unknown }).log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    next();
  });
  app.use("/", scribeRouter);
  return app;
}

/** Delete all rows written by this test file. */
async function cleanTestRows(): Promise<void> {
  await db
    .delete(scribeIdempotencyKeysTable)
    .where(eq(scribeIdempotencyKeysTable.userId, TEST_USER));
}

async function provisionTestUser(userId: string): Promise<void> {
  await db.insert(usersTable).values({ id: userId }).onConflictDoNothing();
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
  vi.clearAllMocks();
  // Stop the background sweep timer so it cannot interfere with test assertions.
  _stopSweepInterval();
  // Start each test with an empty in-process cache, simulating a fresh process.
  _clearIdempotencyCache();
  // Remove any rows left over from a previous run.
  await cleanTestRows();
  await provisionTestUser(TEST_USER);
  // Defaults for route-level tests.
  mockUserHasPass.mockResolvedValue(false);
  mockReserveUsage.mockResolvedValue({ reserved: true, count: 1 });
});

afterEach(async () => {
  await cleanTestRows();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("scribe-idempotency — DB-backed cross-instance durability (integration)", () => {
  // ── Core cross-instance round-trip (route-level) ───────────────────────────

  it("instance B route returns cached DB response and does NOT call reserveUsage", async () => {
    // ── Instance A ──────────────────────────────────────────────────────────
    // Directly commit a result to the DB, simulating a successful generate-note
    // request that completed on a different server instance.
    const KEY = "integ-route-no-reserve-001";
    const { commit } = beginIdempotency(KEY, TEST_USER);
    await commit(RESPONSE_A);

    // ── Simulate process boundary ────────────────────────────────────────────
    // Clearing the in-process cache is equivalent to starting a brand-new
    // Node process or a second autoscale replica with no shared memory.
    _clearIdempotencyCache();

    // ── Instance B — route-level request ────────────────────────────────────
    // The route calls checkIdempotency BEFORE reserveUsage.  When it finds the
    // DB-stored entry it must return 200 with the cached response immediately,
    // skipping reserveUsage entirely.
    const app = buildApp();
    const res = await supertest(app)
      .post("/scribe/generate-note")
      .set("x-idempotency-key", KEY)
      .send({ transcript: "any transcript", mode: "summary" });

    // The route must succeed and return the cached response.
    expect(res.status).toBe(200);
    expect(res.body).toEqual(RESPONSE_A);

    // The critical assertion: reserveUsage was NEVER called on instance B.
    // If the idempotency cache had not protected this request, reserveUsage
    // would have been called at least once (free user, cache miss path).
    expect(mockReserveUsage).not.toHaveBeenCalled();
  });

  // ── Core cross-instance round-trip (library-level) ────────────────────────

  it("commit on instance A writes to the DB, checkIdempotency on instance B reads it back", async () => {
    const KEY = "integ-cross-instance-002";

    // Instance A.
    const { commit } = beginIdempotency(KEY, TEST_USER);
    await commit(RESPONSE_A);

    // Simulate process boundary.
    _clearIdempotencyCache();

    // Instance B — library level.
    const result = await checkIdempotency(KEY, TEST_USER);

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.response).toEqual(RESPONSE_A);
    }
  });

  // ── DB row is written with correct field values ────────────────────────────

  it("the DB row contains the committed response and a future expiresAt", async () => {
    const KEY = "integ-row-content-003";
    const before = new Date();

    const { commit } = beginIdempotency(KEY, TEST_USER);
    await commit(RESPONSE_A);

    // Read the row directly from the DB to verify the stored shape.
    const rows = await db
      .select()
      .from(scribeIdempotencyKeysTable)
      .where(
        and(
          eq(scribeIdempotencyKeysTable.userId, TEST_USER),
          eq(scribeIdempotencyKeysTable.idempotencyKey, KEY),
        ),
      )
      .limit(1);

    expect(rows).toHaveLength(1);
    expect(rows[0].response).toEqual(RESPONSE_A);
    // expiresAt must be in the future (roughly TTL from now).
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(before.getTime());
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(
      Date.now() + IDEMPOTENCY_TTL_MS - 5_000,
    );
  });

  // ── Key + user isolation ───────────────────────────────────────────────────

  it("two different keys for the same user are stored and retrieved independently", async () => {
    const KEY1 = "integ-isolation-key1-004";
    const KEY2 = "integ-isolation-key2-004";

    const { commit: commit1 } = beginIdempotency(KEY1, TEST_USER);
    await commit1(RESPONSE_A);

    const { commit: commit2 } = beginIdempotency(KEY2, TEST_USER);
    await commit2(RESPONSE_B);

    _clearIdempotencyCache();

    const r1 = await checkIdempotency(KEY1, TEST_USER);
    const r2 = await checkIdempotency(KEY2, TEST_USER);

    expect(r1.found).toBe(true);
    expect(r2.found).toBe(true);
    if (r1.found) expect(r1.response).toEqual(RESPONSE_A);
    if (r2.found) expect(r2.response).toEqual(RESPONSE_B);
  });

  it("the same key for a different userId is a distinct row (cross-user isolation)", async () => {
    const KEY = "integ-user-isolation-005";
    const OTHER_USER = `${TEST_USER}_other`;
    await provisionTestUser(OTHER_USER);

    // Instance A commits for TEST_USER.
    const { commit } = beginIdempotency(KEY, TEST_USER);
    await commit(RESPONSE_A);

    _clearIdempotencyCache();

    try {
      // OTHER_USER has no row — must be a miss.
      const result = await checkIdempotency(KEY, OTHER_USER);
      expect(result.found).toBe(false);
    } finally {
      // Clean up the extra user row.
      await db
        .delete(scribeIdempotencyKeysTable)
        .where(eq(scribeIdempotencyKeysTable.userId, OTHER_USER));
      await db.delete(usersTable).where(eq(usersTable.id, OTHER_USER));
    }
  });

  // ── Expired row is a miss ──────────────────────────────────────────────────

  it("a row whose expiresAt is in the past is treated as a cache miss", async () => {
    const KEY = "integ-expired-006";

    // Insert an already-expired row directly — bypassing beginIdempotency so
    // we can control the timestamp precisely.
    await db.insert(scribeIdempotencyKeysTable).values({
      idempotencyKey: KEY,
      userId: TEST_USER,
      response: RESPONSE_A as Record<string, unknown>,
      // 10 seconds in the past — definitely expired.
      expiresAt: new Date(Date.now() - 10_000),
    });

    _clearIdempotencyCache();

    // The WHERE clause in dbLookup uses gt(expiresAt, now()), so the expired
    // row must not be returned.
    const result = await checkIdempotency(KEY, TEST_USER);
    expect(result.found).toBe(false);
  });

  // ── Upsert: second commit overwrites the first ────────────────────────────

  it("committing the same key twice upserts — the second response wins", async () => {
    const KEY = "integ-upsert-007";

    const { commit: commit1 } = beginIdempotency(KEY, TEST_USER);
    await commit1(RESPONSE_A);

    // Simulate a second commit for the same key (e.g. two instances racing).
    // The DB upsert (ON CONFLICT DO UPDATE) must be idempotent.
    const { commit: commit2 } = beginIdempotency(KEY, TEST_USER);
    await commit2(RESPONSE_B);

    _clearIdempotencyCache();

    const result = await checkIdempotency(KEY, TEST_USER);
    expect(result.found).toBe(true);
    // commit2 ran after commit1 so RESPONSE_B wins.
    if (result.found) {
      expect(result.response).toEqual(RESPONSE_B);
    }
  });

  // ── Miss path: unknown key ────────────────────────────────────────────────

  it("returns found: false when neither the in-process cache nor the DB has the key", async () => {
    _clearIdempotencyCache();
    const result = await checkIdempotency("integ-unknown-key-008", TEST_USER);
    expect(result.found).toBe(false);
  });

  // ── In-process hit does not require a DB round-trip ──────────────────────

  it("a live in-process done entry is returned without waiting for a DB round-trip", async () => {
    const KEY = "integ-inproc-priority-009";

    // commit() writes to the in-process cache first, then awaits the DB upsert.
    const { commit } = beginIdempotency(KEY, TEST_USER);
    await commit(RESPONSE_A);

    // Do NOT clear the in-process cache — the done entry is still live.
    const result = await checkIdempotency(KEY, TEST_USER);

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.response).toEqual(RESPONSE_A);
    }
  });

  // ── abort clears the in-process entry and leaves no DB row ────────────────

  it("abort removes the pending in-process entry; a subsequent checkIdempotency is a miss", async () => {
    const KEY = "integ-abort-010";

    const { abort } = beginIdempotency(KEY, TEST_USER);
    abort();

    _clearIdempotencyCache();

    // No DB row was written (abort fires before commit), so this is a miss.
    const result = await checkIdempotency(KEY, TEST_USER);
    expect(result.found).toBe(false);
  });
});
