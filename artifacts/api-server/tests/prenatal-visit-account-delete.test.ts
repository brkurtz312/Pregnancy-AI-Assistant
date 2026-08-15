/**
 * Prenatal visit account-level delete
 *
 * Confirms that DELETE /tools/prenatal-visits wipes ALL prenatal visit rows
 * for the authenticated user, regardless of which session or device created them.
 *
 * Also covers:
 *   - 401 when unauthenticated
 *   - Only the target user's rows are removed (cross-user isolation)
 *   - GET returns an empty list after account-level wipe
 *   - Idempotency (204 even when no rows exist)
 *   - Individual /:id delete still works after the account route is registered
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
  prenatalVisitsTable,
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
      values: (vals: Row) => {
        const row: Row = {
          weight: null,
          bloodPressure: null,
          fetalHeartRate: null,
          notes: null,
          ...vals,
          id: nextId++,
          createdAt: new Date("2024-06-15T10:00:00Z"),
        };
        store.push(row);
        return {
          returning: () => thenable([row]),
        };
      },
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

  const prenatalVisitsTable: MockTable = {
    _table: "prenatal_visits",
    id: { _col: "id" },
    userId: { _col: "userId" },
    visitDate: { _col: "visitDate" },
    weight: { _col: "weight" },
    bloodPressure: { _col: "bloodPressure" },
    fetalHeartRate: { _col: "fetalHeartRate" },
    notes: { _col: "notes" },
    createdAt: { _col: "createdAt" },
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
    prenatalVisitsTable,
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
  prenatalVisitsTable,
  // Stub tables used by the tools router but unused in this test
  symptomLogsTable: {
    _table: "symptom_logs",
    id: { _col: "id" },
    userId: { _col: "userId" },
  },
  kickSessionsTable: {
    _table: "kick_sessions",
    id: { _col: "id" },
    userId: { _col: "userId" },
  },
  contractionLogsTable: {
    _table: "contractions",
    id: { _col: "id" },
    userId: { _col: "userId" },
    sessionDate: { _col: "sessionDate" },
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

/** Insert a prenatal visit directly into the mock store. */
function seedVisit(userId: string, id: number, visitDate = "2024-06-15") {
  getStore().push({
    id,
    userId,
    visitDate: new Date(`${visitDate}T10:00:00Z`),
    weight: null,
    bloodPressure: null,
    fetalHeartRate: null,
    notes: null,
    createdAt: new Date("2024-06-15T10:00:00Z"),
  });
}

beforeEach(() => {
  resetStore();
  setAuthedUserId("user_A");
});

// ─── Auth guard ───────────────────────────────────────────────────────────────

describe("DELETE /api/tools/prenatal-visits — auth", () => {
  it("returns 401 when not signed in", async () => {
    setAuthedUserId(null);
    const res = await request(app).delete("/api/tools/prenatal-visits");
    expect(res.status).toBe(401);
  });
});

// ─── Core behaviour ───────────────────────────────────────────────────────────

