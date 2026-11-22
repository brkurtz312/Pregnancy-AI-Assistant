import { describe, it, expect, vi } from "vitest";

vi.mock("@clerk/express", () => ({ clerkClient: { users: {} } }));

import {
  parseArgs,
  runAdminDeletion,
  type AdminDeletionDeps,
} from "../src/admin/delete-account";

function makeDeps(overrides: Partial<AdminDeletionDeps> = {}) {
  const lines: string[] = [];
  const deps: AdminDeletionDeps = {
    findUserIdsByEmail: vi.fn(async () => ["user_abc"]),
    deleteAccount: vi.fn(async () => {}),
    deleteRevenueCatCustomer: vi.fn(async () => true),
    log: (line) => lines.push(line),
    ...overrides,
  };
  return { deps, lines };
}

describe("parseArgs", () => {
  it("reads an email, lower-cased, as a dry run by default", () => {
    expect(parseArgs(["--", "--email", " Person@Example.com "])).toEqual({
      email: "person@example.com",
      revenueCat: false,
      confirm: false,
    });
  });

  it("reads a user ID with --revenuecat and --yes", () => {
    expect(parseArgs(["--user", "user_abc", "--revenuecat", "--yes"])).toEqual({
      userId: "user_abc",
      revenueCat: true,
      confirm: true,
    });
  });

  it("needs exactly one of --email or --user", () => {
    expect(() => parseArgs([])).toThrow("exactly one");
    expect(() =>
      parseArgs(["--email", "a@b.com", "--user", "user_abc"]),
    ).toThrow("exactly one");
  });

  it("rejects missing values, unknown options and non-Clerk IDs", () => {
    expect(() => parseArgs(["--email"])).toThrow("needs a value");
    expect(() => parseArgs(["--email", "--yes"])).toThrow("needs a value");
    expect(() => parseArgs(["--user", "abc"])).toThrow("not a Clerk user ID");
    expect(() => parseArgs(["--email", "a@b.com", "--force"])).toThrow(
      "Unknown option",
    );
  });
});

describe("runAdminDeletion", () => {
  it("only reports what it would do without --yes", async () => {
    const { deps, lines } = makeDeps();
    const id = await runAdminDeletion(
      { email: "a@b.com", revenueCat: true, confirm: false },
      deps,
    );

    expect(id).toBe("user_abc");
    expect(deps.deleteAccount).not.toHaveBeenCalled();
    expect(deps.deleteRevenueCatCustomer).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("Dry run");
    expect(lines.join("\n")).toContain("delete RevenueCat customer user_abc");
  });

  it("deletes the account found by email", async () => {
    const { deps } = makeDeps();
    await runAdminDeletion(
      { email: "a@b.com", revenueCat: false, confirm: true },
      deps,
    );

    expect(deps.findUserIdsByEmail).toHaveBeenCalledWith("a@b.com");
    expect(deps.deleteAccount).toHaveBeenCalledWith("user_abc");
    expect(deps.deleteRevenueCatCustomer).not.toHaveBeenCalled();
  });

  it("deletes the RevenueCat customer after the account with --revenuecat", async () => {
    const order: string[] = [];
    const { deps } = makeDeps({
      deleteAccount: vi.fn(async () => {
        order.push("account");
      }),
      deleteRevenueCatCustomer: vi.fn(async () => {
        order.push("revenuecat");
        return true;
      }),
    });
    await runAdminDeletion(
      { userId: "user_xyz", revenueCat: true, confirm: true },
      deps,
    );

    expect(deps.findUserIdsByEmail).not.toHaveBeenCalled();
    expect(order).toEqual(["account", "revenuecat"]);
  });

  it("reports a missing RevenueCat customer without failing", async () => {
    const { deps, lines } = makeDeps({
      deleteRevenueCatCustomer: vi.fn(async () => false),
    });
    await runAdminDeletion(
      { userId: "user_xyz", revenueCat: true, confirm: true },
      deps,
    );
    expect(lines.join("\n")).toContain("RevenueCat had no customer user_xyz");
  });

  it("does nothing when no account uses the email", async () => {
    const { deps, lines } = makeDeps({
      findUserIdsByEmail: vi.fn(async () => []),
    });
    const id = await runAdminDeletion(
      { email: "nobody@b.com", revenueCat: true, confirm: true },
      deps,
    );

    expect(id).toBeNull();
    expect(deps.deleteAccount).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("No account uses nobody@b.com");
  });

  it("refuses to guess when an email matches several accounts", async () => {
    const { deps } = makeDeps({
      findUserIdsByEmail: vi.fn(async () => ["user_1", "user_2"]),
    });
    await expect(
      runAdminDeletion(
        { email: "a@b.com", revenueCat: false, confirm: true },
        deps,
      ),
    ).rejects.toThrow("matches 2 accounts");
    expect(deps.deleteAccount).not.toHaveBeenCalled();
  });

  it("stops before RevenueCat if the account deletion fails", async () => {
    const { deps } = makeDeps({
      deleteAccount: vi.fn(async () => {
        throw new Error("Clerk unavailable");
      }),
    });
    await expect(
      runAdminDeletion(
        { userId: "user_abc", revenueCat: true, confirm: true },
        deps,
      ),
    ).rejects.toThrow("Clerk unavailable");
    expect(deps.deleteRevenueCatCustomer).not.toHaveBeenCalled();
  });
});
