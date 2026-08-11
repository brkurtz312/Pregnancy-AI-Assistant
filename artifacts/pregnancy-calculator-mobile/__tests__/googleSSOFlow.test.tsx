/**
 * googleSSOFlow.test.tsx
 *
 * Verifies the "Continue with Google" button in the sign-in and sign-up
 * screens correctly wires up Clerk's useSSO hook.  These tests cover:
 *
 *   1. The button renders on both screens.
 *   2. Tapping it calls startSSOFlow with strategy:"oauth_google" and a
 *      redirect URL that uses the "pregnancy-calculator-mobile" scheme.
 *   3. When startSSOFlow resolves with a session, setActive is called and
 *      the router navigates away (dismissAll / replace).
 *   4. When startSSOFlow rejects, an error notice is shown and the spinner
 *      is cleared — no crash.
 *
 * Physical-device verification (consent screen → app-reopen → signed-in) is
 * required separately; those runtime paths cannot be exercised in Jest.
 */

import React from "react";
import { Text, TouchableOpacity } from "react-native";
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

// Mutable so individual tests can simulate a missing/misconfigured scheme.
const mockExpoConfig: { scheme?: string | string[] } = {
  scheme: "pregnancy-calculator-mobile",
};
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockExpoConfig;
    },
  },
}));

jest.mock("expo-auth-session", () => ({
  makeRedirectUri: jest.fn(({ scheme }: { scheme: string }) => `${scheme}://`),
}));

// sign-in.tsx imports useSignInWithApple from @clerk/expo/apple; mock it so
// tests that render SignInScreen don't hit the real ClerkProvider guard.
jest.mock("@clerk/expo/apple", () => ({
  useSignInWithApple: jest.fn(() => ({
    startAppleAuthenticationFlow: jest.fn(),
  })),
}));

const mockStartSSOFlow = jest.fn();
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
import * as AuthSession from "expo-auth-session";
import { useRouter } from "expo-router";

import SignInScreen from "../app/(auth)/sign-in";
import SignUpScreen from "../app/(auth)/sign-up";

const mockUseSSO = useSSO as jest.Mock;
const mockUseSignIn = useSignIn as jest.Mock;
const mockUseSignUp = useSignUp as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;
const mockMakeRedirectUri = AuthSession.makeRedirectUri as jest.Mock;

// ─── helpers ─────────────────────────────────────────────────────────────────

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

// ─── sign-in screen ──────────────────────────────────────────────────────────

describe("SignInScreen — Google SSO", () => {
  let dismissAll: jest.Mock;
  let back: jest.Mock;

  beforeEach(() => {
    dismissAll = jest.fn();
    back = jest.fn();
    mockUseRouter.mockReturnValue({ dismissAll, back });
    mockUseSSO.mockReturnValue({ startSSOFlow: mockStartSSOFlow });
    mockUseSignIn.mockReturnValue({
      signIn: mockSignIn,
      errors: mockErrors,
      fetchStatus: "idle",
    });
    mockStartSSOFlow.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the "Continue with Google" button', async () => {
    mockStartSSOFlow.mockResolvedValue({});

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Continue with Google");
  });

  it("calls startSSOFlow with strategy:oauth_google and the correct redirect scheme", async () => {
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
      setActive: null,
    });

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    expect(mockStartSSOFlow).toHaveBeenCalledTimes(1);
    const call = mockStartSSOFlow.mock.calls[0][0];
    expect(call.strategy).toBe("oauth_google");
    // makeRedirectUri must be given the app's custom scheme
    expect(mockMakeRedirectUri).toHaveBeenCalledWith(
      expect.objectContaining({ scheme: "pregnancy-calculator-mobile" }),
    );
    expect(call.redirectUrl).toBe("pregnancy-calculator-mobile://");
  });

  it("calls setActive and dismissAll when startSSOFlow returns a session", async () => {
    const setActive = jest.fn().mockResolvedValue(undefined);
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: "sess_123",
      setActive,
    });

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    expect(setActive).toHaveBeenCalledWith({ session: "sess_123" });
    expect(dismissAll).toHaveBeenCalled();
  });

  it("shows an error notice and does NOT crash when startSSOFlow rejects", async () => {
    // No message on the error so the component renders the generic fallback
    mockStartSSOFlow.mockRejectedValue(new Error());

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Google sign-in failed");
    // dismissAll must NOT have been called on failure
    expect(dismissAll).not.toHaveBeenCalled();
  });

  it("shows a notice and re-enables the button when startSSOFlow resolves with null session", async () => {
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
      setActive: null,
    });

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Sign-in could not be completed");
    // dismissAll must NOT have been called — no session was established
    expect(dismissAll).not.toHaveBeenCalled();
    // Button must be re-enabled (googleLoading back to false)
    expect(btn.props.disabled).toBe(false);
  });

  // ── cancel-handling ────────────────────────────────────────────────────────

  it("does NOT show an error notice when startSSOFlow rejects with an iOS WKWebView dismiss error", async () => {
    // iOS reports browser dismissal as a message containing "dismiss"
    mockStartSSOFlow.mockRejectedValue(
      new Error(
        "The operation couldn't be completed. (com.apple.AuthenticationServices.AuthorizationError error 1.) dismiss",
      ),
    );

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    // No error text must appear
    expect(json).not.toContain("Google sign-in failed");
    expect(json).not.toContain("Sign-in could not be completed");
    // Navigation must NOT have been called
    expect(dismissAll).not.toHaveBeenCalled();
    // Button re-enabled (loading cleared)
    expect(btn.props.disabled).toBe(false);
  });

  it("does NOT show an error notice when startSSOFlow rejects with an Android back-press cancel error", async () => {
    // Android Chrome Custom Tabs back-press surfaces "user_cancel" in the message
    mockStartSSOFlow.mockRejectedValue(new Error("user_cancel"));

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Google sign-in failed");
    expect(json).not.toContain("Sign-in could not be completed");
    expect(dismissAll).not.toHaveBeenCalled();
    expect(btn.props.disabled).toBe(false);
  });

  it("does NOT show an error notice when startSSOFlow rejects with a plain 'cancel' message", async () => {
    mockStartSSOFlow.mockRejectedValue(new Error("The flow was cancelled"));

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Google sign-in failed");
    expect(dismissAll).not.toHaveBeenCalled();
  });

  it("DOES show an error notice when startSSOFlow rejects with a real network error (not a cancel)", async () => {
    // No message on the error so the component renders the generic fallback
    mockStartSSOFlow.mockRejectedValue(new Error());

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Google sign-in failed");
    expect(dismissAll).not.toHaveBeenCalled();
  });

  it("does not call startSSOFlow a second time while the first call is in-flight", async () => {
    let resolveSSOFlow!: (v: unknown) => void;
    mockStartSSOFlow.mockReturnValue(
      new Promise((resolve) => {
        resolveSSOFlow = resolve;
      }),
    );

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);

    // first tap — starts the flow
    await act(async () => {
      btn.props.onPress();
    });
    // second tap — should be a no-op (googleLoading guard)
    await act(async () => {
      btn.props.onPress();
    });

    expect(mockStartSSOFlow).toHaveBeenCalledTimes(1);

    // resolve to avoid dangling promise
    await act(async () => {
      resolveSSOFlow({ createdSessionId: null, setActive: null });
    });
  });
});

