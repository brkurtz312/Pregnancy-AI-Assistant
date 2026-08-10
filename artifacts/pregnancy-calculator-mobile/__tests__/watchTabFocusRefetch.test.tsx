/**
 * watchTabFocusRefetch.test.tsx
 *
 * Confirms that KickCounterSection and ContractionTimerSection do NOT block
 * React Query's automatic refetch after a Watch save marks the cache stale.
 *
 * Two scenarios are verified for each section:
 *
 *   A) Remount-after-invalidation — the user was on another tab while the
 *      Watch fired; on returning (component remounts), a fresh fetch must fire
 *      because the cache is stale.  A staleTime: Infinity setting would break
 *      this silently — this test catches that regression.
 *
 *   B) Focus-triggered refetch — the component stays mounted in the background;
 *      after the Watch marks the cache stale (refetchType:"none"), returning
 *      focus to the app must trigger a refetch via React Query's built-in
 *      refetchOnWindowFocus mechanic.  Disabling refetchOnWindowFocus would
 *      break this — this test catches that regression.
 *
 * Unlike watchKickSync.test.tsx, this suite does NOT mock @tanstack/react-query.
 * It uses real QueryClient + focusManager so that React Query's stale/focus
 * machinery is exercised end-to-end rather than through our own test doubles.
 */

import React from "react";
import { act, create } from "react-test-renderer";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";

// ── Silence Reanimated ────────────────────────────────────────────────────────
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// ── Clerk ─────────────────────────────────────────────────────────────────────
jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(() => ({
    isSignedIn: true,
    userId: "user-focus-test",
    getToken: jest.fn().mockResolvedValue("token-focus"),
  })),
  useUser: jest.fn(() => ({ user: null, isSignedIn: false })),
}));

// ── Icons ─────────────────────────────────────────────────────────────────────
jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

// ── Navigation ────────────────────────────────────────────────────────────────
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useRouter: jest.fn(() => ({ push: jest.fn(), back: jest.fn() })),
}));

// ── Safe-area / haptics ───────────────────────────────────────────────────────
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium", Heavy: "Heavy" },
  NotificationFeedbackType: { Success: "Success" },
}));

jest.mock("@/lib/haptics", () => ({
  impact: jest.fn(),
  notification: jest.fn(),
}));

// ── Design ────────────────────────────────────────────────────────────────────
jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#fff",
    card: "#f9f9f9",
    border: "#eee",
    primary: "#ff69b4",
    primaryForeground: "#fff",
    foreground: "#000",
    mutedForeground: "#666",
    muted: "#f5f5f5",
  }),
}));

jest.mock("@/components/ResponsiveContainer", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
    children,
}));

// ── Domain utilities ──────────────────────────────────────────────────────────
jest.mock("@/lib/pregnancy-math", () => ({
  calculateByDueDate: jest.fn(() => ({ gestationalWeek: 20 })),
}));

jest.mock("@/lib/watch-tips", () => ({
  getWeeklyTips: jest.fn(() => []),
}));

// ── Sync API ──────────────────────────────────────────────────────────────────
jest.mock("@/lib/sync-api", () => ({
  apiDirectSaveKickSession: jest.fn().mockResolvedValue(undefined),
  apiDirectSaveContraction: jest.fn().mockResolvedValue(undefined),
  apiSaveWatchKickSession: jest.fn().mockResolvedValue(undefined),
  apiSaveWatchContraction: jest.fn().mockResolvedValue(undefined),
  apiUpsertJournalEntry: jest.fn().mockResolvedValue({ id: "srv-1" }),
  apiSaveHospitalBag: jest.fn().mockResolvedValue(undefined),
  apiSaveBirthPlanAnswers: jest.fn().mockResolvedValue(undefined),
  isServerUuid: jest.fn().mockReturnValue(true),
}));

// ── Sync queue ────────────────────────────────────────────────────────────────
jest.mock("@/lib/sync-queue", () => ({
  enqueueWatchKickSession: jest.fn().mockResolvedValue(undefined),
  enqueueWatchContraction: jest.fn().mockResolvedValue(undefined),
  getWatchQueueGeneration: jest.fn().mockReturnValue(0),
  markPendingSync: jest.fn().mockResolvedValue(undefined),
  clearPendingSync: jest.fn().mockResolvedValue(undefined),
  hasPendingSync: jest.fn().mockResolvedValue(false),
  tryAcquireSyncLock: jest.fn().mockReturnValue(true),
  releaseSyncLock: jest.fn(),
  readWatchKickSessions: jest.fn().mockResolvedValue([]),
  removeWatchKickSessionById: jest.fn().mockResolvedValue(undefined),
  readWatchContractions: jest.fn().mockResolvedValue([]),
  removeWatchContractionById: jest.fn().mockResolvedValue(undefined),
  invalidateWatchQueueSession: jest.fn().mockResolvedValue(undefined),
}));

