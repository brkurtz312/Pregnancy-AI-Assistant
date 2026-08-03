import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { act, create, type ReactTestInstance } from "react-test-renderer";

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(),
  useUser: jest.fn(),
}));

jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@workspace/api-client-react", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#fff",
    card: "#fff",
    border: "#eee",
    primary: "#ff69b4",
    foreground: "#000",
    mutedForeground: "#666",
    muted: "#f5f5f5",
    accent: "#f0f0f0",
    destructive: "#ef4444",
  }),
}));

const mockRefresh = jest.fn();

jest.mock("@/hooks/usePass", () => ({
  usePass: jest.fn(),
}));

jest.mock("@/lib/revenuecat", () => ({
  useSubscription: jest.fn(),
  isTestStore: jest.fn(() => false),
  isUserCancelledError: jest.fn(() => false),
}));

jest.mock("@/modules/WatchConnectivity", () => ({
  __esModule: true,
  default: { signOut: jest.fn(async () => {}) },
}));
// Obtain the mock reference after the factory is registered so there is no
// temporal-dead-zone issue with the factory closure.
const mockWatchSignOut = (
  jest.requireMock("@/modules/WatchConnectivity") as {
    default: { signOut: jest.Mock };
  }
).default.signOut;

import { useAuth, useUser } from "@clerk/expo";
import { useRouter } from "expo-router";
import { usePass } from "@/hooks/usePass";
import { useSubscription } from "@/lib/revenuecat";

import { AccountSheet } from "../components/AccountSheet";

const mockUseAuth = useAuth as jest.Mock;
const mockUseUser = useUser as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;
const mockUsePass = usePass as jest.Mock;
const mockUseSubscription = useSubscription as jest.Mock;

function makePassMock(overrides: Partial<ReturnType<typeof usePass>> = {}) {
  return {
    isSignedIn: true,
    hasPass: false,
    freeUsed: 0,
    freeLimit: 5,
    freeRemaining: 5,
    isLoading: false,
    startCheckout: jest.fn(),
    isStartingCheckout: false,
    redeemCode: jest.fn(),
    isRedeeming: false,
    reconcileRevenueCat: jest.fn().mockResolvedValue(undefined),
    isReconciling: false,
    refresh: mockRefresh,
    ...overrides,
  };
}

function makeSubscriptionMock() {
  return {
    available: true,
    customerInfo: undefined,
    offerings: undefined,
    passPackage: null,
    isSubscribed: false,
    isLoading: false,
    purchase: jest.fn(),
    restore: jest.fn(),
    isPurchasing: false,
    isRestoring: false,
  };
}

/** Flatten a React children value into a plain string. */
function flatText(children: unknown): string {
  if (children == null) return "";
  if (typeof children === "string" || typeof children === "number")
    return String(children);
  if (Array.isArray(children)) return children.map(flatText).join("");
  return "";
}

function touchableParent(
  node: ReactTestInstance,
): ReactTestInstance | undefined {
  let cur: ReactTestInstance | null = node.parent;
  while (cur) {
    if (cur.type === TouchableOpacity) return cur;
    cur = cur.parent;
  }
  return undefined;
}

function findBtn(
  root: ReactTestInstance,
  label: string,
): ReactTestInstance | undefined {
  const textNodes = root.findAllByType(Text);
  for (const t of textNodes) {
    if (flatText(t.props.children).includes(label)) {
      const btn = touchableParent(t);
      if (btn) return btn;
    }
  }
  return undefined;
}

const mockOnClose = jest.fn();

function renderSheet(visible = true) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      React.createElement(AccountSheet, { visible, onClose: mockOnClose }),
    );
  });
  return renderer;
}

