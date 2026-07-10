/**
 * Unit tests for runReviewerPassCheck (src/lib/reviewer-check.ts).
 *
 * The check now verifies system readiness (access code configured, Clerk key
 * present, Clerk API reachable) rather than inspecting a single demo user row.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// DB mock — only getConfig (appConfigTable select) is called now
// ---------------------------------------------------------------------------

const dbSelectImpl = vi.fn();

vi.mock("@workspace/db", () => {
  const appConfigTable = { key: "key" };

  return {
    appConfigTable,
    db: {
      select: (_projection?: unknown) => ({
        from: (_table: unknown) => ({
          where: (_cond: unknown) => dbSelectImpl(),
        }),
      }),
    },
  };
});

// Suppress logger output in tests
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const fetchMock = vi.fn(async () =>
  Promise.resolve({ ok: true, status: 200, text: async () => "" } as Response),
);
vi.stubGlobal("fetch", fetchMock);

import { runReviewerPassCheck } from "../src/lib/reviewer-check";

// ---------------------------------------------------------------------------
// Env snapshot helpers
// ---------------------------------------------------------------------------

const ORIGINAL_CLERK_KEY = process.env.CLERK_SECRET_KEY;
const ORIGINAL_DEV_CODE = process.env.DEV_ACCESS_CODE;

beforeEach(() => {
  vi.clearAllMocks();
  dbSelectImpl.mockResolvedValue([]); // getConfig returns null by default
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => "",
  } as Response);
  // Set up a working environment by default
  process.env.CLERK_SECRET_KEY = "sk_test_fake_clerk_key";
  process.env.DEV_ACCESS_CODE = "test-code-123";
});

afterEach(() => {
  if (ORIGINAL_CLERK_KEY === undefined) delete process.env.CLERK_SECRET_KEY;
  else process.env.CLERK_SECRET_KEY = ORIGINAL_CLERK_KEY;
  if (ORIGINAL_DEV_CODE === undefined) delete process.env.DEV_ACCESS_CODE;
  else process.env.DEV_ACCESS_CODE = ORIGINAL_DEV_CODE;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runReviewerPassCheck", () => {
  describe("healthy system", () => {
    it("returns { ok: true } when code, key, and Clerk API are all good", async () => {
      const result = await runReviewerPassCheck();

      expect(result.ok).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.timestamp).toBeTruthy();

      // Should call Clerk API to verify connectivity
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain("clerk.com");
    });

    it("prefers access code from app_config DB over env var", async () => {
      dbSelectImpl.mockResolvedValueOnce([{ value: "db-access-code" }]);

      const result = await runReviewerPassCheck();

      expect(result.ok).toBe(true);
    });
  });

  describe("no access code configured", () => {
    it("returns { ok: false, reason: 'no_access_code' } when no code is set", async () => {
      dbSelectImpl.mockResolvedValue([]); // no DB row
      delete process.env.DEV_ACCESS_CODE;
      delete process.env.REVIEWER_ACCESS_CODE;

      const result = await runReviewerPassCheck();

      expect(result.ok).toBe(false);
      expect(result.reason).toBe("no_access_code");
      // Should not reach Clerk API check
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("no Clerk secret key", () => {
    it("returns { ok: false, reason: 'no_clerk_key' } when CLERK_SECRET_KEY is absent", async () => {
      delete process.env.CLERK_SECRET_KEY;

      const result = await runReviewerPassCheck();

      expect(result.ok).toBe(false);
      expect(result.reason).toBe("no_clerk_key");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("Clerk API unreachable", () => {
    it("returns { ok: false, reason: 'clerk_unreachable' } when Clerk returns non-OK", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      } as Response);

      const result = await runReviewerPassCheck();

      expect(result.ok).toBe(false);
      expect(result.reason).toBe("clerk_unreachable");
    });

    it("returns { ok: false, reason: 'clerk_unreachable' } when fetch throws", async () => {
      fetchMock.mockRejectedValueOnce(new Error("Network error"));

      const result = await runReviewerPassCheck();

      expect(result.ok).toBe(false);
      expect(result.reason).toBe("clerk_unreachable");
    });
  });
});
