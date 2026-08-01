/**
 * Consumer-level regression guard: pass-status and AI quota must never flash
 * stale values from a previous user when the active account changes.
 *
 * Why this matters
 * ─────────────────
 * React Query retains cached data in `passQuery.data` even when the query is
 * disabled (`enabled: false`). SessionWatcher calls `queryClient.clear()` in a
 * `useEffect`, which fires AFTER the sign-out render has already committed.
 *
 * That means there is a brief window where:
 *   1. `useAuth()` returns `isSignedIn: false` (session gone).
 *   2. `passQuery.data` still holds User A's stale entitlement in the cache.
 *
 * Without the `signedIn &&` guard added to PassProvider, a consumer rendering
 * `hasPass` during that window would paint User A's paid entitlement (e.g.
 * hasPass: true, freeUsed: 4) on what should be the sign-in screen.
 *
 * Each test below captures *every* render of a PassConsumer component and
 * asserts that no render ever painted a stale paid entitlement or stale quota
 * value while the user was signed out.
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
import * as ClerkReact from "@clerk/react";
import * as ApiClientReact from "@workspace/api-client-react";
import { PassProvider, usePass } from "@/hooks/use-pass";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@clerk/react", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetPassStatus: vi.fn(),
  useCreateCheckout: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useConfirmCheckout: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useRedeemCode: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  getGetPassStatusQueryKey: vi.fn(() => ["get-pass-status"]),
}));

const mockUseAuth = ClerkReact.useAuth as MockedFunction<
  typeof ClerkReact.useAuth
>;
const mockUseGetPassStatus = ApiClientReact.useGetPassStatus as MockedFunction<
  typeof ApiClientReact.useGetPassStatus
>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQuery(
  overrides: Partial<{
    data: { hasPass: boolean; freeUsed: number; freeLimit: number } | undefined;
    isLoading: boolean;
    isError: boolean;
    refetch: () => void;
  }> = {},
) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as ReturnType<typeof ApiClientReact.useGetPassStatus>;
}

// ─── Consumer component that logs every render ────────────────────────────────

/**
 * Renders the pass context values and pushes a snapshot of every render to
 * `renderLog` so tests can assert on intermediate render states (i.e. they can
 * catch a flash even if the final state is correct).
 */