// ── Watch connectivity ────────────────────────────────────────────────────────
jest.mock("@/hooks/useWatchConnectivity", () => ({
  useWatchConnectivity: jest.fn(() => ({
    pushTips: jest.fn(),
    isSupported: false,
    watchStatus: {
      isReachable: false,
      isWatchAppInstalled: false,
      activationState: "notActivated",
    },
  })),
}));

// ── API client — real useQuery with spy queryFns ──────────────────────────────
//
// The spy queryFns are created inside the factory so they are stable across
// the lifetime of the module registry.  They are exposed via __spies so tests
// can assert on call counts without needing to reach into the closure.
//
// Mutation hooks and other list hooks are returned as simple stubs because only
// the list queries are relevant to the focus-refetch behaviour being tested.
jest.mock("@workspace/api-client-react", () => {
  const { useQuery } = jest.requireActual<
    typeof import("@tanstack/react-query")
  >("@tanstack/react-query");

  const kickQueryFn = jest.fn().mockResolvedValue({ items: [] as unknown[] });
  const contractionQueryFn = jest
    .fn()
    .mockResolvedValue({ items: [] as unknown[] });

  return {
    // ── List hooks backed by real useQuery ──────────────────────────────────
    useListKickSessions: (params: unknown) =>
      useQuery({
        queryKey: ["kick-sessions", params],
        queryFn: kickQueryFn,
      }),

    useListContractions: (params: unknown) =>
      useQuery({
        queryKey: ["contractions", params],
        queryFn: contractionQueryFn,
      }),

    // ── Mutation stubs ──────────────────────────────────────────────────────
    useCreateKickSession: jest.fn(() => ({
      mutateAsync: jest.fn().mockResolvedValue({ id: 1 }),
      isPending: false,
    })),
    useUpdateKickSession: jest.fn(() => ({
      mutateAsync: jest.fn().mockResolvedValue({ id: 1 }),
      isPending: false,
    })),
    useDeleteKickSession: jest.fn(() => ({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    })),
    useCreateContraction: jest.fn(() => ({
      mutateAsync: jest.fn().mockResolvedValue({ id: 1 }),
      isPending: false,
    })),
    useDeleteContraction: jest.fn(() => ({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    })),

    // ── Other hooks used by tools.tsx but not under test ───────────────────
    useListSymptoms: jest.fn(() => ({
      data: { items: [] },
      isLoading: false,
      refetch: jest.fn(),
    })),
    useCreateSymptom: jest.fn(() => ({
      mutateAsync: jest.fn().mockResolvedValue({ id: 1 }),
      isPending: false,
    })),
    useDeleteSymptom: jest.fn(() => ({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    })),
    useGetProfile: jest.fn(() => ({ data: null, isLoading: false })),

    // ── Query key helpers ───────────────────────────────────────────────────
    getGetProfileQueryKey: jest.fn(() => ["profile"]),
    getListKickSessionsQueryKey: jest.fn((p: unknown) => ["kick-sessions", p]),
    getListContractionsQueryKey: jest.fn((p: unknown) => ["contractions", p]),

    // ── Exposed spies so tests can assert on call counts ───────────────────
    __kickQueryFn: kickQueryFn,
    __contractionQueryFn: contractionQueryFn,
  };
});

// ── Subject imports (after all mocks) ────────────────────────────────────────
import {
  KickCounterSection,
  ContractionTimerSection,
} from "../app/(tabs)/tools";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Drain the microtask queue so React Query can settle async work. */
async function flushMicrotasks() {
  for (let i = 0; i < 50; i++) {
    await Promise.resolve();
  }
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Avoid retries so test errors surface immediately.
        retry: false,
        // Keep React Query defaults: staleTime=0, refetchOnWindowFocus=true.
      },
    },
  });
}

function wrap(
  queryClient: QueryClient,
  element: React.ReactElement,
): React.ReactElement {
  return React.createElement(
    QueryClientProvider,
    { client: queryClient },
    element,
  );
}

// ── Kick spy accessor ─────────────────────────────────────────────────────────

function getKickSpy(): jest.Mock {
  return (
    require("@workspace/api-client-react") as { __kickQueryFn: jest.Mock }
  ).__kickQueryFn;
}

