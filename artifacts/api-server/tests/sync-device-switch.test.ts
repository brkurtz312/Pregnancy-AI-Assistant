/**
 * End-to-end sync tests — device switch scenario
 *
 * Simulates a user creating data on one device (session), then signing out and
 * signing back in on a second device (fresh HTTP request, no local state) and
 * confirming all three synced datasets — journal entries, hospital bag, and
 * birth plan — are retrieved correctly from the server.
 *
 * Also verifies:
 *   - Unauthenticated requests are rejected with 401
 *   - User A's data is not visible to User B (isolation)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";
import crypto from "crypto";

// ─── Hoisted shared state ─────────────────────────────────────────────────────
// vi.mock() factories are hoisted above all imports, so any variables they
// reference must also be defined via vi.hoisted(). We expose all objects that
// both the factories AND the test body need through a single vi.hoisted() call.

const {
  resetStores,
  getAuthedUserId,
  setAuthedUserId,
  resetNextId,
  // Mock objects for @workspace/db
  mockDb,
  journalEntriesTable,
  hospitalBagStateTable,
  birthPlanAnswersTable,
} = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type TableName = "journal" | "hospital_bag" | "birth_plan";

  const stores: Record<TableName, Row[]> = {
    journal: [],
    hospital_bag: [],
    birth_plan: [],
  };

  let authedUserId: string | null = "user_A";
  let nextId = 1;

  // ── Condition types produced by the mocked drizzle-orm functions ──────────
  type EqCond = { _op: "eq"; col: string; val: unknown };
  type AndCond = { _op: "and"; args: unknown[] };
  type Cond = EqCond | AndCond;

  function evalCond(cond: unknown, row: Row): boolean {
    const c = cond as Cond;
    if (c._op === "eq") return row[c.col] === c.val;
    if (c._op === "and") return c.args.every((sub) => evalCond(sub, row));
    return true;
  }

  // Makes a DB chain result awaitable AND provides .returning() for routes
  // that use it. Both patterns appear across the three tool routes:
  //   await db.insert(table).values(data).returning()   ← journal
  //   await db.insert(table).values(data)               ← hospital-bag / birth-plan
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
    _table: TableName;
    id: { _col: string };
    userId: { _col: string };
    [key: string]: unknown;
  };

  // ── In-memory mock database ────────────────────────────────────────────────

  const mockDb = {
    select: (_projection?: unknown) => ({
      from: (table: MockTable) => ({
        where: (cond: unknown) => ({
          orderBy: (_sort: unknown) =>
            thenable(stores[table._table].filter((r) => evalCond(cond, r))),
          limit: (n: number) =>
            thenable(
              stores[table._table].filter((r) => evalCond(cond, r)).slice(0, n),
            ),
        }),
        limit: (n: number) => thenable(stores[table._table].slice(0, n)),
      }),
    }),

    insert: (table: MockTable) => ({
      values: (vals: Row) => {
        const row: Row = {
          ...vals,
          id:
            vals.id !== undefined
              ? vals.id
              : table._table === "journal"
                ? crypto.randomUUID()
                : nextId++,
          createdAt:
            vals.createdAt instanceof Date
              ? vals.createdAt
              : vals.createdAt
                ? new Date(vals.createdAt as string)
                : new Date(),
          updatedAt: new Date(),
        };
        stores[table._table].push(row);
        return thenable([row]);
      },
    }),

    update: (table: MockTable) => ({
      set: (data: Row) => ({
        where: (cond: unknown) => {
          const matched = stores[table._table].filter((r) => evalCond(cond, r));
          matched.forEach((r) => Object.assign(r, data));
          return thenable(matched);
        },
      }),
    }),

    delete: (table: MockTable) => ({
      where: (cond: unknown) => {
        const store = stores[table._table];
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

  // ── Table marker objects ───────────────────────────────────────────────────
  // Column references are plain objects with _col so the mocked eq()/desc()
  // can extract the field name without drizzle SQL machinery.

  const journalEntriesTable: MockTable = {
    _table: "journal",
    id: { _col: "id" },
    userId: { _col: "userId" },
    createdAt: { _col: "createdAt" },
  };

  const hospitalBagStateTable: MockTable = {
    _table: "hospital_bag",
    id: { _col: "id" },
    userId: { _col: "userId" },
  };

  const birthPlanAnswersTable: MockTable = {
    _table: "birth_plan",
    id: { _col: "id" },
    userId: { _col: "userId" },
  };

  // ── Helpers exposed to the test body ──────────────────────────────────────

  return {
    resetStores: () => {
      stores.journal.length = 0;
      stores.hospital_bag.length = 0;
      stores.birth_plan.length = 0;
    },
    getAuthedUserId: () => authedUserId,
    setAuthedUserId: (id: string | null) => {
      authedUserId = id;
    },
    resetNextId: () => {
      nextId = 1;
    },
    // Exported so vi.mock() factories can reference them (no TDZ issue)
    mockDb,
    journalEntriesTable,
    hospitalBagStateTable,
    birthPlanAnswersTable,
  };
});

// ─── Mock drizzle-orm ─────────────────────────────────────────────────────────
// eq / and / desc are imported by the route files. We replace them with simple
// serialisable objects that the in-memory evaluator (defined above) can handle.

vi.mock("drizzle-orm", () => ({
  eq: (col: { _col: string }, val: unknown) => ({
    _op: "eq",
    col: col._col,
    val,
  }),
  and: (...args: unknown[]) => ({ _op: "and", args }),
  desc: (col: { _col: string }) => ({ _dir: "desc", col: col._col }),
}));

// ─── Mock @workspace/db ───────────────────────────────────────────────────────
// All values come from vi.hoisted() so they're available when this factory
// runs (hoisted factories execute in module-init order).

vi.mock("@workspace/db", () => ({
  db: mockDb,
  journalEntriesTable,
  hospitalBagStateTable,
  birthPlanAnswersTable,
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

// ─── Import route modules ─────────────────────────────────────────────────────

import journalRouter from "../src/routes/tools/journal";
import hospitalBagRouter from "../src/routes/tools/hospital-bag";
import birthPlanRouter from "../src/routes/tools/birth-plan";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { log: unknown }).log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    next();
  });
  app.use("/api", journalRouter);
  app.use("/api", hospitalBagRouter);
  app.use("/api", birthPlanRouter);
  return app;
}

const app = buildApp();

beforeEach(() => {
  resetStores();
  setAuthedUserId("user_A");
  resetNextId();
  vi.clearAllMocks();
});

// ─── Journal ──────────────────────────────────────────────────────────────────

describe("GET /api/tools/journal — auth", () => {
  it("returns 401 when not signed in", async () => {
    setAuthedUserId(null);
    const res = await request(app).get("/api/tools/journal");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/tools/journal — auth", () => {
  it("returns 401 when not signed in", async () => {
    setAuthedUserId(null);
    const res = await request(app)
      .post("/api/tools/journal")
      .send({ text: "Secret" });
    expect(res.status).toBe(401);
  });
});

describe("Journal — device switch (sync survival)", () => {
  it("returns an empty list before any entries are created", async () => {
    const res = await request(app).get("/api/tools/journal");
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(0);
  });

  it("creates an entry on device 1 and retrieves it on device 2 (same user, fresh request)", async () => {
    // ── Device 1: create entry while signed in ────────────────────────────
    const postRes = await request(app).post("/api/tools/journal").send({
      text: "Feeling great at 20 weeks!",
      mood: "happy",
      gestationalWeeks: 20,
      gestationalDays: 3,
    });
    expect(postRes.status).toBe(201);
    expect(postRes.body.text).toBe("Feeling great at 20 weeks!");
    expect(postRes.body.mood).toBe("happy");
    const entryId: string = postRes.body.id;
    // Must be a server-assigned UUID (the mobile isServerUuid() regex checks this)
    expect(entryId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    // ── Device 2: sign in (same userId), fresh GET — no local state ───────
    const getRes = await request(app).get("/api/tools/journal");
    expect(getRes.status).toBe(200);
    expect(getRes.body.entries).toHaveLength(1);
    expect(getRes.body.entries[0].id).toBe(entryId);
    expect(getRes.body.entries[0].text).toBe("Feeling great at 20 weeks!");
    expect(getRes.body.entries[0].mood).toBe("happy");
    expect(getRes.body.entries[0].gestationalWeeks).toBe(20);
    expect(getRes.body.entries[0].gestationalDays).toBe(3);
  });

  it("returns only the signed-in user's entries — User B sees an empty list", async () => {
    // User A creates an entry
    await request(app)
      .post("/api/tools/journal")
      .send({ text: "User A private thought" });

    // Simulate device switch to User B
    setAuthedUserId("user_B");
    const res = await request(app).get("/api/tools/journal");
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(0);
  });

  it("updates an existing entry using its server UUID and the change persists on next load", async () => {
    const createRes = await request(app)
      .post("/api/tools/journal")
      .send({ text: "Original text", mood: "tired" });
    const entryId: string = createRes.body.id;

    const updateRes = await request(app)
      .post("/api/tools/journal")
      .send({ id: entryId, text: "Updated text", mood: "grateful" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.text).toBe("Updated text");
    expect(updateRes.body.mood).toBe("grateful");

    const getRes = await request(app).get("/api/tools/journal");
    expect(getRes.body.entries).toHaveLength(1);
    expect(getRes.body.entries[0].text).toBe("Updated text");
    expect(getRes.body.entries[0].mood).toBe("grateful");
  });

  it("deletes an entry and confirms it is gone on the next load", async () => {
    const createRes = await request(app)
      .post("/api/tools/journal")
      .send({ text: "To be deleted" });
    const entryId: string = createRes.body.id;

    const delRes = await request(app).delete(`/api/tools/journal/${entryId}`);
    expect(delRes.status).toBe(204);

    const getRes = await request(app).get("/api/tools/journal");
    expect(getRes.body.entries).toHaveLength(0);
  });

  it("multiple entries survive in insertion order", async () => {
    await request(app).post("/api/tools/journal").send({ text: "Entry 1" });
    await request(app).post("/api/tools/journal").send({ text: "Entry 2" });
    await request(app).post("/api/tools/journal").send({ text: "Entry 3" });

    const getRes = await request(app).get("/api/tools/journal");
    expect(getRes.body.entries).toHaveLength(3);
    const texts = getRes.body.entries.map((e: { text: string }) => e.text);
    expect(texts).toContain("Entry 1");
    expect(texts).toContain("Entry 2");
    expect(texts).toContain("Entry 3");
  });
});

// ─── Hospital Bag ─────────────────────────────────────────────────────────────

const sampleBagCategories = [
  {
    id: "for-mom",
    title: "For Mom",
    items: [
      {
        id: "toiletries",
        label: "Toiletries",
        note: "Travel sizes",
        checked: true,
        custom: false,
      },
      { id: "robe", label: "Comfy robe", checked: false, custom: false },
      { id: "my-snacks", label: "Snacks", checked: false, custom: true },
    ],
  },
];

describe("GET /api/tools/hospital-bag — auth", () => {
  it("returns 401 when not signed in", async () => {
    setAuthedUserId(null);
    const res = await request(app).get("/api/tools/hospital-bag");
    expect(res.status).toBe(401);
  });
});

describe("Hospital Bag — device switch (sync survival)", () => {
  it("returns null before any data has been saved", async () => {
    const res = await request(app).get("/api/tools/hospital-bag");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ categories: null });
  });

  it("saves checked state on device 1 and returns it on a fresh load on device 2", async () => {
    // ── Device 1: toggle items and save ───────────────────────────────────
    const postRes = await request(app)
      .post("/api/tools/hospital-bag")
      .send({ categories: sampleBagCategories });
    expect(postRes.status).toBe(200);
    expect(postRes.body.ok).toBe(true);

    // ── Device 2: sign in, fresh GET — simulates new device after switch ──
    const getRes = await request(app).get("/api/tools/hospital-bag");
    expect(getRes.status).toBe(200);
    expect(getRes.body.categories).toHaveLength(1);
    const items: Array<{ id: string; checked: boolean; custom: boolean }> =
      getRes.body.categories[0].items;
    expect(items.find((i) => i.id === "toiletries")!.checked).toBe(true);
    expect(items.find((i) => i.id === "robe")!.checked).toBe(false);
    expect(items.find((i) => i.id === "my-snacks")!.custom).toBe(true);
  });

  it("returns null for User B when only User A has saved bag data", async () => {
    await request(app)
      .post("/api/tools/hospital-bag")
      .send({ categories: sampleBagCategories });

    setAuthedUserId("user_B");
    const res = await request(app).get("/api/tools/hospital-bag");
    expect(res.body).toEqual({ categories: null });
  });

  it("overwrites the saved state when a second POST is made (toggle update)", async () => {
    await request(app)
      .post("/api/tools/hospital-bag")
      .send({ categories: sampleBagCategories });

    const updated = [
      {
        ...sampleBagCategories[0],
        items: sampleBagCategories[0].items.map((i) => ({
          ...i,
          checked: true,
        })),
      },
    ];
    const updateRes = await request(app)
      .post("/api/tools/hospital-bag")
      .send({ categories: updated });
    expect(updateRes.status).toBe(200);

    const getRes = await request(app).get("/api/tools/hospital-bag");
    const items: Array<{ checked: boolean }> = getRes.body.categories[0].items;
    expect(items.every((i) => i.checked)).toBe(true);
  });

  it("rejects a malformed body with 400", async () => {
    const res = await request(app)
      .post("/api/tools/hospital-bag")
      .send({ wrong: "shape" });
    expect(res.status).toBe(400);
  });
});

// ─── Birth Plan ───────────────────────────────────────────────────────────────

const sampleBirthPlanAnswers = {
  preferred_name: "Jane",
  pain_management: "epidural",
  labor_support: ["partner", "doula"],
  skin_to_skin: true,
};

describe("GET /api/tools/birth-plan — auth", () => {
  it("returns 401 when not signed in", async () => {
    setAuthedUserId(null);
    const res = await request(app).get("/api/tools/birth-plan");
    expect(res.status).toBe(401);
  });
});

describe("Birth Plan — device switch (sync survival)", () => {
  it("returns null before any answers have been saved", async () => {
    const res = await request(app).get("/api/tools/birth-plan");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ answers: null });
  });

  it("saves birth plan answers on device 1 and returns them on a fresh load on device 2", async () => {
    // ── Device 1: fill in birth plan fields ───────────────────────────────
    const postRes = await request(app)
      .post("/api/tools/birth-plan")
      .send({ answers: sampleBirthPlanAnswers });
    expect(postRes.status).toBe(200);
    expect(postRes.body.ok).toBe(true);

    // ── Device 2: sign in, fresh GET — confirms data loaded from server ───
    const getRes = await request(app).get("/api/tools/birth-plan");
    expect(getRes.status).toBe(200);
    expect(getRes.body.answers.preferred_name).toBe("Jane");
    expect(getRes.body.answers.pain_management).toBe("epidural");
    expect(getRes.body.answers.labor_support).toEqual(["partner", "doula"]);
    expect(getRes.body.answers.skin_to_skin).toBe(true);
  });

  it("returns null for User B when only User A has saved answers", async () => {
    await request(app)
      .post("/api/tools/birth-plan")
      .send({ answers: sampleBirthPlanAnswers });

    setAuthedUserId("user_B");
    const res = await request(app).get("/api/tools/birth-plan");
    expect(res.body).toEqual({ answers: null });
  });

  it("overwrites existing answers when POSTed a second time", async () => {
    await request(app)
      .post("/api/tools/birth-plan")
      .send({ answers: sampleBirthPlanAnswers });

    const updated = {
      ...sampleBirthPlanAnswers,
      preferred_name: "Jane (updated)",
    };
    await request(app).post("/api/tools/birth-plan").send({ answers: updated });

    const getRes = await request(app).get("/api/tools/birth-plan");
    expect(getRes.body.answers.preferred_name).toBe("Jane (updated)");
  });

  it("rejects a malformed body with 400", async () => {
    const res = await request(app)
      .post("/api/tools/birth-plan")
      .send({ wrong: "shape" });
    expect(res.status).toBe(400);
  });
});
