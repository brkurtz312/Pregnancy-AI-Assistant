/**
 * watchStatusBadgeLive.test.tsx
 *
 * Confirms the WatchStatusBadge label transitions live — without any screen
 * refresh — when the Watch connects or disconnects mid-session.
 *
 * Strategy
 * ────────
 * The badge reads `watchStatus` from `useWatchConnectivity`, which registers
 * an `onWatchStateChange` listener on the WatchConnectivity module.
 *
 * Rather than mounting the full ToolsScreen (which pulls in react-native-
 * reanimated and other heavy native deps), we:
 *   1. Mount a minimal wrapper that calls `useWatchConnectivity` and renders
 *      the same badge text the real screen renders.
 *   2. Mock the WatchConnectivity module to capture the listener.
 *   3. Fire simulated events mid-render and assert the badge label changes
 *      without any imperative refresh.
 *
 * This tests the live-update path end-to-end:
 *   native event → onWatchStateChange listener → setWatchStatus → badge re-render
 */

import React from "react";
import {
  Text,
  View,
  Platform,
  AppState,
  type AppStateStatus,
} from "react-native";
import { act, create } from "react-test-renderer";
import { flushAsync } from "../test-helpers/testUtils";

// ─── WatchConnectivity module mock ────────────────────────────────────────────
//
// capturedStateListener is filled when useWatchConnectivity registers its
// onWatchStateChange subscription.  Tests fire it to simulate native events.

type WatchState = {
  activationState: string;
  isWatchAppInstalled: boolean;
  isReachable: boolean;
};

let capturedStateListener: ((state: WatchState) => void) | null = null;

const mockGetSessionState = jest.fn(
  async (): Promise<WatchState> => ({
    activationState: "activated",
    isWatchAppInstalled: true,
    isReachable: false,
  }),
);

const mockAddListener = jest.fn(
  (event: string, cb: (state: WatchState) => void) => {
    if (event === "onWatchStateChange") {
      capturedStateListener = cb;
    }
    return {
      remove: () => {
        if (event === "onWatchStateChange") {
          capturedStateListener = null;
        }
      },
    };
  },
);

jest.mock("../modules/WatchConnectivity", () => ({
  __esModule: true,
  default: {
    getSessionState: mockGetSessionState,
    sendWeekAndTips: jest.fn(async () => {}),
    sendTips: jest.fn(async () => {}),
    sendGestationalWeek: jest.fn(async () => {}),
    addListener: mockAddListener,
  },
}));

// ─── Minimal badge component — mirrors the logic in tools.tsx ─────────────────
// jest-expo sets defaultPlatform: "ios" so Platform.OS is already "ios" here.
// No Platform mock is needed.

import { useWatchConnectivity } from "../hooks/useWatchConnectivity";

function TestBadge() {
  const { watchStatus } = useWatchConnectivity();
  const { isReachable, isWatchAppInstalled } = watchStatus;
  if (Platform.OS !== "ios") return null;
  const label = isReachable
    ? "Apple Watch connected"
    : isWatchAppInstalled
      ? "Watch not reachable"
      : "Watch app not installed";
  return (
    <View>
      <Text testID="badge-label">{label}</Text>
    </View>
  );
}