describe("AccountSheet — sign-out error recovery", () => {
  beforeEach(() => {
    mockUseUser.mockReturnValue({
      user: { primaryEmailAddress: { emailAddress: "test@example.com" } },
    });
    mockUseRouter.mockReturnValue({ push: jest.fn() });
    mockUsePass.mockReturnValue(makePassMock());
    mockUseSubscription.mockReturnValue(makeSubscriptionMock());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows an error message and does NOT call onClose when signOut() rejects", async () => {
    const mockSignOut = jest.fn().mockRejectedValue(new Error("Network error"));
    mockUseAuth.mockReturnValue({ isSignedIn: true, signOut: mockSignOut });

    const renderer = renderSheet();
    await act(async () => {});

    const signOutBtn = findBtn(renderer.root, "Sign Out");
    expect(signOutBtn).toBeDefined();

    await act(async () => {
      await signOutBtn!.props.onPress();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();

    const allText = renderer.root
      .findAllByType(Text)
      .map((t) => flatText(t.props.children))
      .join(" ");
    expect(allText).toContain("Sign-out failed");
  });

  it("re-enables the sign-out button after a failure so the user can retry", async () => {
    const mockSignOut = jest.fn().mockRejectedValue(new Error("Network error"));
    mockUseAuth.mockReturnValue({ isSignedIn: true, signOut: mockSignOut });

    const renderer = renderSheet();
    await act(async () => {});

    await act(async () => {
      await findBtn(renderer.root, "Sign Out")!.props.onPress();
    });

    // Button should be re-enabled (not disabled) so the user can retry
    const signOutBtn = findBtn(renderer.root, "Sign Out");
    expect(signOutBtn).toBeDefined();
    expect(signOutBtn!.props.disabled).toBeFalsy();
  });

  it("calls pass.refresh() and onClose() when signOut() succeeds", async () => {
    const mockSignOut = jest.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({ isSignedIn: true, signOut: mockSignOut });

    const renderer = renderSheet();
    await act(async () => {});

    await act(async () => {
      await findBtn(renderer.root, "Sign Out")!.props.onPress();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });

  it("does NOT call WatchConnectivity.signOut when Clerk signOut() rejects (no data loss on failed sign-out)", async () => {
    const mockSignOut = jest.fn().mockRejectedValue(new Error("Network error"));
    mockUseAuth.mockReturnValue({ isSignedIn: true, signOut: mockSignOut });

    const renderer = renderSheet();
    await act(async () => {});

    await act(async () => {
      await findBtn(renderer.root, "Sign Out")!.props.onPress();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockWatchSignOut).not.toHaveBeenCalled();
  });

  it("calls WatchConnectivity.signOut after Clerk signOut() succeeds", async () => {
    const mockSignOut = jest.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({ isSignedIn: true, signOut: mockSignOut });

    const renderer = renderSheet();
    await act(async () => {});

    await act(async () => {
      await findBtn(renderer.root, "Sign Out")!.props.onPress();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockWatchSignOut).toHaveBeenCalledTimes(1);
  });

  it("clears the error and calls onClose when the user retries sign-out successfully after a prior failure", async () => {
    // First call rejects; second call resolves.
    const mockSignOut = jest
      .fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(undefined);
    mockUseAuth.mockReturnValue({ isSignedIn: true, signOut: mockSignOut });

    const renderer = renderSheet();
    await act(async () => {});

    // First tap → failure
    await act(async () => {
      await findBtn(renderer.root, "Sign Out")!.props.onPress();
    });

    // Error message should be visible
    const textAfterFailure = renderer.root
      .findAllByType(Text)
      .map((t) => flatText(t.props.children))
      .join(" ");
    expect(textAfterFailure).toContain("Sign-out failed");

    // Button must be re-enabled (not stuck in loading) so the retry is possible
    const retryBtn = findBtn(renderer.root, "Sign Out");
    expect(retryBtn).toBeDefined();
    expect(retryBtn!.props.disabled).toBeFalsy();

    // Second tap → success
    await act(async () => {
      await retryBtn!.props.onPress();
    });

    expect(mockSignOut).toHaveBeenCalledTimes(2);

    // Error message must be gone
    const textAfterRetry = renderer.root
      .findAllByType(Text)
      .map((t) => flatText(t.props.children))
      .join(" ");
    expect(textAfterRetry).not.toContain("Sign-out failed");

    // Sheet should have closed
    expect(mockOnClose).toHaveBeenCalledTimes(1);

    // pass.refresh() must also have been called on successful retry
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
