/**
 * appleSSOFlow.test.tsx
 *
 * Verifies the visible "Sign in with Apple" button in the sign-in and sign-up
 * screens correctly wires up Clerk's Apple hooks and handles cancellation
 * gracefully.  The Apple button is iOS-only, so these tests temporarily
 * set Platform.OS to "ios".
 *
 * Sign-in uses useSignInWithApple / startAppleAuthenticationFlow (native Apple
 * auth sheet — no redirectUrl needed or passed).
 * Sign-up uses useSSO / startSSOFlow with strategy:"oauth_apple" (also no
 * redirectUrl).
 *
 * Cases covered for each screen:
 *   1. The button renders on iOS.
 *   2. The correct flow function is called.
 *   3. A successful session activates the session and navigates away.
 *   4. An ERR_CANCELED error (Apple sheet dismissed) shows NO error message.
 *   5. A genuine Apple auth error DOES show an error message.
 *   6. A null session (no createdSessionId) shows a notice but does not navigate.
 */

import React from "react";
import { Platform, Text, TouchableOpacity } from "react-native";
import { act, create, type ReactTestInstance } from "react-test-renderer";

// ─── module-level mocks ──────────────────────────────────────────────────────

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  warmUpAsync: jest.fn(),
  coolDownAsync: jest.fn(),
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      scheme: "pregnancy-calculator-mobile",
    },
  },
}));

jest.mock("expo-auth-session", () => ({
  makeRedirectUri: jest.fn(({ scheme }: { scheme: string }) => `${scheme}://`),
}));

// ─── sign-in: mock @clerk/expo/apple (native Apple auth sheet) ───────────────
const mockStartAppleAuthFlow = jest.fn();
jest.mock("@clerk/expo/apple", () => ({
  useSignInWithApple: jest.fn(() => ({
    startAppleAuthenticationFlow: mockStartAppleAuthFlow,
  })),
}));

const mockSignIn = {
  password: jest.fn(),
  finalize: jest.fn(),
};
const mockSignUp = {
  status: "idle",
  unverifiedFields: [] as string[],
  password: jest.fn(),
  verifications: {
    sendEmailCode: jest.fn(),
    verifyEmailCode: jest.fn(),
  },
  finalize: jest.fn(),
};
const mockErrors = {
  fields: {},
};
jest.mock("@clerk/expo", () => ({
  useSSO: jest.fn(),
  useClerk: jest.fn(() => ({ setActive: jest.fn() })),
  useSignIn: jest.fn(),
  useSignUp: jest.fn(),
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

jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#fff",
    card: "#fff",
    border: "#eee",
    primary: "#ff69b4",
    foreground: "#000",
    mutedForeground: "#666",
    destructive: "#f00",
  }),
}));

// ─── imports (after mocks) ───────────────────────────────────────────────────

import { useSSO, useSignIn, useSignUp } from "@clerk/expo";
import { useRouter } from "expo-router";

import SignInScreen from "../app/(auth)/sign-in";
import SignUpScreen from "../app/(auth)/sign-up";

const mockUseSSO = useSSO as jest.Mock;
const mockUseSignIn = useSignIn as jest.Mock;
const mockUseSignUp = useSignUp as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;

// ─── helpers ─────────────────────────────────────────────────────────────────

function findAppleButton(root: ReactTestInstance): ReactTestInstance {
  const label = root
    .findAllByType(Text)
    .find((t) => t.props.children === "Sign in with Apple");
  expect(label).toBeDefined();

  let node: ReactTestInstance | null | undefined = label;
  while (node?.parent) {
    node = node.parent;
    if (node.type === TouchableOpacity) return node;
  }
  throw new Error(
    "Could not find TouchableOpacity wrapping 'Sign in with Apple'",
  );
}

// ─── sign-in screen (uses useSignInWithApple / startAppleAuthenticationFlow) ──

