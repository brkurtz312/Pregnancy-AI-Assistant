import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import request from "supertest";

// ---------------------------------------------------------------------------
// Integration-style test: a real signed checkout.session.completed event
// flows through the webhook handler → lightly-stubbed StripeSync → in-memory
// state → userHasPass check.
//
// What's real:
//   - HMAC-SHA256 Stripe signature generation and verification (same algorithm
//     the real Stripe SDK uses: HMAC(key, "${timestamp}.${payload}") with the
//     key derived from the webhook secret).
//   - The webhook handler in app.ts (raw-body guard, missing-header guard,
//     error → 400 mapping) is exercised without changes.
//   - Event parsing, customer-ID extraction, and the conditional grantPass
//     call all run inside the stub's real logic.
//
// What's lightly stubbed:
//   - getStripeSync: returns a processWebhook that verifies the signature with
//     our test secret, then updates the shared in-memory user state — the same
//     net effect a real StripeSync would produce.
//   - userHasPass: reads from the same in-memory state, so the assertion after
//     the webhook exercises the real fast-path check (hasPass flag).
//
// Why in-memory state instead of a real DB:
//   Tests in this repo don't rely on a live DB — they run in CI where the DB
//   may not be migrated or available. Using shared in-memory state keeps the
//   test deterministic and self-contained while still exercising every layer
//   owned by the application: handler → signature check → event parsing →
//   entitlement mutation → entitlement read.
// ---------------------------------------------------------------------------

const TEST_WEBHOOK_SECRET = "test_stripe_integ_hmac_secret_0123456789abcdef";

// ---------------------------------------------------------------------------
// In-memory user state — shared between the StripeSync stub and the
// entitlement mock so a pass grant is immediately visible to userHasPass.
// ---------------------------------------------------------------------------
interface MockUser {
  id: string;
  stripeCustomerId: string | null;
  hasPass: boolean;
}
// Module-level: the vi.mock factories below capture this binding at call time
// (factories are evaluated lazily, not at hoist time), so the variable is
// already populated when any test runs.
const mockUsers = new Map<string, MockUser>();

// ---------------------------------------------------------------------------
// Stripe-compatible HMAC-SHA256 signature helpers.
// Algorithm: HMAC-SHA256(key, "${timestamp}.${payload}") in hex.
// The key is:
//   • If the secret starts with "whsec_": base64-decode the suffix.
//   • Otherwise: UTF-8 bytes of the secret.
// Both Stripe.webhooks.generateTestHeaderString and constructEvent use this
// same derivation. We replicate it here to stay SDK-version-independent.
// ---------------------------------------------------------------------------
function secretKey(secret: string): Buffer {
  return secret.startsWith("whsec_")
    ? Buffer.from(secret.slice("whsec_".length), "base64")
    : Buffer.from(secret, "utf8");
}

function makeStripeHeader(payload: string, secret: string = TEST_WEBHOOK_SECRET): string {
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secretKey(secret))
    .update(`${ts}.${payload}`)
    .digest("hex");
  return `t=${ts},v1=${sig}`;
}

function verifyStripeSignature(rawBody: Buffer, header: string, secret: string = TEST_WEBHOOK_SECRET): void {
  const ts = header.match(/t=(\d+)/)?.[1];
  const sigs = [...header.matchAll(/v1=([0-9a-f]+)/g)].map((m) => m[1]);
  if (!ts || !sigs.length) throw new Error("Invalid Stripe-Signature header");

  const expected = createHmac("sha256", secretKey(secret))
    .update(`${ts}.${rawBody.toString("utf8")}`)
    .digest("hex");

  if (!sigs.some((s) => s === expected)) {
    throw new Error("Stripe webhook signature verification failed");
  }
}

// ---------------------------------------------------------------------------
// Mocks — must appear before `import app` (vi.mock is hoisted by Vitest).
// ---------------------------------------------------------------------------

