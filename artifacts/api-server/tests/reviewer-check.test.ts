import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the DB so the admin token lookup (getConfig("reviewer_access_code"))
// never needs a real database. Individual tests can override as needed.
const dbSelectWhere = vi.fn(async () => []);
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (..._args: unknown[]) => dbSelectWhere(),
      }),
    }),
  },
  appConfigTable: { key: "key" },
  usersTable: {},
}));

// Mock the reviewer-check library so we can control what runReviewerPassCheck
// returns without touching the database or sending real alerts.
const runReviewerPassCheck = vi.fn();
vi.mock("../src/lib/reviewer-check", () => ({
  runReviewerPassCheck: () => runReviewerPassCheck(),
}));

import adminRouter from "../src/routes/admin";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN_TOKEN = "test-admin-secret";
const ORIGINAL_ADMIN_TOKEN = process.env.ADMIN_CHECK_TOKEN;

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { log: unknown }).log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    next();
  });
  app.use("/api", adminRouter);
  return app;
}

const app = buildApp();

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_CHECK_TOKEN = ADMIN_TOKEN;
  // Default: DB lookup for app_config returns nothing (ADMIN_CHECK_TOKEN env takes priority)
  dbSelectWhere.mockResolvedValue([]);
});

afterAll(() => {
  if (ORIGINAL_ADMIN_TOKEN === undefined) delete process.env.ADMIN_CHECK_TOKEN;
  else process.env.ADMIN_CHECK_TOKEN = ORIGINAL_ADMIN_TOKEN;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/admin/reviewer-check", () => {
  describe("authentication", () => {
    it("returns 401 when no Authorization header is provided", async () => {
      const res = await request(app).post("/api/admin/reviewer-check");
      expect(res.status).toBe(401);
      expect(runReviewerPassCheck).not.toHaveBeenCalled();
    });

    it("returns 401 when the Authorization header has a wrong token", async () => {
      const res = await request(app)
        .post("/api/admin/reviewer-check")
        .set("Authorization", "Bearer wrong-token");
      expect(res.status).toBe(401);
      expect(runReviewerPassCheck).not.toHaveBeenCalled();
    });

    it("returns 401 when the Authorization header is malformed (no Bearer prefix)", async () => {
      const res = await request(app)
        .post("/api/admin/reviewer-check")
        .set("Authorization", ADMIN_TOKEN);
      expect(res.status).toBe(401);
      expect(runReviewerPassCheck).not.toHaveBeenCalled();
    });

    it("returns 503 when no admin token is configured on the server", async () => {
      delete process.env.ADMIN_CHECK_TOKEN;
      // DB also returns nothing
      dbSelectWhere.mockResolvedValue([]);

      const res = await request(app)
        .post("/api/admin/reviewer-check")
        .set("Authorization", "Bearer some-token");
      expect(res.status).toBe(503);
      expect(runReviewerPassCheck).not.toHaveBeenCalled();
    });
  });

  describe("healthy demo account (pass is present)", () => {
    it("returns { ok: true, healed: false } when the demo account has a valid pass", async () => {
      const mockResult = {
        ok: true,
        demoUserId: "user_demo_123",
        healed: false,
        timestamp: new Date().toISOString(),
      };
      runReviewerPassCheck.mockResolvedValue(mockResult);

      const res = await request(app)
        .post("/api/admin/reviewer-check")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.healed).toBe(false);
      expect(res.body.demoUserId).toBe("user_demo_123");
      expect(runReviewerPassCheck).toHaveBeenCalledTimes(1);
    });
  });

  describe("revoked demo account pass (hasPass = false)", () => {
    it("returns { ok: false, healed: true, reason: 'pass_revoked' } and corrects the DB row", async () => {
      // runReviewerPassCheck detects hasPass=false, heals the DB row, and
      // returns healed:true. The route must pass this result through as-is.
      const mockResult = {
        ok: false,
        demoUserId: "user_demo_123",
        reason: "pass_revoked" as const,
        healed: true,
        timestamp: new Date().toISOString(),
      };
      runReviewerPassCheck.mockResolvedValue(mockResult);

      const res = await request(app)
        .post("/api/admin/reviewer-check")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.healed).toBe(true);
      expect(res.body.reason).toBe("pass_revoked");
      expect(res.body.demoUserId).toBe("user_demo_123");
      // runReviewerPassCheck is responsible for the DB update; confirm it ran
      expect(runReviewerPassCheck).toHaveBeenCalledTimes(1);
    });
  });

  describe("missing demo account (user_missing)", () => {
    it("returns { ok: false, healed: true, reason: 'user_missing' } when the account does not exist", async () => {
      const mockResult = {
        ok: false,
        demoUserId: "user_demo_123",
        reason: "user_missing" as const,
        healed: true,
        timestamp: new Date().toISOString(),
      };
      runReviewerPassCheck.mockResolvedValue(mockResult);

      const res = await request(app)
        .post("/api/admin/reviewer-check")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.healed).toBe(true);
      expect(res.body.reason).toBe("user_missing");
      expect(runReviewerPassCheck).toHaveBeenCalledTimes(1);
    });
  });

  describe("token resolution fallbacks", () => {
    it("accepts the token from the app_config DB row when ADMIN_CHECK_TOKEN is not set", async () => {
      delete process.env.ADMIN_CHECK_TOKEN;
      // DB returns the reviewer_access_code row
      dbSelectWhere.mockResolvedValue([{ value: "db-token" }]);
      runReviewerPassCheck.mockResolvedValue({
        ok: true,
        demoUserId: "user_demo_123",
        healed: false,
        timestamp: new Date().toISOString(),
      });

      const res = await request(app)
        .post("/api/admin/reviewer-check")
        .set("Authorization", "Bearer db-token");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(runReviewerPassCheck).toHaveBeenCalledTimes(1);
    });

    it("accepts the token from REVIEWER_ACCESS_CODE env when ADMIN_CHECK_TOKEN is not set and DB has no row", async () => {
      delete process.env.ADMIN_CHECK_TOKEN;
      const ORIGINAL_RAC = process.env.REVIEWER_ACCESS_CODE;
      process.env.REVIEWER_ACCESS_CODE = "env-fallback-token";
      dbSelectWhere.mockResolvedValue([]);
      runReviewerPassCheck.mockResolvedValue({
        ok: true,
        demoUserId: "user_demo_123",
        healed: false,
        timestamp: new Date().toISOString(),
      });

      const res = await request(app)
        .post("/api/admin/reviewer-check")
        .set("Authorization", "Bearer env-fallback-token");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      if (ORIGINAL_RAC === undefined) delete process.env.REVIEWER_ACCESS_CODE;
      else process.env.REVIEWER_ACCESS_CODE = ORIGINAL_RAC;
    });
  });

  describe("error handling", () => {
    it("returns 500 when runReviewerPassCheck throws", async () => {
      runReviewerPassCheck.mockRejectedValue(new Error("DB exploded"));

      const res = await request(app)
        .post("/api/admin/reviewer-check")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    });
  });
});
