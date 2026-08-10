/**
 * watchStorageFullFallback.test.tsx
 *
 * Verifies that when AsyncStorage is full (or otherwise unavailable) and the
 * offline-queue write fails, WatchBackgroundListener shows an actionable toast
 * ("Couldn't save — please log it manually in the app") rather than silently
 * dropping the data.
 *
 * Scenario
 * ────────
 * 1. The API save fails (device offline / server error).
 * 2. The fallback enqueueWatchKickSession / enqueueWatchContraction also rejects
 *    (storage quota exceeded, first install with no storage, etc.).
 * 3. The component must show a toast that tells the user to log the data
 *    manually — not a silent failure.
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

// ── Safe-area ─────────────────────────────────────────────────────────────────
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// ── Haptics ───────────────────────────────────────────────────────────────────
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium", Heavy: "Heavy" },
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
const mockGetQueryData = jest.fn().mockReturnValue(undefined);

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: jest.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
    getQueryData: mockGetQueryData,
  })),
}));

// ── API client hooks ──────────────────────────────────────────────────────────
jest.mock("@workspace/api-client-react", () => ({
  useCreateKickSession: jest.fn(() => ({
    mutateAsync: jest.fn().mockResolvedValue({ id: 1 }),
    isPending: false,
  })),
  useCreateContraction: jest.fn(() => ({
    mutateAsync: jest.fn().mockResolvedValue({ id: 2 }),
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
  useListKickSessions: jest.fn(() => ({
    data: { items: [] },
    isLoading: false,
    refetch: jest.fn(),
  })),
  useListContractions: jest.fn(() => ({
    data: { items: [] },
    isLoading: false,
    refetch: jest.fn(),
  })),
  useGetProfile: jest.fn(() => ({ data: null, isLoading: false })),
  getGetProfileQueryKey: jest.fn(() => ["profile"]),
  getListKickSessionsQueryKey: jest.fn((p) => ["kick-sessions", p]),
  getListContractionsQueryKey: jest.fn((p) => ["contractions", p]),
}));

// ── Sync API (direct Watch saves) ─────────────────────────────────────────────
// Both direct saves fail to simulate the device being offline / server error.
const mockApiDirectSaveKickSession = jest
  .fn()
  .mockRejectedValue(new Error("Network request failed"));
const mockApiDirectSaveContraction = jest
  .fn()
  .mockRejectedValue(new Error("Network request failed"));

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
// Queue writes also fail — simulating AsyncStorage full / unavailable.
const mockEnqueueWatchKickSession = jest
  .fn()
  .mockRejectedValue(new Error("AsyncStorage is full"));
const mockEnqueueWatchContraction = jest
  .fn()
  .mockRejectedValue(new Error("AsyncStorage is full"));

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
let capturedOnKickSessionEnd: ((s: unknown) => Promise<void>) | undefined;
let capturedOnContractionUpdate: ((r: unknown) => Promise<void>) | undefined;

jest.mock("@/hooks/useWatchConnectivity", () => ({
  useWatchConnectivity: jest.fn(
    (opts: {
      onKickSessionEnd?: (s: unknown) => Promise<void>;
      onContractionUpdate?: (r: unknown) => Promise<void>;
      onKickUpdate?: (count: number) => void;
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

// ── Imports (after all mocks) ─────────────────────────────────────────────────
import { useAuth } from "@clerk/expo";
import { WatchBackgroundListener } from "../components/WatchBackgroundListener";

const mockUseAuth = useAuth as jest.Mock;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the text content from the rendered WatchToast element by walking
 * the JSON tree produced by react-test-renderer.
 */
