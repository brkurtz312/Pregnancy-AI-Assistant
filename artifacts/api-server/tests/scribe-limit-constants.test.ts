import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// FREE_SCRIBE_LIMIT — lifetime free session allowance
// ---------------------------------------------------------------------------
import { FREE_SCRIBE_LIMIT } from "../src/lib/billing-config";

describe("FREE_SCRIBE_LIMIT", () => {
  it("is exactly 1 (each free user gets one lifetime scribe session)", () => {
    expect(FREE_SCRIBE_LIMIT).toBe(1);
  });

  it("blocks a second session when count has reached the limit", () => {
    const limit = FREE_SCRIBE_LIMIT;
    const countAfterFirstUse = 1;
    const wouldBeAllowed = countAfterFirstUse < limit;
    expect(wouldBeAllowed).toBe(false);
  });

  it("allows exactly the first session and no more", () => {
    const sessions = [1, 2, 3].map((n) => n <= FREE_SCRIBE_LIMIT);
    expect(sessions).toEqual([true, false, false]);
  });
});

// ---------------------------------------------------------------------------
// Scribe periodKey — must stay "all-time" to enforce a lifetime cap
//
// The scribe route calls:
//   reserveUsage(`scribe:${userId}`, "all-time", FREE_SCRIBE_LIMIT)
//   refundUsage(`scribe:${userId}`, "all-time")
//
// If the period key changes to a weekly/monthly string the counter resets and
// users get extra free sessions they weren't entitled to.  This test mocks the
// ai-usage module and inspects the exact arguments passed so any drift in the
// route is immediately caught.
// ---------------------------------------------------------------------------

const mockReserveUsage = vi
  .fn()
  .mockResolvedValue({ reserved: true, count: 1 });
const mockRefundUsage = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/lib/ai-usage", () => ({
  reserveUsage: (...args: unknown[]) => mockReserveUsage(...args),
  refundUsage: (...args: unknown[]) => mockRefundUsage(...args),
  getUsage: vi.fn(),
  incrementUsage: vi.fn(),
  currentPeriodKey: vi.fn(),
}));

vi.mock("../src/lib/entitlement", () => ({
  userHasPass: vi.fn().mockResolvedValue(false),
}));

vi.mock("@workspace/integrations-anthropic-ai", () => ({
  isAnthropicConfigured: vi.fn().mockReturnValue(true),
  getAnthropic: vi.fn().mockReturnValue({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              subjective: "s",
              objective: "o",
              assessment: "a",
              plan: "p",
            }),
          },
        ],
      }),
    },
  }),
}));

vi.mock("@workspace/integrations-openai-ai-server/audio", () => ({
  speechToText: vi.fn(),
  ensureCompatibleFormat: vi.fn(),
}));

vi.mock("../../middlewares/auth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../src/middlewares/auth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("@workspace/db", () => ({
  db: {},
  aiUsageTable: {},
  scribeIdempotencyKeysTable: {},
}));

import supertest from "supertest";
import express from "express";
import scribeRouter from "../src/routes/scribe/index";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { userId?: string; log: typeof console }).userId =
      "user_test_123";
    (req as express.Request & { log: typeof console }).log = console;
    next();
  });
  app.use("/", scribeRouter);
  return app;
}

describe("scribe /generate-note periodKey is always 'all-time'", () => {
  it("calls reserveUsage with periodKey 'all-time' for a free user", async () => {
    mockReserveUsage.mockClear();
    const app = buildApp();

    await supertest(app).post("/scribe/generate-note").send({
      transcript: "Patient presents with mild nausea at 10 weeks gestation.",
      mode: "soap",
    });

    expect(mockReserveUsage).toHaveBeenCalledTimes(1);
    const [identifier, periodKey, limit] = mockReserveUsage.mock.calls[0];

    expect(periodKey).toBe("all-time");
    expect(identifier).toMatch(/^scribe:/);
    expect(limit).toBe(FREE_SCRIBE_LIMIT);
  });

  it("calls refundUsage with periodKey 'all-time' when the model returns invalid JSON", async () => {
    mockReserveUsage.mockClear();
    mockRefundUsage.mockClear();

    const { getAnthropic } =
      await import("@workspace/integrations-anthropic-ai");
    vi.mocked(getAnthropic).mockReturnValueOnce({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "not-valid-json{{" }],
        }),
      },
    } as ReturnType<typeof getAnthropic>);

    const app = buildApp();
    await supertest(app).post("/scribe/generate-note").send({
      transcript: "Patient presents with mild nausea at 10 weeks gestation.",
      mode: "soap",
    });

    expect(mockRefundUsage).toHaveBeenCalledTimes(1);
    const [identifier, periodKey] = mockRefundUsage.mock.calls[0];
    expect(periodKey).toBe("all-time");
    expect(identifier).toMatch(/^scribe:/);
  });

  it("periodKey 'all-time' never equals a week key, so the counter never auto-resets", () => {
    const weekPattern = /^\d{4}-W\d{2}$/;
    expect(weekPattern.test("all-time")).toBe(false);
  });

  it("identifier is scoped to the user, not shared across users", async () => {
    mockReserveUsage.mockClear();
    const app = buildApp();
    await supertest(app).post("/scribe/generate-note").send({
      transcript: "Patient presents with mild nausea at 10 weeks gestation.",
      mode: "soap",
    });

    const [identifier] = mockReserveUsage.mock.calls[0];
    expect(identifier).toBe("scribe:user_test_123");
  });
});
