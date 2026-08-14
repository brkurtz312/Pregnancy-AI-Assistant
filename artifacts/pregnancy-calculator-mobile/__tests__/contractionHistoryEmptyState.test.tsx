/**
 * contractionHistoryEmptyState.test.tsx
 *
 * Confirms that the Contraction History tab on the SessionHistoryScreen shows
 * a meaningful empty state — not a permanent spinner or blank view — when the
 * API returns { items: [], total: 0 } (brand-new user, no sessions on any date).
 *
 * Two sub-cases are covered:
 *   A) isFetching=false, data={items:[]} → "No sessions yet" text is shown;
 *      no spinner is present.
 *   B) isFetching=true (initial load) → spinner is visible, no empty-state text.
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
    userId: "user-empty-test",
    getToken: jest.fn().mockResolvedValue("token-empty"),
  })),
}));

// ── Navigation ────────────────────────────────────────────────────────────────
jest.mock("expo-router", () => ({
  useRouter: jest.fn(() => ({ back: jest.fn(), push: jest.fn() })),
  useFocusEffect: jest.fn(),
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

// ── API client ────────────────────────────────────────────────────────────────
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

/** Collect all string leaf content under a node. */
function allLeafText(root: ReactTestInstance): string[] {
  const texts: string[] = [];
  const walk = (node: ReactTestInstance) => {
    node.children.forEach((child) => {
      if (typeof child === "string") {
        texts.push(child);
      } else {
        walk(child);
      }
    });
  };
  walk(root);
  return texts;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Kick Count tab is rendered by default; stub it so it doesn't error
  mockUseListKickSessions.mockReturnValue({
    data: { items: [] },
    isFetching: false,
    refetch: jest.fn(),
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ContractionHistoryTab — empty first page", () => {
  it("shows the empty-state message and no spinner when the API returns zero sessions", async () => {
    mockUseListContractions.mockReturnValue({
      data: { items: [], total: 0 },
      isFetching: false,
      refetch: jest.fn(),
    });

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SessionHistoryScreen));
    });

    // Switch to the Contractions tab using the testID added to the tab button
    const tabBtn = findByTestId(renderer.root, "tab-btn-contractions");
    expect(tabBtn).toBeDefined();
    await act(async () => {
      tabBtn!.props.onPress();
    });

    // Empty-state container must appear
    expect(
      findByTestId(renderer.root, "contraction-history-empty"),
    ).toBeDefined();

    // "No sessions yet" text must be visible
    expect(allLeafText(renderer.root)).toContain("No sessions yet");

    // Spinner must NOT be present
    expect(
      findByTestId(renderer.root, "contraction-history-spinner"),
    ).toBeUndefined();
  });

  it("shows a spinner — not the empty-state view — while the initial fetch is in progress", async () => {
    mockUseListContractions.mockReturnValue({
      data: undefined,
      isFetching: true,
      refetch: jest.fn(),
    });

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SessionHistoryScreen));
    });

    // Switch to the Contractions tab
    const tabBtn = findByTestId(renderer.root, "tab-btn-contractions");
    expect(tabBtn).toBeDefined();
    await act(async () => {
      tabBtn!.props.onPress();
    });

    // Spinner must be present
    expect(
      findByTestId(renderer.root, "contraction-history-spinner"),
    ).toBeDefined();

    // Empty-state container and text must NOT appear
    expect(
      findByTestId(renderer.root, "contraction-history-empty"),
    ).toBeUndefined();
    expect(allLeafText(renderer.root)).not.toContain("No sessions yet");
  });
});