function getContractionSpy(): jest.Mock {
  return (
    require("@workspace/api-client-react") as {
      __contractionQueryFn: jest.Mock;
    }
  ).__contractionQueryFn;
}

// ─────────────────────────────────────────────────────────────────────────────
//
// Scenario A — remount-after-invalidation
//
// Simulates the user being on another tab when the Watch saves a record.
// The component is unmounted (no active observers) so the cache stays stale.
// When the user returns to the Tools tab, the component remounts and must
// issue a fresh fetch because staleTime is 0 (the default).
//
// A regression to staleTime: Infinity would cause the component to silently
// serve the stale cached data without fetching — this test catches that.
//
// ─────────────────────────────────────────────────────────────────────────────

describe("KickCounterSection — remount-after-Watch-invalidation triggers a fresh fetch", () => {
  const FIXED_NOW = new Date("2026-08-10T10:00:00.000Z");
  let queryClient: QueryClient;
  let renderer: ReturnType<typeof create> | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
    queryClient = makeQueryClient();
    renderer = null;
    getKickSpy().mockClear();
    // Start with focusManager in the focused state (normal default).
    focusManager.setFocused(true);
  });

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer!.unmount();
      });
      renderer = null;
    }
    // Always restore focusManager so other suites start clean.
    focusManager.setFocused(undefined);
    queryClient.clear();
    act(() => {
      jest.runAllTimers();
    });
    jest.useRealTimers();
  });

  it("refetches on remount after Watch save marks the kick-sessions cache stale", async () => {
    const kickSpy = getKickSpy();

    // ── Step 1: Mount the section so an initial fetch populates the cache ──
    await act(async () => {
      renderer = create(
        wrap(queryClient, React.createElement(KickCounterSection)),
      );
      await flushMicrotasks();
    });

    expect(kickSpy).toHaveBeenCalledTimes(1);

    // ── Step 2: Unmount — user navigates away to another tab ───────────────
    act(() => {
      renderer!.unmount();
      renderer = null;
    });

    kickSpy.mockClear();

    // ── Step 3: Watch fires — listener invalidates the query ───────────────
    // We call invalidateQueries with refetchType:'none' because there are no
    // active observers at this point (component is unmounted). The call simply
    // marks the cached data as stale, exactly as it would in production when
    // the Watch saves while the user is on a different tab.
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ["kick-sessions"],
        refetchType: "none",
      });
    });

    // No fetch should have fired — the component is not mounted.
    expect(kickSpy).toHaveBeenCalledTimes(0);

    // ── Step 4: User returns to the Tools tab — component remounts ─────────
    await act(async () => {
      renderer = create(
        wrap(queryClient, React.createElement(KickCounterSection)),
      );
      await flushMicrotasks();
    });

    // The query was marked stale, so remounting must trigger a fresh fetch.
    // If staleTime were Infinity the spy would remain at 0 — this assertion
    // would catch that regression.
    expect(kickSpy).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("ContractionTimerSection — remount-after-Watch-invalidation triggers a fresh fetch", () => {
  const FIXED_NOW = new Date("2026-08-10T10:00:00.000Z");
  let queryClient: QueryClient;
  let renderer: ReturnType<typeof create> | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
    queryClient = makeQueryClient();
    renderer = null;
    getContractionSpy().mockClear();
    focusManager.setFocused(true);
  });

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer!.unmount();
      });
      renderer = null;
    }
    focusManager.setFocused(undefined);
    queryClient.clear();
    act(() => {
      jest.runAllTimers();
    });
    jest.useRealTimers();
  });

  it("refetches on remount after Watch save marks the contractions cache stale", async () => {
    const contractionSpy = getContractionSpy();

    // ── Step 1: Mount → initial fetch ──────────────────────────────────────
    await act(async () => {
      renderer = create(
        wrap(queryClient, React.createElement(ContractionTimerSection)),
      );
      await flushMicrotasks();
    });

    expect(contractionSpy).toHaveBeenCalledTimes(1);

    // ── Step 2: Unmount — user navigates to another tab ────────────────────
    act(() => {
      renderer!.unmount();
      renderer = null;
    });

    contractionSpy.mockClear();

    // ── Step 3: Watch fires — listener invalidates the contraction query ───
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ["contractions"],
        refetchType: "none",
      });
    });

    expect(contractionSpy).toHaveBeenCalledTimes(0);

    // ── Step 4: User returns to Tools tab — component remounts ─────────────
    await act(async () => {
      renderer = create(
        wrap(queryClient, React.createElement(ContractionTimerSection)),
      );
      await flushMicrotasks();
    });

    // Stale cache must trigger a fresh fetch on remount.
    expect(contractionSpy).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//
