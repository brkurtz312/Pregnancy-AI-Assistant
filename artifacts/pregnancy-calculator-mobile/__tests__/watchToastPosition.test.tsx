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

// ── RN Animated ──────────────────────────────────────────────────────────────
// The real Animated implementation with useNativeDriver:true never updates the
// JS-side value in Jest (updates happen on the mocked native module), so an
// opacity assertion would always read 0.  Swap in React Native's own
// AnimatedMock, which runs animations to their end value — letting us assert
// the settled state after the 200 ms fade-in.
jest.mock("react-native/Libraries/Animated/AnimatedImplementation", () => {
  const AnimatedMock = jest.requireActual(
    "react-native/Libraries/Animated/AnimatedMock",
  );
  return { __esModule: true, default: AnimatedMock.default ?? AnimatedMock };
});

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
  isKickSessionRecentlySaved: jest.fn().mockResolvedValue(false),
  markKickSessionSaved: jest.fn().mockResolvedValue(undefined),
}));

// ── Watch connectivity ────────────────────────────────────────────────────────
// Capture the callbacks so the fade-in tests can fire real Watch events.
let capturedOnKickSessionEnd: ((s: unknown) => Promise<void>) | undefined;
let capturedOnContractionUpdate: ((r: unknown) => Promise<void>) | undefined;

