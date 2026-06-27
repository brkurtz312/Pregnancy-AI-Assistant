/**
 * Regression guard for SessionWatcher: proves that the React Query cache is
 * fully cleared the moment a Clerk session transitions from active to null
 * (i.e. the user signs out).
 *
 * Why this matters: without the queryClient.clear() call in SessionWatcher,
 * stale authenticated data — pass status, free-question count, profile — would
 * remain in the cache after sign-out and flash to the next visitor before the
 * invalidation triggered by the subsequent sign-in completed.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSession } from "@clerk/react";
import { SessionWatcher } from "@/components/session-watcher";

vi.mock("@clerk/react", () => ({
  useSession: vi.fn(),
}));

const mockUseSession = useSession as MockedFunction<typeof useSession>;

type UseSessionReturn = ReturnType<typeof useSession>;

function signedInState(): UseSessionReturn {
  return {
    isLoaded: true,
    isSignedIn: true,
    session: {
      id: "sess_test",
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

function renderWatcher(queryClient: QueryClient) {
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
