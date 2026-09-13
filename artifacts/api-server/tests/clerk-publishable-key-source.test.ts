/**
 * Regression tests for where the API server gets its Clerk publishable key.
 *
 * Clerk identifies an instance by its publishable key: the key encodes the
 * Frontend API host, and `@clerk/express` checks an incoming session token's
 * `iss` claim against it. Point the middleware at the wrong instance and every
 * authenticated request 401s even though the token is valid and
 * CLERK_SECRET_KEY is correct — which the mobile client reads as a dead
 * session and signs the user out (see AuthTokenBridge).
 *
 * `app.ts` used to build the key from the incoming request host with Clerk's
 * `publishableKeyFromHost(host, fallback)`. That was sound only while the
 * Frontend API was proxied through this server's own domain, so the request
 * host and the Clerk host were the same name. They are different names now:
 * clients call this API at its deployment host, while Clerk serves
 * clerk.pregnancy-assistant.com.
 *
 * These tests pin the two branches of that helper against the hosts this
 * deployment actually sees, to show neither can name the production instance.
 * The server therefore reads CLERK_PUBLISHABLE_KEY straight from the
 * environment. Publishable keys are public by design — they ship inside the
 * client bundles — so quoting one here discloses nothing.
 */

import { describe, it, expect } from "vitest";
import {
  parsePublishableKey,
  publishableKeyFromHost,
} from "@clerk/shared/keys";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** The production instance the deployed API must verify tokens against. */
const PRODUCTION_KEY = "pk_live_Y2xlcmsucHJlZ25hbmN5LWFzc2lzdGFudC5jb20k";
const PRODUCTION_FRONTEND_API = "clerk.pregnancy-assistant.com";

/** Any development key; the value matters less than its `pk_test_` prefix. */
const DEVELOPMENT_KEY = "pk_test_Y2xlcmsuZXhhbXBsZS5kZXYk";

/** The host clients reach this API on — EXPO_PUBLIC_DOMAIN in EAS. */
const DEPLOYMENT_HOST = "pregnancy-calc--brkurtz.replit.app";

// ─── The key the server must end up with ─────────────────────────────────────

describe("the production publishable key", () => {
  it("names the Clerk custom domain", () => {
    expect(parsePublishableKey(PRODUCTION_KEY)).toMatchObject({
      instanceType: "production",
      frontendApi: PRODUCTION_FRONTEND_API,
    });
  });
});

// ─── Why the key cannot come from the request host ───────────────────────────

describe("publishableKeyFromHost cannot name the production instance", () => {
  it("ignores a production fallback and invents a key for the request host", () => {
    const derived = publishableKeyFromHost(DEPLOYMENT_HOST, PRODUCTION_KEY);

    expect(derived).not.toBe(PRODUCTION_KEY);
    expect(parsePublishableKey(derived)).toMatchObject({
      frontendApi: `clerk.${DEPLOYMENT_HOST}`,
    });
  });

  it("returns a development fallback verbatim, whatever the host", () => {
    // This is the branch that broke the Clerk production cutover: the secret
    // key had moved to sk_live_ while CLERK_PUBLISHABLE_KEY still held the old
    // pk_test_ value, so the middleware kept verifying against development.
    expect(publishableKeyFromHost(DEPLOYMENT_HOST, DEVELOPMENT_KEY)).toBe(
      DEVELOPMENT_KEY,
    );
    expect(
      publishableKeyFromHost(PRODUCTION_FRONTEND_API, DEVELOPMENT_KEY),
    ).toBe(DEVELOPMENT_KEY);
  });
});