// ─── fresh install — configuration & full completion path ───────────────────
//
// A fresh install has no cached Clerk session, so sign-in relies entirely on
// the OAuth redirect returning to the app. The redirect only works if the
// scheme registered with the OS (expo.scheme in app.json) matches the scheme
// passed to makeRedirectUri. These tests catch drift between the two, plus
// the full consent → return → setActive → dismiss sequence.

describe("Fresh install — Google SSO", () => {
  let dismissAll: jest.Mock;

  beforeEach(() => {
    mockExpoConfig.scheme = "pregnancy-calculator-mobile";
    dismissAll = jest.fn();
    mockUseRouter.mockReturnValue({ dismissAll, back: jest.fn() });
    mockUseSSO.mockReturnValue({ startSSOFlow: mockStartSSOFlow });
    mockUseSignIn.mockReturnValue({
      // Fresh install: no cached session, no createdSessionId on signIn.
      signIn: { ...mockSignIn, createdSessionId: null },
      errors: mockErrors,
      fetchStatus: "idle",
    });
    mockStartSSOFlow.mockReset();
  });

  afterEach(() => {
    mockExpoConfig.scheme = "pregnancy-calculator-mobile";
    jest.clearAllMocks();
  });

  it("app.json expo.scheme matches the scheme used for the OAuth redirect URI", () => {
    // Read the REAL app.json — this catches a scheme rename or removal that
    // would break the browser → app redirect on a fresh install.
    const appJson = require("../app.json") as {
      expo: { scheme?: string | string[]; android?: { package?: string } };
    };
    expect(appJson.expo.scheme).toBe("pregnancy-calculator-mobile");
    // The mocked Constants value must mirror the real config, otherwise
    // the assertions in this suite would be testing the wrong scheme.
    expect(mockExpoConfig.scheme).toEqual(appJson.expo.scheme);
    // Android needs a package for the intent filter to be registered.
    expect(appJson.expo.android?.package).toBeTruthy();
  });

  it("completes the full fresh-install sequence: consent → redirect back → setActive → dismiss", async () => {
    const callOrder: string[] = [];
    const setActive = jest.fn().mockImplementation(async () => {
      callOrder.push("setActive");
    });
    mockStartSSOFlow.mockImplementation(async (opts: unknown) => {
      callOrder.push("startSSOFlow");
      // Simulate browser consent + redirect back into the app with a
      // brand-new session (fresh install ⇒ no pre-existing session id).
      expect((opts as { redirectUrl: string }).redirectUrl).toBe(
        "pregnancy-calculator-mobile://",
      );
      return { createdSessionId: "sess_fresh_install", setActive };
    });
    dismissAll.mockImplementation(() => {
      callOrder.push("dismissAll");
    });

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    expect(setActive).toHaveBeenCalledWith({ session: "sess_fresh_install" });
    // Order matters: session must be activated BEFORE the screen dismisses,
    // otherwise the app re-opens signed out.
    expect(callOrder).toEqual(["startSSOFlow", "setActive", "dismissAll"]);
    // No error notice should be shown on success.
    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("sign-in failed");
    expect(json).not.toContain("Sign-in could not be completed");
  });

  it("logs a loud misconfiguration error when expo.scheme is missing, instead of failing silently", async () => {
    mockExpoConfig.scheme = undefined;
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
      setActive: null,
    });

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("expo.scheme is not set"),
    );
    consoleError.mockRestore();
  });

  it("handles an array-valued expo.scheme by using its first entry", async () => {
    mockExpoConfig.scheme = ["pregnancy-calculator-mobile", "legacy-scheme"];
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
      setActive: null,
    });

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
      expect.objectContaining({ scheme: "pregnancy-calculator-mobile" }),
    );
  });
});

