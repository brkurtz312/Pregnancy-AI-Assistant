import { describe, it, expect, beforeEach, vi } from "vitest";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import request from "supertest";

const deletedRows: Array<{ table: string; value: string }> = [];
const dbTransaction = vi.fn(
  async (callback: (tx: unknown) => Promise<void>) => {
    const tx = {
      delete: (table: { name: string }) => ({
        where: async (condition: { value: string }) => {
          deletedRows.push({ table: table.name, value: condition.value });
        },
      }),
    };
    await callback(tx);
  },
);

function table(name: string, key = "userId") {
  return { name, [key]: `${name}.${key}` };
}

vi.mock("@workspace/db", () => ({
  db: {
    transaction: (...args: Parameters<typeof dbTransaction>) =>
      dbTransaction(...args),
  },
  aiUsageTable: table("ai_usage", "identifier"),
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
  eq: (_column: string, value: string) => ({ value }),
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

import { deleteAccount } from "../src/lib/account-deletion";
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
    authedUserId = "user_a";
  });

  it("removes every app-owned record only for the requested user, then deletes that Clerk identity", async () => {
    await deleteAccount("user_a");

    expect(deletedRows).toHaveLength(12);
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
      "user_a",
    ]);
    expect(deletedRows.some((row) => row.value.includes("user_b"))).toBe(false);
    expect(deleteClerkUser).toHaveBeenCalledWith("user_a");
  });

  it("treats an already-deleted Clerk identity as a completed retry", async () => {
    deleteClerkUser.mockRejectedValueOnce({
      status: 404,
      errors: [{ code: "resource_not_found" }],
    });

    await expect(deleteAccount("user_a")).resolves.toBeUndefined();
    expect(deletedRows).toHaveLength(12);
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
