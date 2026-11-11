import { describe, it, expect, beforeEach, vi } from "vitest";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";

// Hermetic in-memory stand-in for the Postgres rate-limit store, so the real
// express-rate-limit middleware runs without a database.
vi.mock("../src/lib/rate-limit-store", () => {
  class InMemoryRateLimitStore {
    localKeys = true;
    private counts = new Map<string, { hits: number; resetTime: Date }>();
    private windowMs = 60_000;

    init(options: { windowMs: number }): void {
      this.windowMs = options.windowMs;
    }

    async increment(
      key: string,
    ): Promise<{ totalHits: number; resetTime: Date }> {
      const now = Date.now();
      const entry = this.counts.get(key);
      if (!entry || entry.resetTime.getTime() <= now) {
        const resetTime = new Date(now + this.windowMs);
        this.counts.set(key, { hits: 1, resetTime });
        return { totalHits: 1, resetTime };
      }
      entry.hits += 1;
      return { totalHits: entry.hits, resetTime: entry.resetTime };
    }

    async decrement(key: string): Promise<void> {
      const entry = this.counts.get(key);
      if (entry && entry.hits > 0) entry.hits -= 1;
    }

    async resetKey(key: string): Promise<void> {
      this.counts.delete(key);
    }
  }

  return {
    PostgresRateLimitStore: InMemoryRateLimitStore,
    RATE_LIMIT_PREFIXES: {
      aiBurst: "ai-burst",
      aiDaily: "ai-daily",
      redeemCode: "redeem-code",
      demoSession: "demo-session",
      funnelEvents: "funnel-events",
    },
  };
});

const inserted: unknown[] = [];
let insertShouldFail = false;

vi.mock("@workspace/db", () => ({
  db: {
    insert: () => ({
      values: async (row: unknown) => {
        if (insertShouldFail) throw new Error("db down");
        inserted.push(row);
      },
    }),
  },
  funnelEventsTable: {},
}));

const { default: eventsRouter } = await import("../src/routes/events");
const { FUNNEL_EVENTS_LIMIT } = await import("../src/lib/rate-limit");

// Each test gets its own client IP so the shared limiter's counter does not
// leak between tests.
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { log: unknown }).log = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    };
    next();
  });
  app.use("/api", eventsRouter);
  return app;
}

const base = {
  signedIn: false,
  platform: "ios",
  appVersion: "1.1.0",
};

function post(app: Express, body: unknown, ip = nextIp()) {
  return request(app)
    .post("/api/events")
    .set("X-Forwarded-For", ip)
    .send(body as object);
}

describe("POST /api/events", () => {
  let app: Express;

  beforeEach(() => {
    inserted.length = 0;
    insertShouldFail = false;
    app = buildApp();
  });

  describe("accepts", () => {
    it("a signed-out event with no auth header at all", async () => {
      const res = await post(app, {
        ...base,
        event: "paywall_viewed",
        source: "home",
      });
      expect(res.status).toBe(204);
      expect(inserted).toEqual([
        {
          event: "paywall_viewed",
          source: "home",
          signedIn: false,
          platform: "ios",
          appVersion: "1.1.0",
          errorCode: null,
        },
      ]);
    });

    it("a signed-in event", async () => {
      const res = await post(app, {
        ...base,
        signedIn: true,
        event: "purchase_started",
      });
      expect(res.status).toBe(204);
      expect(inserted).toHaveLength(1);
      expect(inserted[0]).toMatchObject({ signedIn: true, source: null });
    });

    it("every allowlisted source for pass_cta_tapped", async () => {
      for (const source of [
        "ai_limit",
        "home",
        "settings",
        "onboarding",
        "after_answer",
        "other",
      ]) {
        const res = await post(app, {
          ...base,
          event: "pass_cta_tapped",
          source,
        });
        expect(res.status, source).toBe(204);
      }
    });

    it("an error code on purchase_failed and offerings_load_failed", async () => {
      for (const event of ["purchase_failed", "offerings_load_failed"]) {
        const res = await post(app, {
          ...base,
          event,
          errorCode: "NETWORK_ERROR",
        });
        expect(res.status, event).toBe(204);
      }
      expect(inserted).toHaveLength(2);
      expect(inserted[0]).toMatchObject({ errorCode: "NETWORK_ERROR" });
    });

    it("answers 204 even when the insert fails", async () => {
      insertShouldFail = true;
      const res = await post(app, { ...base, event: "restore_tapped" });
      expect(res.status).toBe(204);
    });
  });

  describe("rejects with 400", () => {
    const cases: Array<[string, unknown]> = [
      ["an unknown event", { ...base, event: "user_signed_up" }],
      [
        "an unknown source",
        { ...base, event: "paywall_viewed", source: "push_notification" },
      ],
      ["paywall_viewed without a source", { ...base, event: "paywall_viewed" }],
      [
        "a source on an event that takes none",
        { ...base, event: "purchase_started", source: "home" },
      ],
      [
        "an errorCode on an event that takes none",
        { ...base, event: "purchase_started", errorCode: "X" },
      ],
      [
        "a free-text errorCode",
        {
          ...base,
          event: "purchase_failed",
          errorCode: "card declined for jane@example.com",
        },
      ],
      [
        "an unknown platform",
        { ...base, platform: "windows", event: "restore_tapped" },
      ],
      [
        "a missing signedIn",
        { platform: "ios", appVersion: "1.1.0", event: "restore_tapped" },
      ],
      [
        "a non-boolean signedIn",
        { ...base, signedIn: "yes", event: "restore_tapped" },
      ],
      [
        "a missing appVersion",
        { signedIn: false, platform: "ios", event: "restore_tapped" },
      ],
      // .strict(): identifying fields are refused outright, never stored.
      [
        "a userId field",
        { ...base, event: "restore_tapped", userId: "user_123" },
      ],
      [
        "an email field",
        { ...base, event: "restore_tapped", email: "a@b.com" },
      ],
      [
        "a deviceId field",
        { ...base, event: "restore_tapped", deviceId: "abc" },
      ],
      ["an empty body", {}],
    ];

    it.each(cases)("%s", async (_label, body) => {
      const res = await post(app, body);
      expect(res.status).toBe(400);
      expect(inserted).toHaveLength(0);
    });
  });

  describe("rate limit", () => {
    it("allows exactly FUNNEL_EVENTS_LIMIT requests per IP, then 429", async () => {
      // If the limiter were applied twice per request (ERR_ERL_DOUBLE_COUNT),
      // the client would be cut off after half the limit.
      const ip = nextIp();
      for (let i = 0; i < FUNNEL_EVENTS_LIMIT; i++) {
        const res = await post(app, { ...base, event: "restore_tapped" }, ip);
        expect(res.status, `request ${i + 1}`).toBe(204);
      }
      const blocked = await post(app, { ...base, event: "restore_tapped" }, ip);
      expect(blocked.status).toBe(429);

      // Another client is unaffected.
      const other = await post(app, { ...base, event: "restore_tapped" });
      expect(other.status).toBe(204);
    });
  });
});
