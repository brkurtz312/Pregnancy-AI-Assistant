/**
 * Session-delete endpoint — Watch-sourced contraction coverage
 *
 * Confirms that DELETE /tools/contractions/session/:date wipes ALL rows for
 * the given date, regardless of whether they arrived from the phone or from
 * the Watch (watchRecordId set).
 *
 * Also covers:
 *   - 401 when unauthenticated
 *   - 400 for a malformed date
 *   - Only the target user's rows are removed (cross-user isolation)
 *   - Only the target date's rows are removed (cross-date isolation)
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
  contractionLogsTable,
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
    // select supports both plain list queries and { count: count() } projections
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
          // Check for watchRecordId uniqueness (mirrors the partial unique index)
          const watchRecordId = vals.watchRecordId as string | null | undefined;
          const userId = vals.userId as string;
          const conflict =
            watchRecordId != null &&
            store.some(
              (r) => r.userId === userId && r.watchRecordId === watchRecordId,
            );
          if (!conflict) {
            const row: Row = { ...vals, id: nextId++ };
            store.push(row);
            return thenable([row]);
          }
          // Conflict: return empty array (ON CONFLICT DO NOTHING)
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
  };

  // ── Table marker ──────────────────────────────────────────────────────────

  const contractionLogsTable: MockTable = {
    _table: "contractions",
    id: { _col: "id" },
    userId: { _col: "userId" },
    sessionDate: { _col: "sessionDate" },
    startedAt: { _col: "startedAt" },
    endedAt: { _col: "endedAt" },
    durationSeconds: { _col: "durationSeconds" },
    intervalSeconds: { _col: "intervalSeconds" },
    watchRecordId: { _col: "watchRecordId" },
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
    contractionLogsTable,
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
  contractionLogsTable,
  // Stub other tables that the tools/index router imports (unused in this test)
  symptomLogsTable: {
    _table: "symptoms",
    id: { _col: "id" },
    userId: { _col: "userId" },
  },
  kickSessionsTable: {
    _table: "kick_sessions",
    id: { _col: "id" },
    userId: { _col: "userId" },
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
// journal, hospital-bag, and birth-plan routers import their own DB tables; stub
// them so we don't have to expand the @workspace/db mock further.

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

const SESSION_DATE = "2024-06-15";
const OTHER_DATE = "2024-06-16";

/** Insert a phone-originated contraction directly into the mock store. */
function seedPhone(userId: string, sessionDate: string, id: number) {
  getStore().push({
    id,
    userId,
    sessionDate,
    startedAt: new Date(`${sessionDate}T10:00:00Z`),
    endedAt: new Date(`${sessionDate}T10:01:00Z`),
    durationSeconds: 60,
    intervalSeconds: null,
    watchRecordId: null,
  });
}

/** Insert a Watch-originated contraction directly into the mock store. */
function seedWatch(
  userId: string,
  sessionDate: string,
  id: number,
  watchRecordId: string,
) {
  getStore().push({
    id,
    userId,
    sessionDate,
    startedAt: new Date(`${sessionDate}T10:05:00Z`),
    endedAt: new Date(`${sessionDate}T10:06:00Z`),
    durationSeconds: 60,
    intervalSeconds: null,
    watchRecordId,
  });
}

beforeEach(() => {
  resetStore();
  setAuthedUserId("user_A");
});

// ─── Auth guard ───────────────────────────────────────────────────────────────

describe("DELETE /api/tools/contractions/session/:date — auth", () => {
  it("returns 401 when not signed in", async () => {
    setAuthedUserId(null);
    const res = await request(app).delete(
      `/api/tools/contractions/session/${SESSION_DATE}`,
    );
    expect(res.status).toBe(401);
  });
});

// ─── Input validation ─────────────────────────────────────────────────────────

describe("DELETE /api/tools/contractions/session/:date — validation", () => {
  it("returns 400 for a date that is not YYYY-MM-DD", async () => {
    const res = await request(app).delete(
      "/api/tools/contractions/session/not-a-date",
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM-DD/);
  });

  it("returns 400 for a partial date string", async () => {
    const res = await request(app).delete(
      "/api/tools/contractions/session/2024-06",
    );
    expect(res.status).toBe(400);
  });
});

// ─── Core behaviour ───────────────────────────────────────────────────────────