describe("DELETE /api/tools/prenatal-visits — account-level wipe", () => {
  it("returns 204 and removes all prenatal visit rows for the authenticated user", async () => {
    seedVisit("user_A", 1, "2024-05-01");
    seedVisit("user_A", 2, "2024-06-01");

    expect(getStore()).toHaveLength(2);

    const res = await request(app).delete("/api/tools/prenatal-visits");
    expect(res.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("returns 204 even when the user has no prenatal visits (idempotent)", async () => {
    const res = await request(app).delete("/api/tools/prenatal-visits");
    expect(res.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("removes all visits across multiple visit dates", async () => {
    seedVisit("user_A", 1, "2024-03-15");
    seedVisit("user_A", 2, "2024-04-15");
    seedVisit("user_A", 3, "2024-05-15");
    seedVisit("user_A", 4, "2024-06-15");

    expect(getStore()).toHaveLength(4);

    const res = await request(app).delete("/api/tools/prenatal-visits");
    expect(res.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("GET returns an empty list after account-level wipe", async () => {
    seedVisit("user_A", 1, "2024-05-01");
    seedVisit("user_A", 2, "2024-06-01");

    await request(app).delete("/api/tools/prenatal-visits");

    const getRes = await request(app).get("/api/tools/prenatal-visits");
    expect(getRes.status).toBe(200);
    expect(getRes.body.items).toHaveLength(0);
    expect(getRes.body.total).toBe(0);
  });
});

// ─── Cross-user isolation ─────────────────────────────────────────────────────

describe("DELETE /api/tools/prenatal-visits — cross-user isolation", () => {
  it("does not remove prenatal visits belonging to a different user", async () => {
    seedVisit("user_A", 1, "2024-05-01");
    seedVisit("user_A", 2, "2024-06-01");
    seedVisit("user_B", 3, "2024-05-15");
    seedVisit("user_B", 4, "2024-06-15");

    // Signed in as user_A
    const res = await request(app).delete("/api/tools/prenatal-visits");
    expect(res.status).toBe(204);

    const remaining = getStore();
    expect(remaining).toHaveLength(2);
    expect(remaining.every((r) => r.userId === "user_B")).toBe(true);
  });

  it("leaves user_B's visits intact after user_A's full account wipe", async () => {
    seedVisit("user_A", 1, "2024-04-01");
    seedVisit("user_B", 2, "2024-05-01");
    seedVisit("user_B", 3, "2024-06-01");

    await request(app).delete("/api/tools/prenatal-visits");

    const remaining = getStore();
    expect(remaining).toHaveLength(2);
    expect(remaining.every((r) => r.userId === "user_B")).toBe(true);
  });

  it("GET for user_B is unaffected after user_A's account wipe", async () => {
    seedVisit("user_A", 1, "2024-05-01");
    seedVisit("user_B", 2, "2024-06-01");

    // Wipe user_A
    setAuthedUserId("user_A");
    await request(app).delete("/api/tools/prenatal-visits");

    // Switch to user_B and confirm data is intact
    setAuthedUserId("user_B");
    const getRes = await request(app).get("/api/tools/prenatal-visits");
    expect(getRes.status).toBe(200);
    expect(getRes.body.items).toHaveLength(1);
    expect(getRes.body.total).toBe(1);
  });
});

// ─── Via POST then DELETE (end-to-end flow) ───────────────────────────────────

describe("DELETE /api/tools/prenatal-visits — end-to-end via POST", () => {
  it("removes a prenatal visit that was created via POST", async () => {
    const postRes = await request(app).post("/api/tools/prenatal-visits").send({
      visitDate: "2024-06-15T10:00:00Z",
      weight: "65.5 kg",
      bloodPressure: "120/80",
      fetalHeartRate: "145 bpm",
    });
    expect(postRes.status).toBe(201);

    const delRes = await request(app).delete("/api/tools/prenatal-visits");
    expect(delRes.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("removes multiple prenatal visits created via POST in a single account wipe", async () => {
    await request(app)
      .post("/api/tools/prenatal-visits")
      .send({ visitDate: "2024-04-15T10:00:00Z", weight: "63.0 kg" });
    await request(app)
      .post("/api/tools/prenatal-visits")
      .send({ visitDate: "2024-05-15T10:00:00Z", weight: "64.2 kg" });
    await request(app)
      .post("/api/tools/prenatal-visits")
      .send({ visitDate: "2024-06-15T10:00:00Z", weight: "65.5 kg" });

    expect(getStore()).toHaveLength(3);

    const delRes = await request(app).delete("/api/tools/prenatal-visits");
    expect(delRes.status).toBe(204);
    expect(getStore()).toHaveLength(0);

    // GET should also reflect empty state
    const getRes = await request(app).get("/api/tools/prenatal-visits");
    expect(getRes.body.items).toHaveLength(0);
    expect(getRes.body.total).toBe(0);
  });
});

// ─── /:id route still reachable after account route is registered ─────────────

describe("DELETE /api/tools/prenatal-visits/:id — still works after account route added", () => {
  it("deletes a single prenatal visit by id without affecting others", async () => {
    seedVisit("user_A", 1, "2024-05-01");
    seedVisit("user_A", 2, "2024-06-01");

    const res = await request(app).delete("/api/tools/prenatal-visits/1");
    expect(res.status).toBe(204);

    expect(getStore()).toHaveLength(1);
    expect(getStore()[0].id).toBe(2);
  });

  it("returns 404 when deleting a non-existent prenatal visit by id", async () => {
    const res = await request(app).delete("/api/tools/prenatal-visits/999");
    expect(res.status).toBe(404);
  });
});
