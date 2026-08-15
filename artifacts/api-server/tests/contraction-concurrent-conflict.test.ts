/**
 * POST /tools/contractions — concurrent-conflict SELECT fallback
 *
 * Exercises the race path where ON CONFLICT DO NOTHING suppresses the insert
 * (returns []) while the conflicting row is already committed and visible to
 * the subsequent SELECT.  The handler must return 200 with the existing row —
 * not 500 "Should never happen".
 *
 * This is distinct from the retry-storm deduplication tests: those rely on the
 * in-memory mock that resolves conflicts naturally.  Here we force the insert
 * to always return an empty array and verify the SELECT fallback is reached.
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
  seedRow,
  setInsertMode,
  mockDb,
  contractionLogsTable,
} = vi.hoisted(() => {
  type Row = Record<string, unknown>;

  /**
   * The seed store — rows placed here before a request are returned by SELECT.
   * The insert mock never adds to it when in "conflict" mode, simulating the
   * ON CONFLICT DO NOTHING path.
   */
  const store: Row[] = [];
  let authedUserId: string | null = "user_A";

  /**
   * Controls what the insert mock returns:
   *   "normal"   – inserts the row into the store and returns it (default)
   *   "conflict" – returns [] without touching the store (simulates a DB-level
   *                unique-constraint conflict where a concurrent transaction
   *                already holds the row)
   */
  let insertMode: "normal" | "conflict" = "normal";

  // ── Condition evaluation ──────────────────────────────────────────────────

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
          if (insertMode === "conflict") {
            // Simulate ON CONFLICT DO NOTHING: the conflicting row is already
            // committed by a concurrent request, so the insert is suppressed.
            return thenable([] as Row[]);
          }
          // Normal path: insert succeeds.
          const row: Row = { ...vals, id: store.length + 1 };
          store.push(row);
          return thenable([row]);
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
      insertMode = "normal";
    },
    getAuthedUserId: () => authedUserId,
    setAuthedUserId: (id: string | null) => {
      authedUserId = id;
    },
    getStore: () => store,
    /** Place a row directly in the store (simulates a row from a concurrent insert). */
    seedRow: (row: Row) => {
      store.push(row);
    },
    /** Switch the insert mock between "normal" and "conflict" modes. */
    setInsertMode: (mode: "normal" | "conflict") => {
      insertMode = mode;
    },
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

// ─── Stub sub-routers ─────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SESSION_DATE = "2024-06-15";

const EXISTING_ROW = {
  id: 42,
  userId: "user_A",
  sessionDate: SESSION_DATE,
  startedAt: new Date(`${SESSION_DATE}T10:00:00.000Z`),
  endedAt: new Date(`${SESSION_DATE}T10:01:00.000Z`),
  durationSeconds: 60,
  intervalSeconds: null,
  watchRecordId: "watch-race-001",
};

beforeEach(() => {
  resetStore();
  setAuthedUserId("user_A");
});

// ─── SELECT fallback path ─────────────────────────────────────────────────────

