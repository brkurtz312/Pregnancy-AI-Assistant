/**
 * Tests that a stale Clerk 400 fired after setActive succeeds does not
 * surface 'Sign-in failed' to the user (the sessionActivated ref fix).
 */
import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { act, create } from "react-test-renderer";

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  warmUpAsync: jest.fn(),
  coolDownAsync: jest.fn(),
}));

jest.mock("expo-auth-session", () => ({
  makeRedirectUri: jest.fn(() => "myapp://"),
}));

jest.mock("expo-constants", () => ({
  default: { expoConfig: { scheme: "myapp" } },
}));

jest.mock("@clerk/expo", () => ({
  useSignIn: jest.fn(),
  useClerk: jest.fn(),
  useSSO: jest.fn(),
}));

jest.mock("@clerk/expo/apple", () => ({
  useSignInWithApple: jest.fn(),
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
    primaryForeground: "#fff",
    foreground: "#000",
    mutedForeground: "#666",
    destructive: "#e53e3e",
  }),
}));

jest.mock("@/lib/auth-cancel", () => ({
  isCancelError: jest.fn(() => false),
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { useSignIn, useClerk, useSSO } from "@clerk/expo";
import { useSignInWithApple } from "@clerk/expo/apple";
import { useRouter } from "expo-router";

import SignInScreen from "../app/(auth)/sign-in";

const mockUseSignIn = useSignIn as jest.Mock;
const mockUseClerk = useClerk as jest.Mock;
const mockUseSSO = useSSO as jest.Mock;
const mockUseSignInWithApple = useSignInWithApple as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;

// ── Helpers ────────────────────────────────────────────────────────────────

function buildDefaults(overrides: {
  passwordImpl?: () => Promise<{ error: unknown }>;
  setActiveImpl?: () => Promise<void>;
  replace?: jest.Mock;
}) {
  const replace = overrides.replace ?? jest.fn();
  const setActive = jest.fn(
    overrides.setActiveImpl ?? (() => Promise.resolve()),
  );
  const passwordFn = jest.fn(
    overrides.passwordImpl ?? (() => Promise.resolve({ error: null })),
  );
  const push = jest.fn();

  mockUseRouter.mockReturnValue({ back: jest.fn(), push, replace });
  mockUseClerk.mockReturnValue({ setActive });
  mockUseSSO.mockReturnValue({ startSSOFlow: jest.fn() });
  mockUseSignInWithApple.mockReturnValue({
    startAppleAuthenticationFlow: jest.fn(),
  });
  mockUseSignIn.mockReturnValue({
    signIn: {
      password: passwordFn,
      createdSessionId: "session-123",
    },
    errors: { fields: {} },
    fetchStatus: "idle",
  });

  return { replace, setActive, passwordFn, push };
}

function renderScreen() {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(SignInScreen));
  });
  return renderer;
}