// Scenario B — focus-triggered refetch while component stays mounted
//
// Simulates the user switching away from the app (or to another tab in a split
// view) while the Watch saves a record.  The component is still mounted but
// focusManager is set to false so React Query defers the invalidation-triggered
// refetch.  When focusManager becomes true again (user returns), the built-in
// refetchOnWindowFocus mechanic must fire a fresh fetch.
//
// Disabling refetchOnWindowFocus or using a custom focusManager override would
// break this — this test catches that regression.
//
// ─────────────────────────────────────────────────────────────────────────────

describe("KickCounterSection — focus-triggered refetch after Watch marks cache stale", () => {
  const FIXED_NOW = new Date("2026-08-10T10:00:00.000Z");
  let queryClient: QueryClient;
  let renderer: ReturnType<typeof create> | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
    // Start focused so the initial mount fetch fires normally.
    focusManager.setFocused(true);
    queryClient = makeQueryClient();
    renderer = null;
    getKickSpy().mockClear();
  });

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer!.unmount();
      });
      renderer = null;
    }
    focusManager.setFocused(undefined);
    queryClient.clear();
    act(() => {
      jest.runAllTimers();
    });
    jest.useRealTimers();
  });

  it("issues a new kick-sessions fetch when focus returns after Watch marks cache stale", async () => {
    const kickSpy = getKickSpy();

    // ── Step 1: Mount the section; wait for initial fetch ──────────────────
    await act(async () => {
      renderer = create(
        wrap(queryClient, React.createElement(KickCounterSection)),
      );
      await flushMicrotasks();
    });

    expect(kickSpy).toHaveBeenCalledTimes(1);
    kickSpy.mockClear();

    // ── Step 2: User puts the app in background (focus lost) ───────────────
    act(() => {
      focusManager.setFocused(false);
    });

    // ── Step 3: Watch fires — mark the query stale without an immediate
    //           refetch (refetchType:"none" matches the "no active observer"
    //           path because the tab is hidden) ─────────────────────────────
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ["kick-sessions"],
        refetchType: "none",
      });
      await flushMicrotasks();
    });

    // Component is mounted but window is unfocused — no fetch yet.
    expect(kickSpy).toHaveBeenCalledTimes(0);

    // ── Step 4: User brings the app back into focus ────────────────────────
    await act(async () => {
      focusManager.setFocused(true);
      await flushMicrotasks();
    });

    // React Query's refetchOnWindowFocus listener should have fired a fresh
    // fetch for the now-stale kick-sessions query.
    // If refetchOnWindowFocus were false the spy would still be 0 — this
    // assertion catches that regression.
    expect(kickSpy).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("ContractionTimerSection — focus-triggered refetch after Watch marks cache stale", () => {
  const FIXED_NOW = new Date("2026-08-10T10:00:00.000Z");
  let queryClient: QueryClient;
  let renderer: ReturnType<typeof create> | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
    focusManager.setFocused(true);
    queryClient = makeQueryClient();
    renderer = null;
    getContractionSpy().mockClear();
  });

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer!.unmount();
      });
      renderer = null;
    }
    focusManager.setFocused(undefined);
    queryClient.clear();
    act(() => {
      jest.runAllTimers();
    });
    jest.useRealTimers();
  });

  it("issues a new contractions fetch when focus returns after Watch marks cache stale", async () => {
    const contractionSpy = getContractionSpy();

    // ── Step 1: Mount → initial fetch ──────────────────────────────────────
    await act(async () => {
      renderer = create(
        wrap(queryClient, React.createElement(ContractionTimerSection)),
      );
      await flushMicrotasks();
    });

    expect(contractionSpy).toHaveBeenCalledTimes(1);
    contractionSpy.mockClear();

    // ── Step 2: App goes to background ────────────────────────────────────
    act(() => {
      focusManager.setFocused(false);
    });

    // ── Step 3: Watch fires — mark contractions stale, no immediate refetch
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ["contractions"],
        refetchType: "none",
      });
      await flushMicrotasks();
    });

    expect(contractionSpy).toHaveBeenCalledTimes(0);

    // ── Step 4: App comes back to foreground ──────────────────────────────
    await act(async () => {
      focusManager.setFocused(true);
      await flushMicrotasks();
    });

    // refetchOnWindowFocus must fire a fresh fetch for the stale query.
    expect(contractionSpy).toHaveBeenCalledTimes(1);
  });
});
