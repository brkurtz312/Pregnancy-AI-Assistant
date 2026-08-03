/**
 * Unit tests for AuthTokenBridge — the mobile equivalent of the web's
 * SessionWatcher. Verifies that switching accounts on a shared device never
 * leaves stale cached data from the previous user in the React Query store
 * or in the AsyncStorage tool caches (journal, hospital bag, birth plan,
 * visit questions).
 *
 * Scenarios covered:
 *   User A signs in  → queryClient.invalidateQueries() is called
 *   User A signs out → queryClient.clear() is called (cache wiped)
 *                    → clearJournalCache / clearHospitalBagCache /
 *                       clearBirthPlanCache / clearVisitQuestionsCache called
 *   User B signs in  → queryClient.invalidateQueries() is called (fresh fetch)
 *   Stale tenant 401 → signOut() is called so Clerk clears the token cache
 *                      and the sign-in screen is shown
 *
 * This mirrors session-switch-isolation.spec.ts on the web side.
 */

import React from "react";
import { act, create } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("@clerk/expo", () => ({
  useSession: jest.fn(),
  useClerk: jest.fn(),
}));

jest.mock("@workspace/api-client-react", () => {
  // Define ApiError inside the factory so the same class is used by both the
  // production module (imported by AuthTokenBridge) and the test helpers below.
  // instanceof checks work correctly because both sides share this one class.
  class ApiError extends Error {
    status: number;
    constructor(status: number, message?: string) {
      super(message ?? String(status));
      this.name = "ApiError";
      this.status = status;
    }
  }
  return {
    setAuthTokenGetter: jest.fn(),
    ApiError,
  };
});

jest.mock("@/lib/journal", () => ({
  clearJournalCache: jest.fn(async () => {}),
}));

jest.mock("@/lib/hospital-bag", () => ({
  clearHospitalBagCache: jest.fn(async () => {}),
}));

jest.mock("@/lib/birth-plan", () => ({
  clearBirthPlanCache: jest.fn(async () => {}),
}));

jest.mock("@/lib/visit-questions", () => ({
  clearVisitQuestionsCache: jest.fn(async () => {}),
}));

jest.mock("@/lib/sync-queue", () => ({
  invalidateWatchQueueSession: jest.fn(async () => {}),
}));

jest.mock("@/modules/WatchConnectivity", () => ({
  __esModule: true,
  default: { signOut: jest.fn(async () => {}) },
}));
// Obtain the mock reference after the factory is registered so there is no
// temporal-dead-zone issue with the factory closure.
const mockWatchSignOut = (
  jest.requireMock("@/modules/WatchConnectivity") as {
    default: { signOut: jest.Mock };
  }
).default.signOut;

import { useClerk, useSession } from "@clerk/expo";
import { ApiError, setAuthTokenGetter } from "@workspace/api-client-react";

/**
 * Construct a mock ApiError for tests.
 *
 * TypeScript resolves `ApiError` to the real 3-param constructor from the
 * original module declaration. Jest replaces the module at runtime with our
 * simplified 2-param mock class. We cast through `unknown` so TypeScript
 * accepts the simplified call; at runtime the mocked class is used, which
 * preserves instanceof behaviour inside AuthTokenBridge.
 */
const MockApiErrorCtor = ApiError as unknown as new (
  status: number,
  msg?: string,
) => ApiError;
function makeApiError(status: number): ApiError {
  return new MockApiErrorCtor(status);
}
import { clearJournalCache } from "@/lib/journal";
import { clearHospitalBagCache } from "@/lib/hospital-bag";
import { clearBirthPlanCache } from "@/lib/birth-plan";
import { clearVisitQuestionsCache } from "@/lib/visit-questions";
import { AuthTokenBridge } from "../components/AuthTokenBridge";

const mockUseSession = useSession as jest.Mock;
const mockUseClerk = useClerk as jest.Mock;
const mockSetAuthTokenGetter = setAuthTokenGetter as jest.Mock;
const mockClearJournal = clearJournalCache as jest.Mock;
const mockClearHospitalBag = clearHospitalBagCache as jest.Mock;
const mockClearBirthPlan = clearBirthPlanCache as jest.Mock;
const mockClearVisitQuestions = clearVisitQuestionsCache as jest.Mock;

