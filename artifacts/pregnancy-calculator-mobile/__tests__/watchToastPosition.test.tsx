/**
 * watchToastPosition.test.tsx
 *
 * Confirms that the WatchBackgroundListener error/success toast sits above the
 * native bottom tab bar on every device class:
 *
 *  • iPhone with home indicator  – safeAreaInsets.bottom = 34 pt
 *  • iPhone without home indicator – safeAreaInsets.bottom = 0 pt
 *  • iPad (home-bar style)       – safeAreaInsets.bottom = 20 pt
 *
 * The expected bottom offset in each case is:
 *   TAB_BAR_HEIGHT (49) + safeAreaInsets.bottom + TOAST_MARGIN (8)
 *
 * The toast must always be positioned strictly above the 49 pt tab bar so it
 * is never obscured by the navigation chrome on any supported screen size.
 */

import React from "react";
import { act, create } from "react-test-renderer";

// ── Reanimated ────────────────────────────────────────────────────────────────
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// ── Clerk ─────────────────────────────────────────────────────────────────────
jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(() => ({
    isSignedIn: false,
    userId: null,
    getToken: jest.fn().mockResolvedValue(null),
  })),
  useUser: jest.fn(() => ({ user: null, isSignedIn: false })),
}));

// ── Icons ─────────────────────────────────────────────────────────────────────
jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

// ── Navigation ────────────────────────────────────────────────────────────────
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useRouter: jest.fn(() => ({ push: jest.fn(), back: jest.fn() })),
}));

// ── Safe-area: controlled per test ────────────────────────────────────────────
const mockUseSafeAreaInsets = jest.fn(() => ({
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockUseSafeAreaInsets(),
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
  calculateByDueDate: jest.fn(() => ({ currentGestationalAgeWeeks: 20 })),
}));

jest.mock("@/lib/fetal-development", () => ({
  getWeeklyDevelopment: jest.fn(() => ({
    development: ["Baby grows."],
    motherChanges: ["Rest well."],
    comingUp: "More changes ahead.",
  })),
}));

// ── React Query ───────────────────────────────────────────────────────────────
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: jest.fn(() => ({
    invalidateQueries: jest.fn().mockResolvedValue(undefined),
    getQueryData: jest.fn().mockReturnValue(undefined),
  })),
}));

// ── API hooks ─────────────────────────────────────────────────────────────────
jest.mock("@workspace/api-client-react", () => ({
  useGetProfile: jest.fn(() => ({ data: null, isLoading: false })),
  getGetProfileQueryKey: jest.fn(() => ["profile"]),
  getListKickSessionsQueryKey: jest.fn((p: unknown) => ["kick-sessions", p]),
  getListContractionsQueryKey: jest.fn((p: unknown) => ["contractions", p]),
}));

// ── Sync API ──────────────────────────────────────────────────────────────────
jest.mock("@/lib/sync-api", () => ({
  apiDirectSaveKickSession: jest.fn().mockResolvedValue(undefined),
  apiDirectSaveContraction: jest.fn().mockResolvedValue(undefined),
}));

// ── Sync queue ────────────────────────────────────────────────────────────────
jest.mock("@/lib/sync-queue", () => ({
  enqueueWatchKickSession: jest.fn().mockResolvedValue(undefined),
  enqueueWatchContraction: jest.fn().mockResolvedValue(undefined),
  getWatchQueueGeneration: jest.fn().mockReturnValue(0),
}));

// ── Watch connectivity ────────────────────────────────────────────────────────
jest.mock("@/hooks/useWatchConnectivity", () => ({
  useWatchConnectivity: jest.fn(() => ({
    pushTips: jest.fn(),
    isSupported: false,
    watchStatus: {
      isReachable: false,
      isWatchAppInstalled: false,
      activationState: "notActivated",
    },
  })),
}));

// ── Imports (after all mocks) ─────────────────────────────────────────────────
import { WatchBackgroundListener } from "../components/WatchBackgroundListener";

// ─────────────────────────────────────────────────────────────────────────────

/** Render the listener and return the raw JSON tree. */
function renderTree() {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(WatchBackgroundListener));
  });
  return { renderer, json: JSON.stringify(renderer.toJSON()) };
}

/**
 * Walk the rendered tree to find the outermost Animated.View that carries the
 * toast `bottom` style.  Returns the numeric `bottom` value, or throws if the
 * node is not found.
 */
