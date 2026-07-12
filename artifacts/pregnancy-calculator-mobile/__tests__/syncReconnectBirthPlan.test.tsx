/**
 * Birth Plan — offline-edits-on-reconnect test
 *
 * Scenario: the user fills in birth-plan fields while NetInfo reports
 * `isConnected: false`.  Those changes are persisted locally.  When the
 * network comes back the `useNetReconnect` hook fires its callback which
 * calls `apiSaveBirthPlanAnswers` with the current in-memory state.
 *
 * Assertions:
 *   1. `apiSaveBirthPlanAnswers` is called when the reconnect callback fires.
 *   2. The screen still renders after the reconnect sync completes.
 *   3. `apiSaveBirthPlanAnswers` is NOT called when the user is signed out.
 */

import React from "react";
import { act, create } from "react-test-renderer";

// ─── Shared RN mocks ──────────────────────────────────────────────────────────

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#fff",
    card: "#fff",
    border: "#eee",
    primary: "#e86cad",
    primaryForeground: "#fff",
    foreground: "#000",
    mutedForeground: "#666",
    muted: "#f5f5f5",
    accent: "#f0f0f0",
  }),
}));

// ─── Clerk mock ───────────────────────────────────────────────────────────────

jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(),
  useUser: jest.fn(),
}));

// ─── expo-router mock ─────────────────────────────────────────────────────────

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    router: { back: jest.fn(), push: jest.fn() },
    useLocalSearchParams: jest.fn(() => ({})),
    useFocusEffect: (cb: () => (() => void) | void) => {
      React.useEffect(() => {
        cb();
      }, []); // eslint-disable-line react-hooks/exhaustive-deps
    },
  };
});

// ─── NetInfo mock — starts offline ────────────────────────────────────────────

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => () => {}),
    fetch: jest.fn(async () => ({
      isConnected: false,
      isInternetReachable: false,
    })),
  },
}));

// ─── useNetReconnect mock — captures the callback so tests can fire it ────────

let capturedReconnectCallback: (() => void) | null = null;

jest.mock("@/hooks/useNetReconnect", () => ({
  useNetReconnect: jest.fn((cb: () => void) => {
    capturedReconnectCallback = cb;
  }),
}));

// ─── Sync queue mock ──────────────────────────────────────────────────────────

jest.mock("@/lib/sync-queue", () => ({
  markPendingSync: jest.fn(async () => {}),
  clearPendingSync: jest.fn(async () => {}),
  hasPendingSync: jest.fn(async () => false),
  tryAcquireSyncLock: jest.fn(() => true),
  releaseSyncLock: jest.fn(),
}));

// ─── UI component / native mocks ──────────────────────────────────────────────

jest.mock("@/components/SyncBanner", () => ({ SyncBanner: () => null }));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium" },
}));

jest.mock("expo-print", () => ({
  printToFileAsync: jest.fn(async () => ({ uri: "file://fake.pdf" })),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(async () => {}),
}));

jest.mock("expo-asset", () => ({
  Asset: {
    fromModule: jest.fn(() => ({
      downloadAsync: jest.fn(async () => {}),
      localUri: "file://fake-asset.pdf",
      uri: "file://fake-asset.pdf",
    })),
  },
}));

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file://cache/",
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));

// ─── Birth-plan lib mock ──────────────────────────────────────────────────────

const FAKE_ANSWERS = {
  "pain-management": "epidural",
  "cord-blood": true,
};

jest.mock("@/lib/birth-plan", () => ({
  BIRTH_PLAN_SECTIONS: [],
  loadBirthPlanAnswers: jest.fn(),
  saveBirthPlanAnswers: jest.fn(async () => {}),
  buildBirthPlanHtml: jest.fn(() => "<html></html>"),
  getBirthPlanCacheOwner: jest.fn(async () => "user-bp-test"),
  setBirthPlanCacheOwner: jest.fn(async () => {}),
  clearBirthPlanCache: jest.fn(async () => {}),
  markBirthPlanGenerated: jest.fn(async () => {}),
}));

// ─── Sync API mock ────────────────────────────────────────────────────────────

