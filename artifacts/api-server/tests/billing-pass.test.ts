import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";

// --- Mocks for the route's collaborators -----------------------------------
// The billing routes touch the DB (to look up the synced Stripe price), the
// Stripe client, the user store and the entitlement check. We mock those so
// the tests exercise the purchase/confirm/status logic without real Stripe or
// a database.

const dbExecute = vi.fn(async () => ({
  rows: [] as Array<{ price_id?: string }>,
}));
vi.mock("@workspace/db", () => ({
  db: { execute: (...args: unknown[]) => dbExecute(...(args as [])) },
}));

let authedUserId: string | null = "user_1";
vi.mock("../src/middlewares/auth", () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => {
    if (!authedUserId) {
      res.status(401).json({ error: "Please sign in to continue." });
      return;
    }
    (req as Request & { userId?: string }).userId = authedUserId;
    next();
  },
  getUserId: () => authedUserId,
}));

const getOrCreateUser = vi.fn();
const setStripeCustomerId = vi.fn(async () => {});
const grantPass = vi.fn(async () => {});
vi.mock("../src/lib/users", () => ({
  getOrCreateUser: (id: string) => getOrCreateUser(id),
  setStripeCustomerId: (id: string, c: string) => setStripeCustomerId(id, c),
  grantPass: (id: string) => grantPass(id),
}));

const userHasPass = vi.fn(async (_id: string) => false);
vi.mock("../src/lib/entitlement", () => ({
  userHasPass: (id: string) => userHasPass(id),
}));

const getUncachableStripeClient = vi.fn();
vi.mock("../src/lib/stripeClient", () => ({
  getUncachableStripeClient: () => getUncachableStripeClient(),
}));

const getUncachableRevenueCatClient = vi.fn(async () => ({}));
vi.mock("../src/lib/revenueCatClient", () => ({
  getUncachableRevenueCatClient: () => getUncachableRevenueCatClient(),
}));

const listEntitlements = vi.fn();
const listCustomerActiveEntitlements = vi.fn();
vi.mock("@replit/revenuecat-sdk", () => ({
  listEntitlements: (...args: unknown[]) => listEntitlements(...args),
  listCustomerActiveEntitlements: (...args: unknown[]) =>
    listCustomerActiveEntitlements(...args),
}));

const getUsage = vi.fn(async (_id: string, _period: string) => 0);
vi.mock("../src/lib/ai-usage", () => ({
  currentPeriodKey: () => "2026-W23",
  getUsage: (id: string, period: string) => getUsage(id, period),
}));

// The redeem-code limiter is backed by a shared Postgres store; stub it to a
// no-op so this unit test doesn't need a real DB-backed rate-limit table.
vi.mock("../src/lib/rate-limit", () => ({
  redeemCodeLimiter: (_req: Request, _res: Response, next: NextFunction) =>
    next(),
  getClientIp: (req: Request): string => {
    const xff = req.headers["x-forwarded-for"];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
    return first || "unknown";
  },
}));

import billingRouter from "../src/routes/billing/index";

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
  app.use("/api", billingRouter);
  return app;
}

const app = buildApp();

beforeEach(() => {
  vi.clearAllMocks();
  authedUserId = "user_1";
  getOrCreateUser.mockResolvedValue({
    id: "user_1",
    email: "mom@example.com",
    stripeCustomerId: null,
    hasPass: false,
  });
  userHasPass.mockResolvedValue(false);
  getUsage.mockResolvedValue(0);
  dbExecute.mockResolvedValue({ rows: [{ price_id: "price_pass_123" }] });
});

describe("GET /api/billing/pass-status", () => {
  it("requires authentication", async () => {
    authedUserId = null;
    const res = await request(app).get("/api/billing/pass-status");
    expect(res.status).toBe(401);
  });

  it("reports pass ownership and free usage for a signed-in user", async () => {
    userHasPass.mockResolvedValue(true);
    getUsage.mockResolvedValue(3);
    const res = await request(app).get("/api/billing/pass-status");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasPass: true, freeUsed: 3, freeLimit: 5 });
    expect(getUsage.mock.calls[0][0]).toBe("user:user_1");
  });
});

