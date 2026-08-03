/**
 * watchKickSync.test.tsx
 *
 * Verifies that when the Apple Watch fires onKickSessionEnd or
 * onContractionUpdate, the WatchBackgroundListener:
 *   1. Persists the record via the create mutation
 *   2. Invalidates the relevant React Query caches so the Tools tab sees
 *      fresh data next time it mounts (no manual refresh needed)
 *
 * A separate describe block verifies that the Watch create+invalidate and
 * the phone's update+refetch (KickCounterSection.handleEndSession) both
 * complete correctly when fired concurrently.
 */

import React from "react";
import { act, create } from "react-test-renderer";

// ── Silence Reanimated in the test environment ────────────────────────────────
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
}));

// ── Safe-area / haptics ───────────────────────────────────────────────────────
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: "Light",
    Medium: "Medium",
    Heavy: "Heavy",
  },
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

// ── React Query ───────────────────────────────────────────────────────────────
const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);
// Returns undefined by default (empty cache); individual tests override this
// to simulate sessions already saved by the phone.
const mockGetQueryData = jest.fn().mockReturnValue(undefined);

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: jest.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
    getQueryData: mockGetQueryData,
  })),
}));

// ── API hooks ─────────────────────────────────────────────────────────────────
const mockKickMutateAsync = jest.fn().mockResolvedValue({ id: 99 });
const mockContractionMutateAsync = jest.fn().mockResolvedValue({ id: 77 });
const mockUpdateMutateAsync = jest.fn().mockResolvedValue({ id: 42 });
const mockRefetch = jest.fn().mockResolvedValue(undefined);

jest.mock("@workspace/api-client-react", () => ({
  useCreateKickSession: jest.fn(() => ({
    mutateAsync: mockKickMutateAsync,
    isPending: false,
  })),
  useCreateContraction: jest.fn(() => ({
    mutateAsync: mockContractionMutateAsync,
    isPending: false,
  })),
  useUpdateKickSession: jest.fn(() => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  })),
  useDeleteKickSession: jest.fn(() => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
  })),
  useListKickSessions: jest.fn(() => ({
    data: { items: [] },
    isLoading: false,
    refetch: mockRefetch,
  })),
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
  useListContractions: jest.fn(() => ({
    data: { items: [] },
    isLoading: false,
    refetch: jest.fn(),
  })),
  useDeleteContraction: jest.fn(() => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
  })),
  useGetProfile: jest.fn(() => ({
    data: null,
    isLoading: false,
  })),
  getGetProfileQueryKey: jest.fn(() => ["profile"]),
  getListKickSessionsQueryKey: jest.fn((p) => ["kick-sessions", p]),
  getListContractionsQueryKey: jest.fn((p) => ["contractions", p]),
}));

// ── Sync API (direct Watch saves) ─────────────────────────────────────────────
const mockApiDirectSaveKickSession = jest.fn().mockResolvedValue(undefined);
const mockApiDirectSaveContraction = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/sync-api", () => ({
  apiDirectSaveKickSession: (...args: unknown[]) =>
    mockApiDirectSaveKickSession(...args),
  apiDirectSaveContraction: (...args: unknown[]) =>
    mockApiDirectSaveContraction(...args),
  // The queue-flush helpers used by useGlobalBackgroundSync
  apiSaveWatchKickSession: jest.fn().mockResolvedValue(undefined),
  apiSaveWatchContraction: jest.fn().mockResolvedValue(undefined),
  apiUpsertJournalEntry: jest.fn().mockResolvedValue({ id: "srv-1" }),
  apiSaveHospitalBag: jest.fn().mockResolvedValue(undefined),
  apiSaveBirthPlanAnswers: jest.fn().mockResolvedValue(undefined),
  isServerUuid: jest.fn().mockReturnValue(true),
}));

// ── Sync queue ────────────────────────────────────────────────────────────────
const mockEnqueueWatchKickSession = jest.fn().mockResolvedValue(undefined);
const mockEnqueueWatchContraction = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/sync-queue", () => ({
  enqueueWatchKickSession: (...args: unknown[]) =>
    mockEnqueueWatchKickSession(...args),
  enqueueWatchContraction: (...args: unknown[]) =>
    mockEnqueueWatchContraction(...args),
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
// Capture the callbacks so we can fire them manually in tests.
let capturedOnKickSessionEnd: ((s: unknown) => Promise<void>) | undefined;
let capturedOnContractionUpdate: ((r: unknown) => Promise<void>) | undefined;

