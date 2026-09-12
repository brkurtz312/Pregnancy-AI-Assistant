import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Express, type Request } from "express";
import request from "supertest";

/**
 * Concurrent scribe-limit integration tests.
 *
 * These tests exercise the actual `reserveUsage` function against a real
 * PostgreSQL database to confirm that the atomic upsert in
 * `lib/ai-usage.ts` closes the race when two devices submit a
 * /scribe/generate-note request at the same instant for the same user.
 *
 * Nothing here mocks `@workspace/db` or `../src/lib/ai-usage`.
 * The only things mocked are the external service boundaries
 * (Anthropic, OpenAI audio, auth middleware) so the test is hermetic
 * with respect to network calls while still exercising the real DB path.
 */

// ─── External service mocks (no DB mock) ─────────────────────────────────────

const mockAnthropicCreate = vi.fn();

vi.mock("@workspace/integrations-anthropic-ai", () => ({
  isAnthropicConfigured: () => true,
  getAnthropic: () => ({ messages: { create: mockAnthropicCreate } }),
}));

vi.mock("@workspace/integrations-openai-ai-server/audio", () => ({
  speechToText: vi.fn(),
  ensureCompatibleFormat: vi.fn(),
}));

vi.mock("../src/lib/entitlement", () => ({
  userHasPass: vi.fn().mockResolvedValue(false),
}));

vi.mock("../src/middlewares/auth", () => ({
  requireAuth: (req: Request, _res: unknown, next: () => void) => {
    (req as Request & { userId?: string }).userId = "user_concurrent_test";
    next();
  },
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { db, aiUsageTable, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { reserveUsage } from "../src/lib/ai-usage";
import scribeRouter from "../src/routes/scribe/index";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEST_IDENTIFIER = "scribe:user_concurrent_test";
const PERIOD_KEY = "all-time";

async function cleanupTestRow() {
  await db
    .insert(usersTable)
    .values({ id: "user_concurrent_test" })
    .onConflictDoNothing();
  await db
    .delete(aiUsageTable)
    .where(
      and(
        eq(aiUsageTable.identifier, TEST_IDENTIFIER),
        eq(aiUsageTable.periodKey, PERIOD_KEY),
      ),
    );
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
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

const VALID_TRANSCRIPT =
  "Patient presents at 28 weeks. Blood pressure normal. Fundal height appropriate. Follow up in two weeks.";

const SOAP_RESPONSE = JSON.stringify({
  subjective: "Patient at 28 weeks gestation with no complaints.",
  objective: "Blood pressure normal. Fundal height appropriate.",
  assessment: "Uncomplicated pregnancy at 28 weeks.",
  plan: "Return visit in 2 weeks.",
});

// ─── Unit-level: concurrent reserveUsage against real DB ─────────────────────

// This suite runs against a real Postgres connection. Without DATABASE_URL
// there is nothing to run against, so it skips instead of failing the whole
// api-server run — the integration coverage is still there for anyone who sets
// DATABASE_URL and re-runs.
const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeDb = describe.skipIf(!hasDatabase);

describeDb("reserveUsage — concurrent calls against the real database", () => {
  beforeEach(cleanupTestRow);
  afterEach(cleanupTestRow);

  it("grants exactly one reservation when two calls race for the sole free slot", async () => {
    const limit = 1;

    const [result1, result2] = await Promise.all([
      reserveUsage(TEST_IDENTIFIER, PERIOD_KEY, limit),
      reserveUsage(TEST_IDENTIFIER, PERIOD_KEY, limit),
    ]);

    const successes = [result1, result2].filter((r) => r.reserved);
    const failures = [result1, result2].filter((r) => !r.reserved);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
  });

  it("leaves the counter at exactly 1 after two concurrent calls (no double-increment)", async () => {
    const limit = 1;

    await Promise.all([
      reserveUsage(TEST_IDENTIFIER, PERIOD_KEY, limit),
      reserveUsage(TEST_IDENTIFIER, PERIOD_KEY, limit),
    ]);

    const [row] = await db
      .select({ count: aiUsageTable.count })
      .from(aiUsageTable)
      .where(
        and(
          eq(aiUsageTable.identifier, TEST_IDENTIFIER),
          eq(aiUsageTable.periodKey, PERIOD_KEY),
        ),
      );

    expect(row?.count).toBe(1);
  });

  it("blocks all subsequent calls once the single slot is consumed", async () => {
    const limit = 1;

    await Promise.all([
      reserveUsage(TEST_IDENTIFIER, PERIOD_KEY, limit),
      reserveUsage(TEST_IDENTIFIER, PERIOD_KEY, limit),
    ]);

    const third = await reserveUsage(TEST_IDENTIFIER, PERIOD_KEY, limit);
    expect(third.reserved).toBe(false);
  });
});

// ─── HTTP-level: two concurrent /scribe/generate-note requests ───────────────

describeDb(
  "POST /scribe/generate-note — concurrent requests from two devices",
  () => {
    beforeEach(async () => {
      await cleanupTestRow();
      vi.clearAllMocks();
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: "text", text: SOAP_RESPONSE }],
      });
    });

    afterEach(cleanupTestRow);

    it("allows exactly one request and blocks the other with 403 SCRIBE_LIMIT_REACHED", async () => {
      const app = buildApp();

      const [res1, res2] = await Promise.all([
        request(app)
          .post("/scribe/generate-note")
          .send({ transcript: VALID_TRANSCRIPT, mode: "soap" }),
        request(app)
          .post("/scribe/generate-note")
          .send({ transcript: VALID_TRANSCRIPT, mode: "soap" }),
      ]);

      const statuses = [res1.status, res2.status].sort();

      expect(statuses).toEqual([200, 403]);

      const blocked = [res1, res2].find((r) => r.status === 403);
      expect(blocked?.body.code).toBe("SCRIBE_LIMIT_REACHED");
    });

    it("the successful response contains a structured SOAP note", async () => {
      const app = buildApp();

      const [res1, res2] = await Promise.all([
        request(app)
          .post("/scribe/generate-note")
          .send({ transcript: VALID_TRANSCRIPT, mode: "soap" }),
        request(app)
          .post("/scribe/generate-note")
          .send({ transcript: VALID_TRANSCRIPT, mode: "soap" }),
      ]);

      const succeeded = [res1, res2].find((r) => r.status === 200);
      expect(succeeded).toBeDefined();
      expect(succeeded?.body.note).toMatchObject({
        subjective: expect.any(String),
        objective: expect.any(String),
        assessment: expect.any(String),
        plan: expect.any(String),
      });
    });

    it("leaves the counter at exactly 1 after both concurrent HTTP requests resolve", async () => {
      const app = buildApp();

      await Promise.all([
        request(app)
          .post("/scribe/generate-note")
          .send({ transcript: VALID_TRANSCRIPT, mode: "soap" }),
        request(app)
          .post("/scribe/generate-note")
          .send({ transcript: VALID_TRANSCRIPT, mode: "soap" }),
      ]);

      const [row] = await db
        .select({ count: aiUsageTable.count })
        .from(aiUsageTable)
        .where(
          and(
            eq(aiUsageTable.identifier, TEST_IDENTIFIER),
            eq(aiUsageTable.periodKey, PERIOD_KEY),
          ),
        );

      expect(row?.count).toBe(1);
    });
  },
);