// ─── Helper: collect Text content from the tree ───────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function allTexts(root: any): string[] {
  const out: string[] = [];
  function walk(node: {
    type: unknown;
    props: Record<string, unknown>;
    children?: unknown[];
  }) {
    if (node.type === "Text" && typeof node.props.children === "string") {
      out.push(node.props.children);
    }
    (node.children ?? []).forEach(
      (c) => c && typeof c === "object" && walk(c as typeof node),
    );
  }
  walk(root);
  return out;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("WatchStatusBadge — live state transitions via onWatchStateChange", () => {
  beforeEach(() => {
    capturedStateListener = null;
    // Default: Watch installed but not yet reachable
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: false,
    });
    jest.clearAllMocks();
    // re-register after clearAllMocks
    mockAddListener.mockImplementation(
      (event: string, cb: (state: WatchState) => void) => {
        if (event === "onWatchStateChange") capturedStateListener = cb;
        return {
          remove: () => {
            if (event === "onWatchStateChange") capturedStateListener = null;
          },
        };
      },
    );
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: false,
    });
  });

  it("shows 'Watch not reachable' on initial mount when Watch is installed but not reachable", async () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(TestBadge));
    });
    await flushAsync();

    expect(allTexts(renderer!.root)).toContain("Watch not reachable");
    expect(allTexts(renderer!.root)).not.toContain("Apple Watch connected");
  });

  it("registers the onWatchStateChange listener on mount", async () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(TestBadge));
    });
    await flushAsync();

    // The subscription must be active so live events can reach the component
    expect(capturedStateListener).not.toBeNull();
    renderer!.unmount();
  });

  it("transitions to 'Apple Watch connected' when Watch becomes reachable mid-session", async () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(TestBadge));
    });
    await flushAsync();

    // Baseline: not connected
    expect(allTexts(renderer!.root)).toContain("Watch not reachable");

    // Simulate the Watch app launching — session becomes reachable
    expect(capturedStateListener).not.toBeNull();
    await act(async () => {
      capturedStateListener!({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: true,
      });
    });

    // Badge updates without any explicit refresh
    expect(allTexts(renderer!.root)).toContain("Apple Watch connected");
    expect(allTexts(renderer!.root)).not.toContain("Watch not reachable");
  });

  it("transitions back to 'Watch not reachable' when Watch goes out of range", async () => {
    // Start already connected
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: true,
    });

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(TestBadge));
    });
    await flushAsync();

    expect(allTexts(renderer!.root)).toContain("Apple Watch connected");

    // Simulate Watch going out of range
    await act(async () => {
      capturedStateListener!({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: false,
      });
    });

    // Badge reverts live — no screen refresh required
    expect(allTexts(renderer!.root)).toContain("Watch not reachable");
    expect(allTexts(renderer!.root)).not.toContain("Apple Watch connected");
  });

  it("shows 'Watch app not installed' when isWatchAppInstalled=false on mount", async () => {
    mockGetSessionState.mockResolvedValue({
      activationState: "notActivated",
      isWatchAppInstalled: false,
      isReachable: false,
    });

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(TestBadge));
    });
    await flushAsync();

    expect(allTexts(renderer!.root)).toContain("Watch app not installed");
  });

  it("transitions from 'Watch app not installed' to 'Apple Watch connected' in a single event", async () => {
    mockGetSessionState.mockResolvedValue({
      activationState: "notActivated",
      isWatchAppInstalled: false,
      isReachable: false,
    });

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(TestBadge));
    });
    await flushAsync();

    expect(allTexts(renderer!.root)).toContain("Watch app not installed");

    // User installs and opens the Watch app — single delegate callback covers both
    await act(async () => {
      capturedStateListener!({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: true,
      });
    });

    expect(allTexts(renderer!.root)).toContain("Apple Watch connected");
    expect(allTexts(renderer!.root)).not.toContain("Watch app not installed");
  });

  it("never flickers to 'not installed' when the live event beats the slow initial snapshot", async () => {
    // Slow-device launch scenario: the mount-time getSessionState() is still
    // in flight when a live onWatchStateChange event arrives reporting the
    // Watch app IS installed. When the slow snapshot finally resolves with
    // isWatchAppInstalled:false (stale), it must be discarded — the badge
    // must never regress to "Watch app not installed" after the live event.
    let resolveInitialSnapshot!: (v: WatchState) => void;
    mockGetSessionState.mockImplementationOnce(
      () =>
        new Promise<WatchState>((resolve) => {
          resolveInitialSnapshot = resolve;
        }),
    );

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(TestBadge));
    });
    // Do NOT flush — the initial snapshot Promise is still pending.

    // Initial default state shows "not installed" (nothing has resolved yet)
    expect(allTexts(renderer!.root)).toContain("Watch app not installed");

    // Live event fires first: Watch app installed, not yet reachable
    expect(capturedStateListener).not.toBeNull();
    await act(async () => {
      capturedStateListener!({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: false,
      });
    });

    expect(allTexts(renderer!.root)).toContain("Watch not reachable");
    expect(allTexts(renderer!.root)).not.toContain("Watch app not installed");

    // Now the slow initial snapshot resolves with the stale pre-launch state
    await act(async () => {
      resolveInitialSnapshot({
        activationState: "notActivated",
        isWatchAppInstalled: false,
        isReachable: false,
      });
    });
    await flushAsync();

    // The badge must NOT flicker back — the stale snapshot is discarded
    expect(allTexts(renderer!.root)).toContain("Watch not reachable");
    expect(allTexts(renderer!.root)).not.toContain("Watch app not installed");
    await act(async () => {
      renderer!.unmount();
    });
  });

  it("removes the onWatchStateChange listener on unmount (no stale subscriptions)", async () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(TestBadge));
    });
    await flushAsync();

    expect(capturedStateListener).not.toBeNull();

    await act(async () => {
      renderer!.unmount();
    });

    // Cleanup effect should have called sub.remove()
    expect(capturedStateListener).toBeNull();
  });
});

