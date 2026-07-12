import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// currentPeriodKey — pure ISO-8601 week logic, no mocks needed
// ---------------------------------------------------------------------------
import { currentPeriodKey } from "../src/lib/ai-usage";

describe("currentPeriodKey", () => {
  it("returns the correct ISO week for a midweek date", () => {
    // 2026-07-08 is a Wednesday inside ISO week 28
    expect(currentPeriodKey(new Date("2026-07-08T12:00:00Z"))).toBe("2026-W28");
  });

  it("returns the same week key for Monday and Sunday of the same week", () => {
    const monday = currentPeriodKey(new Date("2026-07-06T00:00:00Z")); // Mon
    const sunday = currentPeriodKey(new Date("2026-07-12T23:59:59Z")); // Sun
    expect(monday).toBe("2026-W28");
    expect(sunday).toBe("2026-W28");
  });

  it("advances to the next week key on Monday", () => {
    const lastSunday = currentPeriodKey(new Date("2026-07-12T23:59:59Z"));
    const nextMonday = currentPeriodKey(new Date("2026-07-13T00:00:00Z"));
    expect(lastSunday).toBe("2026-W28");
    expect(nextMonday).toBe("2026-W29");
  });

  it("handles a cross-year week (late December belonging to next year's W01)", () => {
    // 2024-12-30 (Monday) — its Thursday is 2025-01-02, so it belongs to 2025-W01
    expect(currentPeriodKey(new Date("2024-12-30T00:00:00Z"))).toBe("2025-W01");
  });

  it("handles the first week of a year whose Jan 1 is a Thursday", () => {
    // 2026-01-01 is a Thursday → week 1 of 2026; its Monday is 2025-12-29
    expect(currentPeriodKey(new Date("2025-12-29T00:00:00Z"))).toBe("2026-W01");
    expect(currentPeriodKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
    expect(currentPeriodKey(new Date("2026-01-04T23:59:59Z"))).toBe("2026-W01");
  });

  it("produces a new key after week boundary, not after a day boundary mid-week", () => {
    // Tuesday and Wednesday of the same week share one key
    const tue = currentPeriodKey(new Date("2026-07-07T00:00:00Z"));
    const wed = currentPeriodKey(new Date("2026-07-08T00:00:00Z"));
    expect(tue).toBe(wed);
  });

  it("defaults to the current date when called with no argument", () => {
    // Freeze time so both calls see the same instant (avoids week-boundary flake)
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T12:00:00Z"));
    try {
      expect(currentPeriodKey()).toBe("2026-W28");
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// FREE_WEEKLY_LIMIT — the configured allowance threshold
// ---------------------------------------------------------------------------
import { FREE_WEEKLY_LIMIT } from "../src/lib/billing-config";

describe("FREE_WEEKLY_LIMIT", () => {
  it("is exactly 5", () => {
    expect(FREE_WEEKLY_LIMIT).toBe(5);
  });

  it("allows the 5th use but blocks the 6th (threshold transition)", () => {
    // Simulate the count a caller sees after each reservation, keeping the
    // limit logic in one place so accidental constant changes break this test.
    const allowed: number[] = [];
    const blocked: number[] = [];
    for (let count = 1; count <= FREE_WEEKLY_LIMIT + 2; count++) {
      if (count <= FREE_WEEKLY_LIMIT) {
        allowed.push(count);
      } else {
        blocked.push(count);
      }
    }
    expect(allowed).toEqual([1, 2, 3, 4, 5]);
    expect(blocked).toEqual([6, 7]);
  });
});

// ---------------------------------------------------------------------------
// userHasPass — pass-bypass logic (DB collaborators mocked)
// ---------------------------------------------------------------------------

// Mock the DB and users library so the test runs without a real database.
const mockGetUser = vi.fn();
const mockGrantPass = vi.fn(async () => {});
vi.mock("../src/lib/users", () => ({
  getUser: (...args: unknown[]) => mockGetUser(...args),
  grantPass: (...args: unknown[]) => mockGrantPass(...args),
}));

const mockDbExecute = vi.fn();
vi.mock("@workspace/db", () => ({
  db: { execute: (...args: unknown[]) => mockDbExecute(...args) },
  aiUsageTable: {},
}));

import { userHasPass } from "../src/lib/entitlement";

describe("userHasPass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbExecute.mockResolvedValue({ rows: [] });
  });

  it("returns false for an unknown user", async () => {
    mockGetUser.mockResolvedValue(null);
    expect(await userHasPass("ghost")).toBe(false);
  });

  it("returns true immediately when has_pass flag is set (fast path, no DB query)", async () => {
    mockGetUser.mockResolvedValue({ hasPass: true, stripeCustomerId: "cus_x" });
    const result = await userHasPass("user_paid");
    expect(result).toBe(true);
    // No Stripe schema query needed when the flag is already set
    expect(mockDbExecute).not.toHaveBeenCalled();
  });

  it("returns false for a user with no Stripe customer, even if flag is unset", async () => {
    mockGetUser.mockResolvedValue({ hasPass: false, stripeCustomerId: null });
    expect(await userHasPass("user_free")).toBe(false);
    expect(mockDbExecute).not.toHaveBeenCalled();
  });

  it("promotes a user to pass holder when a succeeded Stripe payment is found", async () => {
    mockGetUser.mockResolvedValue({
      hasPass: false,
      stripeCustomerId: "cus_abc",
    });
    mockDbExecute.mockResolvedValue({ rows: [{ "1": "1" }] });
    const result = await userHasPass("user_stripe");
    expect(result).toBe(true);
    // The flag should be persisted so future checks skip the query
    expect(mockGrantPass).toHaveBeenCalledWith("user_stripe");
  });

  it("returns false when the Stripe schema query finds no succeeded payment", async () => {
    mockGetUser.mockResolvedValue({
      hasPass: false,
      stripeCustomerId: "cus_abc",
    });
    mockDbExecute.mockResolvedValue({ rows: [] });
    expect(await userHasPass("user_stripe")).toBe(false);
    expect(mockGrantPass).not.toHaveBeenCalled();
  });

  it("returns false and does not throw when the Stripe schema query errors (integration not connected)", async () => {
    mockGetUser.mockResolvedValue({
      hasPass: false,
      stripeCustomerId: "cus_abc",
    });
    mockDbExecute.mockRejectedValue(
      new Error("relation stripe.payment_intents does not exist"),
    );
    await expect(userHasPass("user_stripe")).resolves.toBe(false);
  });

  it("a pass holder bypasses the Stripe fallback even when stripeCustomerId is set", async () => {
    // hasPass=true → returns immediately, no Stripe schema query
    mockGetUser.mockResolvedValue({
      hasPass: true,
      stripeCustomerId: "cus_xyz",
    });
    expect(await userHasPass("user_pass")).toBe(true);
    expect(mockDbExecute).not.toHaveBeenCalled();
    expect(mockGrantPass).not.toHaveBeenCalled();
  });
});
