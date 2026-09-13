import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The redeem endpoint and `check-reviewer-pass` must resolve the reviewer
// access code by the same rule. When they disagreed, `rotate-reviewer-code`
// wrote a database row the server never read: the health check called the
// setup healthy while every reviewer redemption was refused.

const dbSelectWhere = vi.fn(async (): Promise<Array<{ value: string }>> => []);
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (..._args: unknown[]) => dbSelectWhere(),
      }),
    }),
  },
  appConfigTable: { key: "key" },
}));

import { getConfig, reviewerAccessCode } from "../src/lib/app-config";

const EMPTY: NodeJS.ProcessEnv = {};

beforeEach(() => {
  dbSelectWhere.mockReset();
  dbSelectWhere.mockResolvedValue([]);
});

describe("getConfig", () => {
  it("returns the stored value", async () => {
    dbSelectWhere.mockResolvedValue([{ value: "stored" }]);
    await expect(getConfig("reviewer_access_code")).resolves.toBe("stored");
  });

  it("returns null for a missing row", async () => {
    await expect(getConfig("reviewer_access_code")).resolves.toBeNull();
  });

  it("returns null rather than throwing when the database is unreachable", async () => {
    dbSelectWhere.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(getConfig("reviewer_access_code")).resolves.toBeNull();
  });
});

describe("reviewerAccessCode", () => {
  it("prefers the app_config row, so rotate-reviewer-code takes effect without a redeploy", async () => {
    dbSelectWhere.mockResolvedValue([{ value: "from-db" }]);
    await expect(
      reviewerAccessCode({
        REVIEWER_ACCESS_CODE: "from-reviewer-env",
        DEV_ACCESS_CODE: "from-dev-env",
      }),
    ).resolves.toEqual({ code: "from-db", source: "app_config" });
  });

  it("falls back to REVIEWER_ACCESS_CODE when no row is stored", async () => {
    await expect(
      reviewerAccessCode({
        REVIEWER_ACCESS_CODE: "from-reviewer-env",
        DEV_ACCESS_CODE: "from-dev-env",
      }),
    ).resolves.toEqual({
      code: "from-reviewer-env",
      source: "REVIEWER_ACCESS_CODE",
    });
  });

  it("falls back to DEV_ACCESS_CODE last, so an untouched deployment keeps working", async () => {
    await expect(
      reviewerAccessCode({ DEV_ACCESS_CODE: "from-dev-env" }),
    ).resolves.toEqual({ code: "from-dev-env", source: "DEV_ACCESS_CODE" });
  });

  it("reports no code when nothing is configured", async () => {
    await expect(reviewerAccessCode(EMPTY)).resolves.toEqual({
      code: null,
      source: null,
    });
  });

  it("treats an empty env var as unset rather than as an empty code", async () => {
    await expect(
      reviewerAccessCode({
        REVIEWER_ACCESS_CODE: "",
        DEV_ACCESS_CODE: "from-dev-env",
      }),
    ).resolves.toEqual({ code: "from-dev-env", source: "DEV_ACCESS_CODE" });
  });

  it("falls back to the env vars when the database is unreachable", async () => {
    dbSelectWhere.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      reviewerAccessCode({ DEV_ACCESS_CODE: "from-dev-env" }),
    ).resolves.toEqual({ code: "from-dev-env", source: "DEV_ACCESS_CODE" });
  });
});

describe("process.env default", () => {
  const ORIGINAL = process.env.DEV_ACCESS_CODE;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.DEV_ACCESS_CODE;
    else process.env.DEV_ACCESS_CODE = ORIGINAL;
  });

  it("reads process.env when no env is passed", async () => {
    process.env.DEV_ACCESS_CODE = "ambient";
    await expect(reviewerAccessCode()).resolves.toEqual({
      code: "ambient",
      source: "DEV_ACCESS_CODE",
    });
  });
});
