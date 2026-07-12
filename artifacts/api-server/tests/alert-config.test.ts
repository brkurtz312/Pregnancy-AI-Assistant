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

const dbSelectWhere = vi.fn(async () => []);
const dbInsert = vi.fn(async () => []);
const dbDelete = vi.fn(async () => []);

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (..._args: unknown[]) => dbSelectWhere(),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => dbInsert(),
      }),
    }),
    delete: () => ({
      where: () => dbDelete(),
    }),
  },
  appConfigTable: { key: "key" },
}));

vi.mock("../src/lib/reviewer-check", () => ({
  runReviewerPassCheck: vi.fn(),
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
  dbSelectWhere.mockResolvedValue([]);
  dbInsert.mockResolvedValue([]);
  dbDelete.mockResolvedValue([]);
});

afterAll(() => {
  if (ORIGINAL_ADMIN_TOKEN === undefined) delete process.env.ADMIN_CHECK_TOKEN;
  else process.env.ADMIN_CHECK_TOKEN = ORIGINAL_ADMIN_TOKEN;
});

// ---------------------------------------------------------------------------
// GET /api/admin/alert-config
// ---------------------------------------------------------------------------

describe("GET /api/admin/alert-config", () => {
  describe("authentication", () => {
    it("returns 401 when no Authorization header is provided", async () => {
      const res = await request(app).get("/api/admin/alert-config");
      expect(res.status).toBe(401);
    });

    it("returns 401 when the token is wrong", async () => {
      const res = await request(app)
        .get("/api/admin/alert-config")
        .set("Authorization", "Bearer wrong-token");
      expect(res.status).toBe(401);
    });

    it("returns 503 when no admin token is configured", async () => {
      delete process.env.ADMIN_CHECK_TOKEN;
      const res = await request(app)
        .get("/api/admin/alert-config")
        .set("Authorization", "Bearer some-token");
      expect(res.status).toBe(503);
    });
  });

  describe("with no DB rows set", () => {
    it("returns all nulls when no keys are in the DB", async () => {
      dbSelectWhere.mockResolvedValue([]);

      const res = await request(app)
        .get("/api/admin/alert-config")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        alertSlackWebhookUrl: null,
        alertResendApiKey: null,
        alertEmail: null,
        alertFromEmail: null,
      });
    });
  });

  describe("with DB rows set", () => {
    it("returns plain email/fromEmail fields and masks secret fields", async () => {
      dbSelectWhere.mockResolvedValue([
        {
          key: "alert_slack_webhook_url",
          value: "https://hooks.slack.com/T0123/B456/abcdefgh1234",
        },
        { key: "alert_resend_api_key", value: "re_abc1234defgh5678" },
        { key: "alert_email", value: "ops@example.com" },
        { key: "alert_from_email", value: "alerts@example.com" },
      ]);

      const res = await request(app)
        .get("/api/admin/alert-config")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      // Email fields are returned as-is
      expect(res.body.alertEmail).toBe("ops@example.com");
      expect(res.body.alertFromEmail).toBe("alerts@example.com");
      // Secret fields must be masked (not equal to the original values)
      expect(res.body.alertSlackWebhookUrl).not.toBe(
        "https://hooks.slack.com/T0123/B456/abcdefgh1234",
      );
      expect(res.body.alertResendApiKey).not.toBe("re_abc1234defgh5678");
      // But they must not be null — something is there
      expect(res.body.alertSlackWebhookUrl).not.toBeNull();
      expect(res.body.alertResendApiKey).not.toBeNull();
    });

    it("masks short secrets with a fixed placeholder", async () => {
      dbSelectWhere.mockResolvedValue([
        { key: "alert_resend_api_key", value: "short" },
      ]);

      const res = await request(app)
        .get("/api/admin/alert-config")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.alertResendApiKey).toBe("••••••••");
    });
  });

  describe("error handling", () => {
    it("returns 500 when the DB throws", async () => {
      dbSelectWhere.mockRejectedValue(new Error("DB down"));

      const res = await request(app)
        .get("/api/admin/alert-config")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(500);
    });
  });
});

