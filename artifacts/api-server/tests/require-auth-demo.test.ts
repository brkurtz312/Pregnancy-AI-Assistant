import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

// --- mocks -----------------------------------------------------------------

// Clerk: by default no session, so anything that authenticates in these tests
// did so via the demo token rather than by accident.
const getAuthMock = vi.fn<() => { userId: string | null }>(() => ({
  userId: null,
}));
vi.mock("@clerk/express", () => ({
  getAuth: () => getAuthMock(),
}));

// ensureActiveAccount runs a transaction; give it a tombstone-free result.
let tombstoned = false;
vi.mock("@workspace/db", () => ({
  db: {
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        execute: async () => ({ rows: [] }),
        select: () => ({
          from: () => ({
            where: () => ({ limit: async () => (tombstoned ? [{}] : []) }),
          }),
        }),
        insert: () => ({
          values: () => ({ onConflictDoNothing: async () => undefined }),
        }),
      }),
  },
  usersTable: { id: "id" },
  accountDeletionRequestsTable: { userId: "user_id" },
}));

import { requireAuth, getUserId } from "../src/middlewares/auth";
import {
  DEMO_SUBJECT_PREFIX,
  issueDemoToken,
  newDemoSubject,
} from "../src/lib/demo-token";

// --- helpers ---------------------------------------------------------------

const SECRET = "d".repeat(48);
const ORIGINAL = process.env.DEMO_SESSION_SECRET;

function makeReq(authorization?: string): Request {
  return {
    headers: authorization ? { authorization } : {},
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as Request;
}

function makeRes(): Response & { statusCode?: number; body?: unknown } {
  const res = {
    status(code: number) {
      (res as { statusCode?: number }).statusCode = code;
      return res;
    },
    json(payload: unknown) {
      (res as { body?: unknown }).body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode?: number; body?: unknown };
}

/** Runs requireAuth and resolves once next() or a response has settled. */
async function run(req: Request) {
  const res = makeRes();
  const next = vi.fn<NextFunction>();
  requireAuth(req, res, next);
  // ensureActiveAccount is async; let its promise chain flush.
  await new Promise((r) => setTimeout(r, 0));
  return { res, next };
}

beforeEach(() => {
  process.env.DEMO_SESSION_SECRET = SECRET;
  getAuthMock.mockReturnValue({ userId: null });
  tombstoned = false;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DEMO_SESSION_SECRET;
  else process.env.DEMO_SESSION_SECRET = ORIGINAL;
});

// --- tests -----------------------------------------------------------------

describe("requireAuth — demo sessions", () => {
  it("authenticates a valid demo token with no Clerk session", async () => {
    const sub = newDemoSubject();
    const req = makeReq(`Bearer ${issueDemoToken(sub)}`);
    const { res, next } = await run(req);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
    expect((req as Request & { userId?: string }).userId).toBe(sub);
  });

  it("stamps a demo-namespaced userId, never a Clerk-shaped one", async () => {
    const req = makeReq(`Bearer ${issueDemoToken(newDemoSubject())}`);
    await run(req);
    const userId = (req as Request & { userId?: string }).userId ?? "";
    expect(userId.startsWith(DEMO_SUBJECT_PREFIX)).toBe(true);
    expect(userId.startsWith("user_")).toBe(false);
  });

  it("401s when the demo token is garbage and there is no Clerk session", async () => {
    const { res, next } = await run(makeReq("Bearer not-a-real-token"));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("401s once DEMO_SESSION_SECRET is removed, closing the door", async () => {
    const token = issueDemoToken(newDemoSubject());
    delete process.env.DEMO_SESSION_SECRET;
    const { res, next } = await run(makeReq(`Bearer ${token}`));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("410s a demo session whose account carries a deletion tombstone", async () => {
    tombstoned = true;
    const { res, next } = await run(
      makeReq(`Bearer ${issueDemoToken(newDemoSubject())}`),
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(410);
  });
});

describe("requireAuth — Clerk sessions are unaffected", () => {
  it("still authenticates a Clerk session when no demo token is present", async () => {
    getAuthMock.mockReturnValue({ userId: "user_2abcdef" });
    const req = makeReq();
    const { res, next } = await run(req);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
    expect((req as Request & { userId?: string }).userId).toBe("user_2abcdef");
  });

  it("falls through to Clerk when the bearer token is not a demo token", async () => {
    getAuthMock.mockReturnValue({ userId: "user_2abcdef" });
    const req = makeReq("Bearer some.clerk.jwt");
    await run(req);
    expect((req as Request & { userId?: string }).userId).toBe("user_2abcdef");
  });

  it("401s when neither credential is present", async () => {
    const { res, next } = await run(makeReq());
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

describe("getUserId", () => {
  it("returns the demo subject for a demo request", () => {
    const sub = newDemoSubject();
    expect(getUserId(makeReq(`Bearer ${issueDemoToken(sub)}`))).toBe(sub);
  });

  it("returns the Clerk id when there is no demo token", () => {
    getAuthMock.mockReturnValue({ userId: "user_2abcdef" });
    expect(getUserId(makeReq())).toBe("user_2abcdef");
  });

  it("prefers the demo subject when both are somehow present", () => {
    // Defensive: a stale Clerk cookie alongside a demo token must not let the
    // demo session act as the Clerk user.
    getAuthMock.mockReturnValue({ userId: "user_2abcdef" });
    const sub = newDemoSubject();
    expect(getUserId(makeReq(`Bearer ${issueDemoToken(sub)}`))).toBe(sub);
  });

  it("returns null when unauthenticated", () => {
    expect(getUserId(makeReq())).toBeNull();
  });
});
