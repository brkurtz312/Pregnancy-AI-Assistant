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

// Stub the DB so requireAdminToken's internal resolveAdminToken() (which reads
// ADMIN_CHECK_TOKEN from process.env directly) never needs a real DB.
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    }),
  },
  appConfigTable: { key: "key" },
  usersTable: {},
}));

// Control both lib functions independently so we can simulate:
//   a) the initial "no run yet" state  (getReviewerCheckStatus returns all-null)
//   b) the "after a run" state         (getReviewerCheckStatus returns populated data)
const mockGetReviewerCheckStatus = vi.fn();
const mockRunReviewerPassCheck = vi.fn();

vi.mock("../src/lib/reviewer-check", () => ({
  getReviewerCheckStatus: () => mockGetReviewerCheckStatus(),
  runReviewerPassCheck: () => mockRunReviewerPassCheck(),
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

  // Default: no run has happened yet
  mockGetReviewerCheckStatus.mockResolvedValue({
    lastRunAt: null,
    lastResult: null,
    lastReason: null,
  });
});

afterAll(() => {
  if (ORIGINAL_ADMIN_TOKEN === undefined) delete process.env.ADMIN_CHECK_TOKEN;
  else process.env.ADMIN_CHECK_TOKEN = ORIGINAL_ADMIN_TOKEN;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/admin/reviewer-check/status", () => {
  describe("authentication", () => {
    it("returns 401 when no Authorization header is provided", async () => {
      const res = await request(app).get("/api/admin/reviewer-check/status");

      expect(res.status).toBe(401);
      expect(mockGetReviewerCheckStatus).not.toHaveBeenCalled();
    });

    it("returns 401 when the Authorization header has a wrong token", async () => {
      const res = await request(app)
        .get("/api/admin/reviewer-check/status")
        .set("Authorization", "Bearer wrong-token");

      expect(res.status).toBe(401);
      expect(mockGetReviewerCheckStatus).not.toHaveBeenCalled();
    });

    it("returns 401 when the Authorization header is malformed (no Bearer prefix)", async () => {
      const res = await request(app)
        .get("/api/admin/reviewer-check/status")
        .set("Authorization", ADMIN_TOKEN);

      expect(res.status).toBe(401);
      expect(mockGetReviewerCheckStatus).not.toHaveBeenCalled();
    });

    it("returns 503 when no admin token is configured on the server", async () => {
      delete process.env.ADMIN_CHECK_TOKEN;

      const res = await request(app)
        .get("/api/admin/reviewer-check/status")
        .set("Authorization", "Bearer some-token");

      expect(res.status).toBe(503);
      expect(mockGetReviewerCheckStatus).not.toHaveBeenCalled();
    });
  });

  describe("initial state — before any run", () => {
    it("returns 200 with all-null fields when the scheduler has not fired yet", async () => {
      const res = await request(app)
        .get("/api/admin/reviewer-check/status")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        lastRunAt: null,
        lastResult: null,
        lastReason: null,
      });
      expect(mockGetReviewerCheckStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe("after a passing run", () => {
    it("returns lastRunAt, lastResult='ok', and lastReason=null after runReviewerPassCheck succeeds", async () => {
      const runTimestamp = new Date().toISOString();

      // Simulate: runReviewerPassCheck ran and persisted its result.
      // getReviewerCheckStatus now reflects the post-run state.
      mockRunReviewerPassCheck.mockResolvedValue({
        ok: true,
        demoUserId: "user_demo_123",
        healed: false,
        timestamp: runTimestamp,
      });
      mockGetReviewerCheckStatus.mockResolvedValue({
        lastRunAt: runTimestamp,
        lastResult: "ok",
        lastReason: null,
      });

      // Trigger a run via the POST endpoint so the mock state transitions
      await request(app)
        .post("/api/admin/reviewer-check")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`);

      // Now verify the GET /status endpoint reflects the persisted result
      const res = await request(app)
        .get("/api/admin/reviewer-check/status")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.lastRunAt).toBe(runTimestamp);
      expect(res.body.lastResult).toBe("ok");
      expect(res.body.lastReason).toBeNull();
    });
  });

  describe("after a failing run", () => {
    it("returns lastResult='fail' and the reason after runReviewerPassCheck detects a revoked pass", async () => {
      const runTimestamp = new Date().toISOString();

      mockRunReviewerPassCheck.mockResolvedValue({
        ok: false,
        demoUserId: "user_demo_123",
        healed: true,
        reason: "pass_revoked",
        timestamp: runTimestamp,
      });
      mockGetReviewerCheckStatus.mockResolvedValue({
        lastRunAt: runTimestamp,
        lastResult: "fail",
        lastReason: "pass_revoked",
      });

      await request(app)
        .post("/api/admin/reviewer-check")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`);

      const res = await request(app)
        .get("/api/admin/reviewer-check/status")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.lastRunAt).toBe(runTimestamp);
      expect(res.body.lastResult).toBe("fail");
      expect(res.body.lastReason).toBe("pass_revoked");
    });

    it("returns lastResult='fail' and reason='user_missing' when the demo user row was absent", async () => {
      const runTimestamp = new Date().toISOString();

      mockRunReviewerPassCheck.mockResolvedValue({
        ok: false,
        demoUserId: "user_demo_123",
        healed: true,
        reason: "user_missing",
        timestamp: runTimestamp,
      });
      mockGetReviewerCheckStatus.mockResolvedValue({
        lastRunAt: runTimestamp,
        lastResult: "fail",
        lastReason: "user_missing",
      });

      await request(app)
        .post("/api/admin/reviewer-check")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`);

      const res = await request(app)
        .get("/api/admin/reviewer-check/status")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.lastRunAt).toBe(runTimestamp);
      expect(res.body.lastResult).toBe("fail");
      expect(res.body.lastReason).toBe("user_missing");
    });
  });

  describe("error handling", () => {
    it("returns 500 when getReviewerCheckStatus throws", async () => {
      mockGetReviewerCheckStatus.mockRejectedValue(new Error("DB exploded"));

      const res = await request(app)
        .get("/api/admin/reviewer-check/status")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    });
  });
});
