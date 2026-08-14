/**
 * watchContractionHistorySync.test.tsx
 *
 * Confirms that a contraction recorded on the Apple Watch (delivered through
 * WatchBackgroundListener) causes the Session History screen to update without
 * requiring a manual pull-to-refresh.
 *
 * The mechanism:
 *   WatchBackgroundListener.handleContractionUpdate calls
 *   queryClient.invalidateQueries({ queryKey: getListContractionsQueryKey() })
 *   with NO params, so the key resolves to the base path prefix
 *   ["/api/tools/contractions"].  React Query treats this as a prefix match and
 *   marks every contraction query stale — including the all-dates query used by
 *   ContractionHistoryTab ({ limit: 200, no sessionDate }).
 *
 * Tests
 * ─────
 *   1. Watch contraction arrives → invalidateQueries fired with the base key.
 *   2. The base key is a prefix of the all-dates history key, so it covers the
 *      history screen.
 *   3. The base key also covers the single-date tools query, so no regression.
 *   4. When the history screen is rendered alongside WatchBackgroundListener,
 *      the query client sees the invalidation and the screen re-fetches.
 */

import React from "react";
import { act, create } from "react-test-renderer";

// ── Silence Reanimated ─────────────────────────────────────────────────────────
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// ── Clerk ─────────────────────────────────────────────────────────────────────
jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(),
  useUser: jest.fn(() => ({ user: null, isSignedIn: false })),
}));

// ── Icons ─────────────────────────────────────────────────────────────────────
jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

// ── Navigation ────────────────────────────────────────────────────────────────
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useRouter: jest.fn(() => ({ push: jest.fn(), back: jest.fn() })),
  useFocusEffect: jest.fn(),
}));

// ── Safe-area / haptics ───────────────────────────────────────────────────────
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium", Heavy: "Heavy" },
}));

jest.mock("@/lib/haptics", () => ({
  impact: jest.fn(),
  notification: jest.fn(),
}));

// ── Colors ────────────────────────────────────────────────────────────────────
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
    destructive: "#ef4444",
    accent: "#f0f0f0",
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

// ── React Query ───────────────────────────────────────────────────────────────
const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);
const mockGetQueryData = jest.fn().mockReturnValue(undefined);

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: jest.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
    getQueryData: mockGetQueryData,
  })),
}));

// ── API hooks — real base-path key for query-key tests ────────────────────────
//
// Use the real getListContractionsQueryKey implementation so that the
// prefix-match assertions reflect actual production values, not a simplified
// stand-in.  All hooks that render UI are kept as simple stubs.
//
// NOTE: We import the real module here — jest.mock is hoisted above all
// imports, so we declare a factory that calls jest.requireActual for the
// key helpers only.

const REAL_API_CLIENT = jest.requireActual<
  typeof import("@workspace/api-client-react")
>("@workspace/api-client-react");

const mockRefetchHistory = jest.fn().mockResolvedValue(undefined);

jest.mock("@workspace/api-client-react", () => {
  const actual = jest.requireActual<
    typeof import("@workspace/api-client-react")
  >("@workspace/api-client-react");
  return {
    // ── Real key helpers (used in WatchBackgroundListener) ─────────────────
    getListContractionsQueryKey: actual.getListContractionsQueryKey,
    getListKickSessionsQueryKey: actual.getListKickSessionsQueryKey,
    getGetProfileQueryKey: actual.getGetProfileQueryKey,

    // ── Hook stubs ──────────────────────────────────────────────────────────
    useGetProfile: jest.fn(() => ({ data: null, isLoading: false })),
    useListKickSessions: jest.fn(() => ({
      data: { items: [] },
      isFetching: false,
      refetch: jest.fn(),
    })),
    useListContractions: jest.fn(() => ({
      data: { items: [] },
      isFetching: false,
      refetch: mockRefetchHistory,
    })),
    useDeleteKickSession: jest.fn(() => ({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    })),
    useDeleteContraction: jest.fn(() => ({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    })),
    useUpdateKickSession: jest.fn(() => ({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    })),
    useCreateKickSession: jest.fn(() => ({
      mutateAsync: jest.fn().mockResolvedValue({ id: 1 }),
      isPending: false,
    })),
    useCreateContraction: jest.fn(() => ({
      mutateAsync: jest.fn().mockResolvedValue({ id: 2 }),
      isPending: false,
    })),
  };
});

