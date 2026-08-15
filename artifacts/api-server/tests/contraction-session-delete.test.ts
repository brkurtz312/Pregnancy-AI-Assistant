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

// ─── Account-level delete ─────────────────────────────────────────────────────
//
// DELETE /api/tools/contractions (no path segment) wipes every contraction row
// for the authenticated user, regardless of sessionDate or watchRecordId.

describe("DELETE /api/tools/contractions — account-level wipe", () => {
  it("returns 401 when not signed in", async () => {
    setAuthedUserId(null);
    const res = await request(app).delete("/api/tools/contractions");
    expect(res.status).toBe(401);
  });

  it("returns 204 and removes all phone-sourced contractions for the user", async () => {
    seedPhone("user_A", SESSION_DATE, 1);
    seedPhone("user_A", OTHER_DATE, 2);

    expect(getStore()).toHaveLength(2);

    const res = await request(app).delete("/api/tools/contractions");
    expect(res.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("returns 204 and removes all Watch-sourced contractions for the user", async () => {
    seedWatch("user_A", SESSION_DATE, 1, "watch-acct-1");
    seedWatch("user_A", OTHER_DATE, 2, "watch-acct-2");

    expect(getStore()).toHaveLength(2);

    const res = await request(app).delete("/api/tools/contractions");
    expect(res.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("removes both phone-sourced and Watch-sourced contractions across multiple dates", async () => {
    // Two dates, each with a phone row and a Watch row
    seedPhone("user_A", SESSION_DATE, 1);
    seedWatch("user_A", SESSION_DATE, 2, "watch-multi-1");
    seedPhone("user_A", OTHER_DATE, 3);
    seedWatch("user_A", OTHER_DATE, 4, "watch-multi-2");

    expect(getStore()).toHaveLength(4);

    const res = await request(app).delete("/api/tools/contractions");
    expect(res.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("returns 204 even when the user has no contractions (idempotent)", async () => {
    const res = await request(app).delete("/api/tools/contractions");
    expect(res.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("does not remove contractions belonging to a different user", async () => {
    // user_A — phone + Watch
    seedPhone("user_A", SESSION_DATE, 1);
    seedWatch("user_A", SESSION_DATE, 2, "watch-a-acct");
    // user_B — phone + Watch
    seedPhone("user_B", SESSION_DATE, 3);
    seedWatch("user_B", SESSION_DATE, 4, "watch-b-acct");

    // Signed in as user_A
    const res = await request(app).delete("/api/tools/contractions");
    expect(res.status).toBe(204);

    const remaining = getStore();
    expect(remaining).toHaveLength(2);
    expect(remaining.every((r) => r.userId === "user_B")).toBe(true);
  });

  it("leaves user_B's Watch rows intact after user_A's full account wipe", async () => {
    seedWatch("user_A", SESSION_DATE, 1, "watch-a-1");
    seedWatch("user_A", OTHER_DATE, 2, "watch-a-2");
    seedWatch("user_B", SESSION_DATE, 3, "watch-b-1");

    await request(app).delete("/api/tools/contractions");

    const remaining = getStore();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].userId).toBe("user_B");
    expect(remaining[0].watchRecordId).toBe("watch-b-1");
  });

  it("GET returns an empty list for the user after account-level wipe", async () => {
    seedPhone("user_A", SESSION_DATE, 1);
    seedWatch("user_A", SESSION_DATE, 2, "watch-get-check");

    await request(app).delete("/api/tools/contractions");

    const getRes = await request(app).get("/api/tools/contractions");
    expect(getRes.status).toBe(200);
    expect(getRes.body.items).toHaveLength(0);
    expect(getRes.body.total).toBe(0);
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

// ─── Retry-storm / duplicate watchRecordId ────────────────────────────────────
//
// The Watch replays unacknowledged records until the phone confirms receipt.
// If the phone is killed or the network is intermittent the same watchRecordId
// can arrive several times concurrently.  ON CONFLICT DO NOTHING on the
// (user_id, watch_record_id) partial unique index must guarantee that only one
// row ever lands in the DB regardless of how many concurrent POSTs race.

describe("POST /api/tools/contractions — retry-storm deduplication", () => {
  it("stores exactly one row when 3 concurrent POSTs share the same watchRecordId", async () => {
    const WATCH_ID = "watch-retry-storm-001";

    const payload = {
      startedAt: `${SESSION_DATE}T10:00:00Z`,
      endedAt: `${SESSION_DATE}T10:01:00Z`,
      durationSeconds: 60,
      sessionDate: SESSION_DATE,
      watchRecordId: WATCH_ID,
    };

    // Fire all 3 requests concurrently — simulates a Watch retry storm.
    const responses = await Promise.all([
      request(app).post("/api/tools/contractions").send(payload),
      request(app).post("/api/tools/contractions").send(payload),
      request(app).post("/api/tools/contractions").send(payload),
    ]);

    // Every response must be successful (201 for the winner, 200 for retries
    // that hit ON CONFLICT DO NOTHING and return the existing row).
    for (const res of responses) {
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
    }

    // The in-memory store must contain exactly one row for this watchRecordId.
    const storeRows = getStore().filter((r) => r.watchRecordId === WATCH_ID);
    expect(storeRows).toHaveLength(1);
  });

  it("GET history shows exactly one item for the watchRecordId after 5 duplicate POSTs", async () => {
    const WATCH_ID = "watch-retry-storm-002";

    const payload = {
      startedAt: `${SESSION_DATE}T11:00:00Z`,
      endedAt: `${SESSION_DATE}T11:01:00Z`,
      durationSeconds: 60,
      sessionDate: SESSION_DATE,
      watchRecordId: WATCH_ID,
    };

    // Simulate 5 retries (sequential is fine here — what matters is the final state).
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/tools/contractions")
        .send(payload);
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
    }

    const getRes = await request(app)
      .get("/api/tools/contractions")
      .query({ sessionDate: SESSION_DATE });

    expect(getRes.status).toBe(200);

    // Only one contraction should appear in history.
    expect(getRes.body.items).toHaveLength(1);
    expect(getRes.body.total).toBe(1);
  });

  it("total count is correct when duplicates and unique Watch contractions are mixed", async () => {
    // Unique Watch contraction A — arrives once.
    await request(app)
      .post("/api/tools/contractions")
      .send({
        startedAt: `${SESSION_DATE}T08:00:00Z`,
        durationSeconds: 45,
        sessionDate: SESSION_DATE,
        watchRecordId: "watch-unique-A",
      });

    // Watch contraction B — replayed 3 times (retry storm).
    const stormPayload = {
      startedAt: `${SESSION_DATE}T08:10:00Z`,
      durationSeconds: 50,
      sessionDate: SESSION_DATE,
      watchRecordId: "watch-storm-B",
    };
    await Promise.all([
      request(app).post("/api/tools/contractions").send(stormPayload),
      request(app).post("/api/tools/contractions").send(stormPayload),
      request(app).post("/api/tools/contractions").send(stormPayload),
    ]);

    // Unique phone contraction — no watchRecordId.
    await request(app)
      .post("/api/tools/contractions")
      .send({
        startedAt: `${SESSION_DATE}T08:20:00Z`,
        durationSeconds: 55,
        sessionDate: SESSION_DATE,
      });

    const getRes = await request(app)
      .get("/api/tools/contractions")
      .query({ sessionDate: SESSION_DATE });

    expect(getRes.status).toBe(200);

    // 3 distinct records: watch-unique-A, watch-storm-B (once), phone.
    expect(getRes.body.items).toHaveLength(3);
    expect(getRes.body.total).toBe(3);

    // Confirm watch-storm-B appears exactly once in the returned items.
    const stormItems = getRes.body.items.filter(
      (_item: unknown) =>
        getStore().find(
          (r) =>
            r.watchRecordId === "watch-storm-B" &&
            r.id === (_item as { id: number }).id,
        ) !== undefined,
    );
    expect(stormItems).toHaveLength(1);
  });

  it("all concurrent responses return the same contraction id (idempotent)", async () => {
    const WATCH_ID = "watch-retry-storm-idempotent";

    const payload = {
      startedAt: `${SESSION_DATE}T12:00:00Z`,
      endedAt: `${SESSION_DATE}T12:01:00Z`,
      durationSeconds: 60,
      sessionDate: SESSION_DATE,
      watchRecordId: WATCH_ID,
    };

    const responses = await Promise.all([
      request(app).post("/api/tools/contractions").send(payload),
      request(app).post("/api/tools/contractions").send(payload),
      request(app).post("/api/tools/contractions").send(payload),
      request(app).post("/api/tools/contractions").send(payload),
    ]);

    // All responses must carry the same id — they all refer to the same row.
    const ids = responses.map((r) => r.body.id);
    expect(new Set(ids).size).toBe(1);
  });

  it("cross-user isolation: same watchRecordId for different users creates one row per user", async () => {
    const SHARED_WATCH_ID = "watch-cross-user-001";

    const payload = {
      startedAt: `${SESSION_DATE}T13:00:00Z`,
      durationSeconds: 60,
      sessionDate: SESSION_DATE,
      watchRecordId: SHARED_WATCH_ID,
    };

    // user_A sends 3 concurrent POSTs.
    setAuthedUserId("user_A");
    await Promise.all([
      request(app).post("/api/tools/contractions").send(payload),
      request(app).post("/api/tools/contractions").send(payload),
      request(app).post("/api/tools/contractions").send(payload),
    ]);

    // user_B sends 3 concurrent POSTs with the same watchRecordId.
    setAuthedUserId("user_B");
    await Promise.all([
      request(app).post("/api/tools/contractions").send(payload),
      request(app).post("/api/tools/contractions").send(payload),
      request(app).post("/api/tools/contractions").send(payload),
    ]);

    // Exactly one row per user — the unique index is scoped to (userId, watchRecordId).
    const userARows = getStore().filter(
      (r) => r.userId === "user_A" && r.watchRecordId === SHARED_WATCH_ID,
    );
    const userBRows = getStore().filter(
      (r) => r.userId === "user_B" && r.watchRecordId === SHARED_WATCH_ID,
    );

    expect(userARows).toHaveLength(1);
    expect(userBRows).toHaveLength(1);

    // Restore default for subsequent tests.
    setAuthedUserId("user_A");
  });
});

// ─── Delete-then-replay: deduplication index behaviour ────────────────────────
//
// The unique index on (user_id, watch_record_id) is a PARTIAL index
// (WHERE watch_record_id IS NOT NULL).  It prevents duplicate inserts within
// the same session's lifetime, but it does NOT persist across a session delete:
// once the session rows are removed the index has no surviving entry to block a
// later replay carrying the same watchRecordId.
//
// Consequence (intentional): a stale Watch retry that arrives after the user
// deletes the session — e.g. while immediately starting a new session — will
// be ACCEPTED and will insert a new row.  This is expected behaviour; the
// application layer is responsible for deciding whether that ghost row should
// be tolerated or rejected with an additional guard.
//
// These tests document that behaviour so the decision is explicit and visible.

describe("POST /api/tools/contractions — delete-then-replay deduplication", () => {
  it("accepts a replay of the same watchRecordId after the session is deleted (index no longer blocks it)", async () => {
    const WATCH_ID = "watch-delete-replay-001";
    const payload = {
      startedAt: `${SESSION_DATE}T10:00:00Z`,
      endedAt: `${SESSION_DATE}T10:01:00Z`,
      durationSeconds: 60,
      sessionDate: SESSION_DATE,
      watchRecordId: WATCH_ID,
    };

    // Step 1: POST — first arrival stores the contraction.
    const firstPost = await request(app)
      .post("/api/tools/contractions")
      .send(payload);
    expect(firstPost.status).toBe(201);
    expect(getStore()).toHaveLength(1);

    // Step 2: DELETE the session — simulates the user resetting their timer.
    const delRes = await request(app).delete(
      `/api/tools/contractions/session/${SESSION_DATE}`,
    );
    expect(delRes.status).toBe(204);
    expect(getStore()).toHaveLength(0);

    // Step 3: Replay with the same watchRecordId — the Watch hadn't received an
    // acknowledgement yet, so it retries.  Because the index entry was removed
    // with the session rows, this replay is ACCEPTED (not deduplicated).
    const replayPost = await request(app)
      .post("/api/tools/contractions")
      .send(payload);
    expect(replayPost.status).toBeGreaterThanOrEqual(200);
    expect(replayPost.status).toBeLessThan(300);

    // Exactly one row exists — the replay's new row; no ghost duplicates.
    const storeRows = getStore().filter((r) => r.watchRecordId === WATCH_ID);
    expect(storeRows).toHaveLength(1);
  });

  it("replay after delete lands in the new session, not a ghost of the old one", async () => {
    const WATCH_ID = "watch-delete-replay-002";
    const NEW_DATE = "2024-07-01";

    // Original session on SESSION_DATE.
    await request(app)
      .post("/api/tools/contractions")
      .send({
        startedAt: `${SESSION_DATE}T09:00:00Z`,
        durationSeconds: 55,
        sessionDate: SESSION_DATE,
        watchRecordId: WATCH_ID,
      });
    expect(getStore()).toHaveLength(1);

    // Delete the original session.
    await request(app).delete(
      `/api/tools/contractions/session/${SESSION_DATE}`,
    );
    expect(getStore()).toHaveLength(0);

    // Replay arrives claiming a new sessionDate (the user started a fresh
    // session the same day or the next).
    const replayRes = await request(app)
      .post("/api/tools/contractions")
      .send({
        startedAt: `${NEW_DATE}T10:00:00Z`,
        durationSeconds: 60,
        sessionDate: NEW_DATE,
        watchRecordId: WATCH_ID,
      });
    expect(replayRes.status).toBeGreaterThanOrEqual(200);
    expect(replayRes.status).toBeLessThan(300);

    // One row in the store, belonging to the new session date.
    expect(getStore()).toHaveLength(1);
    expect(getStore()[0].sessionDate).toBe(NEW_DATE);
    expect(getStore()[0].watchRecordId).toBe(WATCH_ID);
  });

  it("within a single new session after delete, duplicate replays are still deduplicated", async () => {
    const WATCH_ID = "watch-delete-replay-003";
    const payload = {
      startedAt: `${SESSION_DATE}T11:00:00Z`,
      endedAt: `${SESSION_DATE}T11:01:00Z`,
      durationSeconds: 60,
      sessionDate: SESSION_DATE,
      watchRecordId: WATCH_ID,
    };

    // Original insert.
    await request(app).post("/api/tools/contractions").send(payload);
    expect(getStore()).toHaveLength(1);

    // Delete the session.
    await request(app).delete(
      `/api/tools/contractions/session/${SESSION_DATE}`,
    );
    expect(getStore()).toHaveLength(0);

    // First replay after deletion — accepted (index had no surviving entry).
    const firstReplay = await request(app)
      .post("/api/tools/contractions")
      .send(payload);
    expect(firstReplay.status).toBeGreaterThanOrEqual(200);
    expect(firstReplay.status).toBeLessThan(300);
    expect(getStore()).toHaveLength(1);

    // Second and third replays — these are duplicates within the NEW session
    // so the index now blocks them again (ON CONFLICT DO NOTHING).
    const [secondReplay, thirdReplay] = await Promise.all([
      request(app).post("/api/tools/contractions").send(payload),
      request(app).post("/api/tools/contractions").send(payload),
    ]);
    expect(secondReplay.status).toBeGreaterThanOrEqual(200);
    expect(secondReplay.status).toBeLessThan(300);
    expect(thirdReplay.status).toBeGreaterThanOrEqual(200);
    expect(thirdReplay.status).toBeLessThan(300);

    // Still exactly one row — deduplication is active within the new session.
    const storeRows = getStore().filter((r) => r.watchRecordId === WATCH_ID);
    expect(storeRows).toHaveLength(1);
  });
});
