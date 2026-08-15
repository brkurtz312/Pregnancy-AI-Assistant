/**
 * Kick-session account-level delete — Watch-sourced row coverage
 *
 * Confirms that DELETE /tools/kick-sessions wipes ALL kick-session rows for
 * the authenticated user, regardless of whether they originated from the phone
 * (watchSessionId = null) or from the Watch (watchSessionId set).
 *
 * Also covers:
 *   - 401 when unauthenticated
 *   - Only the target user's rows are removed (cross-user isolation)
 *   - GET returns an empty list after account-level wipe
 *   - Idempotency (204 even when no rows exist)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";

// ─── Hoisted shared state ─────────────────────────────────────────────────────

const {
  resetStore,
  getAuthedUserId,
  setAuthedUserId,
  getStore,
  mockDb,
  kickSessionsTable,
} = vi.hoisted(() => {
  type Row = Record<string, unknown>;

  const store: Row[] = [];
  let authedUserId: string | null = "user_A";
  let nextId = 1;

  // ── Condition types ───────────────────────────────────────────────────────
  type EqCond = { _op: "eq"; col: string; val: unknown };
  type AndCond = { _op: "and"; args: unknown[] };
  type Cond = EqCond | AndCond;

  function evalCond(cond: unknown, row: Row): boolean {
    const c = cond as Cond;
    if (c._op === "eq") return row[c.col] === c.val;
    if (c._op === "and") return c.args.every((sub) => evalCond(sub, row));
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function thenable<T>(value: T): any {
    return {
      then: (resolve?: (v: T) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(value).then(resolve as never, reject as never),
      catch: (reject: (e: unknown) => unknown) =>
        Promise.resolve(value).catch(reject),
      returning: () => thenable(Array.isArray(value) ? value : [value]),
    };
  }

  type MockTable = {
    _table: string;
    id: { _col: string };
    userId: { _col: string };
    [key: string]: unknown;
  };

  // ── In-memory mock database ────────────────────────────────────────────────

  const mockDb = {
    select: (_projection?: unknown) => ({
      from: (_table: MockTable) => ({
        where: (cond: unknown) => ({
          orderBy: (..._args: unknown[]) => ({
            limit: (n: number) => ({
              offset: (o: number) =>
                thenable(
                  store.filter((r) => evalCond(cond, r)).slice(o, o + n),
                ),
            }),
          }),
          // Count sub-query: returns [{ count: N }]
          then: (
            resolve?: (v: { count: number }[]) => unknown,
            reject?: (e: unknown) => unknown,
          ) =>
            Promise.resolve([
              { count: store.filter((r) => evalCond(cond, r)).length },
            ]).then(resolve as never, reject as never),
          catch: (reject: (e: unknown) => unknown) =>
            Promise.resolve([]).catch(reject),
          limit: (n: number) =>
            thenable(store.filter((r) => evalCond(cond, r)).slice(0, n)),
        }),
        limit: (n: number) => thenable(store.slice(0, n)),
      }),
    }),

    insert: (_table: MockTable) => ({
      values: (vals: Row) => ({
        onConflictDoNothing: () => {
          // Enforce partial unique index: (userId, watchSessionId) WHERE watchSessionId IS NOT NULL
          const watchSessionId = vals.watchSessionId as
            | string
            | null
            | undefined;
          const userId = vals.userId as string;
          const conflict =
            watchSessionId != null &&
            store.some(
              (r) => r.userId === userId && r.watchSessionId === watchSessionId,
            );
          if (!conflict) {
            const row: Row = { notes: null, ...vals, id: nextId++ };
            store.push(row);
            return thenable([row]);
          }
          return thenable([] as Row[]);
        },
      }),
    }),

    delete: (_table: MockTable) => ({
      where: (cond: unknown) => {
        const deleted: Row[] = [];
        for (let i = store.length - 1; i >= 0; i--) {
          if (evalCond(cond, store[i])) {
            deleted.unshift(...store.splice(i, 1));
          }
        }
        return thenable(deleted);
      },
    }),

    update: (_table: MockTable) => ({
      set: (_updates: Row) => ({
        where: (_cond: unknown) => ({
          returning: () => thenable([] as Row[]),
        }),
      }),
    }),
  };

  // ── Table marker ──────────────────────────────────────────────────────────

  const kickSessionsTable: MockTable = {
    _table: "kick_sessions",
    id: { _col: "id" },
    userId: { _col: "userId" },
    startedAt: { _col: "startedAt" },
    endedAt: { _col: "endedAt" },
    kickCount: { _col: "kickCount" },
    notes: { _col: "notes" },
    watchSessionId: { _col: "watchSessionId" },
  };

  return {
    resetStore: () => {
      store.length = 0;
      nextId = 1;
    },
    getAuthedUserId: () => authedUserId,
    setAuthedUserId: (id: string | null) => {
      authedUserId = id;
    },
    getStore: () => store,
    mockDb,
    kickSessionsTable,
  };
});

// ─── Mock drizzle-orm ─────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq: (col: { _col: string }, val: unknown) => ({
    _op: "eq",
    col: col._col,
    val,
  }),
  and: (...args: unknown[]) => ({ _op: "and", args }),
  desc: (col: { _col: string }) => ({ _dir: "desc", col: col._col }),
  count: () => ({ _agg: "count" }),
}));

// ─── Mock @workspace/db ───────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: mockDb,
  kickSessionsTable,
  // Stub tables used by the tools router but unused in this test
  symptomLogsTable: {
    _table: "symptoms",
    id: { _col: "id" },
    userId: { _col: "userId" },
  },
  contractionLogsTable: {
    _table: "contractions",
    id: { _col: "id" },
    userId: { _col: "userId" },
    sessionDate: { _col: "sessionDate" },
  },
  prenatalVisitsTable: {
    _table: "prenatal_visits",
    id: { _col: "id" },
    userId: { _col: "userId" },
  },
}));

// ─── Mock auth middleware ─────────────────────────────────────────────────────

vi.mock("../src/middlewares/auth", () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => {
    const uid = getAuthedUserId();
    if (!uid) {
      res.status(401).json({ error: "Please sign in to continue." });
      return;
    }
    (req as Request & { userId?: string }).userId = uid;
    next();
  },
}));

// ─── Stub sub-routers that tools/index.ts mounts ─────────────────────────────

vi.mock("../src/routes/tools/journal", () => {
  const { Router } = require("express");
  return { default: Router() };
});
vi.mock("../src/routes/tools/hospital-bag", () => {
  const { Router } = require("express");
  return { default: Router() };
});
vi.mock("../src/routes/tools/birth-plan", () => {
  const { Router } = require("express");
  return { default: Router() };
});

// ─── Import the router under test ─────────────────────────────────────────────

import toolsRouter from "../src/routes/tools/index";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", toolsRouter);
  return app;
}

const app = buildApp();

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Insert a phone-originated kick session directly into the mock store. */
function seedPhone(userId: string, id: number) {
  getStore().push({
    id,
    userId,
    startedAt: new Date("2024-06-15T10:00:00Z"),
    endedAt: new Date("2024-06-15T10:20:00Z"),
    kickCount: 10,
    notes: null,
    watchSessionId: null,
  });
}

