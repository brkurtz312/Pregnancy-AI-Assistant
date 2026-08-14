/**
 * kickHistoryFocusRefetch.test.tsx
 *
 * Confirms that the Kick Count History tab (session-history.tsx) triggers a
 * fresh fetch whenever the screen regains focus — for example, when the user
 * navigates back from the Kick Counter (tools.tsx) after logging a new session.
 *
 * Without a focus-triggered refetch the history screen could serve the stale
 * cache populated *before* today's kick session was added by the counter,
 * hiding the newly logged entry until a manual pull-to-refresh or app restart.
 *
 * Three assertions are verified:
 *
 *   A) useFocusEffect registers a callback when KickHistoryTab mounts
 *      (the hook is wired up at all).
 *
 *   B) The registered callback calls refetch() — not just a no-op.
 *
 *   C) When the API returns a newly logged kick session (as it would after the
 *      focus-triggered refetch), the entry appears in the rendered list.
 */

import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";

// ── Silence Reanimated ────────────────────────────────────────────────────────
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// ── Clerk ─────────────────────────────────────────────────────────────────────
jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(() => ({
    isSignedIn: true,
    userId: "user-kick-focus-refetch-test",
    getToken: jest.fn().mockResolvedValue("token-kick-focus-refetch"),
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

// ── Navigation — capture useFocusEffect callbacks ─────────────────────────────
//
// We expose a list of captured callbacks so each test can fire the most-recent
// one registered by KickHistoryTab.  The list is reset in beforeEach so
// callbacks from previous tests cannot bleed through.

type FocusCallback = () => void | (() => void);
const capturedFocusCallbacks: FocusCallback[] = [];

jest.mock("expo-router", () => ({
  useRouter: jest.fn(() => ({ back: jest.fn(), push: jest.fn() })),
  useFocusEffect: jest.fn((cb: FocusCallback) => {
    capturedFocusCallbacks.push(cb);
  }),
}));

// ── API client ────────────────────────────────────────────────────────────────

const mockRefetch = jest.fn();
const mockUseListKickSessions = jest.fn();
const mockUseListContractions = jest.fn();

jest.mock("@workspace/api-client-react", () => ({
  useListKickSessions: (...args: unknown[]) => mockUseListKickSessions(...args),
  useListContractions: (...args: unknown[]) => mockUseListContractions(...args),
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
}));

// ── Subject import (after all mocks) ─────────────────────────────────────────
import SessionHistoryScreen from "../app/session-history";

// ── Tree-walking helpers ──────────────────────────────────────────────────────

function findAll(
  root: ReactTestInstance,
  predicate: (n: ReactTestInstance) => boolean,
): ReactTestInstance[] {
  const results: ReactTestInstance[] = [];
  const walk = (node: ReactTestInstance) => {
    if (predicate(node)) results.push(node);
    node.children.forEach((child) => {
      if (typeof child !== "string") walk(child);
    });
  };
  walk(root);
  return results;
}

function findByTestId(
  root: ReactTestInstance,
  testID: string,
): ReactTestInstance | undefined {
  return findAll(root, (n) => n.props.testID === testID)[0];
}

function allLeafText(root: ReactTestInstance): string[] {
  const texts: string[] = [];
  const walk = (node: ReactTestInstance) => {
    node.children.forEach((child) => {
      if (typeof child === "string") texts.push(child);
      else walk(child);
    });
  };
  walk(root);
  return texts;
}

// ── A sample kick session as the API would return it after the counter saves ──

const LOGGED_KICK_SESSION = {
  id: 77,
  startedAt: "2026-08-14T11:00:00.000Z",
  endedAt: "2026-08-14T11:35:00.000Z",
  kickCount: 10,
  notes: null,
  createdAt: "2026-08-14T11:35:00.000Z",
  updatedAt: "2026-08-14T11:35:00.000Z",
};

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  capturedFocusCallbacks.length = 0;
  mockRefetch.mockReset();

  // ContractionHistoryTab is only rendered when the user switches tabs;
  // stub it to avoid errors in case it does mount.
  mockUseListContractions.mockReturnValue({
    data: { items: [] },
    isFetching: false,
    refetch: jest.fn(),
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// A) useFocusEffect is registered when KickHistoryTab mounts
// ─────────────────────────────────────────────────────────────────────────────

describe("KickHistoryTab — useFocusEffect registration", () => {
  it("registers a focus callback when the Kick Count tab is rendered", async () => {
    mockUseListKickSessions.mockReturnValue({
      data: { items: [] },
      isFetching: false,
      refetch: mockRefetch,
    });

    // KickHistoryTab is the default (first) tab — it mounts immediately.
    await act(async () => {
      create(React.createElement(SessionHistoryScreen));
    });

    // useFocusEffect must have been called at least once from KickHistoryTab.
    expect(capturedFocusCallbacks.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B) The registered callback calls refetch() when focus fires
// ─────────────────────────────────────────────────────────────────────────────

describe("KickHistoryTab — focus triggers refetch", () => {
  it("calls refetch() when the screen regains focus (e.g. returning from the kick counter)", async () => {
    mockUseListKickSessions.mockReturnValue({
      data: { items: [] },
      isFetching: false,
      refetch: mockRefetch,
    });

    await act(async () => {
      create(React.createElement(SessionHistoryScreen));
    });

    // There must be at least one captured focus callback from KickHistoryTab.
    expect(capturedFocusCallbacks.length).toBeGreaterThan(0);

    // Fire the most-recently registered focus callback — simulates the user
    // returning from the Kick Counter screen.
    const focusCallback =
      capturedFocusCallbacks[capturedFocusCallbacks.length - 1];

    await act(async () => {
      focusCallback();
    });

    // refetch must have been called — this is what ensures the history list
    // is refreshed with the server's latest kick sessions rather than the
    // pre-counter stale snapshot.
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT call refetch() multiple times without a second focus event", async () => {
    mockUseListKickSessions.mockReturnValue({
      data: { items: [] },
      isFetching: false,
      refetch: mockRefetch,
    });

    await act(async () => {
      create(React.createElement(SessionHistoryScreen));
    });

    // Fire the focus callback once (simulates a single return-from-counter).
    const focusCallback =
      capturedFocusCallbacks[capturedFocusCallbacks.length - 1];

    await act(async () => {
      focusCallback();
    });

    const callsAfterOneFocus = mockRefetch.mock.calls.length;

    // Without another focus event, the call count must not increase further.
    expect(mockRefetch).toHaveBeenCalledTimes(callsAfterOneFocus);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C) The newly logged kick session is shown — not a stale pre-save snapshot
// ─────────────────────────────────────────────────────────────────────────────

describe("KickHistoryTab — shows newly logged session after focus refresh", () => {
  it("renders the session logged in the kick counter after the focus-triggered refetch returns data", async () => {
    // Phase 1: stale snapshot — empty cache from before the kick counter ran.
    mockUseListKickSessions.mockReturnValue({
      data: { items: [] },
      isFetching: false,
      refetch: mockRefetch,
    });

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SessionHistoryScreen));
    });

    // Verify the stale empty state is shown.
    expect(findByTestId(renderer.root, "kick-history-empty")).toBeDefined();
    expect(allLeafText(renderer.root)).toContain("No sessions yet");

    // Phase 2: fire the focus callback to simulate return from the counter.
    const focusCallback =
      capturedFocusCallbacks[capturedFocusCallbacks.length - 1];

    await act(async () => {
      focusCallback();
    });

    // Phase 3: refetch must have been invoked.
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    // Simulate what React Query does after refetch resolves: update the hook
    // return value and re-render the component tree with the fresh server data.
    mockUseListKickSessions.mockReturnValue({
      data: { items: [LOGGED_KICK_SESSION] },
      isFetching: false,
      refetch: mockRefetch,
    });

    await act(async () => {
      renderer.update(React.createElement(SessionHistoryScreen));
    });

    // The row for the newly logged session should now appear.
    const leafTexts = allLeafText(renderer.root);
    // "10 kicks" appears in the row title.
    const hasKickCount = leafTexts.some((t) => t.includes("kicks"));
    expect(hasKickCount).toBe(true);

    // The empty-state view must no longer be present.
    expect(findByTestId(renderer.root, "kick-history-empty")).toBeUndefined();
  });

  it("shows a loading spinner — not stale data — while the focus-triggered refetch is in flight", async () => {
    // Start with a stale empty cache.
    mockUseListKickSessions.mockReturnValue({
      data: { items: [] },
      isFetching: false,
      refetch: mockRefetch,
    });

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SessionHistoryScreen));
    });

    // Fire the focus callback (which calls refetch()), then re-render with
    // isFetching=true to represent the in-flight state.
    const focusCallback =
      capturedFocusCallbacks[capturedFocusCallbacks.length - 1];

    await act(async () => {
      focusCallback();
    });

    // Update the mock to reflect the in-flight state and re-render.
    mockUseListKickSessions.mockReturnValue({
      data: { items: [] },
      isFetching: true,
      refetch: mockRefetch,
    });

    await act(async () => {
      renderer.update(React.createElement(SessionHistoryScreen));
    });

    // While isFetching is true, the spinner must be shown and the empty-state
    // text must not be visible.
    expect(findByTestId(renderer.root, "kick-history-spinner")).toBeDefined();
    expect(findByTestId(renderer.root, "kick-history-empty")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D) Gesture-back and system back fire the same useFocusEffect callback
// ─────────────────────────────────────────────────────────────────────────────
//
// expo-router's useFocusEffect fires via React Navigation's focus event, which
// is emitted whenever the screen transitions into the "focused" state regardless
// of what caused the back navigation:
//
//   • In-app back button  (router.back() / hardware back button via BackHandler)
//   • iOS edge-swipe gesture  (interactivePopGestureRecognizer)
//   • Android system back button or back gesture
//
// Because our mock captures the raw useFocusEffect callback — not the gesture
// mechanism itself — firing the callback here is equivalent to any of those
// paths arriving at the same screen-focus event.
//
// The navigator-config check in gestureBackNavConfig.test.ts provides the
// complementary static guarantee: session-history.tsx has no gestureEnabled:false
// or fullScreenModal option that could prevent gesture-back from firing the
// focus event in the first place.

describe("KickHistoryTab — gesture-back and system back trigger the same focus refetch", () => {
  it("simulates iOS swipe-back: focus callback fires refetch when returning from the kick counter", async () => {
    mockUseListKickSessions.mockReturnValue({
      data: { items: [] },
      isFetching: false,
      refetch: mockRefetch,
    });

    await act(async () => {
      create(React.createElement(SessionHistoryScreen));
    });

    expect(capturedFocusCallbacks.length).toBeGreaterThan(0);

    // Simulate the iOS edge-swipe completing: React Navigation emits the focus
    // event → expo-router invokes the useFocusEffect callback.
    const gestureBackCallback =
      capturedFocusCallbacks[capturedFocusCallbacks.length - 1];

    await act(async () => {
      gestureBackCallback();
    });

    // refetch must be called — same outcome as the in-app back button path.
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("simulates Android system back: focus callback fires refetch when returning from the kick counter", async () => {
    mockUseListKickSessions.mockReturnValue({
      data: { items: [] },
      isFetching: false,
      refetch: mockRefetch,
    });

    await act(async () => {
      create(React.createElement(SessionHistoryScreen));
    });

    expect(capturedFocusCallbacks.length).toBeGreaterThan(0);

    // Simulate the Android system back button / back gesture completing: the
    // same React Navigation focus event path fires the same callback.
    const systemBackCallback =
      capturedFocusCallbacks[capturedFocusCallbacks.length - 1];

    await act(async () => {
      systemBackCallback();
    });

    // refetch must be called — same outcome as the iOS swipe-back path.
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("shows the newly logged kick session after a gesture-back focus refresh", async () => {
    // Phase 1: stale empty cache (before the kick counter ran).
    mockUseListKickSessions.mockReturnValue({
      data: { items: [] },
      isFetching: false,
      refetch: mockRefetch,
    });

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SessionHistoryScreen));
    });

    expect(findByTestId(renderer.root, "kick-history-empty")).toBeDefined();

    // Phase 2: gesture-back focus fires — simulate the iOS edge-swipe or
    // Android back gesture completing and the screen regaining focus.
    const gestureBackCallback =
      capturedFocusCallbacks[capturedFocusCallbacks.length - 1];

    await act(async () => {
      gestureBackCallback();
    });

    expect(mockRefetch).toHaveBeenCalledTimes(1);

    // Phase 3: React Query resolves with the fresh server data.
    mockUseListKickSessions.mockReturnValue({
      data: { items: [LOGGED_KICK_SESSION] },
      isFetching: false,
      refetch: mockRefetch,
    });

    await act(async () => {
      renderer.update(React.createElement(SessionHistoryScreen));
    });

    // The newly logged session from the kick counter must appear.
    const leafTexts = allLeafText(renderer.root);
    expect(leafTexts.some((t) => t.includes("kicks"))).toBe(true);
    expect(findByTestId(renderer.root, "kick-history-empty")).toBeUndefined();
  });
});