function makeSession(id: string) {
  return { getToken: jest.fn(async () => `token-${id}`) };
}

function renderBridge(
  queryClient: QueryClient,
  session: unknown,
  signOut?: jest.Mock,
) {
  mockUseSession.mockReturnValue({ session });
  mockUseClerk.mockReturnValue({ signOut: signOut ?? jest.fn(async () => {}) });
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(AuthTokenBridge),
      ),
    );
  });
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AuthTokenBridge — session-switch isolation", () => {
  it("registers setAuthTokenGetter on mount and clears it on unmount", async () => {
    const qc = new QueryClient();
    const renderer = renderBridge(qc, null);
    await act(async () => {});

    expect(mockSetAuthTokenGetter).toHaveBeenCalledTimes(1);
    expect(typeof mockSetAuthTokenGetter.mock.calls[0][0]).toBe("function");

    act(() => renderer.unmount());
    expect(mockSetAuthTokenGetter).toHaveBeenCalledWith(null);
  });

  it("does NOT call invalidateQueries or clear on initial mount with no session", async () => {
    const qc = new QueryClient();
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    const clear = jest.spyOn(qc, "clear");

    renderBridge(qc, null);
    await act(async () => {});

    expect(invalidate).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("does NOT call invalidateQueries or clear on initial mount with an existing session", async () => {
    const qc = new QueryClient();
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    const clear = jest.spyOn(qc, "clear");

    renderBridge(qc, makeSession("userA"));
    await act(async () => {});

    expect(invalidate).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("calls invalidateQueries (not clear) when transitioning null → session (sign-in)", async () => {
    const qc = new QueryClient();
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    const clear = jest.spyOn(qc, "clear");

    const renderer = renderBridge(qc, null);
    await act(async () => {});

    mockUseSession.mockReturnValue({ session: makeSession("userA") });
    await act(async () => {
      renderer.update(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(AuthTokenBridge),
        ),
      );
    });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
  });

  it("calls clear (not invalidateQueries) when transitioning session → null (sign-out)", async () => {
    const qc = new QueryClient();
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    const clear = jest.spyOn(qc, "clear");

    const renderer = renderBridge(qc, makeSession("userA"));
    await act(async () => {});

    mockUseSession.mockReturnValue({ session: null });
    await act(async () => {
      renderer.update(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(AuthTokenBridge),
        ),
      );
    });

    expect(clear).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("clears on sign-out then invalidates on sign-in — account-switch isolation", async () => {
    const qc = new QueryClient();
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    const clear = jest.spyOn(qc, "clear");

    // User A signs in from the start
    const renderer = renderBridge(qc, makeSession("userA"));
    await act(async () => {});

    // User A signs out
    mockUseSession.mockReturnValue({ session: null });
    await act(async () => {
      renderer.update(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(AuthTokenBridge),
        ),
      );
    });

    expect(clear).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();

    // User B signs in
    mockUseSession.mockReturnValue({ session: makeSession("userB") });
    await act(async () => {
      renderer.update(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(AuthTokenBridge),
        ),
      );
    });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1); // still only once, from sign-out
  });

  it("calls WatchConnectivity.signOut when session transitions signed-in → null", async () => {
    const qc = new QueryClient();

    const renderer = renderBridge(qc, makeSession("userA"));
    await act(async () => {});

    mockUseSession.mockReturnValue({ session: null });
    await act(async () => {
      renderer.update(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(AuthTokenBridge),
        ),
      );
    });

    expect(mockWatchSignOut).toHaveBeenCalledTimes(1);
  });

  it("does NOT call WatchConnectivity.signOut on sign-in (only on sign-out)", async () => {
    const qc = new QueryClient();

    const renderer = renderBridge(qc, null);
    await act(async () => {});

    mockUseSession.mockReturnValue({ session: makeSession("userA") });
    await act(async () => {
      renderer.update(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(AuthTokenBridge),
        ),
      );
    });

    expect(mockWatchSignOut).not.toHaveBeenCalled();
  });

  it("clears journal, hospital-bag, birth-plan, and visit-questions caches on sign-out", async () => {
    const qc = new QueryClient();

    const renderer = renderBridge(qc, makeSession("userA"));
    await act(async () => {});

    mockUseSession.mockReturnValue({ session: null });
    await act(async () => {
      renderer.update(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(AuthTokenBridge),
        ),
      );
    });

    expect(mockClearJournal).toHaveBeenCalledTimes(1);
    expect(mockClearHospitalBag).toHaveBeenCalledTimes(1);
    expect(mockClearBirthPlan).toHaveBeenCalledTimes(1);
    expect(mockClearVisitQuestions).toHaveBeenCalledTimes(1);
  });

  it("does NOT clear tool caches on sign-in (only on sign-out)", async () => {
    const qc = new QueryClient();

    const renderer = renderBridge(qc, null);
    await act(async () => {});

    mockUseSession.mockReturnValue({ session: makeSession("userA") });
    await act(async () => {
      renderer.update(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(AuthTokenBridge),
        ),
      );
    });

    expect(mockClearJournal).not.toHaveBeenCalled();
    expect(mockClearHospitalBag).not.toHaveBeenCalled();
    expect(mockClearBirthPlan).not.toHaveBeenCalled();
    expect(mockClearVisitQuestions).not.toHaveBeenCalled();
  });

  it("does not call invalidateQueries or clear when the same session re-renders without changing", async () => {
    const qc = new QueryClient();
    const session = makeSession("userA");
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    const clear = jest.spyOn(qc, "clear");

    const renderer = renderBridge(qc, session);
    await act(async () => {});

    // Re-render with the same session object (e.g. parent re-renders)
    await act(async () => {
      renderer.update(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(AuthTokenBridge),
        ),
      );
    });

    expect(invalidate).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
});