// ─── AppState / foreground-resume tests ──────────────────────────────────────
//
// These tests exercise the path where Watch reachability changes while the
// phone is backgrounded.  WCSession does NOT fire sessionReachabilityDidChange
// on resume in that case — the hook must call getSessionState() itself when
// AppState transitions to "active".

describe("WatchStatusBadge — foreground-resume re-fetch via AppState", () => {
  // Capture every AppState.addEventListener callback so tests can fire them.
  type AppStateHandler = (state: AppStateStatus) => void;
  const capturedAppStateHandlers: AppStateHandler[] = [];

  let addEventListenerSpy: jest.SpyInstance;

  beforeEach(() => {
    capturedStateListener = null;
    capturedAppStateHandlers.length = 0;

    // Default: Watch installed, currently reachable
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: true,
    });

    jest.clearAllMocks();

    // Re-register addListener mock after clearAllMocks
    mockAddListener.mockImplementation(
      (event: string, cb: (state: WatchState) => void) => {
        if (event === "onWatchStateChange") capturedStateListener = cb;
        return {
          remove: () => {
            if (event === "onWatchStateChange") capturedStateListener = null;
          },
        };
      },
    );

    // Spy on AppState.addEventListener to capture foreground-resume handlers
    addEventListenerSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((event: string, handler: AppStateHandler) => {
        if (event === "change") capturedAppStateHandlers.push(handler);
        return { remove: jest.fn() };
      });
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
  });

  it("calls getSessionState() when the app returns to the foreground", async () => {
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: true,
    });

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(TestBadge));
    });
    await flushAsync();

    const callsBefore = mockGetSessionState.mock.calls.length;

    // Simulate app going to background then returning to foreground
    await act(async () => {
      capturedAppStateHandlers.forEach((h) => h("background"));
    });
    await act(async () => {
      capturedAppStateHandlers.forEach((h) => h("active"));
    });
    await flushAsync();

    // getSessionState must have been called again on resume
    expect(mockGetSessionState.mock.calls.length).toBeGreaterThan(callsBefore);
    renderer!.unmount();
  });

  it("updates badge to 'Watch not reachable' when Watch disconnects while backgrounded", async () => {
    // App starts with Watch connected
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: true,
    });

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(TestBadge));
    });
    await flushAsync();

    expect(allTexts(renderer!.root)).toContain("Apple Watch connected");

    // Watch goes out of range while phone is backgrounded — no live event fires.
    // On foreground, getSessionState() returns the updated (disconnected) state.
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: false,
    });

    await act(async () => {
      capturedAppStateHandlers.forEach((h) => h("background"));
    });
    await act(async () => {
      capturedAppStateHandlers.forEach((h) => h("active"));
    });
    await flushAsync();

    // Badge must now reflect the disconnected state without a manual refresh
    expect(allTexts(renderer!.root)).toContain("Watch not reachable");
    expect(allTexts(renderer!.root)).not.toContain("Apple Watch connected");
    renderer!.unmount();
  });

  it("updates badge to 'Apple Watch connected' when Watch reconnects while backgrounded", async () => {
    // App starts with Watch not reachable
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: false,
    });

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(TestBadge));
    });
    await flushAsync();

    expect(allTexts(renderer!.root)).toContain("Watch not reachable");

    // Watch becomes reachable while backgrounded; on resume getSessionState
    // returns the connected state.
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: true,
    });

    await act(async () => {
      capturedAppStateHandlers.forEach((h) => h("background"));
    });
    await act(async () => {
      capturedAppStateHandlers.forEach((h) => h("active"));
    });
    await flushAsync();

    expect(allTexts(renderer!.root)).toContain("Apple Watch connected");
    expect(allTexts(renderer!.root)).not.toContain("Watch not reachable");
    renderer!.unmount();
  });

  it("ignores 'background' and 'inactive' AppState transitions (no extra fetch)", async () => {
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: true,
    });

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(TestBadge));
    });
    await flushAsync();

    const callsBefore = mockGetSessionState.mock.calls.length;

    await act(async () => {
      capturedAppStateHandlers.forEach((h) => h("background"));
      capturedAppStateHandlers.forEach((h) => h("inactive"));
    });
    await flushAsync();

    // No additional getSessionState calls for non-active transitions
    expect(mockGetSessionState.mock.calls.length).toBe(callsBefore);
    renderer!.unmount();
  });

  it("delayed initial mount fetch does not overwrite a fresher foreground-resume result", async () => {
    // Scenario: app mounts, initial getSessionState() is slow (not resolved).
    // While it is in flight the app backgrounds and foregrounds; the resume
    // fetch immediately resolves with the correct state.  When the slow initial
    // fetch finally resolves it must be discarded, not applied on top.

    // Mount: Watch not reachable (initial state that would be stale)
    let resolveInitialFetch!: (v: WatchState) => void;
    mockGetSessionState.mockImplementationOnce(
      () =>
        new Promise<WatchState>((resolve) => {
          resolveInitialFetch = resolve;
        }),
    );

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(TestBadge));
    });
    // Do NOT flush — the initial Promise is still pending.

    // App backgrounds then foregrounds; resume fetch resolves immediately
    // with the current (connected) state.
    mockGetSessionState.mockResolvedValueOnce({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: true,
    });

    await act(async () => {
      capturedAppStateHandlers.forEach((h) => h("background"));
    });
    await act(async () => {
      capturedAppStateHandlers.forEach((h) => h("active"));
    });
    await flushAsync();

    // Badge reflects the connected state from the foreground-resume fetch
    expect(allTexts(renderer!.root)).toContain("Apple Watch connected");

    // Now the slow initial fetch resolves with the stale disconnected state —
    // it must be silently discarded
    await act(async () => {
      resolveInitialFetch({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: false,
      });
    });
    await flushAsync();

    // Badge must stay connected — stale initial result was discarded
    expect(allTexts(renderer!.root)).toContain("Apple Watch connected");
    expect(allTexts(renderer!.root)).not.toContain("Watch not reachable");
    await act(async () => {
      renderer!.unmount();
    });
  });

  it("live onWatchStateChange event supersedes an in-flight resume fetch", async () => {
    // App starts with Watch not reachable
    mockGetSessionState.mockResolvedValue({
      activationState: "activated",
      isWatchAppInstalled: true,
      isReachable: false,
    });

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(TestBadge));
    });
    await flushAsync();

    expect(allTexts(renderer!.root)).toContain("Watch not reachable");

    // On foreground: getSessionState() resolves with stale "not reachable".
    // But a live event fires first saying the Watch IS connected — the live
    // value must win and the stale Promise result must be discarded.
    let resolveSessionState!: (v: WatchState) => void;
    mockGetSessionState.mockImplementationOnce(
      () =>
        new Promise<WatchState>((resolve) => {
          resolveSessionState = resolve;
        }),
    );

    await act(async () => {
      capturedAppStateHandlers.forEach((h) => h("active"));
    });

    // Live event fires before the Promise resolves
    expect(capturedStateListener).not.toBeNull();
    await act(async () => {
      capturedStateListener!({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: true,
      });
    });

    expect(allTexts(renderer!.root)).toContain("Apple Watch connected");

    // Now resolve the stale getSessionState() with "not reachable"
    await act(async () => {
      resolveSessionState({
        activationState: "activated",
        isWatchAppInstalled: true,
        isReachable: false,
      });
    });
    await flushAsync();

    // The live event's value must survive — the stale Promise is discarded
    expect(allTexts(renderer!.root)).toContain("Apple Watch connected");
    expect(allTexts(renderer!.root)).not.toContain("Watch not reachable");
    renderer!.unmount();
  });
});
