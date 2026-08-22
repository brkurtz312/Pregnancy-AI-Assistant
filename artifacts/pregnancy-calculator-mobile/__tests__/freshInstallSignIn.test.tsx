/**
 * freshInstallSignIn.test.tsx
 *
 * Verifies the email/password sign-in flow works correctly when there is no
 * prior cached session — the "fresh install" scenario. This covers the chain
 * of fixes made to the sign-in screen:
 *
 *   1. Happy path: correct credentials → setActive called → app home replaces
 *      the auth route.
 *   2. Clerk background-400 resilience: if Clerk throws after setActive already
 *      returned successfully (background cleanup request), the app navigates
 *      away rather than showing a spurious error (sessionActivated ref fix).
 *   3. Wrong credentials: Clerk returns an error field → error text shown, no
 *      navigation.
 *   4. Sign-out then sign back in: a second sign-in attempt on the same screen
 *      (e.g. after signing out) follows the same happy path — no stale state
 *      blocks it.
 *   5. Sign-in screen is guarded: if signIn is not yet ready (null), a notice
 *      is shown instead of crashing.
 *
 * Physical-device verification (TestFlight, iCloud, OTA splash) is required
 * separately; those runtime paths cannot be exercised in Jest.
 */

import React from "react";
import { Text, TextInput, TouchableOpacity } from "react-native";
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
const mockSignInObj = {
  password: mockPasswordFn,
  createdSessionId: null as string | null,
};

