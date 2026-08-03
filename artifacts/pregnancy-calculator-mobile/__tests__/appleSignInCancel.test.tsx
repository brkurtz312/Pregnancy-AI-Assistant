/**
 * Confirms that dismissing the Apple Sign-In sheet (ERR_CANCELED) shows no
 * error message on the sign-in or sign-up screen, while a genuine auth failure
 * still surfaces an error to the user.
 */
import React from "react";
import { Platform } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

// ── Force iOS so the Apple button is rendered ─────────────────────────────
// Platform.OS is read at render time, not at import time, so we can
// overwrite it before each test.
beforeAll(() => {
  Object.defineProperty(Platform, "OS", { get: () => "ios" });
});

// ── Module mocks ──────────────────────────────────────────────────────────
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

const mockStartAppleAuthFlow = jest.fn();
const mockStartSSOFlow = jest.fn();
const mockDismissAll = jest.fn();
const mockReplace = jest.fn();

// sign-in.tsx gates the Apple button behind isAvailableAsync(); resolve true
// so the button renders in every test that exercises the sign-in screen.
jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

// sign-in.tsx uses the native Apple auth sheet via @clerk/expo/apple
jest.mock("@clerk/expo/apple", () => ({
  useSignInWithApple: jest.fn(() => ({
    startAppleAuthenticationFlow: mockStartAppleAuthFlow,
  })),
}));

jest.mock("@clerk/expo", () => ({
  useSSO: () => ({ startSSOFlow: mockStartSSOFlow }),
  useClerk: jest.fn(() => ({ setActive: jest.fn() })),
  useSignIn: () => ({
    signIn: { password: jest.fn().mockResolvedValue({ error: null }) },
    errors: { fields: {} },
    fetchStatus: "idle",
  }),
  useSignUp: () => ({
    signUp: {
      status: "idle",
      unverifiedFields: [],
      password: jest.fn().mockResolvedValue({ error: null }),
      verifications: { sendEmailCode: jest.fn(), verifyEmailCode: jest.fn() },
    },
    errors: { fields: {} },
    fetchStatus: "idle",
  }),
}));

jest.mock("expo-auth-session", () => ({
  makeRedirectUri: () => "myapp://auth",
}));

jest.mock("expo-constants", () => ({
  default: { expoConfig: { scheme: "myapp" } },
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({
    back: jest.fn(),
    dismissAll: mockDismissAll,
    replace: mockReplace,
    push: jest.fn(),
  }),
}));

jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  warmUpAsync: jest.fn(),
  coolDownAsync: jest.fn(),
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
    destructive: "#e00",
  }),
}));

// ── JSON node types returned by toJSON() ─────────────────────────────────

