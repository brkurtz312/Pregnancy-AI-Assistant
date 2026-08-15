/**
 * Symptom log account-level delete
 *
 * Confirms that DELETE /tools/symptoms wipes ALL symptom log rows for the
 * authenticated user, regardless of which session or device created them.
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
  symptomLogsTable,
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
        const row: Row = { severity: null, notes: null, ...vals, id: nextId++ };
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

  const symptomLogsTable: MockTable = {
    _table: "symptom_logs",
    id: { _col: "id" },
    userId: { _col: "userId" },
    symptom: { _col: "symptom" },
    severity: { _col: "severity" },
    notes: { _col: "notes" },
    loggedAt: { _col: "loggedAt" },
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
    symptomLogsTable,
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
  symptomLogsTable,
  // Stub tables used by the tools router but unused in this test
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

/** Insert a symptom log directly into the mock store. */
function seedSymptom(userId: string, id: number, symptom = "headache") {
  getStore().push({
    id,
    userId,
    symptom,
    severity: null,
    notes: null,
    loggedAt: new Date("2024-06-15T10:00:00Z"),
  });
}

beforeEach(() => {
  resetStore();
  setAuthedUserId("user_A");
});

// ─── Auth guard ───────────────────────────────────────────────────────────────

describe("DELETE /api/tools/symptoms — auth", () => {
  it("returns 401 when not signed in", async () => {
    setAuthedUserId(null);
    const res = await request(app).delete("/api/tools/symptoms");
    expect(res.status).toBe(401);
  });
});

// ─── Core behaviour ───────────────────────────────────────────────────────────

describe("DELETE /api/tools/symptoms — account-level wipe", () => {
  it("returns 204 and removes all symptom logs for the authenticated user", async () => {
    seedSymptom("user_A", 1, "headache");
    seedSymptom("user_A", 2, "nausea");

    expect(getStore()).toHaveLength(2);

    const res = await request(app).delete("/api/tools/symptoms");
    expect(res.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("returns 204 even when the user has no symptom logs (idempotent)", async () => {
    const res = await request(app).delete("/api/tools/symptoms");
    expect(res.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("removes all symptom logs regardless of symptom type", async () => {
    seedSymptom("user_A", 1, "headache");
    seedSymptom("user_A", 2, "nausea");
    seedSymptom("user_A", 3, "back pain");
    seedSymptom("user_A", 4, "swelling");

    expect(getStore()).toHaveLength(4);

    const res = await request(app).delete("/api/tools/symptoms");
    expect(res.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("GET returns an empty list after account-level wipe", async () => {
    seedSymptom("user_A", 1, "headache");
    seedSymptom("user_A", 2, "nausea");

    await request(app).delete("/api/tools/symptoms");

    const getRes = await request(app).get("/api/tools/symptoms");
    expect(getRes.status).toBe(200);
    expect(getRes.body.items).toHaveLength(0);
    expect(getRes.body.total).toBe(0);
  });
});

// ─── Cross-user isolation ─────────────────────────────────────────────────────

describe("DELETE /api/tools/symptoms — cross-user isolation", () => {
  it("does not remove symptom logs belonging to a different user", async () => {
    seedSymptom("user_A", 1, "headache");
    seedSymptom("user_A", 2, "nausea");
    seedSymptom("user_B", 3, "fatigue");
    seedSymptom("user_B", 4, "swelling");

    // Signed in as user_A
    const res = await request(app).delete("/api/tools/symptoms");
    expect(res.status).toBe(204);

    const remaining = getStore();
    expect(remaining).toHaveLength(2);
    expect(remaining.every((r) => r.userId === "user_B")).toBe(true);
  });

  it("leaves user_B's rows intact after user_A's full account wipe", async () => {
    seedSymptom("user_A", 1, "cramps");
    seedSymptom("user_B", 2, "fatigue");
    seedSymptom("user_B", 3, "nausea");

    await request(app).delete("/api/tools/symptoms");

    const remaining = getStore();
    expect(remaining).toHaveLength(2);
    expect(remaining.every((r) => r.userId === "user_B")).toBe(true);
  });

  it("GET for user_B is unaffected after user_A's account wipe", async () => {
    seedSymptom("user_A", 1, "headache");
    seedSymptom("user_B", 2, "fatigue");

    // Wipe user_A
    setAuthedUserId("user_A");
    await request(app).delete("/api/tools/symptoms");

    // Switch to user_B and confirm data is intact
    setAuthedUserId("user_B");
    const getRes = await request(app).get("/api/tools/symptoms");
    expect(getRes.status).toBe(200);
    expect(getRes.body.items).toHaveLength(1);
    expect(getRes.body.total).toBe(1);
  });
});

// ─── Via POST then DELETE (end-to-end flow) ───────────────────────────────────

describe("DELETE /api/tools/symptoms — end-to-end via POST", () => {
  it("removes a symptom log that was created via POST", async () => {
    const postRes = await request(app).post("/api/tools/symptoms").send({
      symptom: "headache",
      severity: 3,
    });
    expect(postRes.status).toBe(201);

    const delRes = await request(app).delete("/api/tools/symptoms");
    expect(delRes.status).toBe(204);
    expect(getStore()).toHaveLength(0);
  });

  it("removes multiple symptom logs created via POST in a single account wipe", async () => {
    await request(app)
      .post("/api/tools/symptoms")
      .send({ symptom: "headache", severity: 2 });
    await request(app)
      .post("/api/tools/symptoms")
      .send({ symptom: "nausea", severity: 3 });
    await request(app)
      .post("/api/tools/symptoms")
      .send({ symptom: "back pain" });

    expect(getStore()).toHaveLength(3);

    const delRes = await request(app).delete("/api/tools/symptoms");
    expect(delRes.status).toBe(204);
    expect(getStore()).toHaveLength(0);

    // GET should also reflect empty state
    const getRes = await request(app).get("/api/tools/symptoms");
    expect(getRes.body.items).toHaveLength(0);
    expect(getRes.body.total).toBe(0);
  });
});

// ─── /:id route still reachable after account route is registered ─────────────

describe("DELETE /api/tools/symptoms/:id — still works after account route added", () => {
  it("deletes a single symptom by id without affecting others", async () => {
    seedSymptom("user_A", 1, "headache");
    seedSymptom("user_A", 2, "nausea");

    const res = await request(app).delete("/api/tools/symptoms/1");
    expect(res.status).toBe(204);

    expect(getStore()).toHaveLength(1);
    expect(getStore()[0].id).toBe(2);
  });

  it("returns 404 when deleting a non-existent symptom by id", async () => {
    const res = await request(app).delete("/api/tools/symptoms/999");
    expect(res.status).toBe(404);
  });
});
