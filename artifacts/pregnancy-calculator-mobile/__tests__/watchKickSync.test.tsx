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
  getListKickSessionsQueryKey: jest.fn((p) =>
    p !== undefined ? ["kick-sessions", p] : ["kick-sessions"],
  ),
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
  isKickSessionRecentlySaved: jest.fn().mockResolvedValue(false),
  markKickSessionSaved: jest.fn().mockResolvedValue(undefined),
}));

// ── Watch connectivity ────────────────────────────────────────────────────────
// Capture the callbacks so we can fire them manually in tests.
let capturedOnKickSessionEnd: ((s: unknown) => Promise<void>) | undefined;
let capturedOnContractionUpdate: ((r: unknown) => Promise<void>) | undefined;
let capturedOnKickUpdate: ((count: number) => void) | undefined;

jest.mock("@/hooks/useWatchConnectivity", () => ({
  useWatchConnectivity: jest.fn(
    (opts: {
      onKickSessionEnd?: (s: unknown) => Promise<void>;
      onContractionUpdate?: (r: unknown) => Promise<void>;
      onKickUpdate?: (count: number) => void;
    }) => {
      capturedOnKickSessionEnd = opts.onKickSessionEnd;
      capturedOnContractionUpdate = opts.onContractionUpdate;
      capturedOnKickUpdate = opts.onKickUpdate;
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
    capturedOnKickUpdate = undefined;
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
        watchSessionId: session.startedAt,
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
// Live kick-count updates (mid-session)
//
// The Watch fires onKickUpdate on every individual tap.  WatchBackgroundListener
// should reflect this count in its rendered output in real time WITHOUT
// triggering any API save or cache invalidation — those only happen on
// onKickSessionEnd.
//
// ─────────────────────────────────────────────────────────────────────────────

describe("WatchBackgroundListener — live kick-count updates (onKickUpdate)", () => {
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
    capturedOnKickUpdate = undefined;
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

  it("registers an onKickUpdate callback with useWatchConnectivity", () => {
    renderWatchListener();
    act(() => {});

    expect(capturedOnKickUpdate).toBeDefined();
    expect(typeof capturedOnKickUpdate).toBe("function");
  });

  it("reflects the live kick count in rendered output without saving to the API", () => {
    const renderer = renderWatchListener();
    act(() => {});

    expect(capturedOnKickUpdate).toBeDefined();

    // Fire three successive kick updates — simulates the user tapping on Watch
    act(() => {
      capturedOnKickUpdate!(1);
    });
    act(() => {
      capturedOnKickUpdate!(2);
    });
    act(() => {
      capturedOnKickUpdate!(3);
    });

    // The current count must be visible somewhere in the rendered tree
    const textNodes = renderer.root.findAllByType(Text);
    const renderedTexts = textNodes
      .map((n) => String(n.props.children ?? ""))
      .join(" ");
    expect(renderedTexts).toMatch(/3/);

    // No API save or cache invalidation must have fired — those only happen on
    // onKickSessionEnd, not on individual kick taps.
    expect(mockApiDirectSaveKickSession).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  it("clears the live kick count from the UI when the session ends", async () => {
    const renderer = renderWatchListener();
    await act(async () => {});

    expect(capturedOnKickUpdate).toBeDefined();
    expect(capturedOnKickSessionEnd).toBeDefined();

    // Simulate mid-session taps
    act(() => {
      capturedOnKickUpdate!(5);
    });

    // Verify count is shown
    const textsBefore = renderer.root
      .findAllByType(Text)
      .map((n) => String(n.props.children ?? ""))
      .join(" ");
    expect(textsBefore).toMatch(/5/);

    // Session ends — the live count banner must disappear (count → null)
    await act(async () => {
      await capturedOnKickSessionEnd!({
        kickCount: 5,
        startedAt: "2026-08-01T10:00:00.000Z",
        endedAt: "2026-08-01T10:15:00.000Z",
      });
    });

    // After session end the banner text "5 kicks" must no longer be driven by
    // the live-count state (count is null).  The toast "Kick session saved"
    // may still be visible, but the in-progress banner is gone.
    const textsAfter = renderer.root
      .findAllByType(Text)
      .map((n) => String(n.props.children ?? ""))
      .join(" ");
    // The live-session banner ("Watch session in progress") must not appear
    expect(textsAfter).not.toMatch(/Watch session in progress/);
    // The save must have fired exactly once
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(1);
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
    capturedOnKickUpdate = undefined;
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
        watchSessionId: watchSession.startedAt,
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
    capturedOnKickUpdate = undefined;
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
        watchSessionId: "2026-08-01T10:00:00.000Z",
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
      .mockReturnValueOnce(0) // check after persisted recent-saves read
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
    capturedOnKickUpdate = undefined;
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
    capturedOnKickUpdate = undefined;

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
    capturedOnKickUpdate = undefined;
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

  it("invalidates using the base kick-session key so both the tools tab and the history screen refresh", async () => {
    // WatchBackgroundListener.handleKickSessionEnd invalidates with
    // getListKickSessionsQueryKey() — no params.  This resolves to the base
    // path prefix which React Query matches as a prefix against every cached
    // kick-session query, including:
    //   • KickCounterSection: { limit: 10, offset: 0 }
    //   • KickHistoryTab:     { limit: 50, offset: 0 }
    //
    // Using the narrow tools-tab key here (the old behaviour) would leave the
    // history screen stale until the user manually pulled to refresh.
    const apiMock = require("@workspace/api-client-react");

    // Derive the expected base key (no params).
    const expectedBaseKey = apiMock.getListKickSessionsQueryKey();

    // Render the listener and fire a Watch kick event.
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

    // The invalidation key must be the base key (no params) so every
    // kick-session query — including the history screen's limit:50 query — is
    // marked stale and re-fetched automatically.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: expectedBaseKey,
    });
  });

  it("base kick-session key covers both the tools-tab key (limit:10) and the history key (limit:50)", () => {
    // This test confirms that the base key returned by getListKickSessionsQueryKey()
    // is a prefix of the keys returned with params, so React Query's prefix
    // invalidation will mark BOTH variants stale when the listener fires.
    const apiMock = require("@workspace/api-client-react");

    const baseKey = apiMock.getListKickSessionsQueryKey();
    const toolsKey = apiMock.getListKickSessionsQueryKey({
      limit: 10,
      offset: 0,
    });
    const historyKey = apiMock.getListKickSessionsQueryKey({
      limit: 50,
      offset: 0,
    });

    // The base key must be a non-empty prefix shared by both parameterised keys.
    expect(baseKey.length).toBeGreaterThan(0);
    expect(toolsKey.slice(0, baseKey.length)).toEqual(baseKey);
    expect(historyKey.slice(0, baseKey.length)).toEqual(baseKey);

    // And the two parameterised keys must differ from each other (so we know
    // they really are distinct queries that needed to be covered).
    expect(toolsKey).not.toEqual(historyKey);
  });

  it("invalidates using the base contraction key so both the tools tab and the history screen refresh", async () => {
    // WatchBackgroundListener.handleContractionUpdate invalidates with
    // getListContractionsQueryKey() — no params.  This resolves to the base
    // path prefix ["/api/tools/contractions"] which React Query matches as a
    // prefix against every cached contraction query, including:
    //   • ContractionTimerSection: { sessionDate, limit: 50 }
    //   • ContractionHistoryTab:   { limit: 200 }   ← all-dates, no sessionDate
    //
    // Using the narrow single-date key here (the old behaviour) would leave the
    // history screen stale until the user manually pulled to refresh.
    const apiMock = require("@workspace/api-client-react");

    // Derive the expected base key.
    const expectedBaseKey = apiMock.getListContractionsQueryKey();

    // Render the listener and fire a Watch contraction event.
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

    // The invalidation key must be the base key (no params) so every
    // contraction query — including the history screen's all-dates query — is
    // marked stale and re-fetched automatically.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: expectedBaseKey,
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
    capturedOnKickUpdate = undefined;
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
        watchSessionId: zeroKickSession.startedAt,
      },
      expect.any(Function), // frozen token getter
    );

    // Verify the non-zero-kick sessions were also saved
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledWith(
      {
        startedAt: nonZeroKickSession.startedAt,
        endedAt: nonZeroKickSession.endedAt,
        kickCount: 9,
        watchSessionId: nonZeroKickSession.startedAt,
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
          watchSessionId: session.startedAt,
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
    capturedOnKickUpdate = undefined;
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
      {
        startedAt: first.startedAt,
        endedAt: first.endedAt,
        kickCount: 5,
        watchSessionId: first.startedAt,
      },
      expect.any(Function),
    );
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledWith(
      {
        startedAt: second.startedAt,
        endedAt: second.endedAt,
        kickCount: 3,
        watchSessionId: second.startedAt,
      },
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

  it("resets the dedup window when a different user signs in — user B's session with the same startedAt IS saved", async () => {
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnKickSessionEnd).toBeDefined();

    const session = {
      kickCount: 6,
      startedAt: "2026-08-03T15:00:00.000Z",
      endedAt: "2026-08-03T15:25:00.000Z",
    };

    // User A's Watch session — saved and recorded in the in-process dedup Set.
    await act(async () => {
      await capturedOnKickSessionEnd!(session);
    });
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(1);

    // Account switch on the same device: user B signs in. Re-render the SAME
    // component instance (same process lifetime, same ref) with the new userId.
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-456",
      getToken: jest.fn().mockResolvedValue("token-user-456"),
    });
    act(() => {
      listenerRenderer!.update(React.createElement(WatchBackgroundListener));
    });
    await act(async () => {});

    // User B's Watch fires a session with the IDENTICAL startedAt. If the
    // dedup Set were not cleared on userId change, this save would be
    // silently dropped and user B would lose the session.
    await act(async () => {
      await capturedOnKickSessionEnd!(session);
    });

    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(2);
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(2);
  });

  it("does NOT reset the dedup window on a re-render with the same userId", async () => {
    renderWatchListener();
    await act(async () => {});

    const session = {
      kickCount: 2,
      startedAt: "2026-08-03T16:00:00.000Z",
      endedAt: "2026-08-03T16:10:00.000Z",
    };

    await act(async () => {
      await capturedOnKickSessionEnd!(session);
    });
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(1);

    // Re-render with the SAME userId — an ordinary re-render must not wipe
    // the dedup Set, otherwise Watch retries would slip through.
    act(() => {
      listenerRenderer!.update(React.createElement(WatchBackgroundListener));
    });
    await act(async () => {});

    await act(async () => {
      await capturedOnKickSessionEnd!(session);
    });

    // Duplicate still suppressed.
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//
// Offline / transferUserInfo delivery — WatchBackgroundListener persistence
//
// Both the online (sendMessage) and offline (transferUserInfo) transports
// arrive at WatchBackgroundListener via the same onKickSessionEnd /
// onContractionUpdate callbacks — PhoneWatchBridge.handleMessage normalises
// both paths into the same native event before the JS layer sees them.
//
// The native-event subscription boundary is tested separately in
// watchOfflineDelivery.test.tsx (useWatchConnectivity + capturedListeners).
// This suite confirms the WatchBackgroundListener persistence contract:
// once the callback fires, the session is saved and the cache is invalidated.
//
// ─────────────────────────────────────────────────────────────────────────────

describe("WatchBackgroundListener — offline delivery persistence (transferUserInfo path)", () => {
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
    capturedOnKickUpdate = undefined;
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-123",
      getToken: jest.fn().mockResolvedValue("token-user-123"),
    });
    mockInvalidateQueries.mockResolvedValue(undefined);
    mockApiDirectSaveKickSession.mockResolvedValue(undefined);
    mockApiDirectSaveContraction.mockResolvedValue(undefined);
    mockGetQueryData.mockReturnValue(undefined);
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

  it("persists a kick session and invalidates the cache when the callback fires after offline reconnect", async () => {
    // Simulates the end of the offline delivery chain: PhoneWatchBridge decoded
    // the transferUserInfo payload in didReceiveUserInfo, called handleMessage,
    // emitted "onKickSessionEnd", useWatchConnectivity forwarded it here.
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnKickSessionEnd).toBeDefined();

    await act(async () => {
      await capturedOnKickSessionEnd!({
        kickCount: 8,
        startedAt: "2026-08-04T10:00:00.000Z",
        endedAt: "2026-08-04T10:30:00.000Z",
      });
    });

    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(1);
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledWith(
      {
        startedAt: "2026-08-04T10:00:00.000Z",
        endedAt: "2026-08-04T10:30:00.000Z",
        kickCount: 8,
        watchSessionId: "2026-08-04T10:00:00.000Z",
      },
      expect.any(Function), // frozen token getter
    );
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("persists a contraction and invalidates the cache when the callback fires after offline reconnect", async () => {
    // Mirrors the kick-session test above for the contraction path
    // (TestFlight checklist step 5.9).
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnContractionUpdate).toBeDefined();

    await act(async () => {
      await capturedOnContractionUpdate!({
        startedAt: "2026-08-04T14:00:00.000Z",
        endedAt: "2026-08-04T14:01:30.000Z", // 90 s
        interval: 360,
      });
    });

    expect(mockApiDirectSaveContraction).toHaveBeenCalledTimes(1);
    const [payload] = mockApiDirectSaveContraction.mock.calls[0];
    expect(payload.durationSeconds).toBe(90);
    expect(payload.intervalSeconds).toBe(360);
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//
// Signed-out guard
//
// When the user is signed out at the moment the Watch fires, the component
// must silently drop both callbacks — no API save, no cache invalidation,
// no toast.  The callbacks must also be passed as `undefined` to
// useWatchConnectivity so the Watch layer never invokes them.
//
// ─────────────────────────────────────────────────────────────────────────────

describe("WatchBackgroundListener — signed-out guard", () => {
  let listenerRenderer: ReturnType<typeof create> | null = null;

  function renderSignedOutListener() {
    mockUseAuth.mockReturnValue({
      isSignedIn: false,
      userId: undefined,
      getToken: jest.fn().mockResolvedValue(null),
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
    capturedOnKickUpdate = undefined;
    jest.clearAllMocks();
    mockInvalidateQueries.mockResolvedValue(undefined);
    mockApiDirectSaveKickSession.mockResolvedValue(undefined);
    mockApiDirectSaveContraction.mockResolvedValue(undefined);
    mockGetQueryData.mockReturnValue(undefined);
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

  it("passes undefined for onKickSessionEnd to useWatchConnectivity when signed out", () => {
    renderSignedOutListener();
    act(() => {});

    // When isSignedIn is false the component must pass undefined so the Watch
    // layer never has a function to call for kick session end events.
    expect(capturedOnKickSessionEnd).toBeUndefined();
  });

  it("passes undefined for onContractionUpdate to useWatchConnectivity when signed out", () => {
    renderSignedOutListener();
    act(() => {});

    // When isSignedIn is false the component must pass undefined so the Watch
    // layer never has a function to call for contraction update events.
    expect(capturedOnContractionUpdate).toBeUndefined();
  });

  it("passes undefined for onKickUpdate to useWatchConnectivity when signed out", () => {
    renderSignedOutListener();
    act(() => {});

    // Mid-session live-count updates must also be suppressed when signed out.
    expect(capturedOnKickUpdate).toBeUndefined();
  });

  it("does not call apiDirectSaveKickSession when a kick session arrives while signed out", async () => {
    // Even if the internal handleKickSessionEnd were somehow invoked directly,
    // the isSignedIn guard must prevent any API call.
    renderSignedOutListener();
    await act(async () => {});

    // Callback is undefined — the Watch layer would not call it, but we verify
    // the API is never touched regardless.
    expect(capturedOnKickSessionEnd).toBeUndefined();
    expect(mockApiDirectSaveKickSession).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  it("does not call apiDirectSaveContraction when a contraction arrives while signed out", async () => {
    renderSignedOutListener();
    await act(async () => {});

    expect(capturedOnContractionUpdate).toBeUndefined();
    expect(mockApiDirectSaveContraction).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  it("shows no toast when signed out and a kick session callback would have fired", async () => {
    const renderer = renderSignedOutListener();
    await act(async () => {});

    // No callback is registered, so no toast path can be triggered.
    // Verify the rendered tree contains no visible toast text (the toast
    // component renders with visible:false and an empty message by default).
    const textNodes = renderer.root.findAllByType(Text);
    const renderedTexts = textNodes
      .map((n) => String(n.props.children ?? ""))
      .join(" ");

    expect(renderedTexts).not.toMatch(/saved/i);
    expect(renderedTexts).not.toMatch(/recorded/i);
    expect(renderedTexts).not.toMatch(/kick session/i);
    expect(renderedTexts).not.toMatch(/contraction/i);
  });

  it("shows no toast when signed out and a contraction callback would have fired", async () => {
    const renderer = renderSignedOutListener();
    await act(async () => {});

    const textNodes = renderer.root.findAllByType(Text);
    const renderedTexts = textNodes
      .map((n) => String(n.props.children ?? ""))
      .join(" ");

    expect(renderedTexts).not.toMatch(/saved/i);
    expect(renderedTexts).not.toMatch(/recorded/i);
  });

  it("hides the live kick-count banner when the user signs out mid-session", () => {
    // Step 1: render signed-in so the kick-count callbacks are registered.
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-123",
      getToken: jest.fn().mockResolvedValue("token-user-123"),
    });
    act(() => {
      listenerRenderer = create(React.createElement(WatchBackgroundListener));
    });
    act(() => {});

    // Step 2: simulate several Watch taps to drive liveKickCount > 0.
    expect(capturedOnKickUpdate).toBeDefined();
    act(() => {
      capturedOnKickUpdate!(1);
    });
    act(() => {
      capturedOnKickUpdate!(2);
    });
    act(() => {
      capturedOnKickUpdate!(3);
    });

    // Verify the banner is visible before sign-out.
    const textsBefore = listenerRenderer!.root
      .findAllByType(Text)
      .map((n) => String(n.props.children ?? ""))
      .join(" ");
    expect(textsBefore).toMatch(/Watch session in progress/);

    // Step 3: simulate sign-out by updating the mock and re-rendering.
    mockUseAuth.mockReturnValue({
      isSignedIn: false,
      userId: undefined,
      getToken: jest.fn().mockResolvedValue(null),
    });
    act(() => {
      listenerRenderer!.update(React.createElement(WatchBackgroundListener));
    });

    // Step 4: the banner must no longer appear.
    const textsAfter = listenerRenderer!.root
      .findAllByType(Text)
      .map((n) => String(n.props.children ?? ""))
      .join(" ");
    expect(textsAfter).not.toMatch(/Watch session in progress/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//
// Back-to-back sessions — no merging
//
// If the Watch fires onKickSessionEnd (or onContractionUpdate) twice in quick
// succession for two DISTINCT sessions (different startedAt timestamps), each
// call must produce a separate API request and a separate cache invalidation.
//
// The key property under test is CONCURRENCY: both callbacks are launched
// simultaneously (neither is awaited before the other fires), the API mock is
// held pending with a deferred promise, and microtasks are flushed until BOTH
// calls have arrived at the blocked mock before the mock is resolved.  This
// catches a debounce, an in-flight boolean guard, or any other mechanism that
// would coalesce two distinct saves into one.
//
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flush the microtask queue enough times for all pending awaits inside
 * async handlers to advance.  Each `await Promise.resolve()` processes one
 * round of microtasks; handlers in WatchBackgroundListener need at most two
 * rounds to progress past `await getToken()` and reach `await apiDirectSave`.
 */
async function flushMicrotasks(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

describe("WatchBackgroundListener — back-to-back sessions are not merged", () => {
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
    capturedOnKickUpdate = undefined;
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-123",
      getToken: jest.fn().mockResolvedValue("token-user-123"),
    });
    mockInvalidateQueries.mockResolvedValue(undefined);
    mockApiDirectSaveKickSession.mockResolvedValue(undefined);
    mockApiDirectSaveContraction.mockResolvedValue(undefined);
    mockGetQueryData.mockReturnValue(undefined);
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

  it("calls apiDirectSaveKickSession exactly twice when two distinct kick sessions are in-flight simultaneously", async () => {
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnKickSessionEnd).toBeDefined();

    const sessionA = {
      kickCount: 6,
      startedAt: "2026-08-09T08:00:00.000Z",
      endedAt: "2026-08-09T08:30:00.000Z",
    };
    const sessionB = {
      kickCount: 4,
      startedAt: "2026-08-09T09:00:00.000Z",
      endedAt: "2026-08-09T09:25:00.000Z",
    };

    // Hold the API save open so we can assert both calls are in-flight before
    // either resolves.  If a debounce or in-flight guard blocked the second
    // call, its count would still be 1 when we assert below.
    let resolveKickSave!: () => void;
    const kickSaveBlocker = new Promise<void>((res) => {
      resolveKickSave = res;
    });
    mockApiDirectSaveKickSession.mockImplementation(() => kickSaveBlocker);

    // Launch both callbacks simultaneously — neither is awaited before the
    // other is fired.
    let p1!: Promise<void>, p2!: Promise<void>;
    act(() => {
      p1 = capturedOnKickSessionEnd!(sessionA) as Promise<void>;
      p2 = capturedOnKickSessionEnd!(sessionB) as Promise<void>;
    });

    // Flush microtasks until both handlers have advanced past await getToken()
    // and are now suspended at await apiDirectSaveKickSession (the blocker).
    // We assert BEFORE resolving the blocker to prove both are concurrently
    // in-flight.
    await act(async () => {
      // Poll: advance microtasks in bounded rounds until both calls arrive.
      for (let round = 0; round < 30; round++) {
        await Promise.resolve();
        if (mockApiDirectSaveKickSession.mock.calls.length >= 2) break;
      }
    });

    // Both saves must be in-flight at the API level before either resolves.
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(2);
    // Payload identity — each session must carry its own distinct data.
    const calledWith = mockApiDirectSaveKickSession.mock.calls.map(
      (c: unknown[]) => (c[0] as { startedAt: string }).startedAt,
    );
    expect(calledWith).toContain(sessionA.startedAt);
    expect(calledWith).toContain(sessionB.startedAt);

    // Unblock and let both handlers finish.
    await act(async () => {
      resolveKickSave();
      await Promise.all([p1, p2]);
      await flushMicrotasks();
    });
  });

  it("calls invalidateQueries exactly twice when two distinct kick sessions are in-flight simultaneously", async () => {
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnKickSessionEnd).toBeDefined();

    // Deferred save holds both handlers open so both invalidations fire only
    // after each save completes — not before one has even started.
    let resolveAll!: () => void;
    const blocker = new Promise<void>((res) => {
      resolveAll = res;
    });
    mockApiDirectSaveKickSession.mockImplementation(() => blocker);

    let p1!: Promise<void>, p2!: Promise<void>;
    act(() => {
      p1 = capturedOnKickSessionEnd!({
        kickCount: 3,
        startedAt: "2026-08-09T10:00:00.000Z",
        endedAt: "2026-08-09T10:15:00.000Z",
      }) as Promise<void>;
      p2 = capturedOnKickSessionEnd!({
        kickCount: 7,
        startedAt: "2026-08-09T11:00:00.000Z",
        endedAt: "2026-08-09T11:35:00.000Z",
      }) as Promise<void>;
    });

    // Flush microtasks until both API calls have arrived (both in-flight).
    await act(async () => {
      for (let round = 0; round < 30; round++) {
        await Promise.resolve();
        if (mockApiDirectSaveKickSession.mock.calls.length >= 2) break;
      }
    });

    // Confirm both are concurrently in-flight before we unblock.
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(2);

    // Unblock: both saves complete, each must trigger its own invalidation.
    await act(async () => {
      resolveAll();
      await Promise.all([p1, p2]);
      await flushMicrotasks();
    });

    // Each completed session must trigger its own cache invalidation so that
    // the Tools tab reflects both new records without a manual refresh.
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(2);
  });

  it("calls apiDirectSaveContraction exactly twice and invalidates twice when two distinct contractions are in-flight simultaneously", async () => {
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnContractionUpdate).toBeDefined();

    const contractionA = {
      startedAt: "2026-08-09T12:00:00.000Z",
      endedAt: "2026-08-09T12:01:00.000Z",
      interval: 300,
    };
    const contractionB = {
      startedAt: "2026-08-09T12:05:00.000Z",
      endedAt: "2026-08-09T12:06:00.000Z",
      interval: 300,
    };

    // Hold the API save open so both handlers are concurrently suspended at
    // the API call before either resolves.
    let resolveContractionSave!: () => void;
    const contractionBlocker = new Promise<void>((res) => {
      resolveContractionSave = res;
    });
    mockApiDirectSaveContraction.mockImplementation(() => contractionBlocker);

    // Both callbacks launched simultaneously.
    let p1!: Promise<void>, p2!: Promise<void>;
    act(() => {
      p1 = capturedOnContractionUpdate!(contractionA) as Promise<void>;
      p2 = capturedOnContractionUpdate!(contractionB) as Promise<void>;
    });

    // Flush microtasks until both are at the API mock (both in-flight).
    await act(async () => {
      for (let round = 0; round < 30; round++) {
        await Promise.resolve();
        if (mockApiDirectSaveContraction.mock.calls.length >= 2) break;
      }
    });

    // Assert concurrency: both saves arrived before either completed.
    expect(mockApiDirectSaveContraction).toHaveBeenCalledTimes(2);
    const contractionStartedAts = mockApiDirectSaveContraction.mock.calls.map(
      (c: unknown[]) => (c[0] as { startedAt: string }).startedAt,
    );
    expect(contractionStartedAts).toContain(contractionA.startedAt);
    expect(contractionStartedAts).toContain(contractionB.startedAt);

    // Unblock both saves and let the invalidations fire.
    await act(async () => {
      resolveContractionSave();
      await Promise.all([p1, p2]);
      await flushMicrotasks();
    });

    // Both saves must also produce a cache invalidation.
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//
// Sign-out mid-flight — user signs out while the API save is in progress
//
// A Watch kick session arrives while the user is signed in.  The component
// fetches the auth token, confirms the generation matches, then begins the
// async API call.  While that call is still pending, the user signs out —
// bumping the watch-queue generation counter.  Once the API call resolves,
// the post-save generation check sees the mismatch and bails out without
// touching the query cache.
//
// Two invariants must hold:
//   1. The API save itself completed (the data is NOT silently dropped — it
//      was sent to the server with the frozen token for the correct user).
//   2. invalidateQueries is NOT called — we must not update a cache that may
//      now belong to a different signed-in user.
//
// ─────────────────────────────────────────────────────────────────────────────

describe("WatchBackgroundListener — sign-out mid-flight while API save is in progress", () => {
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
    capturedOnKickUpdate = undefined;
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-123",
      getToken: jest.fn().mockResolvedValue("token-user-123"),
    });
    mockInvalidateQueries.mockResolvedValue(undefined);
    mockApiDirectSaveKickSession.mockResolvedValue(undefined);
    mockApiDirectSaveContraction.mockResolvedValue(undefined);
    mockEnqueueWatchKickSession.mockResolvedValue(undefined);
    mockGetQueryData.mockReturnValue(undefined);
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

  it("completes the API save with the frozen token but skips cache invalidation when sign-out bumps the generation mid-flight", async () => {
    const syncQueueMock = require("@/lib/sync-queue");

    // Arrange: generation is 0 at event-receive time; the post-save check will
    // see 1 (sign-out bumped it while the API call was pending).
    //
    // Call order inside handleKickSessionEnd:
    //   1. getWatchQueueGeneration → capturedGen (0)
    //   2. getWatchQueueGeneration → check after isKickSessionRecentlySaved (0 → pass)
    //   3. getWatchQueueGeneration → check after getToken (0 → pass; save starts)
    //   4. getWatchQueueGeneration → check after apiDirectSaveKickSession (1 → bail)
    syncQueueMock.getWatchQueueGeneration
      .mockReturnValueOnce(0) // capturedGen
      .mockReturnValueOnce(0) // after persisted-store read → pass
      .mockReturnValueOnce(0) // after getToken → save proceeds
      .mockReturnValueOnce(1); // after API save → sign-out detected

    // Hold the API save open with a deferred promise so we can interpose
    // the sign-out (generation bump) before the response arrives.
    let resolveSave!: () => void;
    mockApiDirectSaveKickSession.mockImplementation(
      () =>
        new Promise<void>((res) => {
          resolveSave = res;
        }),
    );

    renderWatchListener();
    await act(async () => {});
    expect(capturedOnKickSessionEnd).toBeDefined();

    const session = {
      kickCount: 5,
      startedAt: "2026-08-12T09:00:00.000Z",
      endedAt: "2026-08-12T09:25:00.000Z",
    };

    // Fire the callback without awaiting — the handler suspends at the
    // deferred apiDirectSaveKickSession call.
    let handlerPromise!: Promise<void>;
    act(() => {
      handlerPromise = capturedOnKickSessionEnd!(session) as Promise<void>;
    });

    // Advance microtasks until the handler has reached the deferred API call.
    await act(async () => {
      for (let round = 0; round < 30; round++) {
        await Promise.resolve();
        if (mockApiDirectSaveKickSession.mock.calls.length >= 1) break;
      }
    });

    // Confirm the API call is in-flight (not yet resolved).
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(1);
    // The save was issued with the correct payload and the frozen token getter.
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledWith(
      {
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        kickCount: session.kickCount,
        watchSessionId: session.startedAt,
      },
      expect.any(Function), // frozen token getter
    );
    // invalidateQueries must not have fired yet (API still pending).
    expect(mockInvalidateQueries).not.toHaveBeenCalled();

    // --- sign-out happens here (generation was already pre-configured to
    //     return 1 on the next call via mockReturnValueOnce above) ---

    // Now let the API call resolve and the handler run to completion.
    await act(async () => {
      resolveSave();
      await handlerPromise;
      await flushMicrotasks();
    });

    // Invariant 1: the save itself completed — data was NOT silently dropped.
    // (already confirmed above that the API was called exactly once)
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(1);

    // Invariant 2: the generation mismatch must have suppressed all
    // post-save side-effects on the (now stale) session.
    expect(mockInvalidateQueries).not.toHaveBeenCalled();

    // The data must not have been re-routed to the offline queue either —
    // the save succeeded; only the cache update was suppressed.
    expect(mockEnqueueWatchKickSession).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//
// Force-quit mid-delivery — unmount while the save is in flight
//
// The transferUserInfo path delivers a kick session via didReceiveUserInfo →
// onKickSessionEnd.  If the iPhone process is killed (or the React tree torn
// down) after the callback fires but before apiDirectSaveKickSession settles,
// the session must not be silently dropped: the in-flight async chain must
// still run to completion — the save commits and the persisted recent-save
// marker is written (success path), or the record is enqueued for retry via
// enqueueWatchKickSession (failure path).
//
// These tests fire onKickSessionEnd against a DEFERRED save promise, unmount
// WatchBackgroundListener while the save is still pending, then settle the
// promise and confirm the chain completed.  Mirrors the deferred-promise
// pattern used in the save-failure toast suite above.
//
// ─────────────────────────────────────────────────────────────────────────────

describe("WatchBackgroundListener — unmount while transferUserInfo save is in flight", () => {
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
    capturedOnKickUpdate = undefined;
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-123",
      getToken: jest.fn().mockResolvedValue("token-user-123"),
    });
    mockInvalidateQueries.mockResolvedValue(undefined);
    mockApiDirectSaveKickSession.mockResolvedValue(undefined);
    mockApiDirectSaveContraction.mockResolvedValue(undefined);
    mockEnqueueWatchKickSession.mockResolvedValue(undefined);
    mockGetQueryData.mockReturnValue(undefined);
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

  const session = {
    kickCount: 9,
    startedAt: "2026-08-10T07:00:00.000Z",
    endedAt: "2026-08-10T07:40:00.000Z",
  };

  it("completes the in-flight save (and persists the recent-save marker) even when the component unmounts before the API resolves", async () => {
    // Hold the API save open with a deferred promise.
    let resolveSave!: () => void;
    mockApiDirectSaveKickSession.mockImplementation(
      () =>
        new Promise<void>((res) => {
          resolveSave = res;
        }),
    );

    renderWatchListener();
    await act(async () => {});
    expect(capturedOnKickSessionEnd).toBeDefined();

    // Fire the Watch delivery WITHOUT awaiting it — the save is now pending.
    let handlerPromise!: Promise<void>;
    act(() => {
      handlerPromise = capturedOnKickSessionEnd!(session) as Promise<void>;
    });

    // Advance microtasks until the handler is suspended at the deferred save.
    await act(async () => {
      for (let round = 0; round < 30; round++) {
        await Promise.resolve();
        if (mockApiDirectSaveKickSession.mock.calls.length >= 1) break;
      }
    });
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(1);

    // Simulate the force-quit teardown: unmount while the save is in flight.
    act(() => {
      listenerRenderer!.unmount();
    });
    listenerRenderer = null;

    // Now let the API call settle. The chain must run to completion.
    const syncQueueMock = require("@/lib/sync-queue");
    await act(async () => {
      resolveSave();
      await handlerPromise;
      await flushMicrotasks();
    });

    // The save reached the API with the full payload + idempotency key…
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledWith(
      {
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        kickCount: session.kickCount,
        watchSessionId: session.startedAt,
      },
      expect.any(Function),
    );
    // …and the post-save chain still completed after the unmount: the durable
    // recent-save marker was written so a Watch retry on relaunch is suppressed.
    expect(syncQueueMock.markKickSessionSaved).toHaveBeenCalledWith(
      "user-123",
      session.startedAt,
    );
    // The session was NOT routed to the offline queue — it was saved directly.
    expect(mockEnqueueWatchKickSession).not.toHaveBeenCalled();
  });

  it("enqueues the session for retry when the in-flight save fails after the component has unmounted", async () => {
    // Deferred save that we will REJECT after the unmount.
    let rejectSave!: (err: Error) => void;
    mockApiDirectSaveKickSession.mockImplementation(
      () =>
        new Promise<void>((_res, rej) => {
          rejectSave = rej;
        }),
    );

    renderWatchListener();
    await act(async () => {});
    expect(capturedOnKickSessionEnd).toBeDefined();

    let handlerPromise!: Promise<void>;
    act(() => {
      handlerPromise = capturedOnKickSessionEnd!(session) as Promise<void>;
    });

    await act(async () => {
      for (let round = 0; round < 30; round++) {
        await Promise.resolve();
        if (mockApiDirectSaveKickSession.mock.calls.length >= 1) break;
      }
    });
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(1);

    // Unmount while the save is still pending, then fail the request.
    act(() => {
      listenerRenderer!.unmount();
    });
    listenerRenderer = null;

    await act(async () => {
      rejectSave(new Error("Network error — phone killed mid-delivery"));
      await handlerPromise;
      await flushMicrotasks();
    });

    // The failed save must still be enqueued for retry — not silently dropped.
    expect(mockEnqueueWatchKickSession).toHaveBeenCalledTimes(1);
    expect(mockEnqueueWatchKickSession).toHaveBeenCalledWith(
      {
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        kickCount: session.kickCount,
        watchSessionId: session.startedAt,
      },
      "user-123",
      0, // capturedGen from the mocked getWatchQueueGeneration
    );
  });
});