interface JsonNode {
  type: string;
  props: Record<string, unknown>;
  children: (JsonNode | string)[] | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function collectStrings(node: JsonNode | string | null): string[] {
  if (!node) return [];
  if (typeof node === "string") return [node];
  const results: string[] = [];
  const { children } = node;
  if (children) {
    for (const child of children) {
      results.push(...collectStrings(child));
    }
  }
  return results;
}

function findTexts(renderer: ReactTestRenderer): string[] {
  const json = renderer.toJSON() as JsonNode | JsonNode[] | null;
  const texts: string[] = [];
  function walk(node: JsonNode | string | null) {
    if (!node || typeof node === "string") return;
    if (node.type === "Text") {
      texts.push(...collectStrings(node));
    }
    if (node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }
  if (Array.isArray(json)) {
    json.forEach(walk);
  } else {
    walk(json);
  }
  return texts;
}

function findAppleButton(
  renderer: ReactTestRenderer,
): ReturnType<ReactTestRenderer["root"]["findAllByType"]>[number] | undefined {
  const { TouchableOpacity } = require("react-native") as {
    TouchableOpacity: React.ComponentType;
  };
  const all = renderer.root.findAllByType(TouchableOpacity);
  return all.find((btn) => {
    try {
      const { Text: RNText } = require("react-native") as {
        Text: React.ComponentType;
      };
      const labels = btn
        .findAllByType(RNText)
        .map((t) => String(t.props.children))
        .join(" ");
      return labels.includes("Continue with Apple");
    } catch {
      return false;
    }
  });
}

// ── Sign-In screen ────────────────────────────────────────────────────────

import SignInScreen from "../app/(auth)/sign-in";

describe("SignIn — Apple Sign-In cancellation", () => {
  afterEach(() => jest.clearAllMocks());

  it("shows no error when the user dismisses the Apple sheet (ERR_CANCELED)", async () => {
    // sign-in.tsx uses startAppleAuthenticationFlow (native sheet), not startSSOFlow
    mockStartAppleAuthFlow.mockRejectedValue({ code: "ERR_CANCELED" });

    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const appleBtn = findAppleButton(renderer);
    expect(appleBtn).toBeDefined();

    await act(async () => {
      appleBtn!.props.onPress();
    });

    const texts = findTexts(renderer);
    expect(texts.some((t) => /Apple sign-in failed/i.test(t))).toBe(false);
    expect(texts.some((t) => /please try again/i.test(t))).toBe(false);
  });

  it("shows an error when a genuine Apple auth failure occurs", async () => {
    // No message so the component renders the generic fallback text
    mockStartAppleAuthFlow.mockRejectedValue(new Error());

    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const appleBtn = findAppleButton(renderer);
    expect(appleBtn).toBeDefined();

    await act(async () => {
      appleBtn!.props.onPress();
    });

    const texts = findTexts(renderer);
    expect(texts.some((t) => /Apple sign-in failed/i.test(t))).toBe(true);
  });

  it("shows no error when the user dismisses via a 'cancel' message", async () => {
    mockStartAppleAuthFlow.mockRejectedValue(new Error("user cancel"));

    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const appleBtn = findAppleButton(renderer);
    await act(async () => {
      appleBtn!.props.onPress();
    });

    const texts = findTexts(renderer);
    expect(texts.some((t) => /Apple sign-in failed/i.test(t))).toBe(false);
  });
});

// ── Sign-Up screen ────────────────────────────────────────────────────────

import SignUpScreen from "../app/(auth)/sign-up";

describe("SignUp — Apple Sign-In cancellation", () => {
  afterEach(() => jest.clearAllMocks());

  it("shows no error when the user dismisses the Apple sheet (ERR_CANCELED)", async () => {
    // sign-up.tsx now uses startAppleAuthenticationFlow (native sheet), not startSSOFlow
    mockStartAppleAuthFlow.mockRejectedValue({ code: "ERR_CANCELED" });

    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const appleBtn = findAppleButton(renderer);
    expect(appleBtn).toBeDefined();

    await act(async () => {
      appleBtn!.props.onPress();
    });

    const texts = findTexts(renderer);
    expect(texts.some((t) => /Apple sign-in failed/i.test(t))).toBe(false);
    expect(texts.some((t) => /please try again/i.test(t))).toBe(false);
  });

  it("shows an error when a genuine Apple auth failure occurs", async () => {
    mockStartAppleAuthFlow.mockRejectedValue(
      new Error("Session creation failed"),
    );

    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const appleBtn = findAppleButton(renderer);
    expect(appleBtn).toBeDefined();

    await act(async () => {
      appleBtn!.props.onPress();
    });

    const texts = findTexts(renderer);
    expect(texts.some((t) => /Apple sign-in failed/i.test(t))).toBe(true);
  });

  it("shows no error when the user dismisses via a 'dismiss' message", async () => {
    mockStartAppleAuthFlow.mockRejectedValue(new Error("sheet dismissed"));

    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const appleBtn = findAppleButton(renderer);
    await act(async () => {
      appleBtn!.props.onPress();
    });

    const texts = findTexts(renderer);
    expect(texts.some((t) => /Apple sign-in failed/i.test(t))).toBe(false);
  });
});