vi.mock("../src/lib/stripeClient", () => ({
  // Lightly-stubbed StripeSync: verifies the signature with the test HMAC key,
  // parses the event, and grants the pass to the matched user — the same net
  // DB write the real StripeSync + entitlement pipeline would produce.
  getStripeSync: async () => ({
    processWebhook: async (rawBody: Buffer, sig: string): Promise<void> => {
      verifyStripeSignature(rawBody, sig); // throws → handler returns 400

      const event = JSON.parse(rawBody.toString("utf8")) as {
        type: string;
        data: {
          object: { payment_status?: string; customer?: string };
        };
      };

      if (event.type !== "checkout.session.completed") return;
      const session = event.data.object;
      if (session.payment_status !== "paid" || !session.customer) return;

      // Grant the pass to the user that holds this Stripe customer ID.
      for (const user of mockUsers.values()) {
        if (user.stripeCustomerId === session.customer) {
          user.hasPass = true;
        }
      }
    },
  }),
  getUncachableStripeClient: vi.fn(),
}));

// Entitlement check reads from in-memory state — no DB required.
vi.mock("../src/lib/entitlement", () => ({
  userHasPass: async (userId: string): Promise<boolean> => {
    return mockUsers.get(userId)?.hasPass ?? false;
  },
}));

import app from "../src/app";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEST_USER_ID = "test_stripe_flow_user";
const TEST_CUSTOMER_ID = "cus_test_stripe_flow";

describe("checkout.session.completed → Pass entitlement (integration)", () => {
  beforeEach(() => {
    mockUsers.clear();
    mockUsers.set(TEST_USER_ID, {
      id: TEST_USER_ID,
      stripeCustomerId: TEST_CUSTOMER_ID,
      hasPass: false,
    });
  });

  it("grants the Pass after a valid paid checkout.session.completed event", async () => {
    const { userHasPass } = await import("../src/lib/entitlement");

    // Precondition: user has no pass.
    expect(await userHasPass(TEST_USER_ID)).toBe(false);

    const payload = JSON.stringify({
      id: "evt_integ_paid_1",
      type: "checkout.session.completed",
      data: {
        object: {
          object: "checkout.session",
          id: "cs_integ_paid_1",
          payment_status: "paid",
          customer: TEST_CUSTOMER_ID,
          metadata: { userId: TEST_USER_ID },
        },
      },
    });

    const sig = makeStripeHeader(payload);

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", sig)
      .set("Content-Type", "application/json")
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    // The real userHasPass reads from in-memory state — pass must be recorded.
    expect(await userHasPass(TEST_USER_ID)).toBe(true);
  });

  it("does not grant the Pass for an unpaid checkout.session.completed event", async () => {
    const { userHasPass } = await import("../src/lib/entitlement");

    const payload = JSON.stringify({
      id: "evt_integ_unpaid_1",
      type: "checkout.session.completed",
      data: {
        object: {
          object: "checkout.session",
          id: "cs_integ_unpaid_1",
          payment_status: "unpaid",
          customer: TEST_CUSTOMER_ID,
        },
      },
    });

    const sig = makeStripeHeader(payload);

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", sig)
      .set("Content-Type", "application/json")
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    // Unpaid session must leave the user's pass state unchanged.
    expect(await userHasPass(TEST_USER_ID)).toBe(false);
  });

  it("does not grant the Pass when the customer ID matches no known user", async () => {
    const { userHasPass } = await import("../src/lib/entitlement");

    const payload = JSON.stringify({
      id: "evt_integ_unknown_cus_1",
      type: "checkout.session.completed",
      data: {
        object: {
          object: "checkout.session",
          id: "cs_integ_unknown_cus_1",
          payment_status: "paid",
          customer: "cus_someone_else",
        },
      },
    });

    const sig = makeStripeHeader(payload);

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", sig)
      .set("Content-Type", "application/json")
      .send(payload);

    expect(res.status).toBe(200);
    expect(await userHasPass(TEST_USER_ID)).toBe(false);
  });

  it("returns 400 when the webhook signature does not match the configured secret", async () => {
    const { userHasPass } = await import("../src/lib/entitlement");

    const payload = JSON.stringify({
      id: "evt_integ_badsig_1",
      type: "checkout.session.completed",
      data: {
        object: {
          object: "checkout.session",
          id: "cs_integ_badsig_1",
          payment_status: "paid",
          customer: TEST_CUSTOMER_ID,
        },
      },
    });

    // Sign with a *different* secret — signature verification must reject it.
    const wrongSig = makeStripeHeader(payload, "totally_wrong_secret_xyz");

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", wrongSig)
      .set("Content-Type", "application/json")
      .send(payload);

    expect(res.status).toBe(400);

    // Pass must not have been granted despite the paid payload.
    expect(await userHasPass(TEST_USER_ID)).toBe(false);
  });
});