describe("POST /api/tools/contractions — concurrent-conflict SELECT fallback", () => {
  it(
    "returns 200 with the existing row when the insert is suppressed by ON CONFLICT DO NOTHING " +
      "and the SELECT fallback finds the pre-existing row",
    async () => {
      // Simulate the race: the conflicting row is already committed in the DB
      // (placed in the store so the SELECT can find it) but the insert is
      // suppressed (returns []) as if another request won the race at the same
      // millisecond.
      seedRow({ ...EXISTING_ROW });
      setInsertMode("conflict");

      const res = await request(app)
        .post("/api/tools/contractions")
        .send({
          startedAt: `${SESSION_DATE}T10:00:00.000Z`,
          endedAt: `${SESSION_DATE}T10:01:00.000Z`,
          durationSeconds: 60,
          sessionDate: SESSION_DATE,
          watchRecordId: EXISTING_ROW.watchRecordId,
        });

      // Must be 200 (not 201 for a fresh insert, not 500 for the missing-row panic).
      expect(res.status).toBe(200);

      // The body must reflect the pre-existing row's data.
      expect(res.body.id).toBe(EXISTING_ROW.id);
      expect(res.body.startedAt).toBe(EXISTING_ROW.startedAt.toISOString());
      expect(res.body.endedAt).toBe(EXISTING_ROW.endedAt!.toISOString());
      expect(res.body.durationSeconds).toBe(EXISTING_ROW.durationSeconds);
      expect(res.body.sessionDate).toBe(SESSION_DATE);
    },
  );

  it(
    "does not create a duplicate row in the store when the insert is suppressed " +
      "and the SELECT fallback returns the pre-existing row",
    async () => {
      seedRow({ ...EXISTING_ROW });
      setInsertMode("conflict");

      await request(app)
        .post("/api/tools/contractions")
        .send({
          startedAt: `${SESSION_DATE}T10:00:00.000Z`,
          endedAt: `${SESSION_DATE}T10:01:00.000Z`,
          durationSeconds: 60,
          sessionDate: SESSION_DATE,
          watchRecordId: EXISTING_ROW.watchRecordId,
        });

      // The store must still have exactly the one pre-seeded row — no duplicate.
      const rows = getStore().filter(
        (r) => r.watchRecordId === EXISTING_ROW.watchRecordId,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(EXISTING_ROW.id);
    },
  );

  it("returns 200 (not 500) on back-to-back conflict requests sharing the same watchRecordId", async () => {
    // Seed the row that the conflicting concurrent winner already wrote.
    seedRow({ ...EXISTING_ROW });
    setInsertMode("conflict");

    // Both requests hit the conflict path simultaneously.
    const [res1, res2] = await Promise.all([
      request(app)
        .post("/api/tools/contractions")
        .send({
          startedAt: `${SESSION_DATE}T10:00:00.000Z`,
          endedAt: `${SESSION_DATE}T10:01:00.000Z`,
          durationSeconds: 60,
          sessionDate: SESSION_DATE,
          watchRecordId: EXISTING_ROW.watchRecordId,
        }),
      request(app)
        .post("/api/tools/contractions")
        .send({
          startedAt: `${SESSION_DATE}T10:00:00.000Z`,
          endedAt: `${SESSION_DATE}T10:01:00.000Z`,
          durationSeconds: 60,
          sessionDate: SESSION_DATE,
          watchRecordId: EXISTING_ROW.watchRecordId,
        }),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Both responses must carry the same existing row id.
    expect(res1.body.id).toBe(EXISTING_ROW.id);
    expect(res2.body.id).toBe(EXISTING_ROW.id);

    // Still exactly one row — no duplicates.
    expect(getStore()).toHaveLength(1);
  });

  it(
    "returns 200 on the conflict path even when the request omits endedAt " +
      "(partial contraction recorded from the Watch)",
    async () => {
      const partialRow = {
        id: 99,
        userId: "user_A",
        sessionDate: SESSION_DATE,
        startedAt: new Date(`${SESSION_DATE}T09:00:00.000Z`),
        endedAt: null,
        durationSeconds: null,
        intervalSeconds: null,
        watchRecordId: "watch-partial-001",
      };

      seedRow({ ...partialRow });
      setInsertMode("conflict");

      const res = await request(app)
        .post("/api/tools/contractions")
        .send({
          startedAt: `${SESSION_DATE}T09:00:00.000Z`,
          sessionDate: SESSION_DATE,
          watchRecordId: partialRow.watchRecordId,
        });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(partialRow.id);
      expect(res.body.endedAt).toBeNull();
      expect(res.body.durationSeconds).toBeNull();

      // No duplicate row.
      expect(
        getStore().filter((r) => r.watchRecordId === partialRow.watchRecordId),
      ).toHaveLength(1);
    },
  );
});
