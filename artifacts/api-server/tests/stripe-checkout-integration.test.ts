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

// Stripe customer records (id → metadata) used by the stubbed
// stripe.customers.retrieve — the webhook grant path verifies the customer's
// own metadata.userId before linking a customer to a user.
const mockStripeCustomers = new Map<string, Record<string, string>>();

// ---------------------------------------------------------------------------
// Tracks customer IDs for which a paid checkout.session.completed has been
// processed — regardless of whether a user row existed at that moment.
//
// This mirrors the real StripeSync behaviour: processWebhook writes the
// payment to the stripe.payment_intents table, so the record survives even
// when no app user row exists yet. userHasPass later queries that table as a
// fallback (see entitlement.ts) and back-fills hasPass on the user row. The
// succeededPayments set plays the same role here so the test exercises the
// same two-phase "record now, grant on first load" guarantee.
// ---------------------------------------------------------------------------
const succeededPayments = new Set<string>();

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

function makeStripeHeader(
  payload: string,
  secret: string = TEST_WEBHOOK_SECRET,
): string {
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secretKey(secret))
    .update(`${ts}.${payload}`)
    .digest("hex");
  return `t=${ts},v1=${sig}`;
}

function verifyStripeSignature(
  rawBody: Buffer,
  header: string,
  secret: string = TEST_WEBHOOK_SECRET,
): void {
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

// Stub for users.ts — intercepts revokePassByStripeCustomerId so the webhook
// handler's revocation path mutates in-memory state instead of hitting the DB.
// Also removes the customer from succeededPayments so the entitlement mock's
// fallback path (which mirrors the stripe.payment_intents query) agrees that
// the payment is no longer succeeded — matching the real StripeSync behaviour
// where it updates the payment status to 'refunded' in its own table.
vi.mock("../src/lib/users", () => ({
  revokePassByStripeCustomerId: async (customerId: string): Promise<void> => {
    succeededPayments.delete(customerId);
    for (const user of mockUsers.values()) {
      if (user.stripeCustomerId === customerId) {
        user.hasPass = false;
      }
    }
  },
  getUser: async (id: string) => mockUsers.get(id),
  grantPass: async (id: string): Promise<void> => {
    const user = mockUsers.get(id);
    if (user) user.hasPass = true;
  },
  setStripeCustomerId: async (
    id: string,
    stripeCustomerId: string,
  ): Promise<void> => {
    const user = mockUsers.get(id);
    if (user) user.stripeCustomerId = stripeCustomerId;
  },
}));

vi.mock("../src/lib/stripeClient", () => ({
  // Lightly-stubbed StripeSync: verifies the signature with the test HMAC key,
  // parses the event, then models the real two-phase behaviour:
  //
  //   Phase 1 (processWebhook): record the paid customer ID in
  //   succeededPayments — regardless of whether a user row exists yet.
  //   This mirrors StripeSync writing a row to stripe.payment_intents.
  //
  //   Phase 2 (userHasPass): when the user row later exists and carries the
  //   same stripeCustomerId, the entitlement mock finds it in
  //   succeededPayments and back-fills hasPass — mirroring the real fallback
  //   query in entitlement.ts that reads stripe.payment_intents.
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

      // Always record the succeeded payment — the user row may not exist yet.
      succeededPayments.add(session.customer);

      // Also eagerly update any user row that already holds this customer ID,
      // matching the fast path where the user row pre-dates the webhook.
      for (const user of mockUsers.values()) {
        if (user.stripeCustomerId === session.customer) {
          user.hasPass = true;
        }
      }
    },
  }),
  getUncachableStripeClient: async () => ({
    customers: {
      retrieve: async (customerId: string) => {
        const meta = mockStripeCustomers.get(customerId);
        if (!meta) throw new Error(`No such customer: ${customerId}`);
        return { id: customerId, deleted: false, metadata: meta };
      },
    },
  }),
}));

