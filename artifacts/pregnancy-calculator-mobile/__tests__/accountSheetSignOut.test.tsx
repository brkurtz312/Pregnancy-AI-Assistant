import React from "react";
import { ActivityIndicator, Text, TouchableOpacity } from "react-native";
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
  useDeleteAccount: jest.fn(),
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: jest.fn(),
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

jest.mock("@/lib/appointment-reminders", () => ({
  cancelAllAppointmentReminders: jest.fn(async () => {}),
}));
jest.mock("@/lib/session-cleanup", () => ({
  clearSignedOutUserData: jest.fn(),
}));
const mockCancelAllReminders = (
  jest.requireMock("@/lib/appointment-reminders") as {
    cancelAllAppointmentReminders: jest.Mock;
  }
).cancelAllAppointmentReminders;
// Obtain the mock reference after the factory is registered so there is no
// temporal-dead-zone issue with the factory closure.
const mockWatchSignOut = (
  jest.requireMock("@/modules/WatchConnectivity") as {
    default: { signOut: jest.Mock };
  }
).default.signOut;

import { useAuth, useUser } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { usePass } from "@/hooks/usePass";
import { useSubscription } from "@/lib/revenuecat";
import { useDeleteAccount } from "@workspace/api-client-react";
import { clearSignedOutUserData } from "@/lib/session-cleanup";

import { AccountSheet } from "../components/AccountSheet";

const mockUseAuth = useAuth as jest.Mock;
const mockUseUser = useUser as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;
const mockUsePass = usePass as jest.Mock;
const mockUseSubscription = useSubscription as jest.Mock;
const mockUseDeleteAccount = useDeleteAccount as jest.Mock;
const mockUseQueryClient = useQueryClient as jest.Mock;
const mockClearSignedOutUserData = clearSignedOutUserData as jest.Mock;

const mockQueryClient = {
  cancelQueries: jest.fn(() => Promise.resolve()),
  clear: jest.fn(),
};