function findToastBottom(renderer: ReturnType<typeof create>): number {
  // The toast Animated.View is the root of WatchBackgroundListener's output.
  // It has `position: "absolute"` and a numeric `bottom` in its style.
  const root = renderer.root;

  // Find all View-like nodes that have a `bottom` style property set.
  const candidates = root.findAll((node) => {
    const style = node.props?.style;
    if (!style) return false;
    // style may be a flat object or an array of objects
    const styles = Array.isArray(style) ? style : [style];
    return styles.some(
      (s) => s && typeof s === "object" && "bottom" in s && s.bottom != null,
    );
  });

  if (candidates.length === 0) {
    throw new Error(
      "Could not find any node with a `bottom` style — is the toast rendered?",
    );
  }

  // Pick the node with `position: "absolute"` (the toast container).
  const toastNode = candidates.find((node) => {
    const styles = Array.isArray(node.props.style)
      ? node.props.style
      : [node.props.style];
    return styles.some(
      (s) =>
        s &&
        typeof s === "object" &&
        (s as Record<string, unknown>).position === "absolute",
    );
  });

  if (!toastNode) {
    throw new Error(
      "Could not find the toast container node (position: absolute with bottom).",
    );
  }

  const allStyles = Array.isArray(toastNode.props.style)
    ? toastNode.props.style
    : [toastNode.props.style];

  // `bottom` may appear in multiple style entries; pick the last (highest priority).
  let bottomValue: number | undefined;
  for (const s of allStyles) {
    if (s && typeof s === "object" && "bottom" in s && s.bottom != null) {
      bottomValue = (s as Record<string, number>).bottom;
    }
  }

  if (bottomValue == null) {
    throw new Error(
      "bottom style value is null or undefined on the toast node",
    );
  }
  return bottomValue;
}

// ─────────────────────────────────────────────────────────────────────────────

const TAB_BAR_HEIGHT = 49;
const TOAST_MARGIN = 8;

describe("WatchToast — bottom offset accounts for safe-area inset", () => {
  let renderer: ReturnType<typeof create> | null = null;

  afterEach(() => {
    act(() => {
      jest.runAllTimers();
    });
    if (renderer) {
      act(() => {
        renderer!.unmount();
      });
      renderer = null;
    }
    jest.clearAllMocks();
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  // ── iPhone with home indicator (safeArea bottom = 34 pt) ──────────────────

  it("sits above the tab bar on iPhone with home indicator (safeBottom=34)", () => {
    mockUseSafeAreaInsets.mockReturnValue({
      top: 59,
      bottom: 34,
      left: 0,
      right: 0,
    });

    const result = renderTree();
    renderer = result.renderer;
    const bottom = findToastBottom(renderer);

    // Must be above the tab bar
    expect(bottom).toBeGreaterThan(TAB_BAR_HEIGHT);
    // Must exactly equal TAB_BAR_HEIGHT + safeBottom + margin
    expect(bottom).toBe(TAB_BAR_HEIGHT + 34 + TOAST_MARGIN);
  });

  // ── iPhone without home indicator (safeArea bottom = 0 pt) ───────────────

  it("sits above the tab bar on older iPhone without home indicator (safeBottom=0)", () => {
    mockUseSafeAreaInsets.mockReturnValue({
      top: 20,
      bottom: 0,
      left: 0,
      right: 0,
    });

    const result = renderTree();
    renderer = result.renderer;
    const bottom = findToastBottom(renderer);

    expect(bottom).toBeGreaterThan(TAB_BAR_HEIGHT);
    expect(bottom).toBe(TAB_BAR_HEIGHT + 0 + TOAST_MARGIN);
  });

  // ── iPad (home bar, safeArea bottom = 20 pt) ──────────────────────────────

  it("sits above the tab bar on iPad with home bar (safeBottom=20)", () => {
    mockUseSafeAreaInsets.mockReturnValue({
      top: 24,
      bottom: 20,
      left: 0,
      right: 0,
    });

    const result = renderTree();
    renderer = result.renderer;
    const bottom = findToastBottom(renderer);

    expect(bottom).toBeGreaterThan(TAB_BAR_HEIGHT);
    expect(bottom).toBe(TAB_BAR_HEIGHT + 20 + TOAST_MARGIN);
  });

  // ── Invariant: always strictly above the tab bar ──────────────────────────

  it("never overlaps the tab bar regardless of the safe-area inset", () => {
    // Simulate zero insets (worst case — no safe area padding at all)
    mockUseSafeAreaInsets.mockReturnValue({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });

    const result = renderTree();
    renderer = result.renderer;
    const bottom = findToastBottom(renderer);

    // Even with zero insets the toast must sit above the 49 pt tab bar
    expect(bottom).toBeGreaterThan(TAB_BAR_HEIGHT);
  });

  // ── Dynamic: inset is reflected in the computed bottom ───────────────────

  it("increases the bottom offset proportionally as the safe-area inset grows", () => {
    // Render with a small inset first
    mockUseSafeAreaInsets.mockReturnValue({
      top: 20,
      bottom: 10,
      left: 0,
      right: 0,
    });
    const result1 = renderTree();
    renderer = result1.renderer;
    const bottomSmall = findToastBottom(renderer);
    act(() => {
      renderer!.unmount();
    });
    renderer = null;

    // Render with a large inset
    mockUseSafeAreaInsets.mockReturnValue({
      top: 59,
      bottom: 34,
      left: 0,
      right: 0,
    });
    const result2 = renderTree();
    renderer = result2.renderer;
    const bottomLarge = findToastBottom(renderer);

    expect(bottomLarge).toBeGreaterThan(bottomSmall);
    expect(bottomLarge - bottomSmall).toBe(34 - 10); // delta equals inset delta
  });
});
