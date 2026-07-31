/**
 * End-to-end routing guard for SessionWatcher + AccountBar.
 *
 * Confirms that when the stale-tenant 401 guard fires (a Clerk session is
 * active but every API request returns 401), the app transitions to showing
 * the real sign-in controls provided by AccountBar — not a spinner, not an
 * error screen, and not the authenticated controls.
 *
 * AccountBar is the actual UI component rendered inside CalculatorPage.  It
 * uses Clerk's <Show when="signed-in|signed-out"> to conditionally render the
 * "Sign in" / "Get started" buttons (signed-out) vs. the pass badge + Unlock
 * Pass button (signed-in).  The Show mock below is reactive: it calls
 * useSession() so that updating the session mock and re-rendering the tree
 * produces the correct conditional output — exactly as the real Clerk Show
 * does in production.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockedFunction,
} from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { Router } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useClerk, useSession } from "@clerk/react";
import { SessionWatcher } from "@/components/session-watcher";
import { AccountBar } from "@/components/auth/account-bar";
import { ApiError } from "@workspace/api-client-react";

// ─── DOM cleanup ──────────────────────────────────────────────────────────────
afterEach(cleanup);

// ─── @clerk/react — reactive Show mock ───────────────────────────────────────
//
// Show is mocked to call useSession() on each render so it responds to
// session-state changes the same way the real Clerk Show does.  This lets us
// verify AccountBar's actual conditional rendering without a test double.
vi.mock("@clerk/react", () => {
  const useSessionFn = vi.fn();
  const useClerkFn = vi.fn();

  function Show({
    when,
    children,
  }: {
    when: string;
    children: React.ReactNode;
  }) {
    const { session } = (useSessionFn as () => { session: unknown })();
    const isSignedIn = session != null;
    if (when === "signed-in" && isSignedIn) return <>{children}</>;
    if (when === "signed-out" && !isSignedIn) return <>{children}</>;
    return null;
  }

  return {
    useSession: useSessionFn,
    useClerk: useClerkFn,
    Show,
    UserButton: () => <span data-testid="user-button" />,
    ClerkLoaded: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
  };
});

// ─── @workspace/api-client-react — ApiError ──────────────────────────────────
vi.mock("@workspace/api-client-react", () => {
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

// ─── usePass — AccountBar dependency ─────────────────────────────────────────
vi.mock("@/hooks/use-pass", () => ({
  usePass: vi.fn(() => ({
    hasPass: false,
    freeRemaining: 3,
    freeLimit: 5,
    startCheckout: vi.fn(),
    isStartingCheckout: false,
  })),
}));

// ─── RedeemCodeDialog — AccountBar dependency (Radix portal crashes in jsdom) ─
vi.mock("@/components/auth/redeem-code-dialog", () => ({
  RedeemCodeDialog: () => null,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockUseSession = useSession as MockedFunction<typeof useSession>;
const mockUseClerk = useClerk as MockedFunction<typeof useClerk>;

type UseSessionReturn = ReturnType<typeof useSession>;
type UseClerkReturn = ReturnType<typeof useClerk>;

function signedInState(id = "sess_test"): UseSessionReturn {
  return {
    isLoaded: true,
    isSignedIn: true,
    session: { id, status: "active" } as UseSessionReturn["session"] & {},
  } as UseSessionReturn;
}

function signedOutState(): UseSessionReturn {
  return {
    isLoaded: true,
    isSignedIn: false,
    session: null,
  } as UseSessionReturn;
}

const MockApiErrorCtor = ApiError as unknown as new (
  status: number,
  msg?: string,
) => ApiError;
function makeApiError(status: number): ApiError {
  return new MockApiErrorCtor(status);
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SessionWatcher + AccountBar — routing after stale-tenant sign-out", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = makeQueryClient();
    vi.clearAllMocks();
  });

  it("shows the AccountBar sign-in controls (not authenticated UI) after a stale-tenant 401 triggers signOut", async () => {
    // signOut() transitions the session to null, simulating Clerk clearing its
    // token cache and returning null from useSession on the next render cycle.
    const mockSignOut = vi.fn(async () => {
      mockUseSession.mockReturnValue(signedOutState());
    });
    mockUseClerk.mockReturnValue({
      signOut: mockSignOut,
    } as unknown as UseClerkReturn);
    mockUseSession.mockReturnValue(signedInState());

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <Router>
          <SessionWatcher />
          <AccountBar />
        </Router>
      </QueryClientProvider>,
    );

    // Initially signed in: authenticated controls visible, sign-in buttons absent.
    expect(screen.queryByTestId("button-sign-in")).toBeNull();
    expect(screen.queryByTestId("button-sign-up")).toBeNull();
    expect(screen.getByTestId("button-unlock-pass")).toBeDefined();

    // Trigger a persistent 401 — the stale-tenant guard detects it and calls
    // signOut() because Clerk still reports an active session.
    await act(async () => {
      await queryClient
        .fetchQuery({
          queryKey: ["routing-stale-tenant-401"],
          queryFn: () => Promise.reject(makeApiError(401)),
          retry: false,
        })
        .catch(() => {});
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);

    // Re-render after Clerk propagates the signed-out state.
    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <Router>
            <SessionWatcher />
            <AccountBar />
          </Router>
        </QueryClientProvider>,
      );
    });

    // Sign-in controls must be visible — the user can navigate to the sign-in
    // page.  No spinner or error screen is present.
    expect(screen.getByTestId("button-sign-in")).toBeDefined();
    expect(screen.getByTestId("button-sign-up")).toBeDefined();

    // Authenticated controls must be gone.
    expect(screen.queryByTestId("button-unlock-pass")).toBeNull();
    expect(screen.queryByTestId("badge-pass-active")).toBeNull();
    expect(screen.queryByTestId("user-button")).toBeNull();
  });

  it("does NOT show sign-in controls when the session stays active (non-401 error)", async () => {
    mockUseSession.mockReturnValue(signedInState());
    const mockSignOut = vi.fn(async () => {});
    mockUseClerk.mockReturnValue({
      signOut: mockSignOut,
    } as unknown as UseClerkReturn);

    render(
      <QueryClientProvider client={queryClient}>
        <Router>
          <SessionWatcher />
          <AccountBar />
        </Router>
      </QueryClientProvider>,
    );

    // A 500 must NOT trigger signOut — authenticated controls remain.
    await act(async () => {
      await queryClient
        .fetchQuery({
          queryKey: ["non-401-error"],
          queryFn: () => Promise.reject(makeApiError(500)),
          retry: false,
        })
        .catch(() => {});
    });

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(screen.queryByTestId("button-sign-in")).toBeNull();
    expect(screen.getByTestId("button-unlock-pass")).toBeDefined();
  });

  it("query cache is empty when the sign-in controls appear — no stale authenticated data can flash", async () => {
    const passStatusKey = ["get-pass-status"];

    // Pre-seed the cache with authenticated data (loaded while the user still
    // had a valid session).
    await queryClient.fetchQuery({
      queryKey: passStatusKey,
      queryFn: () => Promise.resolve({ hasPass: true }),
    });
    expect(queryClient.getQueryData(passStatusKey)).toEqual({ hasPass: true });

    mockUseSession.mockReturnValue(signedInState());
    const mockSignOut = vi.fn(async () => {
      mockUseSession.mockReturnValue(signedOutState());
    });
    mockUseClerk.mockReturnValue({
      signOut: mockSignOut,
    } as unknown as UseClerkReturn);

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <Router>
          <SessionWatcher />
          <AccountBar />
        </Router>
      </QueryClientProvider>,
    );

    // Trigger the stale-tenant 401.
    await act(async () => {
      await queryClient
        .fetchQuery({
          queryKey: ["cache-clear-on-sign-out"],
          queryFn: () => Promise.reject(makeApiError(401)),
          retry: false,
        })
        .catch(() => {});
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);

    // Re-render with the updated (signed-out) session state.
    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <Router>
            <SessionWatcher />
            <AccountBar />
          </Router>
        </QueryClientProvider>,
      );
    });

    // Sign-in controls must be visible.
    expect(screen.getByTestId("button-sign-in")).toBeDefined();

    // The entire cache must be cleared — the next user will never see stale
    // authenticated data from the previous session.
    expect(queryClient.getQueryData(passStatusKey)).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
