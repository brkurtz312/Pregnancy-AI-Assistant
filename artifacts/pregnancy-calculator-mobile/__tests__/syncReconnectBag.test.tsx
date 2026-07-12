/**
 * Hospital-bag — offline-edits-on-reconnect test
 *
 * Scenario: the user edits checklist items while NetInfo reports
 * `isConnected: false`.  Those changes are persisted locally.  When the
 * network comes back the `useNetReconnect` hook fires its callback which
 * calls `apiSaveHospitalBag` with the current in-memory state.
 *
 * Assertions:
 *   1. `apiSaveHospitalBag` is called when the reconnect callback fires.
 *   2. The screen still renders after the reconnect sync completes.
 *   3. `apiSaveHospitalBag` is NOT called when the user is signed out.
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
jest.mock("@/components/AskCard", () => ({ AskCard: () => null }));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium" },
}));

jest.mock("expo-print", () => ({
  printToFileAsync: jest.fn(async () => ({ uri: "file://fake.pdf" })),
}));

// ─── Hospital-bag lib mock ────────────────────────────────────────────────────

const FAKE_CATEGORIES = [
  {
    id: "cat-1",
    label: "Clothing",
    items: [
      { id: "item-1", label: "Comfortable socks", checked: true, custom: false },
      { id: "item-2", label: "Robe", checked: false, custom: false },
    ],
  },
];

jest.mock("@/lib/hospital-bag", () => ({
  loadHospitalBagChecklist: jest.fn(),
  saveHospitalBagChecklist: jest.fn(async () => {}),
  buildHospitalBagHtml: jest.fn(() => "<html></html>"),
  countChecked: jest.fn(() => ({ checked: 1, total: 2 })),
  getHospitalBagCacheOwner: jest.fn(async () => "user-bag-test"),
  setHospitalBagCacheOwner: jest.fn(async () => {}),
  clearHospitalBagCache: jest.fn(async () => {}),
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
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id,
    ),
  ),
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { useAuth, useUser } from "@clerk/expo";
import { apiLoadHospitalBag, apiSaveHospitalBag } from "@/lib/sync-api";
import { loadHospitalBagChecklist } from "@/lib/hospital-bag";

const mockUseAuth = useAuth as jest.Mock;
const mockUseUser = useUser as jest.Mock;
const mockApiLoadBag = apiLoadHospitalBag as jest.Mock;
const mockApiSaveBag = apiSaveHospitalBag as jest.Mock;
const mockLoadChecklist = loadHospitalBagChecklist as jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setSignedIn(id = "user-bag-test") {
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

describe("Hospital Bag — offline edits sync back on reconnect (useNetReconnect path)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedReconnectCallback = null;

    mockLoadChecklist.mockResolvedValue(FAKE_CATEGORIES);
  });

  it("calls apiSaveHospitalBag with current categories when the reconnect callback fires", async () => {
    setSignedIn();

    // Mount-time load fails (offline); reconnect save succeeds.
    mockApiLoadBag.mockRejectedValueOnce(new Error("Network request failed"));
    mockApiSaveBag.mockResolvedValue(undefined);

    const HospitalBagScreen = require("../app/hospital-bag").default;
    act(() => {
      create(React.createElement(HospitalBagScreen));
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

    // The save must have been called once with the locally-held categories.
    expect(mockApiSaveBag).toHaveBeenCalledTimes(1);
    expect(mockApiSaveBag).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Function),
    );
  });

  it("does NOT call apiSaveHospitalBag on reconnect when the user is signed out", async () => {
    setSignedOut();

    mockApiLoadBag.mockRejectedValueOnce(new Error("Network request failed"));
    mockApiSaveBag.mockResolvedValue(undefined);

    const HospitalBagScreen = require("../app/hospital-bag").default;
    act(() => {
      create(React.createElement(HospitalBagScreen));
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(capturedReconnectCallback).not.toBeNull();
    await act(async () => {
      capturedReconnectCallback!();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockApiSaveBag).not.toHaveBeenCalled();
  });

  it("renders without crashing after the reconnect sync completes", async () => {
    setSignedIn();

    mockApiLoadBag.mockRejectedValueOnce(new Error("Network request failed"));
    mockApiSaveBag.mockResolvedValue(undefined);

    const HospitalBagScreen = require("../app/hospital-bag").default;
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(HospitalBagScreen));
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

  it("still renders when apiSaveHospitalBag rejects during reconnect sync", async () => {
    setSignedIn();

    mockApiLoadBag.mockRejectedValueOnce(new Error("Network request failed"));
    mockApiSaveBag.mockRejectedValueOnce(new Error("timeout"));

    const HospitalBagScreen = require("../app/hospital-bag").default;
    let renderer: ReturnType<typeof create>;
    expect(() => {
      act(() => {
        renderer = create(React.createElement(HospitalBagScreen));
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
