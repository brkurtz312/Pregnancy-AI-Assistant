/**
 * androidFreshInstallSignIn.test.tsx
 *
 * Verifies Android-specific sign-in behaviour on a fresh install.
 *
 * Android differs from iOS in three key ways inside sign-in.tsx:
 *
 *   1. Browser warm-up: WebBrowser.warmUpAsync() is called on mount when
 *      Platform.OS === "android" so Chrome Custom Tabs is ready before the
 *      user taps "Continue with Google".  coolDownAsync() is called on unmount.
 *   2. No Apple Sign-In button: the native module check returns false on Android,
 *      so the Apple button must not appear.
 *   3. Google OAuth redirect URI: makeRedirectUri is called with the app's custom
 *      URL scheme (pregnancy-calculator-mobile://), which Android resolves via
 *      its intent filter — the same scheme constant used on iOS.
 *
 * Email/password sign-in and the Google SSO success/failure paths are also
 * exercised under the Android platform constant as an additional regression guard
 * alongside the iOS-focused freshInstallSignIn.test.tsx suite.
 *
 * Physical-device verification (uninstall + reinstall from internal track, Chrome
 * Custom Tabs consent, deep-link return) is required separately; those runtime
 * paths cannot be exercised in Jest.
 */

import React from "react";
import { Platform, Text, TextInput, TouchableOpacity } from "react-native";
import { act, create, type ReactTestInstance } from "react-test-renderer";

// ─── module-level mocks ───────────────────────────────────────────────────────

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// Use jest.fn() directly in the factory — the factory is hoisted before any
// variable declarations, so referencing module-scope variables from inside it
// causes "Cannot read properties of undefined" when sign-in.tsx calls
// maybeCompleteAuthSession() at import time.  We retrieve the spy references
// via require() after the module is loaded.
jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  warmUpAsync: jest.fn().mockResolvedValue(undefined),
  coolDownAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { scheme: "pregnancy-calculator-mobile" } },
}));

jest.mock("expo-auth-session", () => ({
  makeRedirectUri: jest.fn(({ scheme }: { scheme: string }) => `${scheme}://`),
}));

// sign-in.tsx imports useSignInWithApple; mock so the native module check
// doesn't crash in the Jest environment.
jest.mock("@clerk/expo/apple", () => ({
  useSignInWithApple: jest.fn(() => ({
    startAppleAuthenticationFlow: jest.fn(),
  })),
}));

const mockSetActive = jest.fn();
const mockPasswordFn = jest.fn();
const mockStartSSOFlow = jest.fn();
const mockSignInObj = {
  password: mockPasswordFn,
  createdSessionId: null as string | null,
};