function makePassMock(overrides: Partial<ReturnType<typeof usePass>> = {}) {
  return {
    isSignedIn: true,
    hasPass: false,
    freeUsed: 0,
    freeLimit: 5,
    freeRemaining: 5,
    isLoading: false,
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
    mockUseQueryClient.mockReturnValue(mockQueryClient);
    mockUseDeleteAccount.mockReturnValue({
      mutateAsync: jest.fn(async () => {}),
      isPending: false,
    });
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

  it("does NOT call WatchConnectivity.signOut directly (AuthTokenBridge handles it centrally)", async () => {
    // AccountSheet previously called WatchConnectivity.signOut() after Clerk
    // signOut() resolved. That created a duplicate message: AuthTokenBridge
    // fires on every session → null transition (covering both manual and 401
    // auto-sign-out paths), so the second AccountSheet call was redundant.
    // The call has been removed from AccountSheet; this test confirms it stays
    // removed so the Watch never receives duplicate sign-out signals.
    const mockSignOut = jest.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({ isSignedIn: true, signOut: mockSignOut });

    const renderer = renderSheet();
    await act(async () => {});

    await act(async () => {
      await findBtn(renderer.root, "Sign Out")!.props.onPress();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockWatchSignOut).not.toHaveBeenCalled();
  });

  it("does NOT cancel appointment reminders when signOut() rejects (reminders still fire)", async () => {
    const mockSignOut = jest.fn().mockRejectedValue(new Error("Network error"));
    mockUseAuth.mockReturnValue({ isSignedIn: true, signOut: mockSignOut });

    const renderer = renderSheet();
    await act(async () => {});

    await act(async () => {
      await findBtn(renderer.root, "Sign Out")!.props.onPress();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockCancelAllReminders).not.toHaveBeenCalled();
  });

  it("cancels appointment reminders only after signOut() succeeds", async () => {
    const mockSignOut = jest.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({ isSignedIn: true, signOut: mockSignOut });

    const renderer = renderSheet();
    await act(async () => {});

    await act(async () => {
      await findBtn(renderer.root, "Sign Out")!.props.onPress();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockCancelAllReminders).toHaveBeenCalledTimes(1);
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

  it("disables the button and shows a spinner while the retry sign-out is in flight", async () => {
    // First call rejects; second call stays pending until we resolve it.
    let resolveRetry!: () => void;
    const retryPromise = new Promise<void>((resolve) => {
      resolveRetry = resolve;
    });
    const mockSignOut = jest
      .fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockReturnValueOnce(retryPromise);
    mockUseAuth.mockReturnValue({ isSignedIn: true, signOut: mockSignOut });

    const renderer = renderSheet();
    await act(async () => {});

    // First tap → failure, button re-enabled with visible label
    await act(async () => {
      await findBtn(renderer.root, "Sign Out")!.props.onPress();
    });
    const retryBtn = findBtn(renderer.root, "Sign Out");
    expect(retryBtn).toBeDefined();
    expect(retryBtn!.props.disabled).toBeFalsy();

    // Second tap → held unresolved: press without awaiting completion.
    await act(async () => {
      retryBtn!.props.onPress();
    });

    // Mid-flight: the "Sign Out" label is replaced by a spinner…
    expect(findBtn(renderer.root, "Sign Out")).toBeUndefined();
    const spinners = renderer.root.findAllByType(ActivityIndicator);
    const spinnerBtn = spinners
      .map((s) => touchableParent(s))
      .find((btn) => btn !== undefined);
    expect(spinnerBtn).toBeDefined();

    // …and the button is disabled so a double-tap cannot fire signOut twice.
    expect(spinnerBtn!.props.disabled).toBe(true);
    expect(mockSignOut).toHaveBeenCalledTimes(2);

    // Resolve the retry: sheet closes and pass state refreshes.
    await act(async () => {
      resolveRetry();
      await retryPromise;
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});

describe("AccountSheet — permanent account deletion", () => {
  beforeEach(() => {
    mockUseUser.mockReturnValue({
      user: { primaryEmailAddress: { emailAddress: "test@example.com" } },
    });
    mockUseRouter.mockReturnValue({ push: jest.fn() });
    mockUsePass.mockReturnValue(makePassMock());
    mockUseSubscription.mockReturnValue(makeSubscriptionMock());
    mockUseQueryClient.mockReturnValue(mockQueryClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("requires a second, clearly destructive confirmation before deleting", async () => {
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      signOut: jest.fn(async () => {}),
    });
    mockUseDeleteAccount.mockReturnValue({
      mutateAsync: jest.fn(async () => {}),
      isPending: false,
    });

    const renderer = renderSheet();
    await act(async () => {});

    expect(
      findBtn(renderer.root, "Permanently Delete Account"),
    ).toBeUndefined();

    await act(async () => {
      findBtn(renderer.root, "Delete Account")!.props.onPress();
    });

    const text = renderer.root
      .findAllByType(Text)
      .map((t) => flatText(t.props.children))
      .join(" ");
    expect(text).toContain("This permanently deletes your profile");
    expect(findBtn(renderer.root, "Permanently Delete Account")).toBeDefined();
  });

  it("deletes the authenticated account, then signs out and closes the sheet", async () => {
    const mutateAsync = jest.fn(async () => {});
    const signOut = jest.fn(async () => {});
    mockUseAuth.mockReturnValue({ isSignedIn: true, signOut });
    mockUseDeleteAccount.mockReturnValue({ mutateAsync, isPending: false });

    const renderer = renderSheet();
    await act(async () => {});
    await act(async () => {
      findBtn(renderer.root, "Delete Account")!.props.onPress();
    });
    await act(async () => {
      await findBtn(
        renderer.root,
        "Permanently Delete Account",
      )!.props.onPress();
    });

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the user signed in and explains the failure when deletion is rejected", async () => {
    const mutateAsync = jest.fn().mockRejectedValue(new Error("offline"));
    const signOut = jest.fn(async () => {});
    mockUseAuth.mockReturnValue({ isSignedIn: true, signOut });
    mockUseDeleteAccount.mockReturnValue({ mutateAsync, isPending: false });

    const renderer = renderSheet();
    await act(async () => {});
    await act(async () => {
      findBtn(renderer.root, "Delete Account")!.props.onPress();
    });
    await act(async () => {
      await findBtn(
        renderer.root,
        "Permanently Delete Account",
      )!.props.onPress();
    });

    expect(signOut).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
    const text = renderer.root
      .findAllByType(Text)
      .map((t) => flatText(t.props.children))
      .join(" ");
    expect(text).toContain("We couldn't delete your account");
  });

  it("clears local data if deletion succeeds but client sign-out fails", async () => {
    const mutateAsync = jest.fn(async () => {});
    const signOut = jest.fn().mockRejectedValue(new Error("offline"));
    mockUseAuth.mockReturnValue({ isSignedIn: true, signOut });
    mockUseDeleteAccount.mockReturnValue({ mutateAsync, isPending: false });

    const renderer = renderSheet();
    await act(async () => {});
    await act(async () => {
      findBtn(renderer.root, "Delete Account")!.props.onPress();
    });
    await act(async () => {
      await findBtn(
        renderer.root,
        "Permanently Delete Account",
      )!.props.onPress();
    });

    expect(mockClearSignedOutUserData).toHaveBeenCalledWith(
      mockQueryClient,
      null,
    );
    expect(mockOnClose).not.toHaveBeenCalled();
    const text = renderer.root
      .findAllByType(Text)
      .map((t) => flatText(t.props.children))
      .join(" ");
    expect(text).toContain("device's data was cleared");
  });
});
