import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";

import {
  DEMO_SUBJECT_PREFIX,
  bearerFrom,
  isDemoModeEnabled,
  issueDemoToken,
  newDemoSubject,
  verifyDemoToken,
} from "../src/lib/demo-token";

// 32+ chars, which is the minimum getSecret() accepts.
const SECRET = "a".repeat(48);
const OTHER_SECRET = "b".repeat(48);

const ORIGINAL = process.env.DEMO_SESSION_SECRET;

beforeEach(() => {
  process.env.DEMO_SESSION_SECRET = SECRET;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DEMO_SESSION_SECRET;
  else process.env.DEMO_SESSION_SECRET = ORIGINAL;
  vi.useRealTimers();
});

/**
 * Mints a correctly-signed token for an arbitrary payload, bypassing
 * issueDemoToken's own guards. Used to prove that verifyDemoToken enforces
 * its invariants itself rather than trusting the issuer.
 */
function forgeSignedToken(payload: object, secret = SECRET): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const head = `v1.${body}`;
  const sig = createHmac("sha256", secret).update(head).digest("base64url");
  return `${head}.${sig}`;
}

describe("isDemoModeEnabled", () => {
  it("is false when the secret is unset", () => {
    delete process.env.DEMO_SESSION_SECRET;
    expect(isDemoModeEnabled()).toBe(false);
  });

  it("is false when the secret is too short to be meaningful", () => {
    process.env.DEMO_SESSION_SECRET = "short";
    expect(isDemoModeEnabled()).toBe(false);
  });

  it("is true for a secret of at least 32 characters", () => {
    expect(isDemoModeEnabled()).toBe(true);
  });
});

describe("newDemoSubject", () => {
  it("always carries the demo prefix", () => {
    expect(newDemoSubject().startsWith(DEMO_SUBJECT_PREFIX)).toBe(true);
  });

  it("never repeats, so reviewers get isolated identities", () => {
    const subjects = new Set(
      Array.from({ length: 200 }, () => newDemoSubject()),
    );
    expect(subjects.size).toBe(200);
  });

  it("cannot collide with a Clerk user id", () => {
    // Clerk ids are always `user_...`; ours are always `demo:...`.
    expect(newDemoSubject().startsWith("user_")).toBe(false);
  });
});

describe("issueDemoToken", () => {
  it("throws when demo mode is disabled, rather than minting silently", () => {
    delete process.env.DEMO_SESSION_SECRET;
    expect(() => issueDemoToken(newDemoSubject())).toThrow(
      /DEMO_SESSION_SECRET/,
    );
  });

  it("refuses to sign a subject outside the demo namespace", () => {
    expect(() => issueDemoToken("user_2abcdef")).toThrow(/demo: prefix/);
  });
});

describe("verifyDemoToken", () => {
  it("round-trips a freshly issued token", () => {
    const sub = newDemoSubject();
    const payload = verifyDemoToken(issueDemoToken(sub));
    expect(payload?.sub).toBe(sub);
  });

  it("returns null once the secret is removed, revoking every outstanding token", () => {
    const token = issueDemoToken(newDemoSubject());
    expect(verifyDemoToken(token)).not.toBeNull();
    delete process.env.DEMO_SESSION_SECRET;
    expect(verifyDemoToken(token)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = forgeSignedToken(
      { sub: newDemoSubject(), exp: Math.floor(Date.now() / 1000) + 600 },
      OTHER_SECRET,
    );
    expect(verifyDemoToken(token)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = issueDemoToken(newDemoSubject());
    const [version, , signature] = token.split(".");
    const swapped = Buffer.from(
      JSON.stringify({
        sub: `${DEMO_SUBJECT_PREFIX}attacker`,
        exp: Math.floor(Date.now() / 1000) + 600,
      }),
      "utf8",
    ).toString("base64url");
    expect(verifyDemoToken(`${version}.${swapped}.${signature}`)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const [version, body, signature] = issueDemoToken(
      newDemoSubject(),
    ).split(".");
    const flipped = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");
    expect(verifyDemoToken(`${version}.${body}.${flipped}`)).toBeNull();
  });

  it("rejects an unrecognised version prefix", () => {
    const [, body, signature] = issueDemoToken(newDemoSubject()).split(".");
    expect(verifyDemoToken(`v2.${body}.${signature}`)).toBeNull();
  });

  it.each([
    ["empty string", ""],
    ["no separators", "notatoken"],
    ["too few parts", "v1.abc"],
    ["too many parts", "v1.abc.def.ghi"],
    ["empty body", "v1..sig"],
  ])("rejects a malformed token (%s)", (_label, token) => {
    expect(verifyDemoToken(token)).toBeNull();
  });

  it("rejects a token whose body is not valid JSON", () => {
    expect(verifyDemoToken(forgeSignedToken("not-an-object" as never))).toBeNull();
  });

  it("rejects a payload missing its fields", () => {
    expect(verifyDemoToken(forgeSignedToken({ sub: newDemoSubject() }))).toBeNull();
    expect(verifyDemoToken(forgeSignedToken({ exp: 99999999999 }))).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T12:00:00Z"));
    const token = issueDemoToken(newDemoSubject(), 60);
    expect(verifyDemoToken(token)).not.toBeNull();
    vi.setSystemTime(new Date("2026-08-30T12:01:01Z"));
    expect(verifyDemoToken(token)).toBeNull();
  });

  // The security property that matters most: even an attacker who somehow
  // obtains the signing secret cannot mint a token that impersonates a Clerk
  // user, because the namespace check runs on verification too.
  it.each([
    ["a Clerk user id", "user_2abcdefghij"],
    ["an empty subject", ""],
    ["a lookalike prefix", "demo_notreallyademo"],
    ["a prefix buried mid-string", "user_demo:1234"],
  ])("refuses to authenticate %s even when correctly signed", (_l, sub) => {
    const token = forgeSignedToken({
      sub,
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    expect(verifyDemoToken(token)).toBeNull();
  });
});

describe("bearerFrom", () => {
  it("extracts the token from a well-formed header", () => {
    expect(bearerFrom("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("is case-insensitive on the scheme", () => {
    expect(bearerFrom("bearer abc")).toBe("abc");
    expect(bearerFrom("BEARER abc")).toBe("abc");
  });

  it("tolerates surrounding and repeated whitespace", () => {
    expect(bearerFrom("  Bearer   abc  ")).toBe("abc");
  });

  it.each([
    ["undefined", undefined],
    ["empty", ""],
    ["scheme only", "Bearer"],
    ["scheme with no token", "Bearer   "],
    ["a different scheme", "Basic abc"],
  ])("returns null for %s", (_label, header) => {
    expect(bearerFrom(header as string | undefined)).toBeNull();
  });
});