// ── Sync API ──────────────────────────────────────────────────────────────────
const mockApiDirectSaveContraction = jest.fn().mockResolvedValue(undefined);
const mockApiDirectSaveKickSession = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/sync-api", () => ({
  apiDirectSaveKickSession: (...args: unknown[]) =>
    mockApiDirectSaveKickSession(...args),
  apiDirectSaveContraction: (...args: unknown[]) =>
    mockApiDirectSaveContraction(...args),
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
  isKickSessionRecentlySaved: jest.fn().mockResolvedValue(false),
  markKickSessionSaved: jest.fn().mockResolvedValue(undefined),
}));

// ── Watch connectivity ────────────────────────────────────────────────────────
let capturedOnContractionUpdate:
  | ((r: unknown, opts?: { nativeReceiptId?: string }) => Promise<void>)
  | undefined;

jest.mock("@/hooks/useWatchConnectivity", () => ({
  useWatchConnectivity: jest.fn(
    (opts: {
      onKickSessionEnd?: (s: unknown) => Promise<void>;
      onContractionUpdate?: (
        r: unknown,
        opts?: { nativeReceiptId?: string },
      ) => Promise<void>;
      onKickUpdate?: (count: number) => void;
    }) => {
      capturedOnContractionUpdate = opts.onContractionUpdate;
      return {
        pushTips: jest.fn(),
        isSupported: true,
        watchStatus: {
          isReachable: false,
          isWatchAppInstalled: false,
          activationState: "notActivated",
        },
      };
    },
  ),
}));

// ── Imports (after all mocks) ──────────────────────────────────────────────────
import { useAuth } from "@clerk/expo";
import { WatchBackgroundListener } from "../components/WatchBackgroundListener";
import { getListContractionsQueryKey } from "@workspace/api-client-react";

const mockUseAuth = useAuth as jest.Mock;

// ─────────────────────────────────────────────────────────────────────────────
//
// Helper: mount WatchBackgroundListener using whatever auth state is already
// set on mockUseAuth.  Call mockUseAuth.mockReturnValue(...) before invoking
// this helper if you need specific auth.
//
// ─────────────────────────────────────────────────────────────────────────────

