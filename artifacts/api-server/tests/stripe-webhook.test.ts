import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

// --- Mocks for the webhook's collaborators ---------------------------------
// The /api/stripe/webhook handler (registered in app.ts) hands the raw body
// and signature to a StripeSync instance returned by getStripeSync. We mock
// that so the tests exercise the handler's guard rails (missing signature,
// non-raw body) and the happy path without real Stripe credentials or a DB.

const processWebhook = vi.fn(async () => {});
const getStripeSync = vi.fn(async () => ({ processWebhook }));
vi.mock("../src/lib/stripeClient", () => ({
  getStripeSync: () => getStripeSync(),
  getUncachableStripeClient: vi.fn(),
}));

import app from "../src/app";

beforeEach(() => {
  vi.clearAllMocks();
  processWebhook.mockResolvedValue(undefined);
  getStripeSync.mockResolvedValue({ processWebhook });
});

describe("POST /api/stripe/webhook", () => {
  it("returns 400 when the stripe-signature header is missing", async () => {
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .send({ type: "checkout.session.completed" });

    expect(res.status).toBe(400);
    expect(getStripeSync).not.toHaveBeenCalled();
    expect(processWebhook).not.toHaveBeenCalled();
  });

  it("returns 500 when the body was already JSON-parsed instead of a raw Buffer", async () => {
    // A non-application/json content type means express.raw() skips parsing, so
    // req.body is not a Buffer -- the handler must refuse to process it.
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "t=1,v1=deadbeef")
      .set("Content-Type", "text/plain")
      .send('{"type":"checkout.session.completed"}');

    expect(res.status).toBe(500);
    expect(processWebhook).not.toHaveBeenCalled();
  });

  it("processes a valid signed payload and returns 200", async () => {
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "t=1,v1=deadbeef")
      .set("Content-Type", "application/json")
      .send({ type: "checkout.session.completed", id: "evt_1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(getStripeSync).toHaveBeenCalledTimes(1);
    expect(processWebhook).toHaveBeenCalledTimes(1);
    // The handler must forward the raw body (a Buffer) and the signature.
    const [body, signature] = processWebhook.mock.calls[0] as [
      unknown,
      unknown,
    ];
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(signature).toBe("t=1,v1=deadbeef");
  });

  it("returns 400 when stripe-sync rejects the payload (bad signature)", async () => {
    processWebhook.mockRejectedValue(new Error("invalid signature"));

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "t=1,v1=bad")
      .set("Content-Type", "application/json")
      .send({ type: "checkout.session.completed" });

    expect(res.status).toBe(400);
    expect(processWebhook).toHaveBeenCalledTimes(1);
  });
});