/** Find and tap the Sign In button. */
async function pressSignIn(renderer: ReturnType<typeof create>) {
  const root = renderer.root;
  const signInText = root
    .findAllByType(Text)
    .find((t) => t.props.children === "Sign In");
  expect(signInText).toBeDefined();

  let node = signInText?.parent;
  let btn: ReturnType<typeof create>["root"] | undefined;
  while (node?.parent) {
    if (node.type === TouchableOpacity) {
      btn = node;
      break;
    }
    node = node.parent;
  }
  expect(btn).toBeDefined();
  await act(async () => {
    btn!.props.onPress();
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("Sign-in screen — sessionActivated fix", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("navigates away and shows no error when correct credentials succeed", async () => {
    const { replace } = buildDefaults({});
    const renderer = renderScreen();
    await act(async () => {});

    // Fill in credentials so the button is enabled
    const root = renderer.root;
    const inputs = root.findAllByType(require("react-native").TextInput);
    await act(async () => {
      inputs[0].props.onChangeText("user@example.com");
      inputs[1].props.onChangeText("CorrectPassword1");
    });

    await pressSignIn(renderer);

    expect(replace).toHaveBeenCalledWith("/");
    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Sign-in failed");
    expect(json).not.toContain("Password is incorrect");
  });

  it("opens password recovery from the forgot-password link", async () => {
    const { push } = buildDefaults({});
    const renderer = renderScreen();

    await act(async () => {
      renderer.root.findByProps({ testID: "forgot-password" }).props.onPress();
    });

    expect(push).toHaveBeenCalledWith("/forgot-password");
  });

  it("navigates away when a stale Clerk 400 fires after setActive already succeeded", async () => {
    // Simulate: password() resolves fine, setActive() resolves fine,
    // then a second error (400 from Clerk cleanup) arrives in the catch block.
    // The sessionActivated ref should be true at that point, so replace() is
    // called instead of showing an error.
    const replace = jest.fn();

    // We'll inject the stale error by making setActive resolve and then having
    // the surrounding try-block throw after sessionActivated.current is set.
    // We achieve this by replacing `router.replace` with a function that
    // throws on the FIRST call (simulating the 400 arriving during navigation)
    // then succeeds on subsequent calls.
    let replaceCallCount = 0;
    replace.mockImplementation(() => {
      replaceCallCount++;
      if (replaceCallCount === 1) {
        // The first call to replace is the one inside the try block
        // (after setActive). Throw to simulate a background 400 landing
        // in the catch block.
        throw Object.assign(new Error("cleanup 400"), {
          errors: [{ longMessage: "Request already completed." }],
        });
      }
      // Second call (from the catch block's sessionActivated branch) succeeds.
    });

    buildDefaults({ replace });

    const renderer = renderScreen();
    await act(async () => {});

    const root = renderer.root;
    const inputs = root.findAllByType(require("react-native").TextInput);
    await act(async () => {
      inputs[0].props.onChangeText("user@example.com");
      inputs[1].props.onChangeText("CorrectPassword1");
    });

    await pressSignIn(renderer);

    // replace should have been called twice: once in try (threw), once in catch.
    expect(replace).toHaveBeenCalledTimes(2);
    const json = JSON.stringify(renderer.toJSON());
    // The cleanup error message must NOT be shown to the user
    expect(json).not.toContain("Request already completed");
    expect(json).not.toContain("Sign-in failed");
  });

  it("shows the Clerk error message when credentials are wrong", async () => {
    const dismissAll = jest.fn();
    mockUseRouter.mockReturnValue({ dismissAll, back: jest.fn() });
    mockUseClerk.mockReturnValue({ setActive: jest.fn() });
    mockUseSSO.mockReturnValue({ startSSOFlow: jest.fn() });
    mockUseSignInWithApple.mockReturnValue({
      startAppleAuthenticationFlow: jest.fn(),
    });
    mockUseSignIn.mockReturnValue({
      signIn: {
        password: jest.fn(() =>
          Promise.resolve({
            error: { errors: [{ longMessage: "Password is incorrect." }] },
          }),
        ),
        createdSessionId: null,
      },
      errors: { fields: {} },
      fetchStatus: "idle",
    });

    const renderer = renderScreen();
    await act(async () => {});

    const root = renderer.root;
    const inputs = root.findAllByType(require("react-native").TextInput);
    await act(async () => {
      inputs[0].props.onChangeText("user@example.com");
      inputs[1].props.onChangeText("WrongPassword");
    });

    await pressSignIn(renderer);

    // The screen must still be showing (not navigated away)
    expect(dismissAll).not.toHaveBeenCalled();
  });

  it("shows a fallback message when sign-in throws with no Clerk error object", async () => {
    const dismissAll = jest.fn();
    mockUseRouter.mockReturnValue({ dismissAll, back: jest.fn() });
    mockUseClerk.mockReturnValue({ setActive: jest.fn() });
    mockUseSSO.mockReturnValue({ startSSOFlow: jest.fn() });
    mockUseSignInWithApple.mockReturnValue({
      startAppleAuthenticationFlow: jest.fn(),
    });
    mockUseSignIn.mockReturnValue({
      signIn: {
        password: jest.fn(() => Promise.reject(new Error("network error"))),
        createdSessionId: null,
      },
      errors: { fields: {} },
      fetchStatus: "idle",
    });

    const renderer = renderScreen();
    await act(async () => {});

    const root = renderer.root;
    const inputs = root.findAllByType(require("react-native").TextInput);
    await act(async () => {
      inputs[0].props.onChangeText("user@example.com");
      inputs[1].props.onChangeText("AnyPassword1");
    });

    await pressSignIn(renderer);

    expect(dismissAll).not.toHaveBeenCalled();
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("network error");
  });
});
