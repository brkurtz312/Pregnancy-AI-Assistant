/**
 * watchKickSync.test.tsx
 *
 * Verifies that when the Apple Watch fires onKickSessionEnd or
 * onContractionUpdate, the ToolsScreen:
 *   1. Persists the record via the create mutation
 *   2. Calls refetch so the list updates without a manual refresh
 */

import React from "react";
import { act, create } from "react-test-renderer";

// ── Silence Reanimated in the test environment ────────────────────────────────
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// ── Navigation / icons ────────────────────────────────────────────────────────
jest.mock("@clerk/expo", () => ({
  useUser: jest.fn(),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium", Heavy: "Heavy" },
  NotificationFeedbackType: { Success: "Success" },
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/lib/haptics", () => ({
  impact: jest.fn(),
  notification: jest.fn(),
}));

jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#fff",
    card: "#fff",
    border: "#eee",
    primary: "#ff69b4",
    primaryForeground: "#fff",
    foreground: "#000",
    mutedForeground: "#666",
    muted: "#f5f5f5",
    accent: "#f0f0f0",
    destructive: "#e00",
  }),
}));

jest.mock("@/lib/pregnancy-math", () => ({
  calculateByDueDate: jest.fn(() => ({ currentGestationalAgeWeeks: 20 })),
}));

jest.mock("@/components/ResponsiveContainer", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ResponsiveContainer: ({ children }: { children: any }) => children,
}));

// ── API hooks ────────────────────────────────────────────────────────────────
// Each mutation/refetch stub is declared at module scope so tests can inspect calls.
const mockKickMutateAsync = jest.fn().mockResolvedValue({ id: 99 });
const mockRefetchKickSessions = jest.fn().mockResolvedValue(undefined);
const mockContractionMutateAsync = jest.fn().mockResolvedValue({ id: 77 });
const mockRefetchContractions = jest.fn().mockResolvedValue(undefined);

jest.mock("@workspace/api-client-react", () => ({
  useListSymptoms: jest.fn(() => ({
    data: undefined,
    isLoading: false,
    refetch: jest.fn(),
  })),
  useCreateSymptom: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
  useDeleteSymptom: jest.fn(() => ({ mutateAsync: jest.fn() })),
  useListKickSessions: jest.fn(() => ({
    data: undefined,
    isLoading: false,
    refetch: mockRefetchKickSessions,
  })),
  useCreateKickSession: jest.fn(() => ({
    mutateAsync: mockKickMutateAsync,
    isPending: false,
  })),
  useUpdateKickSession: jest.fn(() => ({ mutateAsync: jest.fn() })),
  useDeleteKickSession: jest.fn(() => ({ mutateAsync: jest.fn() })),
  useListContractions: jest.fn(() => ({
    data: undefined,
    isLoading: false,
    refetch: mockRefetchContractions,
  })),
  useCreateContraction: jest.fn(() => ({
    mutateAsync: mockContractionMutateAsync,
    isPending: false,
  })),
  useDeleteContraction: jest.fn(() => ({ mutateAsync: jest.fn() })),
  useGetProfile: jest.fn(() => ({ data: undefined })),
  getGetProfileQueryKey: jest.fn(() => ["profile"]),
}));

// ── Watch connectivity ───────────────────────────────────────────────────────
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
      return { pushTips: jest.fn(), isSupported: true };
    },
  ),
}));

// ── Imports (after all mocks) ─────────────────────────────────────────────────
import { useUser } from "@clerk/expo";
import ToolsScreen from "../app/(tabs)/tools";

const mockUseUser = useUser as jest.Mock;