// ---------------------------------------------------------------------------
// PUT /api/admin/alert-config
// ---------------------------------------------------------------------------

describe("PUT /api/admin/alert-config", () => {
  describe("authentication", () => {
    it("returns 401 when no Authorization header is provided", async () => {
      const res = await request(app)
        .put("/api/admin/alert-config")
        .send({ alertEmail: "ops@example.com" });
      expect(res.status).toBe(401);
    });

    it("returns 401 when the token is wrong", async () => {
      const res = await request(app)
        .put("/api/admin/alert-config")
        .set("Authorization", "Bearer wrong-token")
        .send({ alertEmail: "ops@example.com" });
      expect(res.status).toBe(401);
    });

    it("returns 503 when no admin token is configured", async () => {
      delete process.env.ADMIN_CHECK_TOKEN;
      const res = await request(app)
        .put("/api/admin/alert-config")
        .set("Authorization", "Bearer some-token")
        .send({ alertEmail: "ops@example.com" });
      expect(res.status).toBe(503);
    });
  });

  describe("validation", () => {
    it("returns 400 when alertEmail is not a valid email", async () => {
      const res = await request(app)
        .put("/api/admin/alert-config")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
        .send({ alertEmail: "not-an-email" });
      expect(res.status).toBe(400);
    });

    it("returns 400 when alertFromEmail is not a valid email", async () => {
      const res = await request(app)
        .put("/api/admin/alert-config")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
        .send({ alertFromEmail: "bad-email" });
      expect(res.status).toBe(400);
    });

    it("accepts an empty body (no-op)", async () => {
      const res = await request(app)
        .put("/api/admin/alert-config")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.updated).toEqual([]);
    });
  });

  describe("upsert behaviour", () => {
    it("upserts a provided value and returns the DB key in updated[]", async () => {
      const res = await request(app)
        .put("/api/admin/alert-config")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
        .send({ alertEmail: "ops@example.com" });

      expect(res.status).toBe(200);
      expect(res.body.updated).toContain("alert_email");
      expect(dbInsert).toHaveBeenCalledTimes(1);
      expect(dbDelete).not.toHaveBeenCalled();
    });

    it("deletes the DB row when a field is set to null", async () => {
      const res = await request(app)
        .put("/api/admin/alert-config")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
        .send({ alertEmail: null });

      expect(res.status).toBe(200);
      expect(res.body.updated).toContain("alert_email");
      expect(dbDelete).toHaveBeenCalledTimes(1);
      expect(dbInsert).not.toHaveBeenCalled();
    });

    it("updates multiple fields in one call", async () => {
      const res = await request(app)
        .put("/api/admin/alert-config")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
        .send({
          alertEmail: "ops@example.com",
          alertFromEmail: "alerts@example.com",
          alertSlackWebhookUrl: "https://hooks.slack.com/services/T0/B0/xxx",
        });

      expect(res.status).toBe(200);
      expect(res.body.updated).toHaveLength(3);
      expect(res.body.updated).toContain("alert_email");
      expect(res.body.updated).toContain("alert_from_email");
      expect(res.body.updated).toContain("alert_slack_webhook_url");
      expect(dbInsert).toHaveBeenCalledTimes(3);
    });

    it("does not touch omitted fields", async () => {
      const res = await request(app)
        .put("/api/admin/alert-config")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
        .send({ alertEmail: "ops@example.com" });

      expect(res.status).toBe(200);
      expect(res.body.updated).toEqual(["alert_email"]);
      // Only one upsert; the other three keys were untouched
      expect(dbInsert).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("returns 500 when the DB throws during upsert", async () => {
      dbInsert.mockRejectedValue(new Error("DB down"));

      const res = await request(app)
        .put("/api/admin/alert-config")
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
        .send({ alertEmail: "ops@example.com" });

      expect(res.status).toBe(500);
    });
  });
});
