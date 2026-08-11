/**
 * watchKickColdStartDedup.test.tsx
 *
 * Verifies that a Watch retry of the SAME kick session does not create a
 * duplicate API row after the app is force-quit and relaunched.
 *
 * The in-process dedup Set inside WatchBackgroundListener dies with the JS
 * process, so a cold start is simulated by unmounting the listener and
 * mounting a fresh instance: the new mount has an empty Set, but the REAL
 * `@/lib/sync-queue` module (not mocked here) has persisted the saved
 * session's startedAt in AsyncStorage (which the jest mock keeps in memory
 * across mounts, just like the device keeps it across relaunches).
 *
 * Also covers:
 *   • expiry — an entry older than 24h no longer suppresses the save
 *   • sign-out — invalidateWatchQueueSession wipes the persisted store so
 *     the next user is never gated by the previous user's history
 */

import React from "react";
import { act, create } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(),
  useUser: jest.fn(() => ({ user: null, isSignedIn: false })),
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// ── React Query ───────────────────────────────────────────────────────────────
const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);
const mockGetQueryData = jest.fn().mockReturnValue(undefined);

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: jest.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
    getQueryData: mockGetQueryData,
  })),
}));

jest.mock("@workspace/api-client-react", () => ({
  useGetProfile: jest.fn(() => ({ data: null, isLoading: false })),
  getGetProfileQueryKey: jest.fn(() => ["profile"]),
  getListKickSessionsQueryKey: jest.fn((p) => ["kick-sessions", p]),
  getListContractionsQueryKey: jest.fn((p) => ["contractions", p]),
}));

// ── Sync API (direct Watch saves) ─────────────────────────────────────────────
const mockApiDirectSaveKickSession = jest.fn().mockResolvedValue(undefined);
const mockApiDirectSaveContraction = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/sync-api", () => ({
  apiDirectSaveKickSession: (...args: unknown[]) =>
    mockApiDirectSaveKickSession(...args),
  apiDirectSaveContraction: (...args: unknown[]) =>
    mockApiDirectSaveContraction(...args),
}));

// NOTE: @/lib/sync-queue is intentionally NOT mocked — the whole point of this
// suite is to exercise the real persisted recent-saves store.

// ── Watch connectivity ────────────────────────────────────────────────────────
let capturedOnKickSessionEnd: ((s: unknown) => Promise<void>) | undefined;

jest.mock("@/hooks/useWatchConnectivity", () => ({
  useWatchConnectivity: jest.fn(
    (opts: { onKickSessionEnd?: (s: unknown) => Promise<void> }) => {
      capturedOnKickSessionEnd = opts.onKickSessionEnd;
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
import { invalidateWatchQueueSession } from "../lib/sync-queue";

const mockUseAuth = useAuth as jest.Mock;

const USER_ID = "user-123";
const RECENT_KEY = `watch_recent_kicks:${USER_ID}`;

const SESSION = {
  startedAt: "2026-08-11T10:00:00.000Z",
  endedAt: "2026-08-11T10:20:00.000Z",
  kickCount: 10,
};

function mountListener() {
  mockUseAuth.mockReturnValue({
    isSignedIn: true,
    userId: USER_ID,
    getToken: jest.fn().mockResolvedValue("token-user-123"),
  });
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(WatchBackgroundListener));
  });
  return renderer;
}

async function fireKickSessionEnd(session = SESSION) {
  await act(async () => {
    await capturedOnKickSessionEnd?.(session);
  });
}

describe("WatchBackgroundListener — kick-session dedup across cold start", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    capturedOnKickSessionEnd = undefined;
    await AsyncStorage.clear();
  });

  it("suppresses a Watch retry of the same session after a simulated force-quit + relaunch", async () => {
    // ── Warm run: session saved, startedAt persisted ─────────────────────────
    const first = mountListener();
    // fireKickSessionEnd awaits the WHOLE handler, which now awaits the
    // persisted marker write before completing — no separate drain is needed.
    // The force-quit below can therefore happen at any point after the handler
    // resolves without losing the marker.
    await fireKickSessionEnd();
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(1);

    const persisted = await AsyncStorage.getItem(RECENT_KEY);
    expect(persisted).not.toBeNull();
    expect(Object.keys(JSON.parse(persisted!))).toContain(SESSION.startedAt);

    // ── Simulated force-quit + relaunch ──────────────────────────────────────
    // Unmount kills the in-process dedup Set; a fresh mount starts with an
    // empty Set, exactly like a new JS process after relaunch.  AsyncStorage
    // (the jest mock's in-memory store) survives, like the device's disk.
    act(() => first.unmount());
    mockApiDirectSaveKickSession.mockClear();
    const second = mountListener();

    // Watch retries the SAME logical session on relaunch.
    await fireKickSessionEnd();

    // The persisted store suppressed the duplicate API write.
    expect(mockApiDirectSaveKickSession).not.toHaveBeenCalled();

    // A genuinely NEW session is still saved normally.
    await fireKickSessionEnd({
      startedAt: "2026-08-11T12:00:00.000Z",
      endedAt: "2026-08-11T12:15:00.000Z",
      kickCount: 7,
    });
    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(1);

    act(() => second.unmount());
  });

  it("does not suppress the save once the persisted entry is older than 24 hours, and prunes it from storage", async () => {
    // Seed one expired entry (25h ago) and one fresh entry.
    const freshStartedAt = "2026-08-11T09:00:00.000Z";
    const freshSavedAt = Date.now() - 60 * 1000;
    await AsyncStorage.setItem(
      RECENT_KEY,
      JSON.stringify({
        [SESSION.startedAt]: Date.now() - 25 * 60 * 60 * 1000,
        [freshStartedAt]: freshSavedAt,
      }),
    );

    const renderer = mountListener();
    await fireKickSessionEnd();

    expect(mockApiDirectSaveKickSession).toHaveBeenCalledTimes(1);

    // The expired entry was pruned from storage during the read; the fresh
    // entry survives (plus the just-saved session's new marker).
    const stored = JSON.parse((await AsyncStorage.getItem(RECENT_KEY))!);
    expect(stored[freshStartedAt]).toBe(freshSavedAt);
    expect(stored[SESSION.startedAt]).toBeGreaterThan(freshSavedAt);
    act(() => renderer.unmount());
  });

  it("sends the watchSessionId idempotency key with the direct save", async () => {
    const renderer = mountListener();
    await fireKickSessionEnd();

    expect(mockApiDirectSaveKickSession).toHaveBeenCalledWith(
      expect.objectContaining({ watchSessionId: SESSION.startedAt }),
      expect.any(Function),
    );
    act(() => renderer.unmount());
  });

  it("does not persist the startedAt when the API save fails (offline path stays retryable)", async () => {
    mockApiDirectSaveKickSession.mockRejectedValueOnce(new Error("offline"));

    const renderer = mountListener();
    await fireKickSessionEnd();

    const persisted = await AsyncStorage.getItem(RECENT_KEY);
    expect(persisted ? Object.keys(JSON.parse(persisted)) : []).not.toContain(
      SESSION.startedAt,
    );
    act(() => renderer.unmount());
  });

  it("clears the persisted store on sign-out so the next user is not gated", async () => {
    const renderer = mountListener();
    await fireKickSessionEnd();
    expect(await AsyncStorage.getItem(RECENT_KEY)).not.toBeNull();

    await invalidateWatchQueueSession(USER_ID);
    expect(await AsyncStorage.getItem(RECENT_KEY)).toBeNull();
    act(() => renderer.unmount());
  });
});
