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

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: jest.fn(() => ({ invalidateQueries: mockInvalidateQueries })),
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
import { useAuth } from "@clerk/expo";
import { WatchBackgroundListener } from "../components/WatchBackgroundListener";
import { KickCounterSection } from "../app/(tabs)/tools";

const mockUseAuth = useAuth as jest.Mock;

function renderWatchListener() {
  mockUseAuth.mockReturnValue({ isSignedIn: true });
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(WatchBackgroundListener));
  });
  return renderer;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("WatchBackgroundListener — Watch → Tools sync (no manual refresh)", () => {
  beforeEach(() => {
    capturedOnKickSessionEnd = undefined;
    capturedOnContractionUpdate = undefined;
    jest.clearAllMocks();
    // Re-apply the mock return values cleared by clearAllMocks
    mockUseAuth.mockReturnValue({ isSignedIn: true });
    mockInvalidateQueries.mockResolvedValue(undefined);
    mockKickMutateAsync.mockResolvedValue({ id: 99 });
    mockContractionMutateAsync.mockResolvedValue({ id: 77 });
    const apiMock = require("@workspace/api-client-react");
    apiMock.useCreateKickSession.mockReturnValue({
      mutateAsync: mockKickMutateAsync,
      isPending: false,
    });
    apiMock.useCreateContraction.mockReturnValue({
      mutateAsync: mockContractionMutateAsync,
      isPending: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── Kick session ────────────────────────────────────────────────────────────

  it("registers an onKickSessionEnd callback with useWatchConnectivity", async () => {
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnKickSessionEnd).toBeDefined();
    expect(typeof capturedOnKickSessionEnd).toBe("function");
  });

  it("calls createKickSession when the watch fires onKickSessionEnd", async () => {
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

    expect(mockKickMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockKickMutateAsync).toHaveBeenCalledWith({
      data: {
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        kickCount: session.kickCount,
      },
    });
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

    expect(mockKickMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
  });

  // ── Contraction update ───────────────────────────────────────────────────────

  it("registers an onContractionUpdate callback with useWatchConnectivity", async () => {
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnContractionUpdate).toBeDefined();
    expect(typeof capturedOnContractionUpdate).toBe("function");
  });

  it("calls createContraction when the watch fires onContractionUpdate", async () => {
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

    expect(mockContractionMutateAsync).toHaveBeenCalledTimes(1);
    const call = mockContractionMutateAsync.mock.calls[0][0];
    expect(call.data.startedAt).toBe(record.startedAt);
    expect(call.data.endedAt).toBe(record.endedAt);
    expect(call.data.durationSeconds).toBe(70);
    expect(call.data.intervalSeconds).toBe(300);
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

    expect(mockContractionMutateAsync).toHaveBeenCalledTimes(1);
    const call = mockContractionMutateAsync.mock.calls[0][0];
    expect(call.data.intervalSeconds).toBeUndefined();
    expect(call.data.durationSeconds).toBe(90);
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

    mockUseAuth.mockReturnValue({ isSignedIn: true });
    mockInvalidateQueries.mockResolvedValue(undefined);
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

  it("Watch createKickSession and phone updateKickSession both complete when fired with deferred overlap", async () => {
    const { endBtn } = await setupBothComponents();

    // Arm deferred mutations so both operations are in-flight simultaneously
    let resolveWatchCreate!: (v: unknown) => void;
    let resolvePhoneUpdate!: (v: unknown) => void;

    mockKickMutateAsync.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveWatchCreate = r;
        }),
    );
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

    // Start both operations — neither has resolved yet (deferred promises)
    const watchDone = capturedOnKickSessionEnd!(watchSession);
    act(() => {
      // onPress kicks off async handleEndSession; the mutation is deferred
      endBtn.props.onPress();
    });

    // Resolve both mutations concurrently, as real timing would
    act(() => {
      resolveWatchCreate({ id: 100 });
      resolvePhoneUpdate({ id: 42 });
    });

    await act(async () => {
      await watchDone;
    });

    // Watch path: createKickSession persisted the Watch-recorded session
    // (second call — the first was for "Start Counting")
    expect(mockKickMutateAsync).toHaveBeenCalledTimes(2);
    expect(mockKickMutateAsync).toHaveBeenLastCalledWith({
      data: {
        startedAt: watchSession.startedAt,
        endedAt: watchSession.endedAt,
        kickCount: watchSession.kickCount,
      },
    });

    // Phone path: updateKickSession finalised the active phone session
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
