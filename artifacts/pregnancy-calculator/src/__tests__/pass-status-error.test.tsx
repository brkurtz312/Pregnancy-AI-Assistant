/**
 * PassProvider error-resilience tests.
 *
 * Confirms that when /api/billing/pass-status returns a 5xx error during a
 * background refetch, the UI stays in a usable, non-broken state:
 *  - The provider renders children without crashing.
 *  - A user who had hasPass=true does NOT have it incorrectly revoked by the error
 *    (React Query keeps the last successful data when a refetch fails).
 *  - A user with no cached data sees hasPass=false (safe neutral), not a crash or
 *    an incorrect pass grant.
 *  - isLoading does not get stuck as true when the query errors.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import * as ApiClientReact from "@workspace/api-client-react";
import { PassProvider, usePass } from "@/hooks/use-pass";

vi.mock("@clerk/react", () => ({
  useAuth: vi.fn(() => ({ isSignedIn: true })),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetPassStatus: vi.fn(),
  useCreateCheckout: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useConfirmCheckout: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useRedeemCode: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  getGetPassStatusQueryKey: vi.fn(() => ["get-pass-status"]),
}));

function makePassStatusQuery(
  overrides: Partial<{
    data: { hasPass: boolean; freeUsed: number; freeLimit: number } | undefined;
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
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
  };
}

function PassStatusReader() {
  const { hasPass, isLoading } = usePass();
  return (
    <div>
      <span data-testid="has-pass">{hasPass ? "true" : "false"}</span>
      <span data-testid="is-loading">{isLoading ? "true" : "false"}</span>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PassProvider — pass-status endpoint error resilience", () => {
  it("renders children without crashing when pass-status immediately errors (no prior cache)", () => {
    vi.mocked(ApiClientReact.useGetPassStatus).mockReturnValue(
      makePassStatusQuery({
        data: undefined,
        isError: true,
        error: new Error("500 Internal Server Error"),
      }) as ReturnType<typeof ApiClientReact.useGetPassStatus>,
    );

    render(
      <PassProvider>
        <PassStatusReader />
      </PassProvider>,
    );

    expect(screen.getByTestId("has-pass").textContent).toBe("false");
    expect(screen.getByTestId("is-loading").textContent).toBe("false");
  });

  it("retains hasPass=true when a background refetch returns 500 (no incorrect revocation)", () => {
    // React Query keeps `data` from the last successful fetch even when a
    // subsequent background refetch fails. We simulate that state here:
    // `data` holds the stale-but-valid cached value, while `isError` signals
    // that the latest network attempt failed.
    vi.mocked(ApiClientReact.useGetPassStatus).mockReturnValue(
      makePassStatusQuery({
        data: { hasPass: true, freeUsed: 1, freeLimit: 5 },
        isError: true,
        error: new Error("500 Internal Server Error"),
      }) as ReturnType<typeof ApiClientReact.useGetPassStatus>,
    );

    render(
      <PassProvider>
        <PassStatusReader />
      </PassProvider>,
    );

    // The pass badge must NOT be revoked by the network error — the user keeps
    // whatever the last successful response granted them.
    expect(screen.getByTestId("has-pass").textContent).toBe("true");
  });

  it("does not incorrectly grant hasPass=true when no cache exists and the request errors", () => {
    vi.mocked(ApiClientReact.useGetPassStatus).mockReturnValue(
      makePassStatusQuery({
        data: undefined,
        isError: true,
        error: new Error("503 Service Unavailable"),
      }) as ReturnType<typeof ApiClientReact.useGetPassStatus>,
    );

    render(
      <PassProvider>
        <PassStatusReader />
      </PassProvider>,
    );

    // A server error must never grant the pass — falling back to the safe
    // free-tier default is the correct behaviour.
    expect(screen.getByTestId("has-pass").textContent).toBe("false");
  });

  it("isLoading stays false when the query errors — no infinite spinner", () => {
    vi.mocked(ApiClientReact.useGetPassStatus).mockReturnValue(
      makePassStatusQuery({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error("500"),
      }) as ReturnType<typeof ApiClientReact.useGetPassStatus>,
    );

    render(
      <PassProvider>
        <PassStatusReader />
      </PassProvider>,
    );

    expect(screen.getByTestId("is-loading").textContent).toBe("false");
  });

  it("freeLimit and freeUsed fall back to safe defaults when the query errors with no cache", () => {
    vi.mocked(ApiClientReact.useGetPassStatus).mockReturnValue(
      makePassStatusQuery({
        data: undefined,
        isError: true,
        error: new Error("500"),
      }) as ReturnType<typeof ApiClientReact.useGetPassStatus>,
    );

    function FreeQuotaReader() {
      const { freeLimit, freeUsed, freeRemaining } = usePass();
      return (
        <div>
          <span data-testid="free-limit">{freeLimit}</span>
          <span data-testid="free-used">{freeUsed}</span>
          <span data-testid="free-remaining">{freeRemaining}</span>
        </div>
      );
    }

    render(
      <PassProvider>
        <FreeQuotaReader />
      </PassProvider>,
    );

    // Default quota values — user is not locked out of the free tier by the error.
    expect(screen.getByTestId("free-limit").textContent).toBe("5");
    expect(screen.getByTestId("free-used").textContent).toBe("0");
    expect(screen.getByTestId("free-remaining").textContent).toBe("5");
  });

  it("retains stale freeUsed/freeLimit values when a background refetch returns 500", () => {
    vi.mocked(ApiClientReact.useGetPassStatus).mockReturnValue(
      makePassStatusQuery({
        data: { hasPass: true, freeUsed: 3, freeLimit: 5 },
        isError: true,
        error: new Error("500"),
      }) as ReturnType<typeof ApiClientReact.useGetPassStatus>,
    );

    function FreeQuotaReader() {
      const { freeUsed, freeLimit, freeRemaining } = usePass();
      return (
        <div>
          <span data-testid="free-used">{freeUsed}</span>
          <span data-testid="free-limit">{freeLimit}</span>
          <span data-testid="free-remaining">{freeRemaining}</span>
        </div>
      );
    }

    render(
      <PassProvider>
        <FreeQuotaReader />
      </PassProvider>,
    );

    expect(screen.getByTestId("free-used").textContent).toBe("3");
    expect(screen.getByTestId("free-limit").textContent).toBe("5");
    expect(screen.getByTestId("free-remaining").textContent).toBe("2");
  });
});
