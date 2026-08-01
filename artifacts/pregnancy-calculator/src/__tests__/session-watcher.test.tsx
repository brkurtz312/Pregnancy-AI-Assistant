/**
 * Regression guard for SessionWatcher: proves that the React Query cache is
 * fully cleared the moment a Clerk session transitions from active to null
 * (i.e. the user signs out), and that a persistent 401 while Clerk thinks the
 * user is signed in (stale tenant token) triggers an automatic sign-out.
 *
 * Why this matters: without the queryClient.clear() call in SessionWatcher,
 * stale authenticated data — pass status, free-question count, profile — would
 * remain in the cache after sign-out and flash to the next visitor before the
 * invalidation triggered by the subsequent sign-in completed.
 *
 * The stale-tenant guard covers the scenario where a device still has a token
 * from the old Clerk tenant: the API returns 401 on every request, but Clerk
 * still reports isSignedIn = true. Without the guard the user would see an
 * infinite spinner or broken screen; with it, signOut() is called and the
 * sign-in page is shown.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from "vitest";
import { render, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useClerk, useSession } from "@clerk/react";
import { SessionWatcher } from "@/components/session-watcher";

vi.mock("@clerk/react", () => ({
  useSession: vi.fn(),
  useClerk: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => {
  // Define ApiError inside the factory so the same class is shared by the
  // production module (imported by SessionWatcher) and the test helpers.
  // instanceof checks work because both sides see the same class reference.
  class ApiError extends Error {
    status: number;
    constructor(status: number, message?: string) {
      super(message ?? String(status));
      this.name = "ApiError";
      this.status = status;
    }
  }
  return { ApiError };
});

import { ApiError } from "@workspace/api-client-react";

/**
 * Construct a mock ApiError for tests.
 *
 * TypeScript resolves `ApiError` to the real 3-param constructor from the
 * original module declaration. vitest replaces the module at runtime with our
 * simplified 2-param mock class. We cast through `unknown` so TypeScript
 * accepts the simplified call; at runtime the mocked class is used, which
 * preserves instanceof behaviour inside SessionWatcher.
 */
const MockApiErrorCtor = ApiError as unknown as new (
  status: number,
  msg?: string,
) => ApiError;
function makeApiError(status: number): ApiError {
  return new MockApiErrorCtor(status);
}

const mockUseSession = useSession as MockedFunction<typeof useSession>;
const mockUseClerk = useClerk as MockedFunction<typeof useClerk>;

type UseSessionReturn = ReturnType<typeof useSession>;

function signedInState(id = "sess_test"): UseSessionReturn {
  return {
    isLoaded: true,
    isSignedIn: true,
    session: {
      id,
      status: "active",
    } as UseSessionReturn["session"] & {},
  } as UseSessionReturn;
}

function signedOutState(): UseSessionReturn {
  return {
    isLoaded: true,
    isSignedIn: false,
    session: null,
  } as UseSessionReturn;
}

type UseClerkReturn = ReturnType<typeof useClerk>;

function renderWatcher(
  queryClient: QueryClient,
  signOut?: ReturnType<typeof vi.fn>,
) {
  mockUseClerk.mockReturnValue({
    signOut: signOut ?? vi.fn(async () => {}),
  } as unknown as UseClerkReturn);
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionWatcher />
    </QueryClientProvider>,
  );
}