describe("POST /api/billing/checkout", () => {
  it("creates a Stripe customer and checkout session and returns the url", async () => {
    const customersCreate = vi.fn(async () => ({ id: "cus_new" }));
    const sessionsCreate = vi.fn(async () => ({
      url: "https://checkout.stripe.com/c/session_abc",
    }));
    getUncachableStripeClient.mockResolvedValue({
      customers: { create: customersCreate },
      checkout: { sessions: { create: sessionsCreate } },
    });

    const res = await request(app)
      .post("/api/billing/checkout")
      .send({ returnUrl: "https://app.example.com/?tab=assistant" });

    expect(res.status).toBe(200);
    expect(res.body.url).toContain("checkout.stripe.com");
    expect(customersCreate).toHaveBeenCalledTimes(1);
    expect(setStripeCustomerId).toHaveBeenCalledWith("user_1", "cus_new");
    // The created session must use the synced pass price.
    expect(sessionsCreate.mock.calls[0][0].line_items[0].price).toBe(
      "price_pass_123",
    );
  });

  it("reuses an existing Stripe customer instead of creating a new one", async () => {
    getOrCreateUser.mockResolvedValue({
      id: "user_1",
      email: "mom@example.com",
      stripeCustomerId: "cus_existing",
      hasPass: false,
    });
    const customersCreate = vi.fn();
    const sessionsCreate = vi.fn(async () => ({
      url: "https://checkout.stripe.com/c/s2",
    }));
    getUncachableStripeClient.mockResolvedValue({
      customers: { create: customersCreate },
      checkout: { sessions: { create: sessionsCreate } },
    });

    const res = await request(app)
      .post("/api/billing/checkout")
      .send({ returnUrl: "https://app.example.com/" });

    expect(res.status).toBe(200);
    expect(customersCreate).not.toHaveBeenCalled();
    expect(sessionsCreate.mock.calls[0][0].customer).toBe("cus_existing");
  });

  it("returns 503 when the pass price is not found in synced Stripe data", async () => {
    dbExecute.mockResolvedValue({ rows: [] });
    getUncachableStripeClient.mockResolvedValue({
      customers: { create: vi.fn(async () => ({ id: "cus_x" })) },
      checkout: { sessions: { create: vi.fn() } },
    });
    const res = await request(app)
      .post("/api/billing/checkout")
      .send({ returnUrl: "https://app.example.com/" });
    expect(res.status).toBe(503);
  });

  it("rejects a malformed checkout body with 400", async () => {
    const res = await request(app).post("/api/billing/checkout").send({});
    expect(res.status).toBe(400);
  });
});

