/**
 * watchKickSync.test.tsx
 *
 * Verifies that when the Apple Watch fires onKickSessionEnd or
 * onContractionUpdate, the WatchBackgroundListener:
 *   1. Persists the record via the create mutation
 *   2. Invalidates the relevant React Query caches so the Tools tab sees
 *      fresh data next time it mounts (no manual refresh needed)
 */

import React from "react";
import { act, create } from "react-test-renderer";

// ── Silence Reanimated in the test environment ────────────────────────────────
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// ── Navigation / icons ────────────────────────────────────────────────────────
jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(),
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

// ── React Query ───────────────────────────────────────────────────────────────
const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: jest.fn(() => ({ invalidateQueries: mockInvalidateQueries })),
}));

// ── API hooks ────────────────────────────────────────────────────────────────
const mockKickMutateAsync = jest.fn().mockResolvedValue({ id: 99 });
const mockContractionMutateAsync = jest.fn().mockResolvedValue({ id: 77 });

jest.mock("@workspace/api-client-react", () => ({
  useCreateKickSession: jest.fn(() => ({
    mutateAsync: mockKickMutateAsync,
    isPending: false,
  })),
  useCreateContraction: jest.fn(() => ({
    mutateAsync: mockContractionMutateAsync,
    isPending: false,
  })),
  getListKickSessionsQueryKey: jest.fn((p) => ["kick-sessions", p]),
  getListContractionsQueryKey: jest.fn((p) => ["contractions", p]),
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

function renderSignedIn() {
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

  it("invalidates kick-session cache after persisting the watch kick session", async () => {
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

    // Query cache must be invalidated so Tools tab fetches fresh data
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("invalidates kick-session cache even for a zero-kick watch session", async () => {
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
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
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

  it("invalidates contraction cache after persisting the watch contraction", async () => {
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
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
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
    expect(call.data.intervalSeconds).toBeUndefined();
    expect(call.data.durationSeconds).toBe(90);
  });
});