function makeSpy(
  renderLog: Array<{
    isSignedIn: boolean;
    hasPass: boolean;
    freeUsed: number;
    freeLimit: number;
  }>,
) {
  return function PassSpy() {
    const { isSignedIn, hasPass, freeUsed, freeLimit } = usePass();
    // Push synchronously during render (before paint) — this captures the
    // committed value for every render cycle, including transitions.
    renderLog.push({ isSignedIn, hasPass, freeUsed, freeLimit });
    return (
      <div>
        <span data-testid="is-signed-in">{isSignedIn ? "true" : "false"}</span>
        <span data-testid="has-pass">{hasPass ? "true" : "false"}</span>
        <span data-testid="free-used">{String(freeUsed)}</span>
        <span data-testid="free-limit">{String(freeLimit)}</span>
      </div>
    );
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PassProvider — no stale pass-status flash during sign-out transition", () => {
  it("hasPass is false in every render that occurs while the user is signed out, even when the query still holds stale paid data", () => {
    const renderLog: Array<{
      isSignedIn: boolean;
      hasPass: boolean;
      freeUsed: number;
      freeLimit: number;
    }> = [];
    const PassSpy = makeSpy(renderLog);

    // User A is signed in with a paid pass.
    mockUseAuth.mockReturnValue({ isSignedIn: true } as ReturnType<
      typeof ClerkReact.useAuth
    >);
    mockUseGetPassStatus.mockReturnValue(
      makeQuery({ data: { hasPass: true, freeUsed: 4, freeLimit: 5 } }),
    );

    const { rerender } = render(
      <PassProvider>
        <PassSpy />
      </PassProvider>,
    );

    // Confirm User A's paid state is visible while signed in.
    expect(screen.getByTestId("has-pass").textContent).toBe("true");
    expect(screen.getByTestId("free-used").textContent).toBe("4");

    // Simulate the sign-out transition: Clerk session becomes null but
    // React Query's cache has NOT been cleared yet (SessionWatcher's
    // useEffect fires after this render). The query is now disabled but
    // still returns stale data — this is the flash window we guard against.
    act(() => {
      mockUseAuth.mockReturnValue({ isSignedIn: false } as ReturnType<
        typeof ClerkReact.useAuth
      >);
      // Stale data still present — query disabled but cache not yet wiped.
      mockUseGetPassStatus.mockReturnValue(
        makeQuery({ data: { hasPass: true, freeUsed: 4, freeLimit: 5 } }),
      );
      rerender(
        <PassProvider>
          <PassSpy />
        </PassProvider>,
      );
    });

    // At this point the DOM must show the safe signed-out defaults.
    expect(screen.getByTestId("has-pass").textContent).toBe("false");
    expect(screen.getByTestId("free-used").textContent).toBe("0");

    // More importantly: inspect EVERY render that was committed.
    // No render that occurred while isSignedIn was false should have
    // exposed a stale hasPass: true (i.e. User A's paid entitlement).
    const staleFlashRenders = renderLog.filter(
      (r) => !r.isSignedIn && r.hasPass,
    );
    expect(staleFlashRenders).toHaveLength(0);
  });

  it("AI quota (freeUsed/freeLimit) shows safe defaults — not User A's values — in every signed-out render", () => {
    const renderLog: Array<{
      isSignedIn: boolean;
      hasPass: boolean;
      freeUsed: number;
      freeLimit: number;
    }> = [];
    const PassSpy = makeSpy(renderLog);

    // User A used all 5 free questions.
    mockUseAuth.mockReturnValue({ isSignedIn: true } as ReturnType<
      typeof ClerkReact.useAuth
    >);
    mockUseGetPassStatus.mockReturnValue(
      makeQuery({ data: { hasPass: false, freeUsed: 5, freeLimit: 5 } }),
    );

    const { rerender } = render(
      <PassProvider>
        <PassSpy />
      </PassProvider>,
    );

    expect(screen.getByTestId("free-used").textContent).toBe("5");

    // Sign-out: session null, stale quota data still in the query mock.
    act(() => {
      mockUseAuth.mockReturnValue({ isSignedIn: false } as ReturnType<
        typeof ClerkReact.useAuth
      >);
      mockUseGetPassStatus.mockReturnValue(
        makeQuery({ data: { hasPass: false, freeUsed: 5, freeLimit: 5 } }),
      );
      rerender(
        <PassProvider>
          <PassSpy />
        </PassProvider>,
      );
    });

    // The quota must have reset to 0, not show User A's exhausted quota.
    expect(screen.getByTestId("free-used").textContent).toBe("0");

    // Assert across all renders: no signed-out render ever painted
    // User A's freeUsed=5 value.
    const staleQuotaRenders = renderLog.filter(
      (r) => !r.isSignedIn && r.freeUsed !== 0,
    );
    expect(staleQuotaRenders).toHaveLength(0);
  });

  it("full sign-out/sign-in cycle: User B never sees User A's entitlement in any render", () => {
    const renderLog: Array<{
      isSignedIn: boolean;
      hasPass: boolean;
      freeUsed: number;
      freeLimit: number;
    }> = [];
    const PassSpy = makeSpy(renderLog);

    // User A — paid pass, 3 questions used.
    mockUseAuth.mockReturnValue({ isSignedIn: true } as ReturnType<
      typeof ClerkReact.useAuth
    >);
    mockUseGetPassStatus.mockReturnValue(
      makeQuery({ data: { hasPass: true, freeUsed: 3, freeLimit: 5 } }),
    );

    const { rerender } = render(
      <PassProvider>
        <PassSpy />
      </PassProvider>,
    );

    expect(screen.getByTestId("has-pass").textContent).toBe("true");

    // Sign-out with stale data still in the mock (cache not yet cleared).
    act(() => {
      mockUseAuth.mockReturnValue({ isSignedIn: false } as ReturnType<
        typeof ClerkReact.useAuth
      >);
      mockUseGetPassStatus.mockReturnValue(
        makeQuery({ data: { hasPass: true, freeUsed: 3, freeLimit: 5 } }),
      );
      rerender(
        <PassProvider>
          <PassSpy />
        </PassProvider>,
      );
    });

    expect(screen.getByTestId("has-pass").textContent).toBe("false");
    expect(screen.getByTestId("free-used").textContent).toBe("0");

    // User B signs in — fresh free-tier account (cache cleared then fetched).
    act(() => {
      mockUseAuth.mockReturnValue({ isSignedIn: true } as ReturnType<
        typeof ClerkReact.useAuth
      >);
      mockUseGetPassStatus.mockReturnValue(
        makeQuery({ data: { hasPass: false, freeUsed: 0, freeLimit: 5 } }),
      );
      rerender(
        <PassProvider>
          <PassSpy />
        </PassProvider>,
      );
    });

    expect(screen.getByTestId("has-pass").textContent).toBe("false");
    expect(screen.getByTestId("free-used").textContent).toBe("0");

    // Assert across ALL renders: no signed-out render leaked User A's paid
    // entitlement or quota.
    const staleFlashRenders = renderLog.filter(
      (r) => !r.isSignedIn && (r.hasPass || r.freeUsed !== 0),
    );
    expect(staleFlashRenders).toHaveLength(0);

    // And User B's renders must reflect their own data, not User A's.
    const userBRenders = renderLog.filter((r, i) => {
      // User B renders are those after the second rerender where isSignedIn=true.
      // Find the index of the last signed-out render and take what comes after.
      const lastSignedOut = renderLog.reduce(
        (last, r2, idx) => (!r2.isSignedIn ? idx : last),
        -1,
      );
      return r.isSignedIn && i > lastSignedOut;
    });
    for (const r of userBRenders) {
      expect(r.hasPass).toBe(false);
      expect(r.freeUsed).toBe(0);
    }
  });
});
