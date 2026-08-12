/**
 * Tests that the sign-up screen handles a slow Clerk initialization
 * (useSignUp returning signUp: null) without crashing: tapping
 * "Create Account" shows the friendly "not ready" notice instead of a
 * null-dereference.
 */
import React from "react";
import { Text, TextInput, TouchableOpacity } from "react-native";
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
  useSignUp: jest.fn(),
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

import { useSignUp, useSSO } from "@clerk/expo";
import { useSignInWithApple } from "@clerk/expo/apple";
import { useRouter } from "expo-router";

import SignUpScreen from "../app/(auth)/sign-up";

const mockUseSignUp = useSignUp as jest.Mock;
const mockUseSSO = useSSO as jest.Mock;
const mockUseSignInWithApple = useSignInWithApple as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;

const NOT_READY_NOTICE =
  "Sign-up is not ready yet — please wait a moment and try again.";

// ── Helpers ────────────────────────────────────────────────────────────────

function setupMocks() {
  mockUseRouter.mockReturnValue({
    back: jest.fn(),
    replace: jest.fn(),
  });
  mockUseSSO.mockReturnValue({ startSSOFlow: jest.fn() });
  mockUseSignInWithApple.mockReturnValue({
    startAppleAuthenticationFlow: jest.fn(),
  });
  // Simulate ClerkProvider still initializing: signUp is null.
  mockUseSignUp.mockReturnValue({
    signUp: null,
    errors: { fields: {} },
    fetchStatus: "loading",
  });
}

function renderScreen() {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(SignUpScreen));
  });
  return renderer;
}

async function fillForm(renderer: ReturnType<typeof create>) {
  const inputs = renderer.root.findAllByType(TextInput);
  await act(async () => {
    inputs[0].props.onChangeText("user@example.com");
    inputs[1].props.onChangeText("SomePassword1");
  });
}

/** Find and tap the "Create Account" button. */
async function pressCreateAccount(renderer: ReturnType<typeof create>) {
  const root = renderer.root;
  const createText = root
    .findAllByType(Text)
    .find((t) => t.props.children === "Create Account");
  expect(createText).toBeDefined();

  let node = createText?.parent;
  let btn: typeof node | undefined;
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

describe("Sign-up screen — slow Clerk initialization (signUp: null)", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders without crashing when signUp is null", () => {
    setupMocks();
    const renderer = renderScreen();
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Create your account");
  });

  it("shows the 'not ready' notice instead of crashing when Create Account is tapped", async () => {
    setupMocks();
    const renderer = renderScreen();
    await act(async () => {});

    await fillForm(renderer);
    await pressCreateAccount(renderer);

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain(NOT_READY_NOTICE);
  });

  it("does not navigate away when signUp is null", async () => {
    setupMocks();
    const replace = jest.fn();
    mockUseRouter.mockReturnValue({ back: jest.fn(), replace });

    const renderer = renderScreen();
    await act(async () => {});

    await fillForm(renderer);
    await pressCreateAccount(renderer);

    expect(replace).not.toHaveBeenCalled();
  });
});
