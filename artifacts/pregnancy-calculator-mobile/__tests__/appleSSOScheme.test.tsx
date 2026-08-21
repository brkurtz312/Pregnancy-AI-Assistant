/**
 * appleSSOScheme.test.tsx
 *
 * Smoke-tests that confirm neither Apple Sign-In path passes a hardcoded
 * scheme or redirectUrl.
 *
 * Background
 * ──────────
 * The Google SSO paths (sign-in and sign-up) both read the custom URL scheme
 * from Constants.expoConfig.scheme (app.json) and pass it to
 * AuthSession.makeRedirectUri.  Apple Sign-In intentionally does NOT do this:
 *
 *   • sign-in  uses useSignInWithApple / startAppleAuthenticationFlow() — the
 *     native Apple auth sheet, which has no redirect URL concept.  Apple
 *     blocks custom-scheme redirect URIs for its web OAuth flow, so the native
 *     path must never receive a redirectUrl argument.
 *
 *   • sign-up  also uses useSignInWithApple / startAppleAuthenticationFlow() —
 *     the same native Apple auth sheet, for the same reason.
 *
 * These tests are regression guards.  If a redirectUrl is ever added to the
 * Apple path it MUST come from Constants.expoConfig.scheme (app.json), not a
 * hardcoded string.  Mirror the assertions in googleSSOScheme.test.tsx for
 * that case.
 *
 * Cases covered:
 *   1. sign-in: startAppleAuthenticationFlow is called with no arguments
 *      (no redirectUrl, no scheme).
 *   2. sign-up: startAppleAuthenticationFlow is called with no arguments.
 *   3. sign-up: a second call also confirms no redirectUrl property.
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
    expoConfig: { scheme: "pregnancy-calculator-mobile" },
  },
}));

jest.mock("expo-auth-session", () => ({
  makeRedirectUri: jest.fn(({ scheme }: { scheme: string }) => `${scheme}://`),
}));

// ─── sign-in: @clerk/expo/apple (native Apple auth sheet) ────────────────────
const mockStartAppleAuthFlow = jest.fn();
jest.mock("@clerk/expo/apple", () => ({
  useSignInWithApple: jest.fn(() => ({
    startAppleAuthenticationFlow: mockStartAppleAuthFlow,
  })),
}));

// ─── sign-up: @clerk/expo (OAuth SSO) ────────────────────────────────────────
const mockStartSSOFlow = jest.fn();
jest.mock("@clerk/expo", () => ({
  useSSO: jest.fn(() => ({ startSSOFlow: mockStartSSOFlow })),
  useClerk: jest.fn(() => ({ setActive: jest.fn() })),
  useSignIn: jest.fn(() => ({
    signIn: { password: jest.fn(), finalize: jest.fn() },
    errors: { fields: {} },
    fetchStatus: "idle",
  })),
  useSignUp: jest.fn(() => ({
    signUp: {
      status: "idle",
      unverifiedFields: [],
      password: jest.fn(),
      verifications: { sendEmailCode: jest.fn(), verifyEmailCode: jest.fn() },
      finalize: jest.fn(),
    },
    errors: { fields: {} },
    fetchStatus: "idle",
  })),
}));

jest.mock("expo-router", () => ({
  useRouter: jest.fn(() => ({
    dismissAll: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  })),
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

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

// ─── imports (after mocks) ────────────────────────────────────────────────────

import SignInScreen from "../app/(auth)/sign-in";
import SignUpScreen from "../app/(auth)/sign-up";

// ─── helpers ──────────────────────────────────────────────────────────────────

function findAppleButton(root: ReactTestInstance): ReactTestInstance {
  const label = root
    .findAllByType(Text)
    .find((t) => t.props.children === "Sign in with Apple");
  if (!label) throw new Error('"Sign in with Apple" label not found');
  let node: ReactTestInstance | null | undefined = label;
  while (node?.parent) {
    node = node.parent;
    if (node.type === TouchableOpacity) return node;
  }
  throw new Error("TouchableOpacity wrapping Sign in with Apple not found");
}

// ─── helpers: set Platform.OS to "ios" so the button renders ─────────────────

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
  mockStartAppleAuthFlow.mockReset();
  mockStartSSOFlow.mockReset();
});

afterEach(() => {
  jest.clearAllMocks();
});

// ─── 1. sign-in: startAppleAuthenticationFlow receives no arguments ───────────

describe("Apple SSO — sign-in does not pass a redirectUrl or scheme", () => {
  /**
   * sign-in.tsx uses the native Apple auth sheet via useSignInWithApple.
   * Apple rejects custom-scheme redirect URIs for its web OAuth flow, so the
   * startAppleAuthenticationFlow call must remain argument-free.  If a
   * redirectUrl is ever added it must use Constants.expoConfig.scheme
   * (mirror googleSSOScheme.test.tsx) — never a hardcoded string.
   */

  it("startAppleAuthenticationFlow is called with no arguments", async () => {
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
    // Must be called with zero arguments — no redirectUrl, no scheme.
    expect(mockStartAppleAuthFlow).toHaveBeenCalledWith();
  });

  it("startAppleAuthenticationFlow call has no redirectUrl property", async () => {
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
    // If the call ever gains an argument object, it must not contain a
    // hardcoded redirectUrl.  An undefined first arg is also acceptable.
    const firstArg: unknown = mockStartAppleAuthFlow.mock.calls[0]?.[0];
    if (firstArg !== undefined && firstArg !== null) {
      expect(firstArg).not.toHaveProperty("redirectUrl");
    }
  });
});

// ─── 2. sign-up: startAppleAuthenticationFlow receives no arguments ──────────

describe("Apple SSO — sign-up does not pass a redirectUrl or scheme", () => {
  /**
   * sign-up.tsx uses useSignInWithApple / startAppleAuthenticationFlow(), the
   * same native Apple auth sheet as sign-in.  Apple blocks custom-scheme
   * redirect URIs for its web OAuth flow, so the call must remain
   * argument-free.  If a redirectUrl is ever added it must come from
   * Constants.expoConfig.scheme — mirror googleSSOScheme.test.tsx.
   */

  it("startAppleAuthenticationFlow is called without a redirectUrl property", async () => {
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
    // If the call ever gains an argument object, it must not contain a
    // hardcoded redirectUrl.
    const firstArg: unknown = mockStartAppleAuthFlow.mock.calls[0]?.[0];
    if (firstArg !== undefined && firstArg !== null) {
      expect(firstArg).not.toHaveProperty("redirectUrl");
    }
  });

  it("startAppleAuthenticationFlow is called with no arguments", async () => {
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
    // Must be called with zero arguments — no redirectUrl, no scheme.
    expect(mockStartAppleAuthFlow).toHaveBeenCalledWith();
  });
});
