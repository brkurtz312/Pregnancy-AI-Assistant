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

import React, { useState } from "react";
import { Text, View, Platform } from "react-native";
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
let mockRemoveCalled = false;

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
          mockRemoveCalled = true;
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
  function walk(node: { type: unknown; props: Record<string, unknown>; children?: unknown[] }) {
    if (node.type === "Text" && typeof node.props.children === "string") {
      out.push(node.props.children);
    }
    (node.children ?? []).forEach((c) => c && typeof c === "object" && walk(c as typeof node));
  }
  walk(root);
  return out;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("WatchStatusBadge — live state transitions via onWatchStateChange", () => {
  beforeEach(() => {
    capturedStateListener = null;
    mockRemoveCalled = false;
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
