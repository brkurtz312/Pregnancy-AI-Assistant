import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signed demo-session tokens for App Store review.
 *
 * These exist so an Apple reviewer can exercise the full app without a Clerk
 * sign-in. That matters because Clerk's instance-wide "Require multi-factor
 * authentication" policy forces an email_code second factor on every password
 * sign-in — including demo accounts with no MFA enrolled — and a reviewer has
 * no way to read the email that code is sent to. See
 * `.agents/memory/clerk-mfa-blocks-app-review.md`.
 *
 * SECURITY NOTES — this is a second credential type accepted by `requireAuth`:
 *   - Subjects are always prefixed `demo:` so they can never collide with a
 *     Clerk user id (which is always `user_...`). Nothing else in the codebase
 *     may mint a `demo:` subject.
 *   - Tokens are HMAC-SHA256 signed with DEMO_SESSION_SECRET and carry a hard
 *     expiry. There is no refresh path.
 *   - If DEMO_SESSION_SECRET is unset the entire demo path is disabled: minting
 *     throws and verification returns null. Unset it after App Review approval
 *     to close the door completely.
 */

const TOKEN_VERSION = "v1";
export const DEMO_SUBJECT_PREFIX = "demo:";
export const DEMO_TOKEN_TTL_SECONDS = 24 * 60 * 60;

export interface DemoTokenPayload {
  /** Always starts with DEMO_SUBJECT_PREFIX. */
  sub: string;
  /** Expiry as seconds since the epoch. */
  exp: number;
}

function getSecret(): string | null {
  const secret = process.env.DEMO_SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

/** True when the demo path is configured and usable. */
export function isDemoModeEnabled(): boolean {
  return getSecret() !== null;
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/** Mints a fresh demo subject. Each call yields a distinct isolated identity. */
export function newDemoSubject(): string {
  return `${DEMO_SUBJECT_PREFIX}${randomBytes(12).toString("hex")}`;
}

/**
 * Signs a demo token for `sub`.
 * Throws when demo mode is disabled — callers must check isDemoModeEnabled().
 */
export function issueDemoToken(
  sub: string,
  ttlSeconds: number = DEMO_TOKEN_TTL_SECONDS,
): string {
  const secret = getSecret();
  if (!secret) throw new Error("DEMO_SESSION_SECRET is not configured");
  if (!sub.startsWith(DEMO_SUBJECT_PREFIX)) {
    throw new Error("Demo subject must carry the demo: prefix");
  }
  const payload: DemoTokenPayload = {
    sub,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const head = `${TOKEN_VERSION}.${body}`;
  return `${head}.${sign(head, secret)}`;
}

/**
 * Verifies a demo token. Returns its payload, or null when the token is
 * malformed, unsigned, expired, tampered with, or demo mode is disabled.
 * Never throws — callers treat null as "not a demo token" and fall through.
 */
export function verifyDemoToken(token: string): DemoTokenPayload | null {
  const secret = getSecret();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [version, body, signature] = parts;
  if (version !== TOKEN_VERSION || !body || !signature) return null;

  const expected = sign(`${version}.${body}`, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: DemoTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload?.sub !== "string" || typeof payload?.exp !== "number") {
    return null;
  }
  // Defence in depth: a forged-but-correctly-signed token still cannot escape
  // the demo namespace.
  if (!payload.sub.startsWith(DEMO_SUBJECT_PREFIX)) return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

  return payload;
}

/** Extracts a bearer token from an Authorization header, if present. */
export function bearerFrom(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}