jest.mock("@clerk/expo", () => ({
  useSSO: jest.fn(() => ({ startSSOFlow: mockStartSSOFlow })),
  useClerk: jest.fn(() => ({ setActive: mockSetActive })),
  useSignIn: jest.fn(),
  useSignUp: jest.fn(() => ({
    signUp: { status: "idle", unverifiedFields: [] },
    errors: { fields: {} },
    fetchStatus: "idle",
  })),
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

// ─── imports (after mocks) ────────────────────────────────────────────────────

import { useSignIn, useClerk } from "@clerk/expo";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import SignInScreen from "../app/(auth)/sign-in";

// ─── Android platform shim ────────────────────────────────────────────────────
// jest-expo defaults to "ios". Flip to "android" for this entire file so the
// useWarmUpBrowser hook and Platform.OS checks in sign-in.tsx behave as they
// would on a real Android device.

let originalPlatformOS: string;

// Record whether maybeCompleteAuthSession was called before any afterEach
// runs — clearAllMocks() resets call counts, so we capture the flag here
// at the outermost scope.
let maybeCompleteWasCalledAtLoad = false;

beforeAll(() => {
  originalPlatformOS = Platform.OS;
  (Platform as { OS: string }).OS = "android";
  // maybeCompleteAuthSession is called at sign-in.tsx module-load time.
  // By the time beforeAll runs the module is already imported, so we can
  // inspect the mock's call count directly here.
  maybeCompleteWasCalledAtLoad =
    mockMaybeCompleteAuthSession.mock.calls.length > 0;
});
afterAll(() => {
  (Platform as { OS: string }).OS = originalPlatformOS;
});

const mockUseSignIn = useSignIn as jest.Mock;
const mockUseClerk = useClerk as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;
const mockMakeRedirectUri = AuthSession.makeRedirectUri as jest.Mock;
const mockWarmUpAsync = WebBrowser.warmUpAsync as jest.Mock;
const mockCoolDownAsync = WebBrowser.coolDownAsync as jest.Mock;
const mockMaybeCompleteAuthSession =
  WebBrowser.maybeCompleteAuthSession as jest.Mock;

// ─── helpers ──────────────────────────────────────────────────────────────────

async function fillCredentials(
  root: ReactTestInstance,
  email: string,
  password: string,
) {
  const inputs = root.findAllByType(TextInput);
  const emailInput = inputs.find(
    (i) => i.props.placeholder === "you@example.com",
  );
  const passwordInput = inputs.find(
    (i) => i.props.placeholder === "Your password",
  );
  expect(emailInput).toBeDefined();
  expect(passwordInput).toBeDefined();

  await act(async () => {
    emailInput!.props.onChangeText(email);
    passwordInput!.props.onChangeText(password);
  });
}

async function pressSignInButton(root: ReactTestInstance) {
  const label = root
    .findAllByType(Text)
    .find((t) => t.props.children === "Sign In");
  expect(label).toBeDefined();

  let node: ReactTestInstance | null | undefined = label;
  let btn: ReactTestInstance | undefined;
  while (node?.parent) {
    node = node.parent;
    if (node.type === TouchableOpacity) {
      btn = node;
      break;
    }
  }
  expect(btn).toBeDefined();
  await act(async () => {
    btn!.props.onPress();
  });
}

function findGoogleButton(root: ReactTestInstance): ReactTestInstance {
  const label = root
    .findAllByType(Text)
    .find((t) => t.props.children === "Continue with Google");
  expect(label).toBeDefined();
  let node: ReactTestInstance | null | undefined = label;
  while (node?.parent) {
    node = node.parent;
    if (node.type === TouchableOpacity) return node;
  }
  throw new Error(
    "Could not find TouchableOpacity wrapping 'Continue with Google'",
  );
}

// ─── test suites ─────────────────────────────────────────────────────────────

describe("Android fresh install — browser warm-up", () => {
  let dismissAll: jest.Mock;
  let back: jest.Mock;

  beforeEach(() => {
    dismissAll = jest.fn();
    back = jest.fn();
    mockUseRouter.mockReturnValue({ dismissAll, back, replace: jest.fn() });
    mockUseSignIn.mockReturnValue({
      signIn: mockSignInObj,
      errors: { fields: {} },
      fetchStatus: "idle",
    });
    mockUseClerk.mockReturnValue({ setActive: mockSetActive });
    mockWarmUpAsync.mockClear();
    mockCoolDownAsync.mockClear();
    mockStartSSOFlow.mockReset();
    mockSetActive.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("calls WebBrowser.warmUpAsync on mount when running on Android", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SignInScreen));
    });

    expect(mockWarmUpAsync).toHaveBeenCalledTimes(1);
    renderer.unmount();
  });

  it("calls WebBrowser.coolDownAsync on unmount when running on Android", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SignInScreen));
    });

    mockCoolDownAsync.mockClear();

    await act(async () => {
      renderer.unmount();
    });

    expect(mockCoolDownAsync).toHaveBeenCalledTimes(1);
  });

  it("calls WebBrowser.maybeCompleteAuthSession at module load (handles OAuth redirect on relaunch)", () => {
    // maybeCompleteAuthSession is called at the top level of sign-in.tsx so
    // it fires when the module is first imported — before any component mounts.
    // afterEach(clearAllMocks) resets the mock's call count, so we use the
    // flag recorded in beforeAll (before any clearAllMocks ran) instead.
    expect(maybeCompleteWasCalledAtLoad).toBe(true);
  });
});

describe("Android fresh install — email/password sign-in", () => {
  let dismissAll: jest.Mock;
  let replace: jest.Mock;
  let back: jest.Mock;

  beforeEach(() => {
    dismissAll = jest.fn();
    replace = jest.fn();
    back = jest.fn();
    mockUseRouter.mockReturnValue({ dismissAll, back, replace });
    mockSetActive.mockReset();
    mockPasswordFn.mockReset();
    mockSignInObj.createdSessionId = null;

    mockUseSignIn.mockReturnValue({
      signIn: mockSignInObj,
      errors: { fields: {} },
      fetchStatus: "idle",
    });
    mockUseClerk.mockReturnValue({ setActive: mockSetActive });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("calls setActive and opens the app on correct credentials (Android fresh install)", async () => {
    mockSignInObj.createdSessionId = "sess_android_001";
    mockPasswordFn.mockResolvedValue({ error: null });
    mockSetActive.mockResolvedValue(undefined);

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SignInScreen));
    });

    await fillCredentials(renderer.root, "android@example.com", "securePass1!");
    await pressSignInButton(renderer.root);

    expect(mockPasswordFn).toHaveBeenCalledWith({
      emailAddress: "android@example.com",
      password: "securePass1!",
    });
    expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_android_001" });
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("shows an error and does NOT navigate when credentials are wrong on Android", async () => {
    mockPasswordFn.mockRejectedValue({
      errors: [{ longMessage: "Invalid email address or password." }],
    });
    mockSignInObj.createdSessionId = null;

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SignInScreen));
    });

    await fillCredentials(renderer.root, "android@example.com", "wrongPass");
    await pressSignInButton(renderer.root);

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Invalid email address or password.");
    expect(dismissAll).not.toHaveBeenCalled();
  });

  it("does NOT show the Apple Sign-In button on Android", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SignInScreen));
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Sign in with Apple");
  });
});

