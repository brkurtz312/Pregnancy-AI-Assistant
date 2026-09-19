/**
 * Tests for which environment variable supplies each Clerk key.
 *
 * Replit's auth product injects its own CLERK_SECRET_KEY into the deployed
 * process, and that injection beats the value set in the deployment's secrets.
 * The server therefore prefers PREGNANCY_CLERK_* — names nothing else claims —
 * and keeps the bare CLERK_* names as a fallback so local development and CI,
 * which set only those, are unaffected.
 */

import { describe, it, expect } from "vitest";
import {
  clerkKeySources,
  clerkPublishableKey,
  clerkSecretKey,
} from "../src/lib/clerk-env";

const OURS = {
  PREGNANCY_CLERK_SECRET_KEY: "sk_live_ours",
  PREGNANCY_CLERK_PUBLISHABLE_KEY: "pk_live_ours",
} as NodeJS.ProcessEnv;

const INJECTED = {
  CLERK_SECRET_KEY: "sk_live_injected",
  CLERK_PUBLISHABLE_KEY: "pk_live_injected",
} as NodeJS.ProcessEnv;

describe("Clerk key resolution", () => {
  it("prefers the prefixed names over an injected CLERK_*", () => {
    const env = { ...INJECTED, ...OURS };
    expect(clerkSecretKey(env)).toBe("sk_live_ours");
    expect(clerkPublishableKey(env)).toBe("pk_live_ours");
  });

  it("falls back to CLERK_* when the prefixed names are unset", () => {
    expect(clerkSecretKey({ ...INJECTED })).toBe("sk_live_injected");
    expect(clerkPublishableKey({ ...INJECTED })).toBe("pk_live_injected");
  });

  it("treats an empty prefixed value as unset rather than as a key", () => {
    const env = { ...INJECTED, PREGNANCY_CLERK_SECRET_KEY: "" };
    expect(clerkSecretKey(env)).toBe("sk_live_injected");
  });

  it("returns undefined when neither name is set", () => {
    expect(clerkSecretKey({})).toBeUndefined();
    expect(clerkPublishableKey({})).toBeUndefined();
  });

  it("reports which variable each key came from", () => {
    expect(clerkKeySources({ ...INJECTED, ...OURS })).toEqual({
      secretKeyFrom: "PREGNANCY_CLERK_SECRET_KEY",
      publishableKeyFrom: "PREGNANCY_CLERK_PUBLISHABLE_KEY",
    });
    expect(clerkKeySources({ ...INJECTED })).toEqual({
      secretKeyFrom: "CLERK_SECRET_KEY",
      publishableKeyFrom: "CLERK_PUBLISHABLE_KEY",
    });
    expect(clerkKeySources({})).toEqual({
      secretKeyFrom: null,
      publishableKeyFrom: null,
    });
  });
});