function renderSignedIn() {
  mockUseUser.mockReturnValue({ isSignedIn: true });
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(ToolsScreen));
  });
  return renderer;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("ToolsScreen — Watch → Tools sync (no manual refresh)", () => {
  beforeEach(() => {
    capturedOnKickSessionEnd = undefined;
    capturedOnContractionUpdate = undefined;
    jest.clearAllMocks();
    // Re-apply the mock return values cleared by clearAllMocks
    mockUseUser.mockReturnValue({ isSignedIn: true });
    const apiMock = require("@workspace/api-client-react");
    apiMock.useCreateKickSession.mockReturnValue({
      mutateAsync: mockKickMutateAsync,
      isPending: false,
    });
    apiMock.useListKickSessions.mockReturnValue({
      data: undefined,
      isLoading: false,
      refetch: mockRefetchKickSessions,
    });
    apiMock.useCreateContraction.mockReturnValue({
      mutateAsync: mockContractionMutateAsync,
      isPending: false,
    });
    apiMock.useListContractions.mockReturnValue({
      data: undefined,
      isLoading: false,
      refetch: mockRefetchContractions,
    });
    apiMock.useListSymptoms.mockReturnValue({
      data: undefined,
      isLoading: false,
      refetch: jest.fn(),
    });
    apiMock.useCreateSymptom.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
    apiMock.useDeleteSymptom.mockReturnValue({ mutateAsync: jest.fn() });
    apiMock.useUpdateKickSession.mockReturnValue({ mutateAsync: jest.fn() });
    apiMock.useDeleteKickSession.mockReturnValue({ mutateAsync: jest.fn() });
    apiMock.useDeleteContraction.mockReturnValue({ mutateAsync: jest.fn() });
    apiMock.useGetProfile.mockReturnValue({ data: undefined });
    apiMock.getGetProfileQueryKey.mockReturnValue(["profile"]);
    mockKickMutateAsync.mockResolvedValue({ id: 99 });
    mockRefetchKickSessions.mockResolvedValue(undefined);
    mockContractionMutateAsync.mockResolvedValue({ id: 77 });
    mockRefetchContractions.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── Kick session ────────────────────────────────────────────────────────────

  it("registers an onKickSessionEnd callback with useWatchConnectivity", async () => {
    renderSignedIn();
    await act(async () => {});

    expect(capturedOnKickSessionEnd).toBeDefined();
    expect(typeof capturedOnKickSessionEnd).toBe("function");
  });

  it("calls createKickSession when the watch fires onKickSessionEnd", async () => {
    renderSignedIn();
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

  it("calls refetchKickSessions after persisting the watch kick session", async () => {
    renderSignedIn();
    await act(async () => {});

    const session = {
      kickCount: 5,
      startedAt: "2026-08-01T11:00:00.000Z",
      endedAt: "2026-08-01T11:20:00.000Z",
    };

    await act(async () => {
      await capturedOnKickSessionEnd!(session);
    });

    // refetch must be called so the list updates without a manual pull-to-refresh
    expect(mockRefetchKickSessions).toHaveBeenCalledTimes(1);
  });

  it("calls refetchKickSessions even for a zero-kick watch session", async () => {
    renderSignedIn();
    await act(async () => {});

    await act(async () => {
      await capturedOnKickSessionEnd!({
        kickCount: 0,
        startedAt: "2026-08-01T09:00:00.000Z",
        endedAt: "2026-08-01T09:05:00.000Z",
      });
    });

    expect(mockKickMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockRefetchKickSessions).toHaveBeenCalledTimes(1);
  });

  // ── Contraction update ───────────────────────────────────────────────────────

  it("registers an onContractionUpdate callback with useWatchConnectivity", async () => {
    renderSignedIn();
    await act(async () => {});

    expect(capturedOnContractionUpdate).toBeDefined();
    expect(typeof capturedOnContractionUpdate).toBe("function");
  });

  it("calls createContraction when the watch fires onContractionUpdate", async () => {
    renderSignedIn();
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

  it("calls refetchContractions after persisting the watch contraction", async () => {
    renderSignedIn();
    await act(async () => {});

    await act(async () => {
      await capturedOnContractionUpdate!({
        startedAt: "2026-08-01T15:00:00.000Z",
        endedAt: "2026-08-01T15:01:00.000Z",
        interval: 240,
      });
    });

    // list must refresh automatically — no manual pull required
    expect(mockRefetchContractions).toHaveBeenCalledTimes(1);
  });

  it("handles a contraction record without an interval field", async () => {
    renderSignedIn();
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
    expect(call.data.durationSeconds).toBe(90);
    expect(call.data.intervalSeconds).toBeUndefined();
    expect(mockRefetchContractions).toHaveBeenCalledTimes(1);
  });
});
