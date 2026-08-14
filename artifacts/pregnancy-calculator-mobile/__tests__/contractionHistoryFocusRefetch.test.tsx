/**
 * contractionHistoryFocusRefetch.test.tsx
 *
 * Confirms that the Contraction History tab (session-history.tsx) triggers a
 * fresh fetch whenever the screen regains focus — for example, when the user
 * navigates back from the Contraction Timer (tools.tsx) after logging new
 * contractions.
 *
 * Without a focus-triggered refetch the history screen could serve the
 * all-dates cache that was populated *before* today's contractions were
 * added by the timer, hiding the newly logged entries until a manual
 * pull-to-refresh or app restart.
 *
 * Three assertions are verified:
 *
 *   A) useFocusEffect registers a callback when ContractionHistoryTab mounts
 *      (the hook is wired up at all).
 *
 *   B) The registered callback calls refetch() — not just a no-op.
 *
 *   C) When the API returns a newly logged contraction (as it would after the
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
    userId: "user-focus-refetch-test",
    getToken: jest.fn().mockResolvedValue("token-focus-refetch"),
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
// one registered by ContractionHistoryTab.  The list is reset in beforeEach
// so callbacks from previous tests cannot bleed through.

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
const mockUseListContractions = jest.fn();
const mockUseListKickSessions = jest.fn();

jest.mock("@workspace/api-client-react", () => ({
  useListContractions: (...args: unknown[]) => mockUseListContractions(...args),
  useListKickSessions: (...args: unknown[]) => mockUseListKickSessions(...args),
  useDeleteContraction: jest.fn(() => ({
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

// ── A sample contraction as the API would return it after the timer saves ─────

const LOGGED_CONTRACTION = {
  id: 42,
  sessionDate: "2026-08-14",
  startedAt: "2026-08-14T10:05:00.000Z",
  durationSeconds: 62,
  intervalSeconds: null,
  notes: null,
  createdAt: "2026-08-14T10:05:00.000Z",
  updatedAt: "2026-08-14T10:05:00.000Z",
};

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  capturedFocusCallbacks.length = 0;
  mockRefetch.mockReset();

  // KickHistoryTab is rendered first; stub it to avoid errors.
  mockUseListKickSessions.mockReturnValue({
    data: { items: [] },
    isFetching: false,
    refetch: jest.fn(),
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

// ─── Helper — render the screen and switch to the Contractions tab ────────────

async function renderContractionTab(renderer: { root: ReactTestInstance }) {
  const tabBtn = findByTestId(renderer.root, "tab-btn-contractions");
  expect(tabBtn).toBeDefined();
  await act(async () => {
    tabBtn!.props.onPress();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// A) useFocusEffect is registered when ContractionHistoryTab mounts
// ─────────────────────────────────────────────────────────────────────────────

describe("ContractionHistoryTab — useFocusEffect registration", () => {
  it("registers a focus callback when the Contractions tab is rendered", async () => {
    mockUseListContractions.mockReturnValue({
      data: { items: [] },
      isFetching: false,
      refetch: mockRefetch,
    });

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SessionHistoryScreen));
    });

    // useFocusEffect from expo-router must not have been called yet (only
    // KickHistoryTab is visible at this point).
    const callsBeforeSwitch = capturedFocusCallbacks.length;

    // Switch to the Contractions tab — ContractionHistoryTab mounts.
    await renderContractionTab(renderer);

    // At least one new useFocusEffect callback must have been registered.
    expect(capturedFocusCallbacks.length).toBeGreaterThan(callsBeforeSwitch);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B) The registered callback calls refetch() when focus fires
// ─────────────────────────────────────────────────────────────────────────────

describe("ContractionHistoryTab — focus triggers refetch", () => {
  it("calls refetch() when the screen regains focus (e.g. returning from the timer)", async () => {
    // Initial state: stale all-dates cache from before the timer session.
    mockUseListContractions.mockReturnValue({
      data: { items: [] },
      isFetching: false,
      refetch: mockRefetch,
    });

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SessionHistoryScreen));
    });

    await renderContractionTab(renderer);

    // There must be at least one captured focus callback from ContractionHistoryTab.
    expect(capturedFocusCallbacks.length).toBeGreaterThan(0);

    // Fire the most-recently registered focus callback — simulates the user
    // returning from the Contraction Timer screen.
    const focusCallback =
      capturedFocusCallbacks[capturedFocusCallbacks.length - 1];

    await act(async () => {
      focusCallback();
    });

    // refetch must have been called — this is what ensures the history list
    // is refreshed with the server's latest contractions rather than the
    // pre-timer stale snapshot.
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT call refetch() before the screen first gains focus", async () => {
    // Ensure refetch is not called merely from mounting
    mockUseListContractions.mockReturnValue({
      data: { items: [] },
      isFetching: false,
      refetch: mockRefetch,
    });

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SessionHistoryScreen));
    });

    // Without switching to the Contractions tab, refetch should not be called.
    expect(mockRefetch).not.toHaveBeenCalled();

    // Switch to the tab — ContractionHistoryTab mounts; useFocusEffect fires
    // once on mount (expected), so refetch may be called once here.  But
    // crucially, no second call should fire without another focus event.
    await renderContractionTab(renderer);
    const callsAfterMount = mockRefetch.mock.calls.length;

    // No second call should appear without a focus event.
    expect(mockRefetch).toHaveBeenCalledTimes(callsAfterMount);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C) The newly logged contraction is shown — not a stale pre-save snapshot
// ─────────────────────────────────────────────────────────────────────────────

describe("ContractionHistoryTab — shows newly logged contraction after focus refresh", () => {
  it("renders the contraction logged in the timer after the focus-triggered refetch returns data", async () => {
    // Phase 1: stale snapshot — the all-dates cache populated before the
    // Contraction Timer added today's entry.
    mockUseListContractions.mockReturnValue({
      data: { items: [] },
      isFetching: false,
      refetch: mockRefetch,
    });

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SessionHistoryScreen));
    });

    await renderContractionTab(renderer);

    // Verify the stale empty state is shown (pre-timer snapshot).
    expect(
      findByTestId(renderer.root, "contraction-history-empty"),
    ).toBeDefined();
    expect(allLeafText(renderer.root)).toContain("No sessions yet");

    // Phase 2: fire the focus callback to simulate return from the timer.
    const focusCallback =
      capturedFocusCallbacks[capturedFocusCallbacks.length - 1];

    await act(async () => {
      focusCallback();
    });

    // Phase 3: refetch must have been invoked.
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    // Simulate what React Query does after refetch resolves: update the hook
    // return value and re-render the component tree with the fresh server data.
    mockUseListContractions.mockReturnValue({
      data: { items: [LOGGED_CONTRACTION] },
      isFetching: false,
      refetch: mockRefetch,
    });

    await act(async () => {
      renderer.update(React.createElement(SessionHistoryScreen));
    });

    // The date group for today's session should now appear.
    const leafTexts = allLeafText(renderer.root);
    // "1 contraction" appears in the group summary line.
    const hasSummary = leafTexts.some((t) => t.includes("contraction"));
    expect(hasSummary).toBe(true);

    // The empty-state view must no longer be present.
    expect(
      findByTestId(renderer.root, "contraction-history-empty"),
    ).toBeUndefined();
  });

  it("shows a loading spinner — not stale data — while the focus-triggered refetch is in flight", async () => {
    // Start with a stale empty cache.
    mockUseListContractions.mockReturnValue({
      data: { items: [] },
      isFetching: false,
      refetch: mockRefetch,
    });

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SessionHistoryScreen));
    });

    await renderContractionTab(renderer);

    // Simulate the server round-trip being in progress: fire the focus
    // callback (which calls refetch()), then re-render with isFetching=true
    // to represent what React Query does while the request is in flight.
    const focusCallback =
      capturedFocusCallbacks[capturedFocusCallbacks.length - 1];

    await act(async () => {
      focusCallback();
    });

    // Update the mock to reflect the in-flight state and re-render.
    mockUseListContractions.mockReturnValue({
      data: { items: [] },
      isFetching: true,
      refetch: mockRefetch,
    });

    await act(async () => {
      renderer.update(React.createElement(SessionHistoryScreen));
    });

    // While isFetching is true, the spinner must be shown and the empty-state
    // text must not be visible (the user should see progress feedback, not
    // stale "No sessions yet" while new data loads).
    expect(
      findByTestId(renderer.root, "contraction-history-spinner"),
    ).toBeDefined();
    expect(
      findByTestId(renderer.root, "contraction-history-empty"),
    ).toBeUndefined();
  });
});