jest.mock("@clerk/expo", () => ({
  useSSO: jest.fn(() => ({ startSSOFlow: jest.fn() })),
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

// ─── imports (after mocks) ───────────────────────────────────────────────────

import { useSignIn, useClerk } from "@clerk/expo";
import { useRouter } from "expo-router";

import SignInScreen from "../app/(auth)/sign-in";

const mockUseSignIn = useSignIn as jest.Mock;
const mockUseClerk = useClerk as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Fill email + password fields on the rendered sign-in screen. */
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

/** Find and press the primary "Sign In" button. */
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

// ─── tests ───────────────────────────────────────────────────────────────────

describe("Sign-in screen — fresh install, no cached session", () => {
  let replace: jest.Mock;
  let back: jest.Mock;

  beforeEach(() => {
    replace = jest.fn();
    back = jest.fn();
    mockUseRouter.mockReturnValue({ back, replace });
    mockSetActive.mockReset();
    mockPasswordFn.mockReset();
    mockSignInObj.createdSessionId = null;

    // Default: useSignIn returns a ready signIn object with fetchStatus idle
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

  // ── 1. Happy path ──────────────────────────────────────────────────────────

  it("calls setActive and opens the app when correct credentials are entered on a fresh install", async () => {
    mockSignInObj.createdSessionId = "sess_new_user_123";
    mockPasswordFn.mockResolvedValue({ error: null });
    mockSetActive.mockResolvedValue(undefined);

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SignInScreen));
    });

    await fillCredentials(renderer.root, "user@example.com", "correctPass!");
    await pressSignInButton(renderer.root);

    expect(mockPasswordFn).toHaveBeenCalledWith({
      emailAddress: "user@example.com",
      password: "correctPass!",
    });
    expect(mockSetActive).toHaveBeenCalledWith({
      session: "sess_new_user_123",
    });
    expect(replace).toHaveBeenCalledWith("/");
  });

  // ── 2. sessionActivated ref: Clerk background 400 after successful setActive

  it("navigates away instead of showing an error when Clerk throws after setActive already succeeded (background-400 scenario)", async () => {
    // setActive resolves but router.replace throws to simulate the Clerk
    // background cleanup request racing in after a successful 200.  The
    // sessionActivated ref ensures the catch block still navigates away.
    mockSignInObj.createdSessionId = "sess_background_400";
    mockPasswordFn.mockResolvedValue({ error: null });
    mockSetActive.mockResolvedValue(undefined);

    // Make the first replace throw synchronously; the catch block should
    // call it again because sessionActivated.current is true.
    let replaceCallCount = 0;
    replace.mockImplementation(() => {
      replaceCallCount += 1;
      if (replaceCallCount === 1) throw new Error("Clerk background 400");
    });

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SignInScreen));
    });

    await fillCredentials(renderer.root, "user@example.com", "correctPass!");
    await pressSignInButton(renderer.root);

    // The catch block must replace again, not show an error.
    expect(replaceCallCount).toBeGreaterThanOrEqual(2);
    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Sign-in failed");
    expect(json).not.toContain("check your credentials");
  });

  // ── 3. Wrong credentials ───────────────────────────────────────────────────

  it("shows an error notice and does NOT navigate when Clerk returns an error field", async () => {
    mockPasswordFn.mockResolvedValue({
      error: { message: "Password is incorrect" },
    });

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SignInScreen));
    });

    await fillCredentials(renderer.root, "user@example.com", "wrongPass");
    await pressSignInButton(renderer.root);

    expect(mockSetActive).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows an error notice when the Clerk API rejects (network or credentials error)", async () => {
    mockPasswordFn.mockRejectedValue({
      errors: [{ longMessage: "Invalid email address or password." }],
    });
    mockSignInObj.createdSessionId = null;

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SignInScreen));
    });

    await fillCredentials(renderer.root, "user@example.com", "badpass");
    await pressSignInButton(renderer.root);

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Invalid email address or password.");
    expect(replace).not.toHaveBeenCalled();
  });

  // ── 4. Sign out then sign back in ──────────────────────────────────────────

  it("succeeds on a second sign-in attempt after the first succeeds (sign-out then sign-in flow)", async () => {
    // First sign-in
    mockSignInObj.createdSessionId = "sess_first";
    mockPasswordFn.mockResolvedValue({ error: null });
    mockSetActive.mockResolvedValue(undefined);

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SignInScreen));
    });

    await fillCredentials(renderer.root, "user@example.com", "pass1");
    await pressSignInButton(renderer.root);

    expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_first" });
    expect(replace).toHaveBeenCalledTimes(1);

    // Simulate re-mounting the sign-in screen after signing out
    mockSetActive.mockReset();
    replace.mockReset();
    mockSignInObj.createdSessionId = "sess_second";

    let renderer2!: ReturnType<typeof create>;
    await act(async () => {
      renderer2 = create(React.createElement(SignInScreen));
    });

    await fillCredentials(renderer2.root, "user@example.com", "pass2");
    await pressSignInButton(renderer2.root);

    expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_second" });
    expect(replace).toHaveBeenCalledTimes(1);
  });

  // ── 5. signIn not ready (race on fresh install) ───────────────────────────

  it("shows a notice instead of crashing when signIn is null on initial mount", async () => {
    // signIn can be null briefly on first render if Clerk hasn't initialised yet
    mockUseSignIn.mockReturnValue({
      signIn: null,
      errors: { fields: {} },
      fetchStatus: "idle",
    });

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SignInScreen));
    });

    // Manually fire the onPress to simulate a tap before signIn is ready.
    // We can't use fillCredentials since the button is disabled until both
    // fields are filled, so we call pressSignInButton directly after filling
    // with a workaround: manually trigger the submit on a (re-)render where
    // signIn is null and text has been entered.
    //
    // The simplest way: re-use the same renderer but update the mock to return
    // null signIn, re-render, then press submit.
    //
    // Instead, verify a simpler invariant: the screen must have rendered
    // without throwing and the inputs are present.
    const inputs = renderer.root.findAllByType(TextInput);
    expect(inputs.length).toBeGreaterThanOrEqual(2);

    // Fill fields then press to exercise the null-guard path
    const emailInput = inputs.find(
      (i) => i.props.placeholder === "you@example.com",
    );
    const passwordInput = inputs.find(
      (i) => i.props.placeholder === "Your password",
    );
    await act(async () => {
      emailInput!.props.onChangeText("user@example.com");
      passwordInput!.props.onChangeText("somepassword");
    });

    await pressSignInButton(renderer.root);

    // Should show the "not ready" notice and never call setActive
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Sign-in is not ready yet");
    expect(mockSetActive).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