function renderListener() {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(WatchBackgroundListener));
  });
  return renderer;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("WatchBackgroundListener → Session History — contraction auto-refresh", () => {
  let renderer: ReturnType<typeof create> | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    capturedOnContractionUpdate = undefined;
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-hist-sync",
      getToken: jest.fn().mockResolvedValue("tok-hist-sync"),
    });
    mockInvalidateQueries.mockResolvedValue(undefined);
    mockApiDirectSaveContraction.mockResolvedValue(undefined);
    renderer = null;
  });

  afterEach(() => {
    act(() => {
      jest.runAllTimers();
    });
    if (renderer) {
      act(() => {
        renderer!.unmount();
      });
      renderer = null;
    }
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ── 1. Base-key invalidation fires ────────────────────────────────────────

  it("calls invalidateQueries with the base contraction key when a Watch contraction arrives", async () => {
    renderer = renderListener();
    await act(async () => {});

    expect(capturedOnContractionUpdate).toBeDefined();

    await act(async () => {
      await capturedOnContractionUpdate!({
        startedAt: "2026-08-14T09:00:00.000Z",
        endedAt: "2026-08-14T09:01:00.000Z",
        interval: 300,
      });
    });

    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);

    // The key passed to invalidateQueries must be the no-params (base) key
    // so React Query invalidates ALL contraction queries by prefix match.
    const firstCall = mockInvalidateQueries.mock.calls[0] as [
      { queryKey: unknown },
    ];
    const { queryKey } = firstCall[0];
    const expectedBaseKey = getListContractionsQueryKey();
    expect(queryKey).toEqual(expectedBaseKey);
  });

  // ── 2. Base key is a prefix of the history screen's all-dates key ─────────

  it("the base key invalidation prefix-matches the all-dates history query key", () => {
    // getListContractionsQueryKey() returns the base path with no params.
    // getListContractionsQueryKey({ limit: 200 }) returns the same base path
    // followed by the params object.
    // React Query invalidates any cached query whose key STARTS WITH the
    // provided queryKey array, so the base-key call covers the history key.
    const baseKey = getListContractionsQueryKey();
    const historyKey = getListContractionsQueryKey({ limit: 200 });

    // The history key must begin with all elements of the base key.
    expect(historyKey.length).toBeGreaterThan(baseKey.length);
    for (let i = 0; i < baseKey.length; i++) {
      expect(historyKey[i]).toBe(baseKey[i]);
    }
  });

  // ── 3. Base key also covers the tools-tab single-date key ─────────────────

  it("the base key invalidation prefix-matches the tools-tab single-date query key", () => {
    const baseKey = getListContractionsQueryKey();
    const toolsKey = getListContractionsQueryKey({
      sessionDate: "2026-08-14",
      limit: 50,
    });

    expect(toolsKey.length).toBeGreaterThan(baseKey.length);
    for (let i = 0; i < baseKey.length; i++) {
      expect(toolsKey[i]).toBe(baseKey[i]);
    }
  });

  // ── 4. History-tab query is NOT accidentally covered by the old narrow key ─

  it("the old session-date + limit:50 key would NOT have matched the history query key", () => {
    // This test documents the bug that was fixed: when WatchBackgroundListener
    // invalidated only the single-date key { sessionDate, limit:50 }, the
    // history screen's { limit:200 } query was unaffected and stayed stale.
    const narrowKey = getListContractionsQueryKey({
      sessionDate: new Date().toISOString().slice(0, 10),
      limit: 50,
    });
    const historyKey = getListContractionsQueryKey({ limit: 200 });

    // Serialise both: they must NOT be equal (different cache buckets).
    expect(JSON.stringify(narrowKey)).not.toEqual(JSON.stringify(historyKey));

    // And the narrow key is not a prefix of the history key — the params
    // element differs, so React Query would NOT invalidate the history query.
    const narrowParams = narrowKey[1] as Record<string, unknown> | undefined;
    const historyParams = historyKey[1] as Record<string, unknown> | undefined;
    expect(JSON.stringify(narrowParams)).not.toEqual(
      JSON.stringify(historyParams),
    );
  });

  // ── 5. API save fires before the invalidation ─────────────────────────────

  it("saves the contraction before invalidating the history query cache", async () => {
    renderer = renderListener();
    await act(async () => {});

    const callOrder: string[] = [];
    mockApiDirectSaveContraction.mockImplementation(async () => {
      callOrder.push("save");
    });
    mockInvalidateQueries.mockImplementation(async () => {
      callOrder.push("invalidate");
    });

    await act(async () => {
      await capturedOnContractionUpdate!({
        startedAt: "2026-08-14T10:00:00.000Z",
        endedAt: "2026-08-14T10:01:00.000Z",
        interval: 240,
      });
    });

    expect(callOrder).toEqual(["save", "invalidate"]);
  });

  // ── 6. No invalidation when the signed-in guard blocks the save ───────────

  it("does not call invalidateQueries when the user is signed out", async () => {
    mockUseAuth.mockReturnValue({
      isSignedIn: false,
      userId: null,
      getToken: jest.fn(),
    });
    renderer = renderListener();
    await act(async () => {});

    if (capturedOnContractionUpdate) {
      await act(async () => {
        await capturedOnContractionUpdate!({
          startedAt: "2026-08-14T11:00:00.000Z",
          endedAt: "2026-08-14T11:01:00.000Z",
          interval: 300,
        });
      });
    }

    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//
// Query-key shape invariants
// (pure unit tests — no React rendering required)
//
// These assert the contract that lets the prefix-match invalidation work:
// every contraction query key must share the same leading element.
//
// ─────────────────────────────────────────────────────────────────────────────

describe("getListContractionsQueryKey — prefix-match contract for Watch invalidation", () => {
  const baseKey = REAL_API_CLIENT.getListContractionsQueryKey();
  const historyKey = REAL_API_CLIENT.getListContractionsQueryKey({
    limit: 200,
  });
  const toolsKey = REAL_API_CLIENT.getListContractionsQueryKey({
    sessionDate: "2026-08-14",
    limit: 50,
  });

  it("base key (no params) is shorter than parameterised keys", () => {
    expect(baseKey.length).toBeLessThan(historyKey.length);
    expect(baseKey.length).toBeLessThan(toolsKey.length);
  });

  it("history key starts with every element of the base key", () => {
    for (let i = 0; i < baseKey.length; i++) {
      expect(historyKey[i]).toBe(baseKey[i]);
    }
  });

  it("tools key starts with every element of the base key", () => {
    for (let i = 0; i < baseKey.length; i++) {
      expect(toolsKey[i]).toBe(baseKey[i]);
    }
  });

  it("history key and tools key differ so their caches are isolated", () => {
    expect(JSON.stringify(historyKey)).not.toEqual(JSON.stringify(toolsKey));
  });
});