/** Insert a Watch-originated kick session directly into the mock store. */
function seedWatch(userId: string, id: number, watchSessionId: string) {
  getStore().push({
    id,
    userId,
    startedAt: new Date(watchSessionId),
    endedAt: new Date("2024-06-15T10:20:00Z"),
    kickCount: 10,
    notes: null,
    watchSessionId,
  });
}

beforeEach(() => {
  resetStore();
  setAuthedUserId("user_A");
});

// ─── Auth guard ───────────────────────────────────────────────────────────────

describe("DELETE /api/tools/kick-sessions — auth", () => {
  it("returns 401 when not signed in", async () => {
    setAuthedUserId(null);
    const res = await request(app).delete("/api/tools/kick-sessions");
    expect(res.status).toBe(401);
  });
});

// ─── Core behaviour ───────────────────────────────────────────────────────────

describe("DELETE /api/tools/kick-sessions — account-level wipe", () => {
  it("returns 204 and removes all phone-sourced kick sessions for the user", async () => {
    seedPhone("user_A", 1);
    seedPhone("user_A", 2);

    expect(getStore()).toHaveLength(2);

    const res = await request(app).delete("/api/tools/kick-sessions");
    expect(res.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("returns 204 and removes all Watch-sourced kick sessions for the user", async () => {
    seedWatch("user_A", 1, "2024-06-15T10:00:00.000Z");
    seedWatch("user_A", 2, "2024-06-15T11:00:00.000Z");

    expect(getStore()).toHaveLength(2);

    const res = await request(app).delete("/api/tools/kick-sessions");
    expect(res.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("removes both phone-sourced and Watch-sourced kick sessions in one wipe", async () => {
    seedPhone("user_A", 1);
    seedWatch("user_A", 2, "2024-06-15T10:00:00.000Z");
    seedWatch("user_A", 3, "2024-06-15T11:00:00.000Z");
    seedWatch("user_A", 4, "2024-06-15T12:00:00.000Z");

    expect(getStore()).toHaveLength(4);

    const res = await request(app).delete("/api/tools/kick-sessions");
    expect(res.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("returns 204 even when the user has no kick sessions (idempotent)", async () => {
    const res = await request(app).delete("/api/tools/kick-sessions");
    expect(res.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("GET returns an empty list after account-level wipe", async () => {
    seedPhone("user_A", 1);
    seedWatch("user_A", 2, "2024-06-15T10:00:00.000Z");

    await request(app).delete("/api/tools/kick-sessions");

    const getRes = await request(app).get("/api/tools/kick-sessions");
    expect(getRes.status).toBe(200);
    expect(getRes.body.items).toHaveLength(0);
    expect(getRes.body.total).toBe(0);
  });
});

// ─── Isolation ────────────────────────────────────────────────────────────────

describe("DELETE /api/tools/kick-sessions — cross-user isolation", () => {
  it("does not remove kick sessions belonging to a different user", async () => {
    // user_A — one phone, one Watch
    seedPhone("user_A", 1);
    seedWatch("user_A", 2, "2024-06-15T10:00:00.000Z");
    // user_B — one phone, one Watch
    seedPhone("user_B", 3);
    seedWatch("user_B", 4, "2024-06-15T11:00:00.000Z");

    // Signed in as user_A
    const res = await request(app).delete("/api/tools/kick-sessions");
    expect(res.status).toBe(204);

    const remaining = getStore();
    expect(remaining).toHaveLength(2);
    expect(remaining.every((r) => r.userId === "user_B")).toBe(true);
  });

  it("leaves user_B's Watch rows intact after user_A's full account wipe", async () => {
    seedWatch("user_A", 1, "2024-06-15T10:00:00.000Z");
    seedWatch("user_A", 2, "2024-06-15T11:00:00.000Z");
    seedWatch("user_B", 3, "2024-06-15T12:00:00.000Z");

    await request(app).delete("/api/tools/kick-sessions");

    const remaining = getStore();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].userId).toBe("user_B");
    expect(remaining[0].watchSessionId).toBe("2024-06-15T12:00:00.000Z");
  });

  it("leaves user_B's phone rows intact after user_A's full account wipe", async () => {
    seedPhone("user_A", 1);
    seedPhone("user_B", 2);
    seedWatch("user_B", 3, "2024-06-15T10:00:00.000Z");

    await request(app).delete("/api/tools/kick-sessions");

    const remaining = getStore();
    expect(remaining).toHaveLength(2);
    expect(remaining.every((r) => r.userId === "user_B")).toBe(true);
  });
});

// ─── Via POST then DELETE (end-to-end flow) ───────────────────────────────────

describe("DELETE /api/tools/kick-sessions — end-to-end via POST", () => {
  it("removes a phone kick session that was created via POST", async () => {
    const postRes = await request(app).post("/api/tools/kick-sessions").send({
      startedAt: "2024-06-15T10:00:00Z",
      endedAt: "2024-06-15T10:20:00Z",
      kickCount: 10,
    });
    expect(postRes.status).toBe(201);

    const delRes = await request(app).delete("/api/tools/kick-sessions");
    expect(delRes.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("removes a Watch kick session that was created via POST with watchSessionId", async () => {
    const watchSessionId = "2024-06-15T10:00:00.000Z";
    const postRes = await request(app).post("/api/tools/kick-sessions").send({
      startedAt: watchSessionId,
      endedAt: "2024-06-15T10:20:00Z",
      kickCount: 10,
      watchSessionId,
    });
    expect(postRes.status).toBe(201);

    const delRes = await request(app).delete("/api/tools/kick-sessions");
    expect(delRes.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("removes mixed phone + Watch sessions created via POST", async () => {
    // Phone session
    await request(app)
      .post("/api/tools/kick-sessions")
      .send({ startedAt: "2024-06-15T09:00:00Z", kickCount: 5 });

    // Watch session A
    await request(app).post("/api/tools/kick-sessions").send({
      startedAt: "2024-06-15T10:00:00Z",
      kickCount: 10,
      watchSessionId: "2024-06-15T10:00:00.000Z",
    });

    // Watch session B
    await request(app).post("/api/tools/kick-sessions").send({
      startedAt: "2024-06-15T11:00:00Z",
      kickCount: 8,
      watchSessionId: "2024-06-15T11:00:00.000Z",
    });

    expect(getStore()).toHaveLength(3);

    const delRes = await request(app).delete("/api/tools/kick-sessions");
    expect(delRes.status).toBe(204);
    expect(getStore()).toHaveLength(0);

    // Confirm GET also reflects the empty state
    const getRes = await request(app).get("/api/tools/kick-sessions");
    expect(getRes.body.items).toHaveLength(0);
    expect(getRes.body.total).toBe(0);
  });
});