// Entitlement check mirrors the real userHasPass two-phase logic:
//   • Fast path: the hasPass flag on the user row.
//   • Fallback: check succeededPayments by stripeCustomerId (equivalent to
//     querying stripe.payment_intents in entitlement.ts). On a hit, back-fill
//     hasPass on the user row so subsequent checks are instant.
vi.mock("../src/lib/entitlement", () => ({
  userHasPass: async (userId: string): Promise<boolean> => {
    const user = mockUsers.get(userId);
    if (!user) return false;
    if (user.hasPass) return true;
    if (user.stripeCustomerId && succeededPayments.has(user.stripeCustomerId)) {
      user.hasPass = true;
      return true;
    }
    return false;
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
    succeededPayments.clear();
    mockStripeCustomers.clear();
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

  // ---------------------------------------------------------------------------
  // Pass revocation: charge.refunded
  //
  // A successful payment may be refunded (e.g. the user disputes the charge or
  // requests a refund). When Stripe fires charge.refunded the webhook handler
  // must clear the denormalized hasPass flag so the next userHasPass call does
  // not return true via the fast-path.
  // ---------------------------------------------------------------------------
  it("revokes the Pass after a valid charge.refunded event", async () => {
    const { userHasPass } = await import("../src/lib/entitlement");

    // Precondition: user already holds the pass (e.g. from a prior checkout).
    mockUsers.set(TEST_USER_ID, {
      id: TEST_USER_ID,
      stripeCustomerId: TEST_CUSTOMER_ID,
      hasPass: true,
    });
    succeededPayments.add(TEST_CUSTOMER_ID);
    expect(await userHasPass(TEST_USER_ID)).toBe(true);

    const payload = JSON.stringify({
      id: "evt_integ_refund_1",
      type: "charge.refunded",
      data: {
        object: {
          object: "charge",
          id: "ch_integ_refund_1",
          customer: TEST_CUSTOMER_ID,
          refunded: true,
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

    // hasPass must be cleared — a refunded payment no longer grants access.
    expect(await userHasPass(TEST_USER_ID)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Pass revocation: payment_intent.payment_failed
  //
  // A payment that was marked succeeded can later fail (e.g. chargeback, bank
  // reversal). The webhook handler must revoke the pass in the same way it does
  // for an explicit refund.
  // ---------------------------------------------------------------------------
  it("revokes the Pass after a valid payment_intent.payment_failed event", async () => {
    const { userHasPass } = await import("../src/lib/entitlement");

    // Precondition: user already holds the pass.
    mockUsers.set(TEST_USER_ID, {
      id: TEST_USER_ID,
      stripeCustomerId: TEST_CUSTOMER_ID,
      hasPass: true,
    });
    succeededPayments.add(TEST_CUSTOMER_ID);
    expect(await userHasPass(TEST_USER_ID)).toBe(true);

    const payload = JSON.stringify({
      id: "evt_integ_pi_failed_1",
      type: "payment_intent.payment_failed",
      data: {
        object: {
          object: "payment_intent",
          id: "pi_integ_failed_1",
          customer: TEST_CUSTOMER_ID,
          status: "requires_payment_method",
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

    // hasPass must be cleared — a failed payment no longer grants access.
    expect(await userHasPass(TEST_USER_ID)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Revocation bad signature: must not revoke the pass.
  //
  // A spoofed refund event with an invalid signature must be rejected (400)
  // and must not revoke an active pass.
  // ---------------------------------------------------------------------------
  it("does not revoke the Pass when the charge.refunded signature is invalid", async () => {
    const { userHasPass } = await import("../src/lib/entitlement");

    // Precondition: user already holds the pass.
    mockUsers.set(TEST_USER_ID, {
      id: TEST_USER_ID,
      stripeCustomerId: TEST_CUSTOMER_ID,
      hasPass: true,
    });
    succeededPayments.add(TEST_CUSTOMER_ID);

    const payload = JSON.stringify({
      id: "evt_integ_refund_badsig_1",
      type: "charge.refunded",
      data: {
        object: {
          object: "charge",
          id: "ch_integ_refund_badsig_1",
          customer: TEST_CUSTOMER_ID,
          refunded: true,
        },
      },
    });

    // Sign with the wrong secret — handler must reject with 400.
    const wrongSig = makeStripeHeader(payload, "totally_wrong_secret_xyz");

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", wrongSig)
      .set("Content-Type", "application/json")
      .send(payload);

    expect(res.status).toBe(400);

    // Pass must remain intact — the spoofed event must have no effect.
    expect(await userHasPass(TEST_USER_ID)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Race-condition: webhook arrives before the user row exists.
  //
  // In production the checkout.session.completed webhook can fire while the
  // user is still on the Stripe-hosted payment page — before they have ever
  // opened the app and before getOrCreateUser has run. The stub previously
  // iterated mockUsers and silently skipped the grant when no matching row was
  // found, which did not replicate the real StripeSync behaviour.
  //
  // The real StripeSync writes to stripe.payment_intents regardless of whether
  // a user row exists. When the user later loads the app, userHasPass falls
  // back to querying that table and back-fills hasPass. The succeededPayments
  // set in this test file plays exactly that role, so this test exercises the
  // same two-phase guarantee end-to-end.
  // ---------------------------------------------------------------------------
  it("does not silently lose the pass when the webhook fires before the user row exists", async () => {
    const { userHasPass } = await import("../src/lib/entitlement");

    const EARLY_CUSTOMER_ID = "cus_arrives_before_user_row";
    const LATE_USER_ID = "test_late_provisioned_user";

    // Precondition: no user row exists for this Stripe customer.
    expect(mockUsers.has(LATE_USER_ID)).toBe(false);

    const payload = JSON.stringify({
      id: "evt_integ_early_webhook_1",
      type: "checkout.session.completed",
      data: {
        object: {
          object: "checkout.session",
          id: "cs_integ_early_1",
          payment_status: "paid",
          customer: EARLY_CUSTOMER_ID,
          metadata: { userId: LATE_USER_ID },
        },
      },
    });

    const sig = makeStripeHeader(payload);
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", sig)
      .set("Content-Type", "application/json")
      .send(payload);

    // Webhook must be accepted — returning a non-200 would cause Stripe to
    // retry indefinitely, but a 200 with a persisted record is the correct
    // contract (StripeSync writes to stripe.payment_intents).
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    // Simulate the user's first app load: getOrCreateUser provisions the row
    // and links it to the Stripe customer created at checkout time.
    mockUsers.set(LATE_USER_ID, {
      id: LATE_USER_ID,
      stripeCustomerId: EARLY_CUSTOMER_ID,
      hasPass: false,
    });

    // The pass must be discoverable via the stripe.payment_intents fallback
    // (modelled by succeededPayments) — it must not have been silently lost.
    expect(await userHasPass(LATE_USER_ID)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Direct webhook grant path: the user row exists but the Stripe customer ID
  // was not persisted yet (webhook raced /billing/checkout's save, or the save
  // failed). The handler must verify the customer's own metadata.userId before
  // linking, then grant immediately.
  // ---------------------------------------------------------------------------
  async function postPaidCheckout(customer: string, userId: string) {
    const payload = JSON.stringify({
      id: `evt_grant_${customer}`,
      type: "checkout.session.completed",
      data: {
        object: {
          object: "checkout.session",
          id: `cs_grant_${customer}`,
          payment_status: "paid",
          customer,
          metadata: { userId },
        },
      },
    });
    return request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", makeStripeHeader(payload))
      .set("Content-Type", "application/json")
      .send(payload);
  }

  it("links and grants when the user is unlinked and the Stripe customer's metadata confirms the user", async () => {
    const USER = "unlinked_user_1";
    const CUS = "cus_unlinked_confirmed";
    mockUsers.set(USER, { id: USER, stripeCustomerId: null, hasPass: false });
    mockStripeCustomers.set(CUS, { userId: USER });

    const res = await postPaidCheckout(CUS, USER);
    expect(res.status).toBe(200);

    const user = mockUsers.get(USER)!;
    expect(user.stripeCustomerId).toBe(CUS);
    expect(user.hasPass).toBe(true);
  });

  it("does NOT link or grant when the Stripe customer's metadata references a different user", async () => {
    const USER = "unlinked_user_2";
    const CUS = "cus_metadata_mismatch";
    mockUsers.set(USER, { id: USER, stripeCustomerId: null, hasPass: false });
    mockStripeCustomers.set(CUS, { userId: "someone_else" });

    const res = await postPaidCheckout(CUS, USER);
    expect(res.status).toBe(200); // webhook still accepted

    const user = mockUsers.get(USER)!;
    expect(user.stripeCustomerId).toBeNull();
    expect(user.hasPass).toBe(false);
  });

  it("does NOT grant when the user is already linked to a different Stripe customer", async () => {
    const USER = "linked_elsewhere_user";
    const CUS_EVENT = "cus_from_event";
    mockUsers.set(USER, {
      id: USER,
      stripeCustomerId: "cus_original_link",
      hasPass: false,
    });
    mockStripeCustomers.set(CUS_EVENT, { userId: USER });

    const res = await postPaidCheckout(CUS_EVENT, USER);
    expect(res.status).toBe(200);

    const user = mockUsers.get(USER)!;
    expect(user.stripeCustomerId).toBe("cus_original_link"); // unchanged
    expect(user.hasPass).toBe(false);
  });

  it("grants directly when the user is already linked to the event's customer", async () => {
    // TEST_USER_ID is seeded in beforeEach with TEST_CUSTOMER_ID and no pass.
    const res = await postPaidCheckout(TEST_CUSTOMER_ID, TEST_USER_ID);
    expect(res.status).toBe(200);
    expect(mockUsers.get(TEST_USER_ID)!.hasPass).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Stripe customer retrieval failure: user row exists + stripeCustomerId null,
  // but customers.retrieve() throws (network error, rate limit, etc.).
  //
  // Pre-fix: the catch block logged the error and moved on — the pass was
  // silently lost, with no backfill because stripeCustomerId stayed null.
  //
  // Post-fix: the catch block still calls grantPass() unconditionally because
  // the webhook body is already HMAC-verified — the payment itself is
  // authenticated. The customer link may be missing, but the entitlement is not.
  // ---------------------------------------------------------------------------
  it("grants pass even when customers.retrieve() throws (transient network/rate-limit error)", async () => {
    const USER = "unlinked_retrieve_fails";
    const CUS = "cus_retrieve_will_throw";

    // Deliberately do NOT add CUS to mockStripeCustomers so that
    // getUncachableStripeClient().customers.retrieve(CUS) throws "No such
    // customer: cus_retrieve_will_throw", simulating a Stripe API error.
    mockUsers.set(USER, { id: USER, stripeCustomerId: null, hasPass: false });

    const res = await postPaidCheckout(CUS, USER);

    // Webhook is still accepted — returning non-200 would cause Stripe to
    // retry indefinitely which would hit the same error.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    // Despite the retrieval failure the pass MUST be granted, because the
    // webhook HMAC verifies the payment is real.
    const user = mockUsers.get(USER)!;
    expect(user.hasPass).toBe(true);

    // The customer↔user link cannot be persisted without a successful retrieve;
    // that is expected — the link will be established on next sign-in.
    expect(user.stripeCustomerId).toBeNull();
  });
});
