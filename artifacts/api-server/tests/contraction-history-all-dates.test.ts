/**
 * Contraction history — all-dates query
 *
 * The GET /tools/contractions endpoint returns all sessions for the
 * authenticated user when `sessionDate` is omitted.  This new code path
 * (added when the history screen needed multi-date support) has three
 * requirements tested here:
 *
 *  1. Sessions from multiple dates are all returned, sorted newest-first
 *     (by sessionDate DESC then startedAt DESC).
 *  2. `offset` pagination is respected — page 2 returns the next batch.
 *  3. User isolation — user A's sessions are never visible to user B.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

// ─── Hoisted shared state ─────────────────────────────────────────────────────
// vi.mock() factories are hoisted above all imports.  Any variables they
// reference must also be initialised via vi.hoisted() to avoid TDZ errors.

const {
  resetStore,
  mockDb,
  contractionLogsTable,
  getCurrentUserId,
  setCurrentUserId,
} = vi.hoisted(() => {
  type Row = Record<string, unknown>;

  let rows: Row[] = [];
  let nextId = 1;
  let currentUserId = "user_A";

  // ── Condition evaluator (mirrors mocked drizzle-orm behaviour) ────────────
  type EqCond = { _op: "eq"; col: string; val: unknown };
  type AndCond = { _op: "and"; args: unknown[] };
  type DescSort = { _dir: "desc"; col: string };

  function evalCond(cond: unknown, row: Row): boolean {
    const c = cond as EqCond | AndCond;
    if (c._op === "eq") return row[c.col] === c.val;
    if (c._op === "and") return c.args.every((sub) => evalCond(sub, row));
    return true;
  }

  function applySort(filtered: Row[], sorts: DescSort[]): Row[] {
    return [...filtered].sort((a, b) => {
      for (const s of sorts) {
        const av = a[s.col] as string;
        const bv = b[s.col] as string;
        if (av > bv) return s._dir === "desc" ? -1 : 1;
        if (av < bv) return s._dir === "desc" ? 1 : -1;
      }
      return 0;
    });
  }

  // ── Table marker (column names used by the route's eq()/desc() calls) ─────
  const contractionLogsTable = {
    _name: "contraction_logs",
    id: { _col: "id" },
    userId: { _col: "userId" },
    sessionDate: { _col: "sessionDate" },
    startedAt: { _col: "startedAt" },
    watchRecordId: { _col: "watchRecordId" },
  };

  // ── In-memory mock database ───────────────────────────────────────────────
  const mockDb = {
    insert: (_table: unknown) => ({
      values: (vals: Row) => {
        const chain = {
          _conflictSafe: false,
          onConflictDoNothing() {
            this._conflictSafe = true;
            return this;
          },
          returning() {
            // Enforce partial unique index on (userId, watchRecordId) WHERE
            // watchRecordId IS NOT NULL — mirrors the real DB constraint.
            if (
              vals.watchRecordId != null &&
              rows.some(
                (r) =>
                  r.userId === vals.userId &&
                  r.watchRecordId === vals.watchRecordId,
              )
            ) {
              if (this._conflictSafe) return Promise.resolve([]);
              return Promise.reject(
                new Error("duplicate key violates unique constraint"),
              );
            }
            const row: Row = { id: nextId++, ...vals };
            rows.push(row);
            return Promise.resolve([row]);
          },
        };
        return chain;
      },
    }),

    select: (fields?: Record<string, unknown>) => ({
      from: (_table: unknown) => {
        const isCount =
          fields != null &&
          Object.values(fields).some(
            (f) => (f as { _op?: string })?._op === "count",
          );

        return {
          _where: null as unknown,
          _sorts: [] as DescSort[],
          _limit: null as number | null,
          _offset: 0,

          where(cond: unknown) {
            this._where = cond;
            return this;
          },
          orderBy(...sorts: DescSort[]) {
            this._sorts = sorts;
            return this;
          },
          limit(n: number) {
            this._limit = n;
            return this;
          },
          offset(o: number) {
            this._offset = o;
            return this;
          },
          then(
            resolve: (v: Row[]) => unknown,
            reject: (e: unknown) => unknown,
          ) {
            const cond = this._where;
            let out = cond ? rows.filter((r) => evalCond(cond, r)) : [...rows];
            if (isCount) {
              return Promise.resolve([{ count: out.length }]).then(
                resolve as never,
                reject,
              );
            }
            if (this._sorts.length) out = applySort(out, this._sorts);
            if (this._offset) out = out.slice(this._offset);
            if (this._limit != null) out = out.slice(0, this._limit);
            return Promise.resolve(out).then(resolve as never, reject);
          },
        };
      },
    }),
  };

  return {
    resetStore: () => {
      rows = [];
      nextId = 1;
    },
    getCurrentUserId: () => currentUserId,
    setCurrentUserId: (id: string) => {
      currentUserId = id;
    },
    mockDb,
    contractionLogsTable,
  };
});

// ─── Mock @workspace/db ───────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: mockDb,
  contractionLogsTable,
  symptomLogsTable: { _name: "symptom_logs" },
  kickSessionsTable: { _name: "kick_sessions" },
  prenatalVisitsTable: { _name: "prenatal_visits" },
  journalEntriesTable: { _name: "journal_entries" },
  hospitalBagStateTable: { _name: "hospital_bag_state" },
  birthPlanAnswersTable: { _name: "birth_plan_answers" },
}));

// ─── Mock drizzle-orm ─────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq: (col: { _col?: string } | string, val: unknown) => ({
    _op: "eq",
    col: typeof col === "object" ? (col as { _col?: string })._col : col,
    val,
  }),
  and: (...args: unknown[]) => ({ _op: "and", args }),
  desc: (col: { _col: string }) => ({ _dir: "desc", col: col._col }),
  count: () => ({ _op: "count" }),
  sql: () => ({}),
}));

// ─── Mock auth middleware ─────────────────────────────────────────────────────
// The mock sets `req.userId` from the hoisted `getCurrentUserId()` so tests
// can switch users between requests by calling `setCurrentUserId()`.

vi.mock("../src/middlewares/auth", () => ({
  requireAuth: (
    req: express.Request & { userId?: string },
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    req.userId = getCurrentUserId();
    next();
  },
}));

// ─── Stub sub-routers (pulled in by the tools index) ─────────────────────────

vi.mock("../src/routes/tools/journal", () => ({ default: express.Router() }));
vi.mock("../src/routes/tools/hospital-bag", () => ({
  default: express.Router(),
}));
vi.mock("../src/routes/tools/birth-plan", () => ({
  default: express.Router(),
}));

// ─── App factory ─────────────────────────────────────────────────────────────

import toolsRouter from "../src/routes/tools/index";

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(toolsRouter);
  return app;
}

const app = makeApp();

// ─── Test setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  resetStore();
  setCurrentUserId("user_A");
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /tools/contractions (no sessionDate) — multi-date history", () => {
  it("returns an empty list when the user has no contractions", async () => {
    const res = await request(app).get("/tools/contractions");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it("returns sessions from multiple dates and sorts them newest-first", async () => {
    // Seed three contractions across two session dates.
    // Expected order: 2026-08-12T14 → 2026-08-12T10 → 2026-08-10T08.
    const seeds = [
      { startedAt: "2026-08-10T08:00:00.000Z", sessionDate: "2026-08-10" },
      { startedAt: "2026-08-12T14:00:00.000Z", sessionDate: "2026-08-12" },
      { startedAt: "2026-08-12T10:00:00.000Z", sessionDate: "2026-08-12" },
    ];

    for (const s of seeds) {
      await request(app).post("/tools/contractions").send(s).expect(201);
    }

    const res = await request(app).get("/tools/contractions");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items).toHaveLength(3);

    // Newest date first; within the same date, newest startedAt first.
    expect(res.body.items[0].sessionDate).toBe("2026-08-12");
    expect(res.body.items[0].startedAt).toBe("2026-08-12T14:00:00.000Z");
    expect(res.body.items[1].sessionDate).toBe("2026-08-12");
    expect(res.body.items[1].startedAt).toBe("2026-08-12T10:00:00.000Z");
    expect(res.body.items[2].sessionDate).toBe("2026-08-10");
    expect(res.body.items[2].startedAt).toBe("2026-08-10T08:00:00.000Z");
  });

  it("respects the offset parameter — page 2 returns the next batch", async () => {
    // Insert 5 contractions across three dates.
    const entries = [
      { sessionDate: "2026-08-14", startedAt: "2026-08-14T09:00:00.000Z" },
      { sessionDate: "2026-08-14", startedAt: "2026-08-14T07:00:00.000Z" },
      { sessionDate: "2026-08-13", startedAt: "2026-08-13T22:00:00.000Z" },
      { sessionDate: "2026-08-13", startedAt: "2026-08-13T20:00:00.000Z" },
      { sessionDate: "2026-08-12", startedAt: "2026-08-12T11:00:00.000Z" },
    ];

    for (const e of entries) {
      await request(app).post("/tools/contractions").send(e).expect(201);
    }

    // Page 1: first 2 (newest)
    const page1 = await request(app).get(
      "/tools/contractions?limit=2&offset=0",
    );
    expect(page1.status).toBe(200);
    expect(page1.body.total).toBe(5);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.items[0].startedAt).toBe("2026-08-14T09:00:00.000Z");
    expect(page1.body.items[1].startedAt).toBe("2026-08-14T07:00:00.000Z");

    // Page 2: next 2
    const page2 = await request(app).get(
      "/tools/contractions?limit=2&offset=2",
    );
    expect(page2.status).toBe(200);
    expect(page2.body.total).toBe(5);
    expect(page2.body.items).toHaveLength(2);
    expect(page2.body.items[0].startedAt).toBe("2026-08-13T22:00:00.000Z");
    expect(page2.body.items[1].startedAt).toBe("2026-08-13T20:00:00.000Z");

    // Page 3: last 1
    const page3 = await request(app).get(
      "/tools/contractions?limit=2&offset=4",
    );
    expect(page3.status).toBe(200);
    expect(page3.body.total).toBe(5);
    expect(page3.body.items).toHaveLength(1);
    expect(page3.body.items[0].startedAt).toBe("2026-08-12T11:00:00.000Z");
  });

  it("user isolation — user B sees an empty list when only user A has data", async () => {
    // User A creates 3 contractions.
    setCurrentUserId("user_A");
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/tools/contractions")
        .send({
          startedAt: `2026-08-10T0${i}:00:00.000Z`,
          sessionDate: "2026-08-10",
        })
        .expect(201);
    }

    // Switch to user B — should see nothing.
    setCurrentUserId("user_B");
    const res = await request(app).get("/tools/contractions");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it("user B's sessions do not bleed into user A's results", async () => {
    // User A inserts one contraction.
    setCurrentUserId("user_A");
    await request(app)
      .post("/tools/contractions")
      .send({
        startedAt: "2026-08-11T08:00:00.000Z",
        sessionDate: "2026-08-11",
      })
      .expect(201);

    // User B inserts two contractions on the same date.
    setCurrentUserId("user_B");
    await request(app)
      .post("/tools/contractions")
      .send({
        startedAt: "2026-08-11T09:00:00.000Z",
        sessionDate: "2026-08-11",
      })
      .expect(201);
    await request(app)
      .post("/tools/contractions")
      .send({
        startedAt: "2026-08-11T10:00:00.000Z",
        sessionDate: "2026-08-11",
      })
      .expect(201);

    // Back to user A — only their 1 session is returned.
    setCurrentUserId("user_A");
    const res = await request(app).get("/tools/contractions");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].startedAt).toBe("2026-08-11T08:00:00.000Z");
  });

  it("single-date filter still works when sessionDate IS provided", async () => {
    // Insert contractions across two dates.
    const entries = [
      { sessionDate: "2026-08-10", startedAt: "2026-08-10T08:00:00.000Z" },
      { sessionDate: "2026-08-11", startedAt: "2026-08-11T09:00:00.000Z" },
      { sessionDate: "2026-08-11", startedAt: "2026-08-11T10:00:00.000Z" },
    ];
    for (const e of entries) {
      await request(app).post("/tools/contractions").send(e).expect(201);
    }

    const res = await request(app).get(
      "/tools/contractions?sessionDate=2026-08-11",
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(
      res.body.items.every(
        (i: { sessionDate: string }) => i.sessionDate === "2026-08-11",
      ),
    ).toBe(true);
  });
});
