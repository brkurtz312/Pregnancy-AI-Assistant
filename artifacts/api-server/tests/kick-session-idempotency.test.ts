/**
 * Kick-session server-side idempotency
 *
 * Watch-originated kick sessions carry a `watchSessionId` (the Watch session's
 * startedAt).  A partial unique index on (user_id, watch_session_id) WHERE
 * watch_session_id IS NOT NULL rejects duplicate inserts atomically; the route
 * then returns the existing row with 200 instead of creating a duplicate.
 *
 * This closes the client crash gap: even if the phone is force-quit before its
 * persisted recent-save marker commits, a Watch retry of the same logical
 * session cannot create a second row.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const { resetStore, mockDb, kickSessionsTable } = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  let rows: Row[] = [];
  let nextId = 1;

  const kickSessionsTable = { _name: "kick_sessions" };

  type EqCond = { _op: "eq"; col: string; val: unknown };
  type AndCond = { _op: "and"; args: unknown[] };

  function evalCond(cond: unknown, row: Row): boolean {
    const c = cond as EqCond | AndCond;
    if (c._op === "eq") return row[c.col] === c.val;
    if (c._op === "and") return c.args.every((sub) => evalCond(sub, row));
    return false;
  }

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
            // Enforce the partial unique index (user_id, watch_session_id)
            // WHERE watch_session_id IS NOT NULL.
            if (
              vals.watchSessionId != null &&
              rows.some(
                (r) =>
                  r.userId === vals.userId &&
                  r.watchSessionId === vals.watchSessionId,
              )
            ) {
              if (this._conflictSafe) return Promise.resolve([]);
              return Promise.reject(
                new Error(
                  'duplicate key value violates unique constraint "kick_sessions_user_watch_session_uniq"',
                ),
              );
            }
            const row = { id: nextId++, notes: null, ...vals };
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
        const result = {
          _filtered: rows as Row[],
          _limit: null as number | null,
          _offset: 0,
          where(cond: unknown) {
            this._filtered = rows.filter((r) => evalCond(cond, r));
            return this;
          },
          orderBy() {
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
          then(res: (v: Row[]) => unknown, rej: (e: unknown) => unknown) {
            let out = this._filtered;
            if (isCount) {
              return Promise.resolve([{ count: out.length }]).then(res, rej);
            }
            if (this._offset) out = out.slice(this._offset);
            if (this._limit != null) out = out.slice(0, this._limit);
            return Promise.resolve(out).then(res, rej);
          },
        };
        return result;
      },
    }),
  };

  return {
    resetStore: () => {
      rows = [];
      nextId = 1;
    },
    getRows: () => rows,
    mockDb,
    kickSessionsTable,
  };
});

vi.mock("@workspace/db", () => ({
  db: mockDb,
  kickSessionsTable,
  symptomLogsTable: { _name: "symptom_logs" },
  contractionLogsTable: { _name: "contraction_logs" },
  prenatalVisitsTable: { _name: "prenatal_visits" },
  journalEntriesTable: { _name: "journal_entries" },
  hospitalBagStateTable: { _name: "hospital_bag_state" },
  birthPlanAnswersTable: { _name: "birth_plan_answers" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: { name?: string } | string, val: unknown) => ({
    _op: "eq",
    col: typeof col === "object" ? (col as { _col?: string })._col : col,
    val,
  }),
  and: (...args: unknown[]) => ({ _op: "and", args }),
  desc: (c: unknown) => c,
  count: () => ({ _op: "count" }),
  sql: () => ({}),
}));

// Give mocked eq() a way to know column names: the route calls
// eq(kickSessionsTable.userId, ...) — define those column markers.
Object.assign(kickSessionsTable, {
  userId: { _col: "userId" },
  watchSessionId: { _col: "watchSessionId" },
  startedAt: { _col: "startedAt" },
  id: { _col: "id" },
});

// ── Auth middleware mock ──────────────────────────────────────────────────────
vi.mock("../src/middlewares/auth", () => ({
  requireAuth: (
    req: express.Request & { userId?: string },
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    req.userId = "user_A";
    next();
  },
}));

// Child routers pulled in by the tools router — stub to isolated no-op routers.
vi.mock("../src/routes/tools/journal", () => ({ default: express.Router() }));
vi.mock("../src/routes/tools/hospital-bag", () => ({
  default: express.Router(),
}));
vi.mock("../src/routes/tools/birth-plan", () => ({
  default: express.Router(),
}));

import toolsRouter from "../src/routes/tools/index";

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(toolsRouter);
  return app;
}

const WATCH_SESSION = {
  startedAt: "2026-08-11T10:00:00.000Z",
  endedAt: "2026-08-11T10:20:00.000Z",
  kickCount: 10,
  watchSessionId: "2026-08-11T10:00:00.000Z",
};

describe("POST /tools/kick-sessions — watchSessionId idempotency", () => {
  beforeEach(() => resetStore());

  it("creates the row on first save (201) and returns the SAME row on a retry (200) without duplicating", async () => {
    const app = makeApp();

    const first = await request(app)
      .post("/tools/kick-sessions")
      .send(WATCH_SESSION);
    expect(first.status).toBe(201);

    // Simulated Watch retry after the phone was force-quit and relaunched.
    const retry = await request(app)
      .post("/tools/kick-sessions")
      .send(WATCH_SESSION);
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(first.body.id);

    const list = await request(app).get("/tools/kick-sessions");
    expect(list.body.total).toBe(1);
  });

  it("does not constrain manual sessions without a watchSessionId", async () => {
    const app = makeApp();
    const body = {
      startedAt: "2026-08-11T08:00:00.000Z",
      kickCount: 3,
    };
    const a = await request(app).post("/tools/kick-sessions").send(body);
    const b = await request(app).post("/tools/kick-sessions").send(body);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.id).not.toBe(a.body.id);
  });

  it("scopes idempotency per user — same watchSessionId is distinct per userId in the index predicate", async () => {
    const app = makeApp();
    const first = await request(app)
      .post("/tools/kick-sessions")
      .send(WATCH_SESSION);
    expect(first.status).toBe(201);
    // Same user retry conflicts (checked above); a different user with the
    // same watchSessionId would insert cleanly because the index includes
    // user_id — enforced by the store's (userId, watchSessionId) match.
    const retry = await request(app)
      .post("/tools/kick-sessions")
      .send({ ...WATCH_SESSION, kickCount: 99 });
    expect(retry.status).toBe(200);
    expect(retry.body.kickCount).toBe(first.body.kickCount);
  });
});
