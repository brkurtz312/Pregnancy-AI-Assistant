/**
 * googleSSOScheme.test.tsx
 *
 * Focused tests for the scheme-resolution logic added in the "scheme fix":
 *
 *   1. The scheme string passed to makeRedirectUri at call-site is identical
 *      to the value set in app.json (regression guard against a future rename
 *      that touches only one of the two files).
 *
 *   2. When Constants.expoConfig is absent (undefined / null) the code calls
 *      console.error with the expected warning message, so operators can catch
 *      a misconfigured build before users hit an OAuth redirect failure.
 *
 * These cases require per-test control of the expo-constants mock, which is why
 * they live in a separate file from googleSSOFlow.test.tsx (that file uses a
 * module-level mock that cannot be varied per test).
 */

import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { act, create, type ReactTestInstance } from "react-test-renderer";

// ─── shared module-level mocks ────────────────────────────────────────────────

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  warmUpAsync: jest.fn(),
  coolDownAsync: jest.fn(),
}));

// expo-constants is mocked per-test with jest.mocked / module re-import pattern.
// We declare a mutable variable here so beforeEach can swap the shape.
let mockExpoConfig: { scheme?: string | string[] } | null = {
  scheme: "pregnancy-calculator-mobile",
};

jest.mock("expo-constants", () => ({
  __esModule: true,
  get default() {
    return { expoConfig: mockExpoConfig };
  },
}));

const mockMakeRedirectUri = jest.fn(
  ({ scheme }: { scheme: string }) => `${scheme}://`,
);
jest.mock("expo-auth-session", () => ({
  makeRedirectUri: (...args: Parameters<typeof mockMakeRedirectUri>) =>
    mockMakeRedirectUri(...args),
}));

// sign-in.tsx imports useSignInWithApple from @clerk/expo/apple; mock it so
// tests that render SignInScreen don't hit the real ClerkProvider guard.
jest.mock("@clerk/expo/apple", () => ({
  useSignInWithApple: jest.fn(() => ({
    startAppleAuthenticationFlow: jest.fn(),
  })),
}));

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

// app.json is the single source of truth for the custom URL scheme.
const appJson = require("../app.json") as {
  expo: { scheme: string | string[] };
};

import SignInScreen from "../app/(auth)/sign-in";
import SignUpScreen from "../app/(auth)/sign-up";

// ─── helpers ──────────────────────────────────────────────────────────────────

function findGoogleButton(root: ReactTestInstance): ReactTestInstance {
  const label = root
    .findAllByType(Text)
    .find((t) => t.props.children === "Continue with Google");
  if (!label) throw new Error("Continue with Google label not found");
  let node: ReactTestInstance | null | undefined = label;
  while (node?.parent) {
    node = node.parent;
    if (node.type === TouchableOpacity) return node;
  }
  throw new Error("TouchableOpacity wrapping Continue with Google not found");
}

// ─── 1. Scheme matches app.json ───────────────────────────────────────────────

describe("Google SSO — scheme matches app.json", () => {
  /**
   * The canonical scheme lives in app.json `expo.scheme`.  The sign-in and
   * sign-up screens read it at runtime via Constants.expoConfig.scheme.
   *
   * This suite verifies that when Constants returns the value from app.json the
   * redirect URI passed to startSSOFlow is built with that exact scheme — so a
   * rename that only updates app.json would immediately break this test.
   */

  const appScheme = Array.isArray(appJson.expo.scheme)
    ? appJson.expo.scheme[0]
    : appJson.expo.scheme;

  beforeEach(() => {
    // Mirror the exact shape that a real Expo runtime would expose.
    mockExpoConfig = { scheme: appJson.expo.scheme };
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
      setActive: null,
    });
    mockMakeRedirectUri.mockImplementation(
      ({ scheme }: { scheme: string }) => `${scheme}://`,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("sign-in: makeRedirectUri receives the scheme from app.json", async () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    expect(mockMakeRedirectUri).toHaveBeenCalledWith(
      expect.objectContaining({ scheme: appScheme }),
    );

    const call = mockStartSSOFlow.mock.calls[0][0] as { redirectUrl: string };
    expect(call.redirectUrl).toBe(`${appScheme}://`);
  });

  it("sign-up: makeRedirectUri receives the scheme from app.json", async () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    expect(mockMakeRedirectUri).toHaveBeenCalledWith(
      expect.objectContaining({ scheme: appScheme }),
    );

    const call = mockStartSSOFlow.mock.calls[0][0] as { redirectUrl: string };
    expect(call.redirectUrl).toBe(`${appScheme}://`);
  });
});

// ─── 2. console.error guard when expoConfig is absent ─────────────────────────

describe("Google SSO — console.error guard when scheme is missing", () => {
  /**
   * Both screens include a guard that logs a console.error if
   * Constants.expoConfig is falsy (e.g. in a bare-workflow build that omits the
   * config or in a misconfigured test environment).  This ensures operators
   * notice the issue before users hit a broken OAuth redirect.
   */

  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
      setActive: null,
    });
    mockMakeRedirectUri.mockImplementation(
      ({ scheme }: { scheme?: string }) => `${scheme ?? "undefined"}://`,
    );
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  it("sign-in: logs console.error when Constants.expoConfig is null", async () => {
    mockExpoConfig = null;

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("expo.scheme is not set"),
    );
  });

  it("sign-in: logs console.error when Constants.expoConfig has no scheme", async () => {
    mockExpoConfig = {}; // expoConfig present but scheme missing

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("expo.scheme is not set"),
    );
  });

  it("sign-up: logs console.error when Constants.expoConfig is null", async () => {
    mockExpoConfig = null;

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("expo.scheme is not set"),
    );
  });

  it("sign-up: logs console.error when Constants.expoConfig has no scheme", async () => {
    mockExpoConfig = {}; // expoConfig present but scheme missing

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("expo.scheme is not set"),
    );
  });

  it("sign-in: does NOT log the missing-scheme error when scheme is present", async () => {
    mockExpoConfig = { scheme: "pregnancy-calculator-mobile" };

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const schemeErrorCalls = consoleErrorSpy.mock.calls.filter(
      (args) =>
        typeof args[0] === "string" &&
        args[0].includes("expo.scheme is not set"),
    );
    expect(schemeErrorCalls).toHaveLength(0);
  });

  it("sign-up: does NOT log the missing-scheme error when scheme is present", async () => {
    mockExpoConfig = { scheme: "pregnancy-calculator-mobile" };

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const schemeErrorCalls = consoleErrorSpy.mock.calls.filter(
      (args) =>
        typeof args[0] === "string" &&
        args[0].includes("expo.scheme is not set"),
    );
    expect(schemeErrorCalls).toHaveLength(0);
  });
});