describe("POST /api/billing/confirm", () => {
  function stripeWithSession(session: unknown) {
    const retrieve = vi.fn(async () => session);
    getUncachableStripeClient.mockResolvedValue({
      checkout: { sessions: { retrieve } },
    });
    return retrieve;
  }

  it("grants the pass when a paid session belongs to the user", async () => {
    stripeWithSession({
      metadata: { userId: "user_1" },
      payment_status: "paid",
      customer: "cus_1",
    });
    userHasPass.mockResolvedValue(true); // reflects the freshly granted pass

    const res = await request(app)
      .post("/api/billing/confirm")
      .send({ sessionId: "cs_test_paid" });

    expect(res.status).toBe(200);
    expect(grantPass).toHaveBeenCalledWith("user_1");
    expect(res.body.hasPass).toBe(true);
  });

  it("does not grant the pass for an unpaid session", async () => {
    stripeWithSession({
      metadata: { userId: "user_1" },
      payment_status: "unpaid",
      customer: "cus_1",
    });
    const res = await request(app)
      .post("/api/billing/confirm")
      .send({ sessionId: "cs_test_unpaid" });

    expect(res.status).toBe(200);
    expect(grantPass).not.toHaveBeenCalled();
    expect(res.body.hasPass).toBe(false);
  });

  it("does not grant the pass when a paid session belongs to another user", async () => {
    getOrCreateUser.mockResolvedValue({
      id: "user_1",
      email: "mom@example.com",
      stripeCustomerId: "cus_1",
      hasPass: false,
    });
    stripeWithSession({
      metadata: { userId: "someone_else" },
      payment_status: "paid",
      customer: "cus_other",
    });
    const res = await request(app)
      .post("/api/billing/confirm")
      .send({ sessionId: "cs_test_foreign" });

    expect(res.status).toBe(200);
    expect(grantPass).not.toHaveBeenCalled();
  });

  it("returns current status without granting when no sessionId is provided", async () => {
    const res = await request(app).post("/api/billing/confirm").send({});
    expect(res.status).toBe(200);
    expect(grantPass).not.toHaveBeenCalled();
    expect(getUncachableStripeClient).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/redeem-code", () => {
  const ORIGINAL_CODE = process.env.DEV_ACCESS_CODE;

  beforeEach(() => {
    process.env.DEV_ACCESS_CODE = "let-me-in";
  });

  afterAll(() => {
    if (ORIGINAL_CODE === undefined) delete process.env.DEV_ACCESS_CODE;
    else process.env.DEV_ACCESS_CODE = ORIGINAL_CODE;
  });

  it("requires authentication", async () => {
    authedUserId = null;
    const res = await request(app)
      .post("/api/billing/redeem-code")
      .send({ code: "let-me-in" });
    expect(res.status).toBe(401);
    expect(grantPass).not.toHaveBeenCalled();
  });

  it("rejects a malformed body with 400", async () => {
    const res = await request(app).post("/api/billing/redeem-code").send({});
    expect(res.status).toBe(400);
    expect(grantPass).not.toHaveBeenCalled();
  });

  it("returns 503 when no developer code is configured", async () => {
    delete process.env.DEV_ACCESS_CODE;
    const res = await request(app)
      .post("/api/billing/redeem-code")
      .send({ code: "let-me-in" });
    expect(res.status).toBe(503);
    expect(grantPass).not.toHaveBeenCalled();
  });

  it("rejects an incorrect code with 403 and does not grant the pass", async () => {
    const res = await request(app)
      .post("/api/billing/redeem-code")
      .send({ code: "wrong-code" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("INVALID_CODE");
    expect(grantPass).not.toHaveBeenCalled();
  });

  it("grants the pass and returns updated status for the correct code", async () => {
    userHasPass.mockResolvedValue(true); // reflects the freshly granted pass
    const res = await request(app)
      .post("/api/billing/redeem-code")
      .send({ code: "  let-me-in  " });
    expect(res.status).toBe(200);
    expect(grantPass).toHaveBeenCalledWith("user_1");
    expect(res.body.hasPass).toBe(true);
  });
});

describe("POST /api/billing/revenuecat/reconcile", () => {
  const ORIGINAL_PROJECT_ID = process.env.REVENUECAT_PROJECT_ID;

  beforeEach(() => {
    process.env.REVENUECAT_PROJECT_ID = "proj_test";
    // By default, the project exposes the "pass" entitlement with internal id
    // "entl_pass_1"; subclasses of each test override the customer entitlements.
    listEntitlements.mockResolvedValue({
      data: { items: [{ id: "entl_pass_1", lookup_key: "pass" }] },
      error: null,
    });
    listCustomerActiveEntitlements.mockResolvedValue({
      data: { items: [] },
      error: null,
    });
  });

  afterAll(() => {
    if (ORIGINAL_PROJECT_ID === undefined)
      delete process.env.REVENUECAT_PROJECT_ID;
    else process.env.REVENUECAT_PROJECT_ID = ORIGINAL_PROJECT_ID;
  });

  it("requires authentication", async () => {
    authedUserId = null;
    const res = await request(app).post("/api/billing/revenuecat/reconcile");
    expect(res.status).toBe(401);
    expect(grantPass).not.toHaveBeenCalled();
  });

  it("returns 503 when REVENUECAT_PROJECT_ID is not configured", async () => {
    delete process.env.REVENUECAT_PROJECT_ID;
    const res = await request(app).post("/api/billing/revenuecat/reconcile");
    expect(res.status).toBe(503);
    expect(grantPass).not.toHaveBeenCalled();
  });

  it("grants the pass when the customer holds the active 'pass' entitlement", async () => {
    listCustomerActiveEntitlements.mockResolvedValue({
      data: { items: [{ entitlement_id: "entl_pass_1", expires_at: null }] },
      error: null,
    });
    userHasPass.mockResolvedValue(true); // reflects the freshly granted pass
    const res = await request(app).post("/api/billing/revenuecat/reconcile");
    expect(res.status).toBe(200);
    expect(grantPass).toHaveBeenCalledWith("user_1");
    expect(res.body.hasPass).toBe(true);
    // It matched by resolved internal id, not the lookup_key.
    expect(listEntitlements).toHaveBeenCalledTimes(1);
  });

  it("does not grant the pass when the customer has no active entitlements", async () => {
    listCustomerActiveEntitlements.mockResolvedValue({
      data: { items: [] },
      error: null,
    });
    const res = await request(app).post("/api/billing/revenuecat/reconcile");
    expect(res.status).toBe(200);
    expect(grantPass).not.toHaveBeenCalled();
    expect(res.body.hasPass).toBe(false);
  });

  it("does not grant the pass for an unrelated active entitlement", async () => {
    listCustomerActiveEntitlements.mockResolvedValue({
      data: { items: [{ entitlement_id: "entl_other", expires_at: null }] },
      error: null,
    });
    const res = await request(app).post("/api/billing/revenuecat/reconcile");
    expect(res.status).toBe(200);
    expect(grantPass).not.toHaveBeenCalled();
  });

  it("returns 503 when listing the customer's entitlements fails", async () => {
    listCustomerActiveEntitlements.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const res = await request(app).post("/api/billing/revenuecat/reconcile");
    expect(res.status).toBe(503);
    expect(grantPass).not.toHaveBeenCalled();
  });

  it("returns 503 when the 'pass' entitlement cannot be resolved", async () => {
    listEntitlements.mockResolvedValue({
      data: { items: [{ id: "entl_other", lookup_key: "other" }] },
      error: null,
    });
    const res = await request(app).post("/api/billing/revenuecat/reconcile");
    expect(res.status).toBe(503);
    expect(grantPass).not.toHaveBeenCalled();
  });

  it("returns 503 when listing the project entitlements fails", async () => {
    listEntitlements.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const res = await request(app).post("/api/billing/revenuecat/reconcile");
    expect(res.status).toBe(503);
    expect(grantPass).not.toHaveBeenCalled();
    expect(listCustomerActiveEntitlements).not.toHaveBeenCalled();
  });
});