describe("Android fresh install — Google SSO flow", () => {
  let dismissAll: jest.Mock;
  let replace: jest.Mock;
  let back: jest.Mock;

  beforeEach(() => {
    dismissAll = jest.fn();
    replace = jest.fn();
    back = jest.fn();
    mockUseRouter.mockReturnValue({ dismissAll, back, replace });
    mockUseSignIn.mockReturnValue({
      signIn: mockSignInObj,
      errors: { fields: {} },
      fetchStatus: "idle",
    });
    mockUseClerk.mockReturnValue({ setActive: mockSetActive });
    mockStartSSOFlow.mockReset();
    mockMakeRedirectUri.mockImplementation(
      ({ scheme }: { scheme: string }) => `${scheme}://`,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("calls startSSOFlow with oauth_google strategy and the app custom scheme as redirect URI", async () => {
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
      setActive: null,
    });

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SignInScreen));
    });

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    expect(mockStartSSOFlow).toHaveBeenCalledTimes(1);
    const call = mockStartSSOFlow.mock.calls[0][0] as {
      strategy: string;
      redirectUrl: string;
    };
    expect(call.strategy).toBe("oauth_google");
    // Android resolves the custom scheme via its intent filter — the same
    // scheme constant used on iOS, not a package-name intent:// URI.
    expect(mockMakeRedirectUri).toHaveBeenCalledWith(
      expect.objectContaining({ scheme: "pregnancy-calculator-mobile" }),
    );
    expect(call.redirectUrl).toBe("pregnancy-calculator-mobile://");
  });

  it("calls setActive and opens the app when Chrome Custom Tabs OAuth completes successfully", async () => {
    const setActive = jest.fn().mockResolvedValue(undefined);
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: "sess_android_google_001",
      setActive,
    });

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SignInScreen));
    });

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    expect(setActive).toHaveBeenCalledWith({
      session: "sess_android_google_001",
    });
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("does NOT show an error when the user presses back in Chrome Custom Tabs (user_cancel)", async () => {
    // Android Chrome Custom Tabs back-press surfaces "user_cancel" in the
    // rejection message — this is the canonical Android cancel signal.
    mockStartSSOFlow.mockRejectedValue(new Error("user_cancel"));

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SignInScreen));
    });

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Google sign-in failed");
    expect(json).not.toContain("Sign-in could not be completed");
    expect(dismissAll).not.toHaveBeenCalled();
    // Button must be re-enabled after cancel
    expect(btn.props.disabled).toBe(false);
  });

  it("shows an error notice when a real network failure occurs during Google SSO", async () => {
    // Use an empty-message error so the component falls back to the generic
    // "Google sign-in failed" text — matches the pattern in googleSSOFlow.test.tsx.
    mockStartSSOFlow.mockRejectedValue(new Error());

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SignInScreen));
    });

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Google sign-in failed");
    expect(dismissAll).not.toHaveBeenCalled();
  });

  it("shows a notice and re-enables the button when Google SSO resolves with no session", async () => {
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
      setActive: null,
    });

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SignInScreen));
    });

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Sign-in could not be completed");
    expect(dismissAll).not.toHaveBeenCalled();
    expect(btn.props.disabled).toBe(false);
  });

  it("does not trigger a second SSO flow while Chrome Custom Tabs is open (double-tap guard)", async () => {
    let resolveSSOFlow!: (v: unknown) => void;
    mockStartSSOFlow.mockReturnValue(
      new Promise((resolve) => {
        resolveSSOFlow = resolve;
      }),
    );

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SignInScreen));
    });

    const btn = findGoogleButton(renderer.root);

    // First tap — opens Chrome Custom Tabs
    await act(async () => {
      btn.props.onPress();
    });
    // Second tap — should be a no-op while flow is in-flight
    await act(async () => {
      btn.props.onPress();
    });

    expect(mockStartSSOFlow).toHaveBeenCalledTimes(1);

    // Resolve to avoid dangling promise
    await act(async () => {
      resolveSSOFlow({ createdSessionId: null, setActive: null });
    });
  });
});