jest.mock("@/lib/sync-api", () => ({
  apiLoadJournalEntries: jest.fn(),
  apiUpsertJournalEntry: jest.fn(),
  apiLoadHospitalBag: jest.fn(),
  apiSaveHospitalBag: jest.fn(),
  apiLoadBirthPlanAnswers: jest.fn(),
  apiSaveBirthPlanAnswers: jest.fn(),
  isServerUuid: jest.fn((id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  ),
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { useAuth, useUser } from "@clerk/expo";
import {
  apiLoadBirthPlanAnswers,
  apiSaveBirthPlanAnswers,
} from "@/lib/sync-api";
import { loadBirthPlanAnswers } from "@/lib/birth-plan";

const mockUseAuth = useAuth as jest.Mock;
const mockUseUser = useUser as jest.Mock;
const mockApiLoadBirthPlan = apiLoadBirthPlanAnswers as jest.Mock;
const mockApiSaveBirthPlan = apiSaveBirthPlanAnswers as jest.Mock;
const mockLoadAnswers = loadBirthPlanAnswers as jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setSignedIn(id = "user-bp-test") {
  mockUseAuth.mockReturnValue({
    isSignedIn: true,
    getToken: jest.fn(async () => "tok"),
  });
  mockUseUser.mockReturnValue({ user: { id } });
}

function setSignedOut() {
  mockUseAuth.mockReturnValue({
    isSignedIn: false,
    getToken: jest.fn(async () => null),
  });
  mockUseUser.mockReturnValue({ user: null });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Birth Plan — offline edits sync back on reconnect (useNetReconnect path)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedReconnectCallback = null;

    mockLoadAnswers.mockResolvedValue(FAKE_ANSWERS);
  });

  it("calls apiSaveBirthPlanAnswers with current answers when the reconnect callback fires", async () => {
    setSignedIn();

    // Mount-time load fails (offline); reconnect save succeeds.
    mockApiLoadBirthPlan.mockRejectedValueOnce(
      new Error("Network request failed"),
    );
    mockApiSaveBirthPlan.mockResolvedValue(undefined);

    const BirthPlanScreen = require("../app/birth-plan").default;
    act(() => {
      create(React.createElement(BirthPlanScreen));
    });

    // Let the offline fallback load settle.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Network is back — fire the reconnect callback.
    expect(capturedReconnectCallback).not.toBeNull();
    await act(async () => {
      capturedReconnectCallback!();
      await new Promise((r) => setTimeout(r, 0));
    });

    // The save must have been called once with the locally-held answers.
    expect(mockApiSaveBirthPlan).toHaveBeenCalledTimes(1);
    expect(mockApiSaveBirthPlan).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("does NOT call apiSaveBirthPlanAnswers on reconnect when the user is signed out", async () => {
    setSignedOut();

    mockApiLoadBirthPlan.mockRejectedValueOnce(
      new Error("Network request failed"),
    );
    mockApiSaveBirthPlan.mockResolvedValue(undefined);

    const BirthPlanScreen = require("../app/birth-plan").default;
    act(() => {
      create(React.createElement(BirthPlanScreen));
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(capturedReconnectCallback).not.toBeNull();
    await act(async () => {
      capturedReconnectCallback!();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiSaveBirthPlan).not.toHaveBeenCalled();
  });

  it("renders without crashing after the reconnect sync completes", async () => {
    setSignedIn();

    mockApiLoadBirthPlan.mockRejectedValueOnce(
      new Error("Network request failed"),
    );
    mockApiSaveBirthPlan.mockResolvedValue(undefined);

    const BirthPlanScreen = require("../app/birth-plan").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(BirthPlanScreen));
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      capturedReconnectCallback!();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(renderer!.toJSON()).not.toBeNull();
  });

  it("still renders when apiSaveBirthPlanAnswers rejects during reconnect sync", async () => {
    setSignedIn();

    mockApiLoadBirthPlan.mockRejectedValueOnce(
      new Error("Network request failed"),
    );
    mockApiSaveBirthPlan.mockRejectedValueOnce(new Error("timeout"));

    const BirthPlanScreen = require("../app/birth-plan").default;
    let renderer: ReturnType<typeof create>;
    expect(() => {
      act(() => {
        renderer = create(React.createElement(BirthPlanScreen));
      });
    }).not.toThrow();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      capturedReconnectCallback!();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(renderer!.toJSON()).not.toBeNull();
  });
});
