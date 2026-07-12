/**
 * Tests confirming the "All changes saved" success toast appears in the
 * rendered output after a reconnect sync succeeds, and that it auto-dismisses
 * after ~2 s (verified with jest fake timers).
 *
 * Unlike syncRetryOnReconnect.test.tsx, this file does NOT mock SyncBanner so
 * the real component is rendered and its text content can be inspected.
 */

import React from "react";
import { Text, TouchableOpacity } from "react-native";
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

// ─── NetInfo (no-op listener, start online) ───────────────────────────────────

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => () => {}),
    fetch: jest.fn(async () => ({
      isConnected: true,
      isInternetReachable: true,
    })),
  },
}));

// ─── useNetReconnect — captures callback so tests can fire it ─────────────────

let capturedReconnectCb: (() => void) | null = null;

jest.mock("@/hooks/useNetReconnect", () => ({
  useNetReconnect: jest.fn((cb: () => void) => {
    capturedReconnectCb = cb;
  }),
}));

// ─── Shared misc mocks ────────────────────────────────────────────────────────

jest.mock("@/lib/sync-queue", () => ({
  markPendingSync: jest.fn(async () => {}),
  clearPendingSync: jest.fn(async () => {}),
  hasPendingSync: jest.fn(async () => false),
  tryAcquireSyncLock: jest.fn(() => true),
  releaseSyncLock: jest.fn(),
}));

// ─── Hospital-bag-specific mocks ──────────────────────────────────────────────

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium", Heavy: "Heavy" },
}));

jest.mock("expo-print", () => ({
  printToFileAsync: jest.fn(async () => ({ uri: "file://test.pdf" })),
}));

jest.mock("@/components/AskCard", () => ({ AskCard: () => null }));

jest.mock("@/lib/hospital-bag", () => ({
  loadHospitalBagChecklist: jest.fn(),
  saveHospitalBagChecklist: jest.fn(async () => {}),
  countChecked: jest.fn(() => ({ checked: 1, total: 1 })),
  buildHospitalBagHtml: jest.fn(() => "<html/>"),
  getHospitalBagCacheOwner: jest.fn(async () => null),
  setHospitalBagCacheOwner: jest.fn(async () => {}),
  clearHospitalBagCache: jest.fn(async () => {}),
}));

// ─── sync-api mock ────────────────────────────────────────────────────────────

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

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { useAuth, useUser } from "@clerk/expo";
import { apiLoadHospitalBag, apiSaveHospitalBag } from "@/lib/sync-api";
import {
  loadHospitalBagChecklist,
  saveHospitalBagChecklist,
  getHospitalBagCacheOwner,
} from "@/lib/hospital-bag";

const mockUseAuth = useAuth as jest.Mock;
const mockUseUser = useUser as jest.Mock;
const mockApiLoadHospitalBag = apiLoadHospitalBag as jest.Mock;
const mockApiSaveHospitalBag = apiSaveHospitalBag as jest.Mock;
const mockLoadHospitalBag = loadHospitalBagChecklist as jest.Mock;
const mockSaveHospitalBag = saveHospitalBagChecklist as jest.Mock;
const mockGetHospitalBagCacheOwner = getHospitalBagCacheOwner as jest.Mock;

function setSignedIn(id = "user-123") {
  mockUseAuth.mockReturnValue({
    isSignedIn: true,
    getToken: jest.fn(async () => "tok"),
  });
  mockUseUser.mockReturnValue({ user: { id } });
}

const CATEGORIES = [
  {
    id: "cat1",
    title: "For Mum",
    items: [{ id: "item1", label: "Pyjamas", checked: false }],
  },
];

/** Returns all text strings currently rendered in the tree. */
function allTexts(root: ReturnType<typeof create>["root"]): string[] {
  return root
    .findAllByType(Text)
    .map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.join("") : String(c ?? "");
    })
    .filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// Hospital Bag — success toast after reconnect
// ─────────────────────────────────────────────────────────────────────────────

describe('Hospital Bag — "All changes saved" toast appears then auto-dismisses after reconnect', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    capturedReconnectCb = null;
    setSignedIn();
    mockSaveHospitalBag.mockResolvedValue(undefined);
    mockGetHospitalBagCacheOwner.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows green 'All changes saved' text on reconnect success and hides it after 2 s", async () => {
    // Initial load succeeds
    mockApiLoadHospitalBag.mockResolvedValue(CATEGORIES);
    mockLoadHospitalBag.mockResolvedValue(CATEGORIES);

    // First save attempt (after user toggle) fails — device is offline
    mockApiSaveHospitalBag
      .mockRejectedValueOnce(new Error("no network"))
      // Retry on reconnect succeeds
      .mockResolvedValue(undefined);

    const HospitalBagScreen = require("../app/hospital-bag").default;
    let renderer: ReturnType<typeof create>;

    act(() => {
      renderer = create(React.createElement(HospitalBagScreen));
    });

    // Let mount effects settle (Promise microtasks)
    await act(async () => {
      await Promise.resolve();
    });

    // Trigger a checkbox toggle → persist → apiSaveHospitalBag (fails offline)
    const root = renderer!.root;
    const itemToggles = root.findAll(
      (n: { type: unknown; props: { activeOpacity?: number } }) =>
        n.type === TouchableOpacity && n.props.activeOpacity === 0.7,
    );
    expect(itemToggles.length).toBeGreaterThan(0);

    await act(async () => {
      itemToggles[0].props.onPress();
      await Promise.resolve();
    });

    // The offline banner is now visible (syncFailed=true); success toast not yet shown
    expect(allTexts(root)).not.toContain("All changes saved");

    // Reconnect callback must have been registered
    expect(capturedReconnectCb).not.toBeNull();

    // Simulate the network coming back online — retry succeeds
    await act(async () => {
      capturedReconnectCb!();
      await Promise.resolve();
    });

    // "All changes saved" should now be visible in the tree
    expect(allTexts(root)).toContain("All changes saved");

    // Advance time past the 2 s auto-dismiss threshold
    act(() => {
      jest.advanceTimersByTime(2100);
    });

    // The success message should have been replaced by the offline fallback text
    expect(allTexts(root)).not.toContain("All changes saved");
  });
});
