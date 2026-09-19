import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import request from "supertest";

const deletedRows: Array<{ table: string; value: string }> = [];
const deletionRequests = new Map<
  string,
  {
    userId: string;
    status: string;
    attemptCount: number;
    nextAttemptAt: Date;
    lastAttemptAt?: Date;
    lastError?: string | null;
    completedAt?: Date;
    clerkDeletedAt?: Date;
  }
>();

function conditionValue(condition: unknown): string | undefined {
  if (
    condition &&
    typeof condition === "object" &&
    "value" in condition &&
    typeof condition.value === "string"
  ) {
    return condition.value;
  }
  return undefined;
}

function userIdFromCondition(condition: unknown): string | undefined {
  const conditions =
    condition &&
    typeof condition === "object" &&
    "conditions" in condition &&
    Array.isArray(condition.conditions)
      ? condition.conditions
      : [condition];
  return conditions
    .map(conditionValue)
    .find((value) => value?.startsWith("user_"));
}

function selectDeletionRequests(condition: unknown) {
  const conditions =
    condition &&
    typeof condition === "object" &&
    "conditions" in condition &&
    Array.isArray(condition.conditions)
      ? condition.conditions
      : [condition];
  const requestedUserId = userIdFromCondition(condition);
  const dueAt = conditions.find(
    (item) =>
      item &&
      typeof item === "object" &&
      "operator" in item &&
      item.operator === "lte" &&
      "value" in item &&
      item.value instanceof Date,
  ) as { value: Date } | undefined;
  const requests = requestedUserId
    ? [deletionRequests.get(requestedUserId)].filter(
        (request): request is NonNullable<typeof request> => !!request,
      )
    : [...deletionRequests.values()].filter(
        (request) =>
          request.status === "pending" &&
          (!dueAt || request.nextAttemptAt <= dueAt.value),
      );
  return {
    limit: async (count: number) => requests.slice(0, count),
  };
}

const dbTransaction = vi.fn(
  async (callback: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      select: () => ({
        from: () => ({
          where: (condition: unknown) => selectDeletionRequests(condition),
        }),
      }),
      insert: (insertedTable: { name: string }) => ({
        values: (values: { userId: string; status: string }) => ({
          onConflictDoNothing: async () => {
            if (insertedTable.name === "account_deletion_requests") {
              deletionRequests.set(values.userId, {
                userId: values.userId,
                status: values.status,
                attemptCount: 0,
                nextAttemptAt: new Date(0),
              });
            }
          },
        }),
      }),
      execute: async () => {},
      delete: (table: { name: string }) => ({
        where: async (condition: { value: string }) => {
          deletedRows.push({ table: table.name, value: condition.value });
        },
      }),
    };
    return callback(tx);
  },
);

function table(name: string, key = "userId") {
  return { name, [key]: `${name}.${key}` };
}

vi.mock("@workspace/db", () => ({
  db: {
    transaction: (...args: Parameters<typeof dbTransaction>) =>
      dbTransaction(...args),
    select: () => ({
      from: () => ({
        where: (condition: unknown) => selectDeletionRequests(condition),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async (condition: unknown) => {
          const userId = userIdFromCondition(condition);
          if (!userId) return;
          const request = deletionRequests.get(userId);
          if (request) Object.assign(request, values);
        },
      }),
    }),
  },
  aiUsageTable: table("ai_usage", "identifier"),
  accountDeletionRequestsTable: table("account_deletion_requests", "userId"),
  birthPlanAnswersTable: table("birth_plan_answers"),
  contractionLogsTable: table("contraction_logs"),
  hospitalBagStateTable: table("hospital_bag_state"),
  journalEntriesTable: table("journal_entries"),
  kickSessionsTable: table("kick_sessions"),
  prenatalVisitsTable: table("prenatal_visits"),
  scribeIdempotencyKeysTable: table("scribe_idempotency_keys"),
  supportContactsTable: table("support_contacts"),
  symptomLogsTable: table("symptom_logs"),
  userProfilesTable: table("user_profiles"),
  usersTable: table("users", "id"),
}));

vi.mock("drizzle-orm", () => ({
  eq: (column: string, value: string) => ({ column, value }),
  and: (...conditions: unknown[]) => ({ conditions }),
  lte: (_column: unknown, value: Date) => ({ operator: "lte", value }),
  sql: () => ({}),
}));

const deleteClerkUser = vi.fn(async () => {});
vi.mock("@clerk/express", () => ({
  clerkClient: { users: { deleteUser: (id: string) => deleteClerkUser(id) } },
}));

let authedUserId: string | null = "user_a";
vi.mock("../src/middlewares/auth", () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => {
    if (!authedUserId) {
      res.status(401).json({ error: "Please sign in to continue." });
      return;
    }
    (req as Request & { userId?: string }).userId = authedUserId;
    next();
  },
}));

import {
  deleteAccount,
  isAccountDeletionBlocked,
  retryPendingAccountDeletions,
} from "../src/lib/account-deletion";
import accountRouter from "../src/routes/account";

function buildApp(): Express {
  const app = express();
  app.use((req, _res, next) => {
    (req as Request & { log: unknown }).log = { error: vi.fn() };
    next();
  });
  app.use("/api", accountRouter);
  return app;
}