jest.mock("@/hooks/useWatchConnectivity", () => ({
  useWatchConnectivity: jest.fn(
    (opts: {
      onKickSessionEnd?: (s: unknown) => Promise<void>;
      onContractionUpdate?: (r: unknown) => Promise<void>;
    }) => {
      capturedOnKickSessionEnd = opts.onKickSessionEnd;
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
import { Text } from "react-native";
import { useAuth } from "@clerk/expo";
import { WatchBackgroundListener } from "../components/WatchBackgroundListener";
import {
  KickCounterSection,
  ContractionTimerSection,
} from "../app/(tabs)/tools";

const mockUseAuth = useAuth as jest.Mock;

// ─────────────────────────────────────────────────────────────────────────────

describe("WatchBackgroundListener — Watch → Tools sync (no manual refresh)", () => {
  // Track each WatchBackgroundListener renderer so afterEach can drain its
  // 3-second toast timer (while still mounted) and then unmount cleanly.
  let listenerRenderer: ReturnType<typeof create> | null = null;

  function renderWatchListener() {
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-123",
      getToken: jest.fn().mockResolvedValue("token-user-123"),
    });
    act(() => {
      listenerRenderer = create(React.createElement(WatchBackgroundListener));
    });
    return listenerRenderer!;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    listenerRenderer = null;
    capturedOnKickSessionEnd = undefined;
    capturedOnContractionUpdate = undefined;
    jest.clearAllMocks();
    // Re-apply mock values cleared by clearAllMocks.
    // WatchBackgroundListener now calls apiDirectSave* directly (not via
    // mutation hooks) so only those mocks need to be set up here.
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-123",
      getToken: jest.fn().mockResolvedValue("token-user-123"),
    });
    mockInvalidateQueries.mockResolvedValue(undefined);
    mockApiDirectSaveKickSession.mockResolvedValue(undefined);
    mockApiDirectSaveContraction.mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Drain the WatchToast hide-timer while the tree is still mounted
    act(() => {
      jest.runAllTimers();
    });
    if (listenerRenderer) {
      act(() => {
        listenerRenderer!.unmount();
      });
      listenerRenderer = null;
    }
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ── Kick session ────────────────────────────────────────────────────────────

  it("registers an onKickSessionEnd callback with useWatchConnectivity", async () => {
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnKickSessionEnd).toBeDefined();
    expect(typeof capturedOnKickSessionEnd).toBe("function");
  });

  it("calls apiDirectSaveKickSession when the watch fires onKickSessionEnd", async () => {
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnKickSessionEnd).toBeDefined();

    const session = {
      kickCount: 8,
      startedAt: "2026-08-01T10:00:00.000Z",
      endedAt: "2026-08-01T10:30:00.000Z",
    };

    await act(async () => {
      await capturedOnKickSessionEnd!(session);
    });

    // WatchBackgroundListener uses a frozen-token direct API call — not the
    // mutation hook — so that the request always carries the originating
    // user's token, even if another account signs in mid-flight.
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(1);
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledWith(
      {
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        kickCount: session.kickCount,
      },
      expect.any(Function), // frozen token getter
    );
  });

  it("invalidates kick-session cache after persisting the watch kick session", async () => {
    renderWatchListener();
    await act(async () => {});

    const session = {
      kickCount: 5,
      startedAt: "2026-08-01T11:00:00.000Z",
      endedAt: "2026-08-01T11:20:00.000Z",
    };

    await act(async () => {
      await capturedOnKickSessionEnd!(session);
    });

    // Query cache must be invalidated so Tools tab fetches fresh data
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("invalidates kick-session cache even for a zero-kick watch session", async () => {
    renderWatchListener();
    await act(async () => {});

    await act(async () => {
      await capturedOnKickSessionEnd!({
        kickCount: 0,
        startedAt: "2026-08-01T09:00:00.000Z",
        endedAt: "2026-08-01T09:05:00.000Z",
      });
    });

    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(1);
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
  });

  // ── Contraction update ───────────────────────────────────────────────────────

  it("registers an onContractionUpdate callback with useWatchConnectivity", async () => {
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnContractionUpdate).toBeDefined();
    expect(typeof capturedOnContractionUpdate).toBe("function");
  });

  it("calls apiDirectSaveContraction when the watch fires onContractionUpdate", async () => {
    renderWatchListener();
    await act(async () => {});

    const record = {
      startedAt: "2026-08-01T14:00:00.000Z",
      endedAt: "2026-08-01T14:01:10.000Z", // 70 seconds
      interval: 300,
    };

    await act(async () => {
      await capturedOnContractionUpdate!(record);
    });

    expect(mockApiDirectSaveContraction).toHaveBeenCalledTimes(1);
    const [payload] = mockApiDirectSaveContraction.mock.calls[0];
    expect(payload.startedAt).toBe(record.startedAt);
    expect(payload.endedAt).toBe(record.endedAt);
    expect(payload.durationSeconds).toBe(70);
    expect(payload.intervalSeconds).toBe(300);
  });

  it("invalidates contraction cache after persisting the watch contraction", async () => {
    renderWatchListener();
    await act(async () => {});

    await act(async () => {
      await capturedOnContractionUpdate!({
        startedAt: "2026-08-01T15:00:00.000Z",
        endedAt: "2026-08-01T15:01:00.000Z",
        interval: 240,
      });
    });

    // list must refresh automatically — no manual pull required
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("handles a contraction record without an interval field", async () => {
    renderWatchListener();
    await act(async () => {});

    await act(async () => {
      await capturedOnContractionUpdate!({
        startedAt: "2026-08-01T16:00:00.000Z",
        endedAt: "2026-08-01T16:01:30.000Z",
        // no interval
      });
    });

    expect(mockApiDirectSaveContraction).toHaveBeenCalledTimes(1);
    const [payload] = mockApiDirectSaveContraction.mock.calls[0];
    expect(payload.intervalSeconds).toBeUndefined();
    expect(payload.durationSeconds).toBe(90);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//
// Concurrent Watch + phone race
//
// The Watch path (WatchBackgroundListener.handleKickSessionEnd):
//   createKickSession  →  queryClient.invalidateQueries
//
// The phone path (KickCounterSection.handleEndSession):
//   updateKickSession  →  refetch()
//
// Both can fire at nearly the same time.  The tests below render both
// components and verify that each path completes its own API call and
// list-refresh without suppressing the other.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the first pressable element in the tree whose subtree contains a
 * Text node with the given label.
 */
function findButtonByLabel(
  root: ReturnType<typeof create>["root"],
  label: string,
): ReturnType<typeof create>["root"] {
  const candidates = root.findAll((node) => {
    if (typeof node.props?.onPress !== "function") return false;
    try {
      node.findByProps({ children: label });
      return true;
    } catch {
      return false;
    }
  });
  if (!candidates[0]) throw new Error(`Button "${label}" not found in tree`);
  return candidates[0];
}

describe("Watch + phone concurrent kick session ends", () => {
  // Keep renderers alive for the full test so timers fire into a mounted tree
  let watchRendererRef: ReturnType<typeof create> | null = null;
  let kickRendererRef: ReturnType<typeof create> | null = null;

  beforeEach(() => {
    capturedOnKickSessionEnd = undefined;
    capturedOnContractionUpdate = undefined;
    watchRendererRef = null;
    kickRendererRef = null;
    jest.useFakeTimers();
    jest.clearAllMocks();

    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-123",
      getToken: jest.fn().mockResolvedValue("token-user-123"),
    });
    mockInvalidateQueries.mockResolvedValue(undefined);
    // Watch path: direct API saves
    mockApiDirectSaveKickSession.mockResolvedValue(undefined);
    mockApiDirectSaveContraction.mockResolvedValue(undefined);
    // Phone path: mutation hooks (used by KickCounterSection)
    mockKickMutateAsync.mockResolvedValue({ id: 99 });
    mockUpdateMutateAsync.mockResolvedValue({ id: 42 });
    mockRefetch.mockResolvedValue(undefined);
    mockContractionMutateAsync.mockResolvedValue({ id: 77 });

    const apiMock = require("@workspace/api-client-react");
    apiMock.useCreateKickSession.mockReturnValue({
      mutateAsync: mockKickMutateAsync,
      isPending: false,
    });
    apiMock.useUpdateKickSession.mockReturnValue({
      mutateAsync: mockUpdateMutateAsync,
      isPending: false,
    });
    apiMock.useListKickSessions.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      refetch: mockRefetch,
    });
    apiMock.useDeleteKickSession.mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    });
    apiMock.useCreateContraction.mockReturnValue({
      mutateAsync: mockContractionMutateAsync,
      isPending: false,
    });
  });

  afterEach(() => {
    // Drain pending timers (e.g. the WatchToast 3-second hide timer) while the
    // renderers are still mounted so no state update fires into an unmounted
    // component.
    act(() => {
      jest.runAllTimers();
    });
    if (watchRendererRef) {
      act(() => {
        watchRendererRef!.unmount();
      });
    }
    if (kickRendererRef) {
      act(() => {
        kickRendererRef!.unmount();
      });
    }
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  /**
   * Render both components and advance to a state where a phone session is
   * active (Start Counting has been pressed).  Returns the "End Session"
   * button and both renderer references.
   */
  async function setupBothComponents() {
    // WatchBackgroundListener registers capturedOnKickSessionEnd
    act(() => {
      watchRendererRef = create(React.createElement(WatchBackgroundListener));
    });
    await act(async () => {});
    expect(capturedOnKickSessionEnd).toBeDefined();

    // Render the real phone kick-counter component
    act(() => {
      kickRendererRef = create(React.createElement(KickCounterSection));
    });
    await act(async () => {});

    // Press "Start Counting" to open an active session on the phone side
    const startBtn = findButtonByLabel(kickRendererRef!.root, "Start Counting");
    await act(async () => {
      startBtn.props.onPress();
    });

    // createKickSession was called once for the session start
    expect(mockKickMutateAsync).toHaveBeenCalledTimes(1);

    // "End Session" button is now visible
    const endBtn = findButtonByLabel(kickRendererRef!.root, "End Session");
    return { endBtn };
  }

  it("Watch apiDirectSaveKickSession and phone updateKickSession both complete when fired concurrently", async () => {
    const { endBtn } = await setupBothComponents();

    // Arm a deferred phone-update so the two async paths overlap.
    // The Watch path (getToken + apiDirectSaveKickSession) is independent of
    // the phone path (updateKickSession mutation), so we verify they don't
    // suppress each other rather than requiring identical tick-level interleaving.
    let resolvePhoneUpdate!: (v: unknown) => void;
    mockUpdateMutateAsync.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolvePhoneUpdate = r;
        }),
    );

    const watchSession = {
      kickCount: 7,
      startedAt: "2026-08-01T10:00:00.000Z",
      endedAt: "2026-08-01T10:25:00.000Z",
    };

    // Start both operations.
    // Watch: getToken() resolves asynchronously, then apiDirectSaveKickSession fires.
    const watchDone = capturedOnKickSessionEnd!(watchSession);
    act(() => {
      // onPress kicks off async handleEndSession; the mutation is deferred.
      endBtn.props.onPress();
    });

    // Let the Watch path's getToken() microtask resolve and the Watch save
    // complete before releasing the phone-update promise.
    await act(async () => {
      await watchDone;
    });

    act(() => {
      resolvePhoneUpdate({ id: 42 });
    });
    await act(async () => {});

    // Watch path: frozen-token direct API call persisted the Watch-recorded session.
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledWith(
      {
        startedAt: watchSession.startedAt,
        endedAt: watchSession.endedAt,
        kickCount: watchSession.kickCount,
      },
      expect.any(Function), // frozen token getter
    );

    // Phone path: mutation hook used only for Start Counting (setup) + End Session.
    expect(mockKickMutateAsync).toHaveBeenCalledTimes(1); // only Start Counting
    expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
      id: 99, // the ID returned by the Start Counting create
      data: { kickCount: 0, endedAt: expect.any(String) },
    });
  });

  it("Watch cache invalidation and phone refetch both fire — neither is dropped", async () => {
    const { endBtn } = await setupBothComponents();

    // Clear counts from the Start Counting setup phase
    mockInvalidateQueries.mockClear();
    mockRefetch.mockClear();

    const watchSession = {
      kickCount: 4,
      startedAt: "2026-08-01T11:00:00.000Z",
      endedAt: "2026-08-01T11:20:00.000Z",
    };

    // Fire both operations concurrently
    const watchDone = capturedOnKickSessionEnd!(watchSession);
    act(() => {
      endBtn.props.onPress();
    });

    await act(async () => {
      await watchDone;
    });
    // Let the phone's async handleEndSession microtasks settle
    await act(async () => {});

    // Watch triggered cache invalidation so the list auto-refreshes
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
    // Phone triggered its own refetch — neither refresh suppresses the other
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//
// Save-failure toasts
//
// When mutateAsync rejects (network error, auth expiry, server 5xx) the
// WatchBackgroundListener must show an error toast so the user knows their
// Watch data was not recorded, instead of silently discarding it.
// ─────────────────────────────────────────────────────────────────────────────

describe("WatchBackgroundListener — save-failure error toasts", () => {
  let listenerRenderer: ReturnType<typeof create> | null = null;

  function renderWatchListener(
    getToken: () => Promise<string | null> = jest
      .fn()
      .mockResolvedValue("token-user-123"),
  ) {
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-123",
      getToken,
    });
    act(() => {
      listenerRenderer = create(React.createElement(WatchBackgroundListener));
    });
    return listenerRenderer!;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    listenerRenderer = null;
    capturedOnKickSessionEnd = undefined;
    capturedOnContractionUpdate = undefined;
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-123",
      getToken: jest.fn().mockResolvedValue("token-user-123"),
    });
    mockInvalidateQueries.mockResolvedValue(undefined);
    // Watch direct API saves succeed by default; individual tests override for
    // failure scenarios.
    mockApiDirectSaveKickSession.mockResolvedValue(undefined);
    mockApiDirectSaveContraction.mockResolvedValue(undefined);
    mockEnqueueWatchKickSession.mockResolvedValue(undefined);
    mockEnqueueWatchContraction.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => {
      jest.runAllTimers();
    });
    if (listenerRenderer) {
      act(() => {
        listenerRenderer!.unmount();
      });
      listenerRenderer = null;
    }
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("shows an error toast and enqueues the session locally when the kick-session save fails", async () => {
    mockApiDirectSaveKickSession.mockRejectedValueOnce(
      new Error("Network error"),
    );
    const renderer = renderWatchListener();
    await act(async () => {});

    expect(capturedOnKickSessionEnd).toBeDefined();

    await act(async () => {
      await capturedOnKickSessionEnd!({
        kickCount: 5,
        startedAt: "2026-08-01T10:00:00.000Z",
        endedAt: "2026-08-01T10:20:00.000Z",
      });
    });

    // Cache must NOT be invalidated — save failed
    expect(mockInvalidateQueries).not.toHaveBeenCalled();

    // Data must be queued locally so it can be retried on reconnect.
    // The call must include the userId and the captured session generation so
    // events are scoped to the right account and post-sign-out enqueues are
    // rejected.
    expect(mockEnqueueWatchKickSession).toHaveBeenCalledWith(
      {
        startedAt: "2026-08-01T10:00:00.000Z",
        endedAt: "2026-08-01T10:20:00.000Z",
        kickCount: 5,
      },
      "user-123",
      0, // capturedGen from the mocked getWatchQueueGeneration
    );

    // Error toast must be visible with a "saved locally" message
    const textNodes = renderer.root.findAllByType(Text);
    const renderedTexts = textNodes
      .map((n) => String(n.props.children ?? ""))
      .filter(Boolean);
    expect(
      renderedTexts.some((t) => t.toLowerCase().includes("saved locally")),
    ).toBe(true);
  });

  it("shows an error toast and enqueues the contraction locally when the contraction save fails", async () => {
    mockApiDirectSaveContraction.mockRejectedValueOnce(
      new Error("401 Unauthorized"),
    );
    const renderer = renderWatchListener();
    await act(async () => {});

    expect(capturedOnContractionUpdate).toBeDefined();

    await act(async () => {
      await capturedOnContractionUpdate!({
        startedAt: "2026-08-01T14:00:00.000Z",
        endedAt: "2026-08-01T14:01:00.000Z",
        interval: 300,
      });
    });

    // Cache must NOT be invalidated — save failed
    expect(mockInvalidateQueries).not.toHaveBeenCalled();

    // Data must be queued locally so it can be retried on reconnect.
    // The call must include the userId and the captured session generation.
    expect(mockEnqueueWatchContraction).toHaveBeenCalledWith(
      expect.objectContaining({
        startedAt: "2026-08-01T14:00:00.000Z",
        endedAt: "2026-08-01T14:01:00.000Z",
        intervalSeconds: 300,
      }),
      "user-123",
      0, // capturedGen from the mocked getWatchQueueGeneration
    );

    // Error toast must be visible with a "saved locally" message
    const textNodes = renderer.root.findAllByType(Text);
    const renderedTexts = textNodes
      .map((n) => String(n.props.children ?? ""))
      .filter(Boolean);
    expect(
      renderedTexts.some((t) => t.toLowerCase().includes("saved locally")),
    ).toBe(true);
  });

  it("shows a success toast (not error) when kick-session save succeeds", async () => {
    // Default mock already resolves — no override needed
    const renderer = renderWatchListener();
    await act(async () => {});

    await act(async () => {
      await capturedOnKickSessionEnd!({
        kickCount: 3,
        startedAt: "2026-08-01T09:00:00.000Z",
        endedAt: "2026-08-01T09:10:00.000Z",
      });
    });

    const textNodes = renderer.root.findAllByType(Text);
    const renderedTexts = textNodes
      .map((n) => String(n.props.children ?? ""))
      .filter(Boolean);
    expect(renderedTexts.some((t) => t.includes("Kick session saved"))).toBe(
      true,
    );
    // Success path must still invalidate the cache
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("shows a success toast (not error) when contraction save succeeds", async () => {
    const renderer = renderWatchListener();
    await act(async () => {});

    await act(async () => {
      await capturedOnContractionUpdate!({
        startedAt: "2026-08-01T15:00:00.000Z",
        endedAt: "2026-08-01T15:01:00.000Z",
        interval: 180,
      });
    });

    const textNodes = renderer.root.findAllByType(Text);
    const renderedTexts = textNodes
      .map((n) => String(n.props.children ?? ""))
      .filter(Boolean);
    expect(renderedTexts.some((t) => t.includes("Contraction recorded"))).toBe(
      true,
    );
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
  });

  // ── Account-switch race tests ─────────────────────────────────────────────
  //
  // If sign-out occurs between Watch event receipt and the API request, the
  // generation counter will have advanced (via invalidateWatchQueueSession).
  // WatchBackgroundListener checks the generation after calling getToken(); if
  // it advanced, the handler must bail out immediately — it must NOT call the
  // API, update the cache, or enqueue the data.
  //
  // This tests the "post-token-fetch generation check" path introduced so that
  // the frozen token (captured for user A) is never used after A signs out.

  it("does not save or enqueue a kick session when sign-out occurs before the token is used", async () => {
    const syncQueueMock = require("@/lib/sync-queue");
    // Simulate sign-out bumping the generation while getToken() is resolving.
    syncQueueMock.getWatchQueueGeneration
      .mockReturnValueOnce(0) // captured at callback start
      .mockReturnValueOnce(1); // re-checked after getToken (sign-out bumped it)

    renderWatchListener();
    await act(async () => {});

    await act(async () => {
      await capturedOnKickSessionEnd!({
        kickCount: 3,
        startedAt: "2026-08-01T09:00:00.000Z",
        endedAt: "2026-08-01T09:10:00.000Z",
      });
    });

    // Generation changed before the request was sent → must bail out
    expect(mockApiDirectSaveKickSession).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
    expect(mockEnqueueWatchKickSession).not.toHaveBeenCalled();
  });

  it("does not save or enqueue a contraction when sign-out occurs before the token is used", async () => {
    const syncQueueMock = require("@/lib/sync-queue");
    syncQueueMock.getWatchQueueGeneration
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1);

    renderWatchListener();
    await act(async () => {});

    await act(async () => {
      await capturedOnContractionUpdate!({
        startedAt: "2026-08-01T14:00:00.000Z",
        endedAt: "2026-08-01T14:01:00.000Z",
        interval: 300,
      });
    });

    expect(mockApiDirectSaveContraction).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
    expect(mockEnqueueWatchContraction).not.toHaveBeenCalled();
  });

  it("does not invalidate cache when sign-out occurs after the API request completes", async () => {
    // Generation at start: 0, after-token check: 0 (save proceeds), after-save
    // check: 1 (sign-out happened during the HTTP request).
    const syncQueueMock = require("@/lib/sync-queue");
    syncQueueMock.getWatchQueueGeneration
      .mockReturnValueOnce(0) // capturedGen at callback start
      .mockReturnValueOnce(0) // check after getToken → save proceeds
      .mockReturnValueOnce(1); // check after apiDirectSave → sign-out mid-flight

    renderWatchListener();
    await act(async () => {});

    await act(async () => {
      await capturedOnKickSessionEnd!({
        kickCount: 3,
        startedAt: "2026-08-01T09:00:00.000Z",
        endedAt: "2026-08-01T09:10:00.000Z",
      });
    });

    // API call was made (with the frozen token for user A — correct behaviour)
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(1);
    // Cache invalidation must be skipped — we are now in a different session
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//
// Cold-start durability
//
// After the Watch fires onKickSessionEnd (or onContractionUpdate) the
// mutation persists the row and invalidates the query cache.  When the user
// closes and reopens the app the cache starts empty — the data must come back
// from the server via useListKickSessions / useListContractions.
//
// These tests verify that:
//   1. The saved row is visible after a cold-start (fresh cache mount)
//   2. onKickSessionEnd is NOT re-fired on the fresh mount — the component
//      reads from the query, not from the Watch callback.
// ─────────────────────────────────────────────────────────────────────────────

describe("Cold-start durability — Watch data survives app close and reopen", () => {
  // ── Shared server-state doubles ──────────────────────────────────────────
  //
  // Rather than injecting phase-2 data manually, the mutation mocks write
  // to these arrays and the list-hook mocks read from them.  This creates a
  // real data-flow link: if the create mutation never fires, nothing appears
  // in the list — exactly what the cold-start guarantee requires.
  //
  // kickServerRows / contractionServerRows start empty each test, so a fresh
  // mount with no prior mutation produces an empty list.  Once a mutation
  // writes a row, every subsequent mount of KickCounterSection or
  // ContractionTimerSection will render it (simulating the server returning
  // the persisted record after an app reopen).

  type KickRow = {
    id: number;
    kickCount: number;
    startedAt: string;
    endedAt: string;
  };
  type ContractionRow = {
    id: number;
    startedAt: string;
    endedAt: string;
    durationSeconds?: number;
    intervalSeconds?: number;
    sessionDate?: string;
  };

  let kickServerRows: KickRow[] = [];
  let contractionServerRows: ContractionRow[] = [];
  let nextKickId: number;
  let nextContractionId: number;

  // All renderers are tracked here so afterEach drains timers while mounted,
  // then unmounts cleanly.
  let activeRenderers: ReturnType<typeof create>[] = [];

  function mount(element: React.ReactElement): ReturnType<typeof create> {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(element);
    });
    activeRenderers.push(renderer);
    return renderer;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    kickServerRows = [];
    contractionServerRows = [];
    nextKickId = 100;
    nextContractionId = 200;
    activeRenderers = [];
    capturedOnKickSessionEnd = undefined;
    capturedOnContractionUpdate = undefined;
    jest.clearAllMocks();

    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-123",
      getToken: jest.fn().mockResolvedValue("token-user-123"),
    });
    mockInvalidateQueries.mockResolvedValue(undefined);

    // Watch path: direct API calls write to the server double
    mockApiDirectSaveKickSession.mockImplementation(
      async (session: Omit<KickRow, "id">) => {
        const id = nextKickId++;
        kickServerRows.push({ id, ...session } as KickRow);
      },
    );
    mockApiDirectSaveContraction.mockImplementation(
      async (contraction: Omit<ContractionRow, "id">) => {
        const id = nextContractionId++;
        contractionServerRows.push({ id, ...contraction } as ContractionRow);
      },
    );

    // Phone path: mutation hooks used by KickCounterSection (Start Counting)
    mockKickMutateAsync.mockImplementation(
      async ({ data }: { data: Omit<KickRow, "id"> }) => {
        const id = nextKickId++;
        kickServerRows.push({ id, ...data });
        return { id };
      },
    );
    mockContractionMutateAsync.mockImplementation(
      async ({ data }: { data: Omit<ContractionRow, "id"> }) => {
        const id = nextContractionId++;
        contractionServerRows.push({ id, ...data });
        return { id };
      },
    );

    const apiMock = require("@workspace/api-client-react");
    apiMock.useCreateKickSession.mockReturnValue({
      mutateAsync: mockKickMutateAsync,
      isPending: false,
    });
    apiMock.useCreateContraction.mockReturnValue({
      mutateAsync: mockContractionMutateAsync,
      isPending: false,
    });

    // List hooks read from the server double; a fresh mount after mutation
    // sees the persisted row without any manual injection
    apiMock.useListKickSessions.mockImplementation(() => ({
      data: { items: [...kickServerRows] },
      isLoading: false,
      refetch: mockRefetch,
    }));
    apiMock.useListContractions.mockImplementation(() => ({
      data: { items: [...contractionServerRows] },
      isLoading: false,
      refetch: jest.fn(),
    }));
    apiMock.useDeleteKickSession.mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    });
    apiMock.useDeleteContraction.mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    });
  });

  afterEach(() => {
    // Drain the WatchToast hide-timer while trees are still mounted
    act(() => {
      jest.runAllTimers();
    });
    while (activeRenderers.length) {
      const r = activeRenderers.pop()!;
      act(() => {
        r.unmount();
      });
    }
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("kick session saved by the Watch appears in the list after a cold-start (fresh query cache)", async () => {
    // ── Phase 1: Watch fires onKickSessionEnd, mutation writes to server ──
    const phase1Listener = mount(React.createElement(WatchBackgroundListener));
    await act(async () => {});

    expect(capturedOnKickSessionEnd).toBeDefined();

    const savedSession = {
      kickCount: 6,
      startedAt: "2026-08-01T08:00:00.000Z",
      endedAt: "2026-08-01T08:15:00.000Z",
    };

    await act(async () => {
      await capturedOnKickSessionEnd!(savedSession);
    });

    // Direct API call persisted the row — server double now contains it
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(1);
    expect(kickServerRows).toHaveLength(1);
    expect(kickServerRows[0].kickCount).toBe(6);
    // Cache invalidated so next mount fetches fresh data
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);

    // Simulate app close: unmount phase-1 components
    act(() => {
      phase1Listener.unmount();
    });
    activeRenderers.splice(activeRenderers.indexOf(phase1Listener), 1);
    capturedOnKickSessionEnd = undefined;

    // ── Phase 2: Cold-start — fresh components, list reads from server ────
    // No manual mock override here: useListKickSessions.mockImplementation
    // already reads from kickServerRows, which now contains the saved row.
    // This proves the data flows through the direct-API-save → server → query path.
    const createCallsBefore = mockApiDirectSaveKickSession.mock.calls.length;

    mount(React.createElement(WatchBackgroundListener));
    const coldList = mount(React.createElement(KickCounterSection));
    await act(async () => {});

    // The saved row must appear in the rendered output
    const textNodes = coldList.root.findAllByType(Text);
    const renderedTexts = textNodes
      .map((n) => String(n.props.children ?? ""))
      .filter(Boolean);
    expect(renderedTexts.some((t) => t.includes("6"))).toBe(true);

    // The server double must still have exactly 1 row — no duplicate created
    expect(kickServerRows).toHaveLength(1);
    // The direct API save must not have been called again on fresh mount
    expect(mockApiDirectSaveKickSession.mock.calls.length).toBe(
      createCallsBefore,
    );
  });

  it("contraction saved by the Watch appears in the list after a cold-start (fresh query cache)", async () => {
    // ── Phase 1: Watch fires onContractionUpdate, mutation writes to server
    const phase1Listener = mount(React.createElement(WatchBackgroundListener));
    await act(async () => {});

    expect(capturedOnContractionUpdate).toBeDefined();

    const savedContraction = {
      startedAt: "2026-08-01T12:00:00.000Z",
      endedAt: "2026-08-01T12:01:00.000Z",
      interval: 420,
    };

    await act(async () => {
      await capturedOnContractionUpdate!(savedContraction);
    });

    expect(mockApiDirectSaveContraction).toHaveBeenCalledTimes(1);
    // Server double holds the persisted contraction (duration = 60 s)
    expect(contractionServerRows).toHaveLength(1);
    expect(contractionServerRows[0].durationSeconds).toBe(60);
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);

    // Simulate app close
    act(() => {
      phase1Listener.unmount();
    });
    activeRenderers.splice(activeRenderers.indexOf(phase1Listener), 1);
    capturedOnContractionUpdate = undefined;

    // ── Phase 2: Cold-start — fresh ContractionTimerSection reads from server
    const createCallsBefore = mockApiDirectSaveContraction.mock.calls.length;

    mount(React.createElement(WatchBackgroundListener));
    const coldList = mount(React.createElement(ContractionTimerSection));
    await act(async () => {});

    // The saved contraction row must appear — durationSeconds:60 → "1:00"
    const textNodes = coldList.root.findAllByType(Text);
    const renderedTexts = textNodes
      .map((n) => String(n.props.children ?? ""))
      .filter(Boolean);
    expect(renderedTexts.some((t) => t.includes("1:00"))).toBe(true);

    // No new row must have been written to the server double
    expect(contractionServerRows).toHaveLength(1);
    expect(mockApiDirectSaveContraction.mock.calls.length).toBe(
      createCallsBefore,
    );
  });

  it("does not call onKickSessionEnd a second time when the list re-renders with cached data", async () => {
    // Pre-populate the server double with an existing kick session, as if it
    // was saved in a previous app session.
    kickServerRows.push({
      id: 55,
      kickCount: 3,
      startedAt: "2026-08-01T07:00:00.000Z",
      endedAt: "2026-08-01T07:10:00.000Z",
    });

    // Mount both components — no Watch callback is fired
    mount(React.createElement(WatchBackgroundListener));
    const kickRenderer = mount(React.createElement(KickCounterSection));
    await act(async () => {});

    // The pre-populated row appears in the list without any mutation
    expect(mockKickMutateAsync).not.toHaveBeenCalled();
    expect(kickServerRows).toHaveLength(1);

    // Simulate tab-focus / foreground transitions: renderer.update() forces
    // React to re-run the component function, matching the real runtime path
    act(() => {
      kickRenderer.update(React.createElement(KickCounterSection));
    });
    await act(async () => {});
    act(() => {
      kickRenderer.update(React.createElement(KickCounterSection));
    });
    await act(async () => {});

    // Re-renders must not have triggered the Watch create mutation
    expect(mockKickMutateAsync).not.toHaveBeenCalled();
    // Server double still holds only the one pre-populated row
    expect(kickServerRows).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//
// Query-key alignment
//
// WatchBackgroundListener calls queryClient.invalidateQueries after saving.
// For the Tools tab to automatically see fresh data the key passed to
// invalidateQueries must be identical to the key that KickCounterSection and
// ContractionTimerSection derive when they call their list hooks.
//
// These tests discover the params each Tools section actually passes to its
// list hook by rendering the section and spying on the mock, then assert that
// the listener's invalidateQueries call uses a key derived from those same
// captured params.  If either component changes its hook params the test
// breaks immediately — no duplicated literals to drift out of sync.
//
// ─────────────────────────────────────────────────────────────────────────────

describe("WatchBackgroundListener — invalidateQueries key must match Tools tab hooks", () => {
  // Pin the system clock to noon UTC on a fixed date so todayDate() in both
  // the component and test always returns the same ISO date string regardless
  // of when the suite runs or which timezone the CI host is in.
  const FIXED_NOW = new Date("2026-08-02T12:00:00.000Z");

  let listenerRenderer: ReturnType<typeof create> | null = null;
  let toolsRenderer: ReturnType<typeof create> | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
    listenerRenderer = null;
    toolsRenderer = null;
    capturedOnKickSessionEnd = undefined;
    capturedOnContractionUpdate = undefined;
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-123",
      getToken: jest.fn().mockResolvedValue("token-user-123"),
    });
    mockInvalidateQueries.mockResolvedValue(undefined);
    mockApiDirectSaveKickSession.mockResolvedValue(undefined);
    mockApiDirectSaveContraction.mockResolvedValue(undefined);

    const apiMock = require("@workspace/api-client-react");
    // Restore list-hook mocks cleared by clearAllMocks so Tools sections render
    apiMock.useListKickSessions.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      refetch: jest.fn(),
    });
    apiMock.useListContractions.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      refetch: jest.fn(),
    });
    apiMock.useDeleteKickSession.mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    });
    apiMock.useDeleteContraction.mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
      isPending: false,
    });
    apiMock.useCreateKickSession.mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue({ id: 1 }),
      isPending: false,
    });
    apiMock.useCreateContraction.mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue({ id: 1 }),
      isPending: false,
    });
  });

  afterEach(() => {
    act(() => {
      jest.runAllTimers();
    });
    [listenerRenderer, toolsRenderer].forEach((r) => {
      if (r) {
        act(() => {
          r!.unmount();
        });
      }
    });
    listenerRenderer = null;
    toolsRenderer = null;
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("invalidates the exact key KickCounterSection passes to useListKickSessions", async () => {
    // Step 1 — render KickCounterSection and capture the params it passes to
    // useListKickSessions.  The mock spies on every call so we can extract the
    // argument without duplicating the literal in this test.
    const apiMock = require("@workspace/api-client-react");
    let capturedKickListParams: unknown;
    apiMock.useListKickSessions.mockImplementation((params: unknown) => {
      capturedKickListParams = params;
      return { data: { items: [] }, isLoading: false, refetch: jest.fn() };
    });

    act(() => {
      toolsRenderer = create(React.createElement(KickCounterSection));
    });
    await act(async () => {});

    // The section must have called the hook with some params
    expect(capturedKickListParams).toBeDefined();

    // Step 2 — derive the expected invalidation key from those exact params.
    // If KickCounterSection ever changes its hook params the next line also
    // changes, and the assertion below will catch any listener mismatch.
    const expectedKey = apiMock.getListKickSessionsQueryKey(
      capturedKickListParams,
    );

    // Step 3 — render the listener and fire a Watch kick event
    act(() => {
      listenerRenderer = create(React.createElement(WatchBackgroundListener));
    });
    await act(async () => {});

    await act(async () => {
      await capturedOnKickSessionEnd!({
        kickCount: 5,
        startedAt: "2026-08-02T10:00:00.000Z",
        endedAt: "2026-08-02T10:30:00.000Z",
      });
    });

    // Step 4 — the invalidation key must equal the key KickCounterSection uses
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: expectedKey,
    });
  });

  it("invalidates the exact key ContractionTimerSection passes to useListContractions", async () => {
    // Step 1 — render ContractionTimerSection with a fixed system clock so
    // todayDate() returns a deterministic value, and capture the hook params.
    const apiMock = require("@workspace/api-client-react");
    let capturedContractionListParams: unknown;
    apiMock.useListContractions.mockImplementation((params: unknown) => {
      capturedContractionListParams = params;
      return { data: { items: [] }, isLoading: false, refetch: jest.fn() };
    });

    act(() => {
      toolsRenderer = create(React.createElement(ContractionTimerSection));
    });
    await act(async () => {});

    expect(capturedContractionListParams).toBeDefined();

    // Step 2 — derive expected key from the captured params
    const expectedKey = apiMock.getListContractionsQueryKey(
      capturedContractionListParams,
    );

    // Step 3 — render the listener and fire a Watch contraction event.
    // The same fixed system clock ensures todayDate() in the listener and in
    // the section produce the same ISO date string.
    act(() => {
      listenerRenderer = create(React.createElement(WatchBackgroundListener));
    });
    await act(async () => {});

    await act(async () => {
      await capturedOnContractionUpdate!({
        startedAt: "2026-08-02T14:00:00.000Z",
        endedAt: "2026-08-02T14:01:00.000Z",
        interval: 300,
      });
    });

    // Step 4 — the invalidation key must equal the key ContractionTimerSection uses
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: expectedKey,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//
// Watch reconnect backlog — N sessions replayed concurrently
//
// When the Watch comes back online after being out of range it may replay
// several queued sessions all at once.  Each onKickSessionEnd call is
// independent; they should all be persisted and each should trigger its own
// cache invalidation — none should be silently dropped or deduplicated.
//
// ─────────────────────────────────────────────────────────────────────────────

describe("WatchBackgroundListener — Watch reconnect backlog (N sessions replayed concurrently)", () => {
  let listenerRenderer: ReturnType<typeof create> | null = null;

  function renderWatchListener() {
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-123",
      getToken: jest.fn().mockResolvedValue("token-user-123"),
    });
    act(() => {
      listenerRenderer = create(React.createElement(WatchBackgroundListener));
    });
    return listenerRenderer!;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    listenerRenderer = null;
    capturedOnKickSessionEnd = undefined;
    capturedOnContractionUpdate = undefined;
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-123",
      getToken: jest.fn().mockResolvedValue("token-user-123"),
    });
    mockInvalidateQueries.mockResolvedValue(undefined);
    mockApiDirectSaveKickSession.mockResolvedValue(undefined);
    mockApiDirectSaveContraction.mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Drain the WatchToast hide-timer while the tree is still mounted
    act(() => {
      jest.runAllTimers();
    });
    if (listenerRenderer) {
      act(() => {
        listenerRenderer!.unmount();
      });
      listenerRenderer = null;
    }
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("persists all N sessions and invalidates the cache N times when N=5 sessions are replayed concurrently", async () => {
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnKickSessionEnd).toBeDefined();

    // A realistic Watch backlog: mix of zero-kick and non-zero-kick sessions,
    // as would accumulate while the Watch was out of Bluetooth range.
    const backlog = [
      {
        kickCount: 0, // zero-kick session — must still be persisted
        startedAt: "2026-08-03T08:00:00.000Z",
        endedAt: "2026-08-03T08:05:00.000Z",
      },
      {
        kickCount: 4,
        startedAt: "2026-08-03T09:00:00.000Z",
        endedAt: "2026-08-03T09:20:00.000Z",
      },
      {
        kickCount: 0, // second zero-kick session in the same batch
        startedAt: "2026-08-03T10:00:00.000Z",
        endedAt: "2026-08-03T10:03:00.000Z",
      },
      {
        kickCount: 11,
        startedAt: "2026-08-03T11:00:00.000Z",
        endedAt: "2026-08-03T11:35:00.000Z",
      },
      {
        kickCount: 7,
        startedAt: "2026-08-03T12:00:00.000Z",
        endedAt: "2026-08-03T12:25:00.000Z",
      },
    ];

    // Fire all five callbacks concurrently — mirrors the Watch replaying its
    // offline queue all at once on reconnect.
    await act(async () => {
      await Promise.all(backlog.map((s) => capturedOnKickSessionEnd!(s)));
    });

    // Every session must have been saved exactly once — no duplicates, no drops
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(backlog.length);

    // Each save must produce its own cache invalidation so the Tools tab sees
    // fresh data after every individual session — not just once for the batch.
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(backlog.length);
  });

  it("saves both zero-kick and non-zero-kick sessions in the concurrent batch", async () => {
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnKickSessionEnd).toBeDefined();

    const zeroKickSession = {
      kickCount: 0,
      startedAt: "2026-08-03T13:00:00.000Z",
      endedAt: "2026-08-03T13:05:00.000Z",
    };
    const nonZeroKickSession = {
      kickCount: 9,
      startedAt: "2026-08-03T14:00:00.000Z",
      endedAt: "2026-08-03T14:30:00.000Z",
    };
    const anotherNonZeroKickSession = {
      kickCount: 3,
      startedAt: "2026-08-03T15:00:00.000Z",
      endedAt: "2026-08-03T15:10:00.000Z",
    };

    await act(async () => {
      await Promise.all([
        capturedOnKickSessionEnd!(zeroKickSession),
        capturedOnKickSessionEnd!(nonZeroKickSession),
        capturedOnKickSessionEnd!(anotherNonZeroKickSession),
      ]);
    });

    // All three sessions must be persisted, including the zero-kick one
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(3);

    // Verify the zero-kick session was passed through correctly
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledWith(
      {
        startedAt: zeroKickSession.startedAt,
        endedAt: zeroKickSession.endedAt,
        kickCount: 0,
      },
      expect.any(Function), // frozen token getter
    );

    // Verify the non-zero-kick sessions were also saved
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledWith(
      {
        startedAt: nonZeroKickSession.startedAt,
        endedAt: nonZeroKickSession.endedAt,
        kickCount: 9,
      },
      expect.any(Function),
    );

    // Each session in the batch must have triggered its own cache invalidation
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(3);
  });

  it("invalidates the cache once per session even when sessions have varied kick counts in the batch", async () => {
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnKickSessionEnd).toBeDefined();

    // Three sessions with deliberately varied kick counts (including a zero-kick
    // one in the middle) fired concurrently — the listener must treat each as an
    // independent unit and produce exactly one save + one invalidation per item,
    // regardless of how the microtask queue happens to schedule them.
    const sessions = [
      {
        kickCount: 5,
        startedAt: "2026-08-03T16:00:00.000Z",
        endedAt: "2026-08-03T16:20:00.000Z",
      },
      {
        kickCount: 0, // zero-kick in the middle of the batch
        startedAt: "2026-08-03T17:00:00.000Z",
        endedAt: "2026-08-03T17:02:00.000Z",
      },
      {
        kickCount: 8,
        startedAt: "2026-08-03T18:00:00.000Z",
        endedAt: "2026-08-03T18:25:00.000Z",
      },
    ];

    await act(async () => {
      await Promise.all(sessions.map((s) => capturedOnKickSessionEnd!(s)));
    });

    // All three saves completed
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(3);
    // Each completion triggered its own independent cache invalidation
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(3);

    // Verify payload integrity — every session's data arrived at the API intact
    for (const session of sessions) {
      expect(mockApiDirectSaveKickSession).toHaveBeenCalledWith(
        {
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          kickCount: session.kickCount,
        },
        expect.any(Function),
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//
// Duplicate-session deduplication
//
// When the Watch retries onKickSessionEnd for a session the phone already
// recorded (or that the Watch itself already delivered successfully),
// WatchBackgroundListener must skip the second create so the user never sees
// a duplicate entry in their kick-session list.
//
// ─────────────────────────────────────────────────────────────────────────────

describe("WatchBackgroundListener — duplicate kick-session deduplication", () => {
  let listenerRenderer: ReturnType<typeof create> | null = null;

  function renderWatchListener() {
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-123",
      getToken: jest.fn().mockResolvedValue("token-user-123"),
    });
    act(() => {
      listenerRenderer = create(React.createElement(WatchBackgroundListener));
    });
    return listenerRenderer!;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    listenerRenderer = null;
    capturedOnKickSessionEnd = undefined;
    capturedOnContractionUpdate = undefined;
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-123",
      getToken: jest.fn().mockResolvedValue("token-user-123"),
    });
    mockInvalidateQueries.mockResolvedValue(undefined);
    // Default: empty cache — no sessions in React Query store.
    mockGetQueryData.mockReturnValue(undefined);
    mockApiDirectSaveKickSession.mockResolvedValue(undefined);
    mockApiDirectSaveContraction.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => {
      jest.runAllTimers();
    });
    if (listenerRenderer) {
      act(() => {
        listenerRenderer!.unmount();
      });
      listenerRenderer = null;
    }
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("suppresses the second write when the Watch retries a session with the same startedAt", async () => {
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnKickSessionEnd).toBeDefined();

    const session = {
      kickCount: 6,
      startedAt: "2026-08-03T10:00:00.000Z",
      endedAt: "2026-08-03T10:30:00.000Z",
    };

    // First delivery — should be saved normally.
    await act(async () => {
      await capturedOnKickSessionEnd!(session);
    });

    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(1);
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);

    // Second delivery with identical startedAt — Watch retry after a
    // WCSession reconnect.  The handler must discard this silently.
    await act(async () => {
      await capturedOnKickSessionEnd!(session);
    });

    // Still only one createKickSession call — duplicate was suppressed.
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(1);
    // Cache invalidation must not be re-triggered for the duplicate.
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("still saves sessions with different startedAt values after a duplicate is suppressed", async () => {
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnKickSessionEnd).toBeDefined();

    const first = {
      kickCount: 5,
      startedAt: "2026-08-03T11:00:00.000Z",
      endedAt: "2026-08-03T11:20:00.000Z",
    };
    const duplicate = { ...first }; // exact same startedAt
    const second = {
      kickCount: 3,
      startedAt: "2026-08-03T12:00:00.000Z", // different startedAt
      endedAt: "2026-08-03T12:15:00.000Z",
    };

    await act(async () => {
      await capturedOnKickSessionEnd!(first);
    });
    await act(async () => {
      await capturedOnKickSessionEnd!(duplicate); // should be dropped
    });
    await act(async () => {
      await capturedOnKickSessionEnd!(second); // different startedAt — must be saved
    });

    // Only the two distinct sessions should have been saved.
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(2);
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledWith(
      { startedAt: first.startedAt, endedAt: first.endedAt, kickCount: 5 },
      expect.any(Function),
    );
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledWith(
      { startedAt: second.startedAt, endedAt: second.endedAt, kickCount: 3 },
      expect.any(Function),
    );
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(2);
  });

  it("skips the save when the session startedAt is already in the React Query cache (phone saved it first)", async () => {
    // Pre-populate the React Query cache to simulate the phone having already
    // saved this session via handleEndSession + refetch.
    const phoneSavedStartedAt = "2026-08-03T13:00:00.000Z";
    mockGetQueryData.mockReturnValue({
      items: [
        {
          id: 42,
          kickCount: 7,
          startedAt: phoneSavedStartedAt,
          endedAt: "2026-08-03T13:30:00.000Z",
        },
      ],
    });

    renderWatchListener();
    await act(async () => {});

    expect(capturedOnKickSessionEnd).toBeDefined();

    // Watch fires for the same session the phone already recorded.
    await act(async () => {
      await capturedOnKickSessionEnd!({
        kickCount: 7,
        startedAt: phoneSavedStartedAt,
        endedAt: "2026-08-03T13:30:00.000Z",
      });
    });

    // The cache check must have blocked the write — no API call, no
    // cache invalidation.
    expect(mockApiDirectSaveKickSession).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  it("suppresses both concurrent duplicate callbacks — only one createKickSession call", async () => {
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnKickSessionEnd).toBeDefined();

    const session = {
      kickCount: 4,
      startedAt: "2026-08-03T14:00:00.000Z",
      endedAt: "2026-08-03T14:20:00.000Z",
    };

    // Fire two callbacks for the same startedAt concurrently — the Watch
    // replayed the same session twice before the first request completed.
    await act(async () => {
      await Promise.all([
        capturedOnKickSessionEnd!(session),
        capturedOnKickSessionEnd!(session),
      ]);
    });

    // Optimistic Set add before the async gap means the second callback is
    // blocked immediately — only one API call must be made.
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(1);
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
  });
});