function findToastText(instance: ReturnType<typeof create>): string | null {
  const json = instance.toJSON();
  if (!json) return null;
  const nodes = Array.isArray(json) ? json : [json];

  function walk(node: unknown): string | null {
    if (!node || typeof node !== "object") return null;
    const n = node as {
      type?: string;
      props?: Record<string, unknown>;
      children?: unknown[];
    };
    if (n.type === "Text" && Array.isArray(n.children)) {
      const text = n.children.join("");
      if (text.length > 0) return text;
    }
    if (Array.isArray(n.children)) {
      for (const child of n.children) {
        const found = walk(child);
        if (found) return found;
      }
    }
    return null;
  }

  for (const node of nodes) {
    const found = walk(node);
    if (found) return found;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("WatchBackgroundListener — storage-full fallback toast", () => {
  let listenerRenderer: ReturnType<typeof create> | null = null;

  function renderWatchListener() {
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-storage-test",
      getToken: jest.fn().mockResolvedValue("token-abc"),
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

    // API saves fail (offline / server error).
    mockApiDirectSaveKickSession.mockRejectedValue(
      new Error("Network request failed"),
    );
    mockApiDirectSaveContraction.mockRejectedValue(
      new Error("Network request failed"),
    );
    // Queue writes also fail (storage full).
    mockEnqueueWatchKickSession.mockRejectedValue(
      new Error("AsyncStorage is full"),
    );
    mockEnqueueWatchContraction.mockRejectedValue(
      new Error("AsyncStorage is full"),
    );

    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-storage-test",
      getToken: jest.fn().mockResolvedValue("token-abc"),
    });
    mockInvalidateQueries.mockResolvedValue(undefined);
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

  // ── Kick session ─────────────────────────────────────────────────────────────

  it("attempts to enqueue locally when the API save fails", async () => {
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnKickSessionEnd).toBeDefined();

    await act(async () => {
      await capturedOnKickSessionEnd!({
        kickCount: 5,
        startedAt: "2026-08-10T08:00:00.000Z",
        endedAt: "2026-08-10T08:30:00.000Z",
      });
    });

    // The queue write must have been attempted after the API save failed.
    expect(mockEnqueueWatchKickSession).toHaveBeenCalledTimes(1);
  });

  it("shows the manual-log fallback toast when enqueueWatchKickSession rejects", async () => {
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnKickSessionEnd).toBeDefined();

    await act(async () => {
      await capturedOnKickSessionEnd!({
        kickCount: 5,
        startedAt: "2026-08-10T08:00:00.000Z",
        endedAt: "2026-08-10T08:30:00.000Z",
      });
    });

    // The toast must tell the user to log manually — not show a generic error
    // or remain silent.
    const toastText = findToastText(listenerRenderer!);
    expect(toastText).not.toBeNull();
    expect(toastText?.toLowerCase()).toContain("manually");
  });

  it("does not show the 'saved locally' toast when the queue write fails", async () => {
    renderWatchListener();
    await act(async () => {});

    await act(async () => {
      await capturedOnKickSessionEnd!({
        kickCount: 3,
        startedAt: "2026-08-10T09:00:00.000Z",
        endedAt: "2026-08-10T09:15:00.000Z",
      });
    });

    // The "saved locally" success path must NOT appear — storage is full so
    // we never successfully queued the item.
    const toastText = findToastText(listenerRenderer!);
    expect(toastText?.toLowerCase()).not.toContain("saved locally");
    expect(toastText?.toLowerCase()).not.toContain("will sync");
  });

  it("does not invalidate the query cache when both save and queue fail", async () => {
    renderWatchListener();
    await act(async () => {});

    await act(async () => {
      await capturedOnKickSessionEnd!({
        kickCount: 7,
        startedAt: "2026-08-10T10:00:00.000Z",
        endedAt: "2026-08-10T10:20:00.000Z",
      });
    });

    // No data was persisted, so invalidating the cache would be wrong —
    // the user would see a stale or empty list while thinking the session saved.
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  // ── Contraction update ───────────────────────────────────────────────────────

  it("attempts to enqueue locally when the contraction API save fails", async () => {
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnContractionUpdate).toBeDefined();

    await act(async () => {
      await capturedOnContractionUpdate!({
        startedAt: "2026-08-10T11:00:00.000Z",
        endedAt: "2026-08-10T11:01:00.000Z",
        interval: 300,
      });
    });

    expect(mockEnqueueWatchContraction).toHaveBeenCalledTimes(1);
  });

  it("shows the manual-log fallback toast when enqueueWatchContraction rejects", async () => {
    renderWatchListener();
    await act(async () => {});

    expect(capturedOnContractionUpdate).toBeDefined();

    await act(async () => {
      await capturedOnContractionUpdate!({
        startedAt: "2026-08-10T11:00:00.000Z",
        endedAt: "2026-08-10T11:01:00.000Z",
        interval: 300,
      });
    });

    const toastText = findToastText(listenerRenderer!);
    expect(toastText).not.toBeNull();
    expect(toastText?.toLowerCase()).toContain("manually");
  });

  it("does not show 'saved locally' toast when contraction queue write fails", async () => {
    renderWatchListener();
    await act(async () => {});

    await act(async () => {
      await capturedOnContractionUpdate!({
        startedAt: "2026-08-10T12:00:00.000Z",
        endedAt: "2026-08-10T12:01:10.000Z",
        interval: 360,
      });
    });

    const toastText = findToastText(listenerRenderer!);
    expect(toastText?.toLowerCase()).not.toContain("saved locally");
    expect(toastText?.toLowerCase()).not.toContain("will sync");
  });

  // ── Queue-success path is not affected ───────────────────────────────────────

  it("shows 'saved locally — will sync' when the API fails but queue write succeeds", async () => {
    // Override: API still fails but queue write succeeds this time.
    mockEnqueueWatchKickSession.mockResolvedValue(undefined);

    renderWatchListener();
    await act(async () => {});

    await act(async () => {
      await capturedOnKickSessionEnd!({
        kickCount: 4,
        startedAt: "2026-08-10T13:00:00.000Z",
        endedAt: "2026-08-10T13:20:00.000Z",
      });
    });

    const toastText = findToastText(listenerRenderer!);
    expect(toastText).not.toBeNull();
    expect(toastText?.toLowerCase()).toContain("saved locally");
  });
});