describe("SessionWatcher", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
    mockUseClerk.mockReturnValue({
      signOut: vi.fn(async () => {}),
    } as unknown as UseClerkReturn);
  });

  it("calls queryClient.clear() when session transitions from active to null (sign-out)", () => {
    const clearSpy = vi.spyOn(queryClient, "clear");

    mockUseSession.mockReturnValue(signedInState());
    const { rerender } = renderWatcher(queryClient);

    mockUseSession.mockReturnValue(signedOutState());
    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionWatcher />
      </QueryClientProvider>,
    );

    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT call queryClient.clear() when the session stays active", () => {
    const clearSpy = vi.spyOn(queryClient, "clear");

    mockUseSession.mockReturnValue(signedInState());
    const { rerender } = renderWatcher(queryClient);

    mockUseSession.mockReturnValue(signedInState());
    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionWatcher />
      </QueryClientProvider>,
    );

    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("calls queryClient.invalidateQueries() when session transitions from null to active (sign-in)", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    mockUseSession.mockReturnValue(signedOutState());
    const { rerender } = renderWatcher(queryClient);

    mockUseSession.mockReturnValue(signedInState());
    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionWatcher />
      </QueryClientProvider>,
    );

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it("same-device account switch: clear() fires on sign-out then invalidateQueries() fires on next sign-in", () => {
    const clearSpy = vi.spyOn(queryClient, "clear");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    // User A is signed in.
    mockUseSession.mockReturnValue(signedInState("sess_user_a"));
    const { rerender } = renderWatcher(queryClient);

    // User A signs out — cache must be cleared.
    mockUseSession.mockReturnValue(signedOutState());
    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionWatcher />
      </QueryClientProvider>,
    );

    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledTimes(0);

    // User B signs in on the same device/browser — queries must be invalidated.
    mockUseSession.mockReturnValue(signedInState("sess_user_b"));
    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionWatcher />
      </QueryClientProvider>,
    );

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    // clear() must NOT fire again — only the sign-out transition triggers it.
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it("same-device account switch: user A's cached data is absent when user B's session starts", async () => {
    const passStatusKey = ["get-pass-status"];
    const profileKey = ["get-profile"];

    // Seed cache with user A's data.
    await queryClient.fetchQuery({
      queryKey: passStatusKey,
      queryFn: () =>
        Promise.resolve({ hasPass: true, freeUsed: 3, freeLimit: 5 }),
    });
    await queryClient.fetchQuery({
      queryKey: profileKey,
      queryFn: () => Promise.resolve({ providerName: "Dr_UserA" }),
    });

    expect(queryClient.getQueryData(passStatusKey)).toEqual({
      hasPass: true,
      freeUsed: 3,
      freeLimit: 5,
    });
    expect(queryClient.getQueryData(profileKey)).toEqual({
      providerName: "Dr_UserA",
    });

    // User A is signed in.
    mockUseSession.mockReturnValue(signedInState("sess_user_a"));
    const { rerender } = renderWatcher(queryClient);

    // User A signs out — cache cleared.
    mockUseSession.mockReturnValue(signedOutState());
    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionWatcher />
      </QueryClientProvider>,
    );

    // All of user A's data must be gone before user B arrives.
    expect(queryClient.getQueryData(passStatusKey)).toBeUndefined();
    expect(queryClient.getQueryData(profileKey)).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);

    // User B signs in — invalidateQueries fires but no stale data exists to bleed.
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    mockUseSession.mockReturnValue(signedInState("sess_user_b"));
    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionWatcher />
      </QueryClientProvider>,
    );

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    // Cache is still empty — user B's queries will fetch fresh from the server.
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("stale cache entries are gone immediately after sign-out clears the cache", async () => {
    const passStatusKey = ["get-pass-status"];
    await queryClient.fetchQuery({
      queryKey: passStatusKey,
      queryFn: () =>
        Promise.resolve({ hasPass: true, freeUsed: 0, freeLimit: 5 }),
    });

    expect(queryClient.getQueryData(passStatusKey)).toEqual({
      hasPass: true,
      freeUsed: 0,
      freeLimit: 5,
    });

    mockUseSession.mockReturnValue(signedInState());
    const { rerender } = renderWatcher(queryClient);

    mockUseSession.mockReturnValue(signedOutState());
    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionWatcher />
      </QueryClientProvider>,
    );

    expect(queryClient.getQueryData(passStatusKey)).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});