describe("permanent account deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deletedRows.length = 0;
    deletionRequests.clear();
    authedUserId = "user_a";
  });

  it("removes every app-owned record only for the requested user, then deletes that Clerk identity", async () => {
    await deleteAccount("user_a");

    expect(deletedRows).toHaveLength(13);
    expect(deletedRows.map((row) => row.value)).toEqual([
      "user_a",
      "user_a",
      "user_a",
      "user_a",
      "user_a",
      "user_a",
      "user_a",
      "user_a",
      "user_a",
      "user_a",
      "user:user_a",
      "scribe:user_a",
      "user_a",
    ]);
    expect(deletedRows.some((row) => row.value.includes("user_b"))).toBe(false);
    expect(deleteClerkUser).toHaveBeenCalledWith("user_a");
    expect(deletionRequests.get("user_a")).toMatchObject({
      status: "completed",
    });
  });

  it("treats an already-deleted Clerk identity as a completed retry", async () => {
    deleteClerkUser.mockRejectedValueOnce({
      status: 404,
      errors: [{ code: "resource_not_found" }],
    });

    await expect(deleteAccount("user_a")).resolves.toBeUndefined();
    expect(deletedRows).toHaveLength(13);
    expect(deletionRequests.get("user_a")).toMatchObject({
      status: "completed",
    });
  });

  it("keeps a tombstone after a lost Clerk response, blocks app access, and completes on the worker retry", async () => {
    // Clerk accepted the first deletion but the API connection timed out before
    // receiving a response. Its retry reports 404 because the identity is gone.
    deleteClerkUser.mockRejectedValueOnce(new Error("upstream timeout"));

    await expect(deleteAccount("user_a")).rejects.toThrow("upstream timeout");
    expect(deletionRequests.get("user_a")).toMatchObject({
      status: "pending",
      attemptCount: 1,
      lastError: "upstream timeout",
    });
    await expect(isAccountDeletionBlocked("user_a")).resolves.toBe(true);
    await retryPendingAccountDeletions();
    expect(deleteClerkUser).toHaveBeenCalledTimes(1);

    const request = deletionRequests.get("user_a");
    if (!request) throw new Error("Expected a pending account deletion");
    request.nextAttemptAt = new Date();

    deleteClerkUser.mockRejectedValueOnce({
      status: 404,
      errors: [{ code: "resource_not_found" }],
    });
    await retryPendingAccountDeletions();

    expect(deleteClerkUser).toHaveBeenCalledTimes(2);
    expect(deletionRequests.get("user_a")).toMatchObject({
      status: "completed",
      lastError: null,
    });
    // Completed tombstones are retained so a stale session cannot recreate data.
    await expect(isAccountDeletionBlocked("user_a")).resolves.toBe(true);
  });

  it("does not delete the Clerk identity when the app-data transaction fails", async () => {
    dbTransaction.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(deleteAccount("user_a")).rejects.toThrow(
      "database unavailable",
    );
    expect(deleteClerkUser).not.toHaveBeenCalled();
  });

  it("requires an authenticated request and never accepts another user's id from the client", async () => {
    const app = buildApp();

    const res = await request(app).delete("/api/account?userId=user_b");

    expect(res.status).toBe(204);
    expect(deleteClerkUser).toHaveBeenCalledWith("user_a");
    expect(deletedRows.every((row) => !row.value.includes("user_b"))).toBe(
      true,
    );
  });

  it("rejects an unauthenticated deletion request", async () => {
    const app = buildApp();
    authedUserId = null;

    const res = await request(app).delete("/api/account");

    expect(res.status).toBe(401);
    expect(deleteClerkUser).not.toHaveBeenCalled();
  });

  it("returns a safe retryable error when the deletion service fails", async () => {
    const app = buildApp();
    dbTransaction.mockRejectedValueOnce(new Error("database unavailable"));

    const res = await request(app).delete("/api/account");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: "We couldn't delete your account. Please try again.",
    });
    expect(deleteClerkUser).not.toHaveBeenCalled();
  });
});

// The sweep's de-duplication (`activeRetries`) is module-level, so it guards
// one process against itself and nothing across two. During the Railway
// migration two servers run against one database, and both would sweep the
// same tombstones — hence an off switch for whichever one is not yet serving.
describe("account deletion worker interval", () => {
  const ENV = "ACCOUNT_DELETION_WORKER_INTERVAL_MS";
  const original = process.env[ENV];

  afterEach(() => {
    if (original === undefined) delete process.env[ENV];
    else process.env[ENV] = original;
  });

  it("does not schedule a sweep when the interval is 0", async () => {
    process.env[ENV] = "0";
    const { startAccountDeletionWorker } =
      await import("../src/lib/account-deletion");
    const setInterval = vi.spyOn(globalThis, "setInterval");

    const stop = startAccountDeletionWorker();

    expect(setInterval).not.toHaveBeenCalled();
    setInterval.mockRestore();
    stop();
  });

  it("schedules a sweep at the interval the environment names", async () => {
    process.env[ENV] = "5000";
    const { startAccountDeletionWorker } =
      await import("../src/lib/account-deletion");
    const setInterval = vi.spyOn(globalThis, "setInterval");

    const stop = startAccountDeletionWorker();

    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 5000);
    setInterval.mockRestore();
    stop();
  });

  // An explicit argument still wins, so tests and callers that pass one are
  // not silently overridden by a variable set on the host.
  it("lets an explicit option override the environment", async () => {
    process.env[ENV] = "5000";
    const { startAccountDeletionWorker } =
      await import("../src/lib/account-deletion");
    const setInterval = vi.spyOn(globalThis, "setInterval");

    const stop = startAccountDeletionWorker({ intervalMs: 1234 });

    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 1234);
    setInterval.mockRestore();
    stop();
  });
});