describe("AuthTokenBridge — stale-tenant 401 guard", () => {
  it("calls signOut when a query settles in error state with a 401 while a session is active", async () => {
    const mockSignOut = jest.fn(async () => {});
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderBridge(qc, makeSession("userA"), mockSignOut);
    await act(async () => {});

    // Simulate a query failing with a persistent 401 (e.g. stale tenant token).
    await act(async () => {
      await qc
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
    const mockSignOut = jest.fn(async () => {});
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderBridge(qc, makeSession("userA"), mockSignOut);
    await act(async () => {});

    await act(async () => {
      await qc
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
    const mockSignOut = jest.fn(async () => {});
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    // Session is null from the start — already signed out.
    renderBridge(qc, null, mockSignOut);
    await act(async () => {});

    await act(async () => {
      await qc
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
    const mockSignOut = jest.fn(async () => {});
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderBridge(qc, makeSession("userA"), mockSignOut);
    await act(async () => {});

    // Fire two concurrent 401 errors.
    await act(async () => {
      await Promise.all([
        qc
          .fetchQuery({
            queryKey: ["stale-401-a"],
            queryFn: () => Promise.reject(makeApiError(401)),
            retry: false,
          })
          .catch(() => {}),
        qc
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

  it("resets the signing-out guard after 5 s when signOut() rejects so the next 401 is handled", async () => {
    jest.useFakeTimers();
    // signOut() always rejects (e.g. network offline, Clerk error).
    const mockSignOut = jest.fn().mockRejectedValue(new Error("network error"));
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderBridge(qc, makeSession("userA"), mockSignOut);
    await act(async () => {});

    // First 401 — sets the guard and calls signOut() which rejects.
    await act(async () => {
      await qc
        .fetchQuery({
          queryKey: ["reject-signout-1"],
          queryFn: () => Promise.reject(makeApiError(401)),
          retry: false,
        })
        .catch(() => {});
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);

    // Guard is still set — a second 401 before the timer fires is ignored.
    await act(async () => {
      await qc
        .fetchQuery({
          queryKey: ["reject-signout-2"],
          queryFn: () => Promise.reject(makeApiError(401)),
          retry: false,
        })
        .catch(() => {});
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1); // unchanged

    // Advance past the 5 s reset window.
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    // A fresh 401 after the reset should trigger signOut() again.
    await act(async () => {
      await qc
        .fetchQuery({
          queryKey: ["reject-signout-3"],
          queryFn: () => Promise.reject(makeApiError(401)),
          retry: false,
        })
        .catch(() => {});
    });
    expect(mockSignOut).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });
});