describe("SessionWatcher — stale-tenant 401 guard", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
  });

  it("calls signOut when a query settles in error state with a 401 while a session is active", async () => {
    const mockSignOut = vi.fn(async () => {});
    mockUseSession.mockReturnValue(signedInState());

    renderWatcher(queryClient, mockSignOut);

    // Trigger a persistent 401 — simulates a stale tenant token that the API
    // will never accept.
    await act(async () => {
      await queryClient
        .fetchQuery({
          queryKey: ["stale-tenant-test"],
          queryFn: () => Promise.reject(makeApiError(401)),
          retry: false,
        })
        .catch(() => {});
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("does NOT call signOut when a query fails with a non-401 error (e.g. 500)", async () => {
    const mockSignOut = vi.fn(async () => {});
    mockUseSession.mockReturnValue(signedInState());

    renderWatcher(queryClient, mockSignOut);

    await act(async () => {
      await queryClient
        .fetchQuery({
          queryKey: ["server-error-test"],
          queryFn: () => Promise.reject(makeApiError(500)),
          retry: false,
        })
        .catch(() => {});
    });

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("does NOT call signOut when a 401 arrives but the session is already null", async () => {
    const mockSignOut = vi.fn(async () => {});
    // Already signed out.
    mockUseSession.mockReturnValue(signedOutState());

    renderWatcher(queryClient, mockSignOut);

    await act(async () => {
      await queryClient
        .fetchQuery({
          queryKey: ["signed-out-401-test"],
          queryFn: () => Promise.reject(makeApiError(401)),
          retry: false,
        })
        .catch(() => {});
    });

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("only calls signOut once even when multiple queries fail with 401 simultaneously", async () => {
    const mockSignOut = vi.fn(async () => {});
    mockUseSession.mockReturnValue(signedInState());

    renderWatcher(queryClient, mockSignOut);

    await act(async () => {
      await Promise.all([
        queryClient
          .fetchQuery({
            queryKey: ["stale-401-a"],
            queryFn: () => Promise.reject(makeApiError(401)),
            retry: false,
          })
          .catch(() => {}),
        queryClient
          .fetchQuery({
            queryKey: ["stale-401-b"],
            queryFn: () => Promise.reject(makeApiError(401)),
            retry: false,
          })
          .catch(() => {}),
      ]);
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});

describe("SessionWatcher — mid-session token expiry", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
  });

  it("calls signOut when a 401 arrives mid-session with cached data in the query cache", async () => {
    const mockSignOut = vi.fn(async () => {});

    // Seed the cache to simulate a user who has already been using the app
    // (profile, pass status, AI usage — typical mid-session entries).
    const passStatusKey = ["get-pass-status"];
    const profileKey = ["get-profile"];
    await queryClient.fetchQuery({
      queryKey: passStatusKey,
      queryFn: () =>
        Promise.resolve({ hasPass: true, freeUsed: 2, freeLimit: 5 }),
    });
    await queryClient.fetchQuery({
      queryKey: profileKey,
      queryFn: () => Promise.resolve({ providerName: "Dr_Active" }),
    });

    // Confirm the cache is populated before the expiry scenario begins.
    expect(queryClient.getQueryData(passStatusKey)).toEqual({
      hasPass: true,
      freeUsed: 2,
      freeLimit: 5,
    });
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);

    // User is actively signed in.
    mockUseSession.mockReturnValue(signedInState());
    renderWatcher(queryClient, mockSignOut);

    // A subsequent query returns 401 — token expired mid-session.
    await act(async () => {
      await queryClient
        .fetchQuery({
          queryKey: ["mid-session-api-call"],
          queryFn: () => Promise.reject(makeApiError(401)),
          retry: false,
        })
        .catch(() => {});
    });

    // signOut() must have been triggered by the stale-token guard.
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("clears all cached data after a mid-session 401 causes signOut and the session transitions to null", async () => {
    const mockSignOut = vi.fn(async () => {});

    // Pre-populate the cache (mid-session state).
    const passStatusKey = ["get-pass-status"];
    const profileKey = ["get-profile"];
    await queryClient.fetchQuery({
      queryKey: passStatusKey,
      queryFn: () =>
        Promise.resolve({ hasPass: false, freeUsed: 4, freeLimit: 5 }),
    });
    await queryClient.fetchQuery({
      queryKey: profileKey,
      queryFn: () => Promise.resolve({ providerName: "Dr_MidSession" }),
    });

    // Confirm data is present.
    expect(queryClient.getQueryData(passStatusKey)).toBeDefined();
    expect(queryClient.getQueryData(profileKey)).toBeDefined();

    // Active session — user is in the middle of using the app.
    mockUseSession.mockReturnValue(signedInState());
    const { rerender } = renderWatcher(queryClient, mockSignOut);

    // A query returns 401 (token expired mid-session), triggering signOut().
    await act(async () => {
      await queryClient
        .fetchQuery({
          queryKey: ["expired-token-call"],
          queryFn: () => Promise.reject(makeApiError(401)),
          retry: false,
        })
        .catch(() => {});
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);

    // Clerk fires the session-change event after signOut() resolves — simulate
    // the session transitioning to null (the same transition that the
    // session-watcher effect already covers on cold sign-out, but here it
    // follows a mid-session expiry).
    mockUseSession.mockReturnValue(signedOutState());
    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionWatcher />
      </QueryClientProvider>,
    );

    // All cached data must be gone — no stale data can flash to a subsequent
    // visitor or after the user re-authenticates.
    expect(queryClient.getQueryData(passStatusKey)).toBeUndefined();
    expect(queryClient.getQueryData(profileKey)).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("does not flash stale data: cache is empty by the time the sign-in UI would appear", async () => {
    const mockSignOut = vi.fn(async () => {});

    // Simulate rich mid-session cache.
    const keys = [
      ["get-pass-status"],
      ["get-profile"],
      ["get-ai-usage"],
      ["get-appointments"],
    ];
    for (const key of keys) {
      await queryClient.fetchQuery({
        queryKey: key,
        queryFn: () => Promise.resolve({ data: `cached-${key[0]}` }),
      });
    }
    expect(queryClient.getQueryCache().getAll().length).toBe(keys.length);

    mockUseSession.mockReturnValue(signedInState());
    const { rerender } = renderWatcher(queryClient, mockSignOut);

    // Token expires — 401 received mid-session.
    await act(async () => {
      await queryClient
        .fetchQuery({
          queryKey: ["stale-mid-session"],
          queryFn: () => Promise.reject(makeApiError(401)),
          retry: false,
        })
        .catch(() => {});
    });

    // signOut fires; Clerk transitions session to null.
    mockUseSession.mockReturnValue(signedOutState());
    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionWatcher />
      </QueryClientProvider>,
    );

    // The sign-in screen is effectively "shown" once session is null.
    // At that exact moment the cache must already be empty — no stale flash.
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    for (const key of keys) {
      expect(queryClient.getQueryData(key)).toBeUndefined();
    }
  });
});

/**
 * Regression guard: pass-status and AI quota must never flash stale values
 * from a previous user when a returning user signs back in.
 *
 * Scenario: User A's pass entitlement (hasPass: true, freeUsed: 4) and AI
 * quota are in the React Query cache.  User A signs out.  User B signs in on
 * the same device.  At the exact moment User B's session becomes active the
 * cache must already be empty — no stale entitlement or quota data can be
 * visible in the UI, even for a single render cycle.
 */
describe("SessionWatcher — no stale pass-status or AI quota flash on sign-in", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
    mockUseClerk.mockReturnValue({
      signOut: vi.fn(async () => {}),
    } as unknown as UseClerkReturn);
  });

  it("pass-status (hasPass, freeUsed, freeLimit) is absent from the cache the moment a new session starts", async () => {
    // Seed user A's pass entitlement into the cache (rich paid user).
    const passStatusKey = ["get-pass-status"];
    await queryClient.fetchQuery({
      queryKey: passStatusKey,
      queryFn: () =>
        Promise.resolve({ hasPass: true, freeUsed: 4, freeLimit: 5 }),
    });
    expect(queryClient.getQueryData(passStatusKey)).toEqual({
      hasPass: true,
      freeUsed: 4,
      freeLimit: 5,
    });

    // User A is signed in; SessionWatcher is mounted.
    mockUseSession.mockReturnValue(signedInState("sess_user_a"));
    const { rerender } = renderWatcher(queryClient);

    // User A signs out — SessionWatcher must call queryClient.clear().
    mockUseSession.mockReturnValue(signedOutState());
    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionWatcher />
      </QueryClientProvider>,
    );

    // Cache must be fully empty before User B's session arrives.
    // If any pass-status data lingers here, the UI would flash User A's
    // entitlement (e.g. "Full Pass active", free-question count = 4) to User B.
    expect(queryClient.getQueryData(passStatusKey)).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);

    // User B signs in — invalidateQueries fires but there is nothing to flash.
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    mockUseSession.mockReturnValue(signedInState("sess_user_b"));
    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionWatcher />
      </QueryClientProvider>,
    );

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    // Still empty — User B's pass-status will be fetched fresh from the server.
    expect(queryClient.getQueryData(passStatusKey)).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("AI quota (freeUsed, freeLimit) is absent from the cache the moment a new session starts", async () => {
    // Seed user A's AI usage quota (they have used all free questions).
    const passStatusKey = ["get-pass-status"];
    await queryClient.fetchQuery({
      queryKey: passStatusKey,
      queryFn: () =>
        Promise.resolve({ hasPass: false, freeUsed: 5, freeLimit: 5 }),
    });
    expect(queryClient.getQueryData(passStatusKey)).toEqual({
      hasPass: false,
      freeUsed: 5,
      freeLimit: 5,
    });

    // User A signed in, then signs out.
    mockUseSession.mockReturnValue(signedInState("sess_user_a"));
    const { rerender } = renderWatcher(queryClient);

    mockUseSession.mockReturnValue(signedOutState());
    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionWatcher />
      </QueryClientProvider>,
    );

    // AI quota data must be cleared — User B must not see "0 free questions
    // remaining" or "quota exhausted" inherited from User A's session.
    expect(queryClient.getQueryData(passStatusKey)).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);

    // User B signs in — cache remains empty until their own fetch completes.
    mockUseSession.mockReturnValue(signedInState("sess_user_b"));
    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionWatcher />
      </QueryClientProvider>,
    );

    expect(queryClient.getQueryData(passStatusKey)).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("multiple cache entries (pass-status, AI quota, profile) are all absent simultaneously at sign-in", async () => {
    // Seed a full set of user A's authenticated data — the kind of rich cache
    // that would be present after the user has been using the app for a while.
    const passStatusKey = ["get-pass-status"];
    const profileKey = ["get-profile"];
    const aiUsageKey = ["get-ai-usage"];

    await queryClient.fetchQuery({
      queryKey: passStatusKey,
      queryFn: () =>
        Promise.resolve({ hasPass: true, freeUsed: 2, freeLimit: 5 }),
    });
    await queryClient.fetchQuery({
      queryKey: profileKey,
      queryFn: () => Promise.resolve({ providerName: "Dr_UserA" }),
    });
    await queryClient.fetchQuery({
      queryKey: aiUsageKey,
      queryFn: () => Promise.resolve({ used: 2, limit: 5, resetAt: null }),
    });

    expect(queryClient.getQueryCache().getAll()).toHaveLength(3);

    // Sign-out cycle.
    mockUseSession.mockReturnValue(signedInState("sess_user_a"));
    const { rerender } = renderWatcher(queryClient);

    mockUseSession.mockReturnValue(signedOutState());
    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionWatcher />
      </QueryClientProvider>,
    );

    // ALL entries cleared atomically — the sign-in UI never has access to
    // any of User A's stale data.
    expect(queryClient.getQueryData(passStatusKey)).toBeUndefined();
    expect(queryClient.getQueryData(profileKey)).toBeUndefined();
    expect(queryClient.getQueryData(aiUsageKey)).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);

    // User B signs in — fresh fetch, no stale flash possible.
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    mockUseSession.mockReturnValue(signedInState("sess_user_b"));
    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionWatcher />
      </QueryClientProvider>,
    );

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