describe("SignInScreen — Apple SSO", () => {
  let dismissAll: jest.Mock;
  let replace: jest.Mock;
  let back: jest.Mock;
  let originalOS: typeof Platform.OS;

  beforeAll(() => {
    originalOS = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "ios", writable: true });
  });

  afterAll(() => {
    Object.defineProperty(Platform, "OS", {
      value: originalOS,
      writable: true,
    });
  });

  beforeEach(() => {
    dismissAll = jest.fn();
    replace = jest.fn();
    back = jest.fn();
    mockUseRouter.mockReturnValue({ dismissAll, back, replace });
    mockUseSSO.mockReturnValue({ startSSOFlow: jest.fn() });
    mockUseSignIn.mockReturnValue({
      signIn: mockSignIn,
      errors: mockErrors,
      fetchStatus: "idle",
    });
    mockStartAppleAuthFlow.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the "Sign in with Apple" button on iOS', async () => {
    mockStartAppleAuthFlow.mockResolvedValue({});

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Sign in with Apple");
  });

  it("calls startAppleAuthenticationFlow with no arguments", async () => {
    mockStartAppleAuthFlow.mockResolvedValue({
      createdSessionId: null,
      setActive: null,
    });

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findAppleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    expect(mockStartAppleAuthFlow).toHaveBeenCalledTimes(1);
    // Native Apple auth uses the system sheet — it must not receive any
    // redirectUrl (Apple rejects custom-scheme redirect URIs for web OAuth).
    expect(mockStartAppleAuthFlow).toHaveBeenCalledWith(/* no args */);
  });

  it("calls setActive and opens the app when Apple SSO returns a session", async () => {
    const setActive = jest.fn().mockResolvedValue(undefined);
    mockStartAppleAuthFlow.mockResolvedValue({
      createdSessionId: "sess_apple_123",
      setActive,
    });

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findAppleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    expect(setActive).toHaveBeenCalledWith({ session: "sess_apple_123" });
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("does NOT show an error when the Apple sheet is dismissed (ERR_CANCELED)", async () => {
    // Apple fires { code: "ERR_CANCELED" } when the native sheet is dismissed.
    mockStartAppleAuthFlow.mockRejectedValue({ code: "ERR_CANCELED" });

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findAppleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Apple sign-in failed");
    expect(json).not.toContain("Apple sign-in could not be completed");
    expect(dismissAll).not.toHaveBeenCalled();
    // Button must be re-enabled after the dismissed flow
    expect(btn.props.disabled).toBe(false);
  });

  it("DOES show an error when Apple SSO rejects with a real failure (not a cancel)", async () => {
    // No message on the error so the component renders the generic fallback
    mockStartAppleAuthFlow.mockRejectedValue(new Error());

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findAppleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Apple sign-in failed");
    expect(dismissAll).not.toHaveBeenCalled();
  });

  it("shows NO error when Apple SSO resolves with null session (native sheet dismissed)", async () => {
    // Clerk resolves — not rejects — with { createdSessionId: null } when the
    // user dismisses the native Apple sheet. This must be treated as a silent
    // cancellation, not a failure.
    mockStartAppleAuthFlow.mockResolvedValue({
      createdSessionId: null,
      setActive: null,
    });

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findAppleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Apple sign-in could not be completed");
    expect(json).not.toContain("Apple sign-in failed");
    expect(dismissAll).not.toHaveBeenCalled();
    expect(btn.props.disabled).toBe(false);
  });
});

// ─── sign-up screen (uses useSignInWithApple / startAppleAuthenticationFlow) ──

describe("SignUpScreen — Apple SSO", () => {
  let replace: jest.Mock;
  let back: jest.Mock;
  let originalOS: typeof Platform.OS;

  beforeAll(() => {
    originalOS = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "ios", writable: true });
  });

  afterAll(() => {
    Object.defineProperty(Platform, "OS", {
      value: originalOS,
      writable: true,
    });
  });

  beforeEach(() => {
    replace = jest.fn();
    back = jest.fn();
    mockUseRouter.mockReturnValue({ replace, back });
    mockUseSSO.mockReturnValue({ startSSOFlow: jest.fn() });
    mockUseSignUp.mockReturnValue({
      signUp: mockSignUp,
      errors: mockErrors,
      fetchStatus: "idle",
    });
    mockStartAppleAuthFlow.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the "Sign in with Apple" button on iOS', async () => {
    mockStartAppleAuthFlow.mockResolvedValue({});

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Sign in with Apple");
  });

  it("calls startAppleAuthenticationFlow with no arguments", async () => {
    mockStartAppleAuthFlow.mockResolvedValue({
      createdSessionId: null,
      setActive: null,
    });

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const btn = findAppleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    expect(mockStartAppleAuthFlow).toHaveBeenCalledTimes(1);
    // Native Apple auth uses the system sheet — it must not receive any
    // redirectUrl (Apple rejects custom-scheme redirect URIs for web OAuth).
    expect(mockStartAppleAuthFlow).toHaveBeenCalledWith(/* no args */);
  });

  it("calls setActive and navigates to root when Apple SSO returns a session", async () => {
    const setActive = jest.fn().mockResolvedValue(undefined);
    mockStartAppleAuthFlow.mockResolvedValue({
      createdSessionId: "sess_apple_456",
      setActive,
    });

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const btn = findAppleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    expect(setActive).toHaveBeenCalledWith({ session: "sess_apple_456" });
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("does NOT show an error when the Apple sheet is dismissed (ERR_CANCELED)", async () => {
    mockStartAppleAuthFlow.mockRejectedValue({ code: "ERR_CANCELED" });

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const btn = findAppleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Apple sign-in failed");
    expect(json).not.toContain("Apple sign-in could not be completed");
    expect(replace).not.toHaveBeenCalled();
    expect(btn.props.disabled).toBe(false);
  });

  it("DOES show an error when Apple SSO rejects with a real failure (not a cancel)", async () => {
    // No message on the error so the component renders the generic fallback
    mockStartAppleAuthFlow.mockRejectedValue(new Error());

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const btn = findAppleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Apple sign-in failed");
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows NO error when Apple SSO resolves with null session (native sheet dismissed)", async () => {
    // Clerk resolves — not rejects — with { createdSessionId: null } when the
    // user dismisses the native Apple sheet. This must be treated as a silent
    // cancellation, not a failure.
    mockStartAppleAuthFlow.mockResolvedValue({
      createdSessionId: null,
      setActive: null,
    });

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const btn = findAppleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Apple sign-in could not be completed");
    expect(json).not.toContain("Apple sign-in failed");
    expect(replace).not.toHaveBeenCalled();
    expect(btn.props.disabled).toBe(false);
  });
});