jest.mock("@/hooks/useWatchConnectivity", () => ({
  useWatchConnectivity: jest.fn(
    (opts: {
      onKickSessionEnd?: (s: unknown) => Promise<void>;
      onContractionUpdate?: (r: unknown) => Promise<void>;
    }) => {
      capturedOnKickSessionEnd = opts?.onKickSessionEnd;
      capturedOnContractionUpdate = opts?.onContractionUpdate;
      return {
        pushTips: jest.fn(),
        isSupported: false,
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

// ─────────────────────────────────────────────────────────────────────────────
//
// Fade-in after a real Watch sync event
//
// The static tests above only assert the bottom offset at initial render
// (opacity 0). These tests fire an actual Watch callback with a signed-in
// user, let the 200 ms opacity animation settle, and then assert that the
// visible toast node has opacity > 0 AND still sits strictly above the tab
// bar — on both phone (safeBottom=34) and tablet (safeBottom=20) insets.
//
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the toast container node (position: absolute + numeric bottom) and
 * return both its bottom offset and the current opacity value.  `opacity` is
 * an Animated.Value in the style, so unwrap it via __getValue() when present.
 */
function findToastBottomAndOpacity(renderer: ReturnType<typeof create>): {
  bottom: number;
  opacity: number;
} {
  const bottom = findToastBottom(renderer);

  const candidates = renderer.root.findAll((node) => {
    const style = node.props?.style;
    if (!style) return false;
    const styles = Array.isArray(style) ? style : [style];
    return (
      styles.some(
        (s) =>
          s &&
          typeof s === "object" &&
          (s as Record<string, unknown>).position === "absolute",
      ) &&
      styles.some(
        (s) => s && typeof s === "object" && "bottom" in s && s.bottom != null,
      ) &&
      styles.some((s) => s && typeof s === "object" && "opacity" in s)
    );
  });

  if (candidates.length === 0) {
    throw new Error("Could not find the animated toast node with opacity");
  }

  const styles = Array.isArray(candidates[0].props.style)
    ? candidates[0].props.style
    : [candidates[0].props.style];

  let opacityValue: number | undefined;
  for (const s of styles) {
    if (s && typeof s === "object" && "opacity" in s) {
      const raw = (s as Record<string, unknown>).opacity;
      if (typeof raw === "number") {
        opacityValue = raw;
      } else if (
        raw &&
        typeof (raw as { __getValue?: () => number }).__getValue === "function"
      ) {
        opacityValue = (raw as { __getValue: () => number }).__getValue();
      }
    }
  }

  if (opacityValue == null) {
    throw new Error("Could not read the opacity value from the toast node");
  }
  return { bottom, opacity: opacityValue };
}

describe("WatchToast — fade-in after a Watch sync keeps the toast above the tab bar", () => {
  let renderer: ReturnType<typeof create> | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    capturedOnKickSessionEnd = undefined;
    capturedOnContractionUpdate = undefined;
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user-123",
      getToken: jest.fn().mockResolvedValue("token-user-123"),
    });
  });

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

  afterAll(() => {
    jest.useRealTimers();
  });

  async function fireAndSettle(
    fire: () => Promise<void>,
  ): Promise<{ bottom: number; opacity: number }> {
    await act(async () => {}); // flush mount effects

    expect(capturedOnKickSessionEnd).toBeDefined();
    expect(capturedOnContractionUpdate).toBeDefined();

    await act(async () => {
      await fire();
    });

    // Let the 200 ms fade-in animation run to completion.
    act(() => {
      jest.advanceTimersByTime(250);
    });

    return findToastBottomAndOpacity(renderer!);
  }

  it("shows the toast above the tab bar after onKickSessionEnd on phone insets (safeBottom=34)", async () => {
    mockUseSafeAreaInsets.mockReturnValue({
      top: 59,
      bottom: 34,
      left: 0,
      right: 0,
    });

    act(() => {
      renderer = create(React.createElement(WatchBackgroundListener));
    });

    const { bottom, opacity } = await fireAndSettle(() =>
      capturedOnKickSessionEnd!({
        kickCount: 6,
        startedAt: "2026-08-12T10:00:00.000Z",
        endedAt: "2026-08-12T10:20:00.000Z",
      }),
    );

    expect(opacity).toBeGreaterThan(0);
    expect(bottom).toBeGreaterThan(TAB_BAR_HEIGHT);
    expect(bottom).toBe(TAB_BAR_HEIGHT + 34 + TOAST_MARGIN);
    // The success message is rendered in the tree
    expect(JSON.stringify(renderer!.toJSON())).toContain("Kick session saved");
  });

  it("shows the toast above the tab bar after onKickSessionEnd on tablet insets (safeBottom=20)", async () => {
    mockUseSafeAreaInsets.mockReturnValue({
      top: 24,
      bottom: 20,
      left: 0,
      right: 0,
    });

    act(() => {
      renderer = create(React.createElement(WatchBackgroundListener));
    });

    const { bottom, opacity } = await fireAndSettle(() =>
      capturedOnKickSessionEnd!({
        kickCount: 3,
        startedAt: "2026-08-12T11:00:00.000Z",
        endedAt: "2026-08-12T11:15:00.000Z",
      }),
    );

    expect(opacity).toBeGreaterThan(0);
    expect(bottom).toBeGreaterThan(TAB_BAR_HEIGHT);
    expect(bottom).toBe(TAB_BAR_HEIGHT + 20 + TOAST_MARGIN);
    expect(JSON.stringify(renderer!.toJSON())).toContain("Kick session saved");
  });

  it("shows the toast above the tab bar after onContractionUpdate on phone insets (safeBottom=34)", async () => {
    mockUseSafeAreaInsets.mockReturnValue({
      top: 59,
      bottom: 34,
      left: 0,
      right: 0,
    });

    act(() => {
      renderer = create(React.createElement(WatchBackgroundListener));
    });

    const { bottom, opacity } = await fireAndSettle(() =>
      capturedOnContractionUpdate!({
        startedAt: "2026-08-12T14:00:00.000Z",
        endedAt: "2026-08-12T14:01:10.000Z",
        interval: 300,
      }),
    );

    expect(opacity).toBeGreaterThan(0);
    expect(bottom).toBeGreaterThan(TAB_BAR_HEIGHT);
    expect(bottom).toBe(TAB_BAR_HEIGHT + 34 + TOAST_MARGIN);
    expect(JSON.stringify(renderer!.toJSON())).toContain(
      "Contraction recorded",
    );
  });

  it("shows the toast above the tab bar after onContractionUpdate on tablet insets (safeBottom=20)", async () => {
    mockUseSafeAreaInsets.mockReturnValue({
      top: 24,
      bottom: 20,
      left: 0,
      right: 0,
    });

    act(() => {
      renderer = create(React.createElement(WatchBackgroundListener));
    });

    const { bottom, opacity } = await fireAndSettle(() =>
      capturedOnContractionUpdate!({
        startedAt: "2026-08-12T15:00:00.000Z",
        endedAt: "2026-08-12T15:01:00.000Z",
        interval: 240,
      }),
    );

    expect(opacity).toBeGreaterThan(0);
    expect(bottom).toBeGreaterThan(TAB_BAR_HEIGHT);
    expect(bottom).toBe(TAB_BAR_HEIGHT + 20 + TOAST_MARGIN);
    expect(JSON.stringify(renderer!.toJSON())).toContain(
      "Contraction recorded",
    );
  });
});
