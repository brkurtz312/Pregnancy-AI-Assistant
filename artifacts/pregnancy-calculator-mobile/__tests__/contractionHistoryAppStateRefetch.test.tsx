/**
 * contractionHistoryAppStateRefetch.test.tsx
 *
 * Confirms that ContractionHistoryTab (and KickHistoryTab) in session-history.tsx
 * call refetch() when the app transitions from background back to "active" via
 * AppState — a path where useFocusEffect does NOT fire because the screen was
 * already focused before the app was backgrounded.
 *
 * Two assertions are verified:
 *
 *   A) ContractionHistoryTab calls refetch() on an AppState "active" event.
 *
 *   B) KickHistoryTab calls refetch() on an AppState "active" event.
 */

import React from "react";
import { act, create } from "react-test-renderer";

// ── Silence Reanimated ────────────────────────────────────────────────────────
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// ── Clerk ─────────────────────────────────────────────────────────────────────
jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(() => ({
    isSignedIn: true,
    userId: "user-appstate-refetch-test",
    getToken: jest.fn().mockResolvedValue("token-appstate-refetch"),
  })),
}));

// ── Icons ─────────────────────────────────────────────────────────────────────
jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

// ── Safe area ─────────────────────────────────────────────────────────────────
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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

// ── AppState — capture addEventListener so tests can fire state changes ────────
//
// We intercept AppState.addEventListener to collect the listener callbacks.
// Tests call simulateAppStateChange("active") to fire them, mirroring the OS
// transition that happens when the user returns from background.

type AppStateListener = (nextState: string) => void;
const appStateListeners: AppStateListener[] = [];

function simulateAppStateChange(nextState: string) {
  for (const listener of appStateListeners) {
    listener(nextState);
  }
}

// react-native is auto-mocked in jest by jest-expo; we patch AppState on the
// real module after import so the component code gets the patched version.
import { AppState } from "react-native";

// Replace addEventListener with our capturing version before any component
// renders.  The mock returns a subscription object with a remove() no-op to
// match the real API.
const originalAddEventListener = AppState.addEventListener.bind(AppState);
beforeAll(() => {
  (
    AppState as unknown as {
      addEventListener: typeof AppState.addEventListener;
    }
  ).addEventListener = jest.fn((event: string, handler: AppStateListener) => {
    if (event === "change") appStateListeners.push(handler);
    return { remove: jest.fn() };
  }) as unknown as typeof AppState.addEventListener;
});

afterAll(() => {
  (
    AppState as unknown as {
      addEventListener: typeof AppState.addEventListener;
    }
  ).addEventListener =
    originalAddEventListener as unknown as typeof AppState.addEventListener;
});

// ── Navigation — useFocusEffect no-op for these tests ────────────────────────
jest.mock("expo-router", () => ({
  useRouter: jest.fn(() => ({ back: jest.fn(), push: jest.fn() })),
  useFocusEffect: jest.fn((_cb: () => void) => {
    // Do not fire the focus callback; we only want to test AppState triggers.
  }),
}));

// ── API client ────────────────────────────────────────────────────────────────

const mockContractionRefetch = jest.fn();
const mockKickRefetch = jest.fn();
const mockUseListContractions = jest.fn();
const mockUseListKickSessions = jest.fn();

jest.mock("@workspace/api-client-react", () => ({
  useListContractions: (...args: unknown[]) => mockUseListContractions(...args),
  useListKickSessions: (...args: unknown[]) => mockUseListKickSessions(...args),
  useDeleteContractionSession: jest.fn(() => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
  })),
  useDeleteKickSession: jest.fn(() => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
  })),
  useUpdateKickSession: jest.fn(() => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
  })),
}));

// ── Subject import (after all mocks) ─────────────────────────────────────────
import SessionHistoryScreen from "../app/session-history";
import type { ReactTestInstance } from "react-test-renderer";

// ── Tree-walking helper ───────────────────────────────────────────────────────

function findByTestId(
  root: ReactTestInstance,
  testID: string,
): ReactTestInstance | undefined {
  const walk = (node: ReactTestInstance): ReactTestInstance | undefined => {
    if (node.props.testID === testID) return node;
    for (const child of node.children) {
      if (typeof child !== "string") {
        const found = walk(child);
        if (found) return found;
      }
    }
    return undefined;
  };
  return walk(root);
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  appStateListeners.length = 0;
  mockContractionRefetch.mockReset();
  mockKickRefetch.mockReset();

  mockUseListContractions.mockReturnValue({
    data: { items: [] },
    isFetching: false,
    refetch: mockContractionRefetch,
  });

  mockUseListKickSessions.mockReturnValue({
    data: { items: [] },
    isFetching: false,
    refetch: mockKickRefetch,
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// A) ContractionHistoryTab — AppState "active" triggers refetch
// ─────────────────────────────────────────────────────────────────────────────

describe("ContractionHistoryTab — AppState active triggers refetch", () => {
  it("calls refetch() when AppState changes to 'active' while the Contractions tab is mounted", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SessionHistoryScreen));
    });

    // Switch to the Contractions tab so ContractionHistoryTab mounts and
    // registers its AppState listener.
    const tabBtn = findByTestId(renderer.root, "tab-btn-contractions");
    expect(tabBtn).toBeDefined();
    await act(async () => {
      tabBtn!.props.onPress();
    });

    // AppState listener must have been registered.
    expect(appStateListeners.length).toBeGreaterThan(0);
    const callsBefore = mockContractionRefetch.mock.calls.length;

    // Simulate the OS signalling that the app returned from background.
    await act(async () => {
      simulateAppStateChange("active");
    });

    // refetch() must have been called at least once more than before.
    expect(mockContractionRefetch.mock.calls.length).toBeGreaterThan(
      callsBefore,
    );
  });

  it("does NOT call refetch() for non-active AppState transitions (e.g. 'background')", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SessionHistoryScreen));
    });

    const tabBtn = findByTestId(renderer.root, "tab-btn-contractions");
    await act(async () => {
      tabBtn!.props.onPress();
    });

    mockContractionRefetch.mockClear();

    await act(async () => {
      simulateAppStateChange("background");
    });

    // Going to background must not trigger a refetch.
    expect(mockContractionRefetch).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B) KickHistoryTab — AppState "active" triggers refetch
// ─────────────────────────────────────────────────────────────────────────────

describe("KickHistoryTab — AppState active triggers refetch", () => {
  it("calls refetch() when AppState changes to 'active' while the Kicks tab is mounted", async () => {
    await act(async () => {
      create(React.createElement(SessionHistoryScreen));
    });

    // Kicks tab is the default — KickHistoryTab is already mounted.
    expect(appStateListeners.length).toBeGreaterThan(0);
    const callsBefore = mockKickRefetch.mock.calls.length;

    await act(async () => {
      simulateAppStateChange("active");
    });

    expect(mockKickRefetch.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("does NOT call refetch() for non-active AppState transitions", async () => {
    await act(async () => {
      create(React.createElement(SessionHistoryScreen));
    });

    mockKickRefetch.mockClear();
    // renderer not needed — we only need the AppState listener to be registered

    await act(async () => {
      simulateAppStateChange("inactive");
    });

    expect(mockKickRefetch).not.toHaveBeenCalled();
  });
});