// ─── sign-up screen ──────────────────────────────────────────────────────────

describe("SignUpScreen — Google SSO", () => {
  let replace: jest.Mock;
  let back: jest.Mock;

  beforeEach(() => {
    replace = jest.fn();
    back = jest.fn();
    mockUseRouter.mockReturnValue({ replace, back });
    mockUseSSO.mockReturnValue({ startSSOFlow: mockStartSSOFlow });
    mockUseSignUp.mockReturnValue({
      signUp: mockSignUp,
      errors: mockErrors,
      fetchStatus: "idle",
    });
    mockStartSSOFlow.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the "Continue with Google" button', async () => {
    mockStartSSOFlow.mockResolvedValue({});

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Continue with Google");
  });

  it("calls startSSOFlow with strategy:oauth_google and the correct redirect scheme", async () => {
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
      setActive: null,
    });

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    expect(mockStartSSOFlow).toHaveBeenCalledTimes(1);
    const call = mockStartSSOFlow.mock.calls[0][0];
    expect(call.strategy).toBe("oauth_google");
    expect(mockMakeRedirectUri).toHaveBeenCalledWith(
      expect.objectContaining({ scheme: "pregnancy-calculator-mobile" }),
    );
    expect(call.redirectUrl).toBe("pregnancy-calculator-mobile://");
  });

  it("calls setActive and navigates to root when startSSOFlow returns a session", async () => {
    const setActive = jest.fn().mockResolvedValue(undefined);
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: "sess_456",
      setActive,
    });

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    expect(setActive).toHaveBeenCalledWith({ session: "sess_456" });
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("shows an error message and does NOT crash when startSSOFlow rejects", async () => {
    // No message on the error so the component renders the generic fallback
    mockStartSSOFlow.mockRejectedValue(new Error());

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Google sign-in failed");
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows a notice and re-enables the button when startSSOFlow resolves with null session", async () => {
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: null,
      setActive: null,
    });

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Sign-in could not be completed");
    // replace must NOT have been called — no session was established
    expect(replace).not.toHaveBeenCalled();
    // Button must be re-enabled (googleLoading back to false)
    expect(btn.props.disabled).toBe(false);
  });

  // ── cancel-handling ────────────────────────────────────────────────────────

  it("does NOT show an error when startSSOFlow rejects with an iOS WKWebView dismiss error", async () => {
    mockStartSSOFlow.mockRejectedValue(
      new Error(
        "The operation couldn't be completed. (com.apple.AuthenticationServices.AuthorizationError error 1.) dismiss",
      ),
    );

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Google sign-in failed");
    expect(json).not.toContain("Sign-in could not be completed");
    expect(replace).not.toHaveBeenCalled();
    expect(btn.props.disabled).toBe(false);
  });

  it("does NOT show an error when startSSOFlow rejects with an Android back-press cancel error", async () => {
    mockStartSSOFlow.mockRejectedValue(new Error("user_cancel"));

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Google sign-in failed");
    expect(json).not.toContain("Sign-in could not be completed");
    expect(replace).not.toHaveBeenCalled();
    expect(btn.props.disabled).toBe(false);
  });

  it("does NOT show an error when startSSOFlow rejects with a plain 'cancel' message", async () => {
    mockStartSSOFlow.mockRejectedValue(new Error("The flow was cancelled"));

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Google sign-in failed");
    expect(replace).not.toHaveBeenCalled();
  });

  it("DOES show an error when startSSOFlow rejects with a real network error (not a cancel)", async () => {
    mockStartSSOFlow.mockRejectedValue(
      new Error("Network request failed — no internet"),
    );

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const btn = findGoogleButton(renderer.root);
    await act(async () => {
      btn.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Google sign-in failed");
    expect(replace).not.toHaveBeenCalled();
  });
});
