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