describe("DELETE /api/tools/contractions/session/:date — removes all rows", () => {
  it("returns 204 and removes both phone-sourced and Watch-sourced rows for the date", async () => {
    // Seed: two contractions — one from phone, one from Watch — same date, same user
    seedPhone("user_A", SESSION_DATE, 1);
    seedWatch("user_A", SESSION_DATE, 2, "watch-uuid-abc");

    expect(getStore()).toHaveLength(2);

    const delRes = await request(app).delete(
      `/api/tools/contractions/session/${SESSION_DATE}`,
    );
    expect(delRes.status).toBe(204);

    // Store must be empty — both rows gone
    expect(getStore()).toHaveLength(0);
  });

  it("confirms the GET for that date returns an empty list after deletion", async () => {
    seedPhone("user_A", SESSION_DATE, 1);
    seedWatch("user_A", SESSION_DATE, 2, "watch-uuid-def");

    await request(app).delete(
      `/api/tools/contractions/session/${SESSION_DATE}`,
    );

    const getRes = await request(app)
      .get("/api/tools/contractions")
      .query({ sessionDate: SESSION_DATE });
    expect(getRes.status).toBe(200);
    expect(getRes.body.items).toHaveLength(0);
    expect(getRes.body.total).toBe(0);
  });

  it("also handles a session with multiple Watch contractions alongside phone ones", async () => {
    seedPhone("user_A", SESSION_DATE, 1);
    seedWatch("user_A", SESSION_DATE, 2, "watch-uuid-1");
    seedWatch("user_A", SESSION_DATE, 3, "watch-uuid-2");
    seedWatch("user_A", SESSION_DATE, 4, "watch-uuid-3");

    expect(getStore()).toHaveLength(4);

    const delRes = await request(app).delete(
      `/api/tools/contractions/session/${SESSION_DATE}`,
    );
    expect(delRes.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("returns 204 even when the session has no rows (idempotent)", async () => {
    const res = await request(app).delete(
      `/api/tools/contractions/session/${SESSION_DATE}`,
    );
    expect(res.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });
});

// ─── Isolation ────────────────────────────────────────────────────────────────

describe("DELETE /api/tools/contractions/session/:date — isolation", () => {
  it("does not remove rows belonging to a different user (cross-user isolation)", async () => {
    // User A and User B both have a phone and a Watch contraction on SESSION_DATE
    seedPhone("user_A", SESSION_DATE, 1);
    seedWatch("user_A", SESSION_DATE, 2, "watch-a-1");
    seedPhone("user_B", SESSION_DATE, 3);
    seedWatch("user_B", SESSION_DATE, 4, "watch-b-1");

    // Signed in as user_A — delete only user_A's session
    const delRes = await request(app).delete(
      `/api/tools/contractions/session/${SESSION_DATE}`,
    );
    expect(delRes.status).toBe(204);

    const remaining = getStore();
    expect(remaining).toHaveLength(2);
    expect(remaining.every((r) => r.userId === "user_B")).toBe(true);
  });

  it("does not remove rows from a different date (cross-date isolation)", async () => {
    // user_A has contractions on both SESSION_DATE and OTHER_DATE
    seedPhone("user_A", SESSION_DATE, 1);
    seedWatch("user_A", SESSION_DATE, 2, "watch-uuid-same-date");
    seedPhone("user_A", OTHER_DATE, 3);
    seedWatch("user_A", OTHER_DATE, 4, "watch-uuid-other-date");

    const delRes = await request(app).delete(
      `/api/tools/contractions/session/${SESSION_DATE}`,
    );
    expect(delRes.status).toBe(204);

    const remaining = getStore();
    expect(remaining).toHaveLength(2);
    expect(remaining.every((r) => r.sessionDate === OTHER_DATE)).toBe(true);
  });

  it("preserves Watch-only rows on a different date after deleting the target session", async () => {
    seedWatch("user_A", SESSION_DATE, 1, "watch-target");
    seedWatch("user_A", OTHER_DATE, 2, "watch-survivor");

    await request(app).delete(
      `/api/tools/contractions/session/${SESSION_DATE}`,
    );

    const remaining = getStore();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].watchRecordId).toBe("watch-survivor");
    expect(remaining[0].sessionDate).toBe(OTHER_DATE);
  });
});

// ─── Via POST then DELETE (end-to-end flow) ───────────────────────────────────

describe("DELETE /api/tools/contractions/session/:date — end-to-end via POST", () => {
  it("removes a phone contraction that was created via POST /tools/contractions", async () => {
    const postRes = await request(app)
      .post("/api/tools/contractions")
      .send({
        startedAt: `${SESSION_DATE}T10:00:00Z`,
        endedAt: `${SESSION_DATE}T10:01:00Z`,
        durationSeconds: 60,
        sessionDate: SESSION_DATE,
      });
    expect(postRes.status).toBe(201);

    const delRes = await request(app).delete(
      `/api/tools/contractions/session/${SESSION_DATE}`,
    );
    expect(delRes.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("removes a Watch contraction that was created via POST /tools/contractions with watchRecordId", async () => {
    const watchId = "watch-e2e-uuid-001";
    const postRes = await request(app)
      .post("/api/tools/contractions")
      .send({
        startedAt: `${SESSION_DATE}T10:05:00Z`,
        endedAt: `${SESSION_DATE}T10:06:00Z`,
        durationSeconds: 60,
        sessionDate: SESSION_DATE,
        watchRecordId: watchId,
      });
    expect(postRes.status).toBe(201);

    const delRes = await request(app).delete(
      `/api/tools/contractions/session/${SESSION_DATE}`,
    );
    expect(delRes.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("removes mixed phone + Watch contractions created via POST in a single session", async () => {
    // Phone contraction
    await request(app)
      .post("/api/tools/contractions")
      .send({
        startedAt: `${SESSION_DATE}T09:00:00Z`,
        durationSeconds: 45,
        sessionDate: SESSION_DATE,
      });

    // Watch contraction 1
    await request(app)
      .post("/api/tools/contractions")
      .send({
        startedAt: `${SESSION_DATE}T09:10:00Z`,
        durationSeconds: 50,
        sessionDate: SESSION_DATE,
        watchRecordId: "watch-post-1",
      });

    // Watch contraction 2
    await request(app)
      .post("/api/tools/contractions")
      .send({
        startedAt: `${SESSION_DATE}T09:20:00Z`,
        durationSeconds: 55,
        sessionDate: SESSION_DATE,
        watchRecordId: "watch-post-2",
      });

    expect(getStore()).toHaveLength(3);

    const delRes = await request(app).delete(
      `/api/tools/contractions/session/${SESSION_DATE}`,
    );
    expect(delRes.status).toBe(204);
    expect(getStore()).toHaveLength(0);

    // History list must also be empty
    const getRes = await request(app)
      .get("/api/tools/contractions")
      .query({ sessionDate: SESSION_DATE });
    expect(getRes.body.items).toHaveLength(0);
    expect(getRes.body.total).toBe(0);
  });
});
