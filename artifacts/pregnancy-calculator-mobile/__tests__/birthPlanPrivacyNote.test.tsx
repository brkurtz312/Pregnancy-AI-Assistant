/**
 * Unit tests for the Birth Plan privacy note.
 *
 * The note box in birth-plan.tsx shows different text depending on whether the
 * user is signed in:
 *
 *   Signed out → "saved on this device only when you're not signed in. Sign in
 *                  to sync your birth plan across devices."
 *   Signed in  → "sync securely to your account so they're available on all
 *                  your devices."
 *
 * This is the UI side of the device-switch guarantee: the user is told exactly
 * whether their data is local-only or server-synced.
 */

import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(),
  useUser: jest.fn(),
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock("expo-asset", () => ({
  Asset: {
    fromModule: jest.fn(() => ({
      downloadAsync: jest.fn(async () => {}),
      localUri: null,
      uri: "file://sample.pdf",
    })),
  },
}));

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "cache://",
  copyAsync: jest.fn(async () => {}),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: "Medium" },
}));

jest.mock("expo-print", () => ({
  printToFileAsync: jest.fn(async () => ({ uri: "file://output.pdf" })),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(async () => {}),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#fff",
    card: "#fff",
    border: "#eee",
    primary: "#ff69b4",
    primaryForeground: "#fff",
    foreground: "#000",
    mutedForeground: "#666",
    muted: "#f5f5f5",
  }),
}));

jest.mock("@/lib/birth-plan", () => ({
  BIRTH_PLAN_SECTIONS: [],
  buildBirthPlanHtml: jest.fn(() => "<html/>"),
  loadBirthPlanAnswers: jest.fn(async () => ({})),
  saveBirthPlanAnswers: jest.fn(async () => {}),
  markBirthPlanGenerated: jest.fn(async () => {}),
  getBirthPlanCacheOwner: jest.fn(async () => null),
  setBirthPlanCacheOwner: jest.fn(async () => {}),
  clearBirthPlanCache: jest.fn(async () => {}),
}));

jest.mock("@/lib/sync-api", () => ({
  apiLoadBirthPlanAnswers: jest.fn(async () => null),
  apiSaveBirthPlanAnswers: jest.fn(async () => {}),
}));

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

jest.mock("@/lib/sync-queue", () => ({
  markPendingSync: jest.fn(async () => {}),
  clearPendingSync: jest.fn(async () => {}),
  hasPendingSync: jest.fn(async () => false),
  tryAcquireSyncLock: jest.fn(() => true),
  releaseSyncLock: jest.fn(),
}));

jest.mock("@/hooks/useNetReconnect", () => ({
  useNetReconnect: jest.fn(),
}));

jest.mock("@/components/SyncBanner", () => ({
  SyncBanner: () => null,
}));

// The screen has a static require for the blank PDF asset. jest-expo transforms
// asset requires to numbers; mock it so the module resolves cleanly.
jest.mock("../assets/docs/sample-birth-plan.pdf", () => 1, { virtual: true });

import { useAuth, useUser } from "@clerk/expo";
import BirthPlanScreen from "../app/birth-plan";

const mockUseAuth = useAuth as jest.Mock;
const mockUseUser = useUser as jest.Mock;

function renderBirthPlan(isSignedIn: boolean) {
  mockUseAuth.mockReturnValue({
    isSignedIn,
    getToken: jest.fn(async () => (isSignedIn ? "mock-token" : null)),
  });
  mockUseUser.mockReturnValue({
    user: isSignedIn ? { id: "user_test_1" } : null,
  });

  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(BirthPlanScreen));
  });
  return renderer;
}

describe("Birth Plan — privacy note updates with sign-in state", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows the device-only message when the user is signed out", async () => {
    const renderer = renderBirthPlan(false);
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("saved on this device only");
    expect(json).not.toContain("sync securely to your account");
  });

  it("prompts the user to sign in to sync when signed out", async () => {
    const renderer = renderBirthPlan(false);
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Sign in to sync your birth plan across devices");
  });

  it("shows the cross-device sync message when the user is signed in", async () => {
    const renderer = renderBirthPlan(true);
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("sync securely to your account");
    expect(json).toContain("available on all your devices");
    expect(json).not.toContain("saved on this device only");
  });

  it("does not show the sign-in prompt when the user is already signed in", async () => {
    const renderer = renderBirthPlan(true);
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Sign in to sync");
  });
});
