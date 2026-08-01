/**
 * appleSSOFlow.test.tsx
 *
 * Verifies the "Continue with Apple" button in the sign-in and sign-up
 * screens correctly wires up Clerk's useSSO hook and handles cancellation
 * gracefully.  The Apple button is iOS-only, so these tests temporarily
 * set Platform.OS to "ios".
 *
 * Cases covered:
 *   1. The button renders on iOS for both screens.
 *   2. Tapping it calls startSSOFlow with strategy:"oauth_apple".
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
    .find((t) => t.props.children === "Continue with Apple");
  expect(label).toBeDefined();

  let node: ReactTestInstance | null | undefined = label;
  while (node?.parent) {
    node = node.parent;
    if (node.type === TouchableOpacity) return node;
  }
  throw new Error(
    "Could not find TouchableOpacity wrapping 'Continue with Apple'",
  );
}

// ─── sign-in screen ──────────────────────────────────────────────────────────

describe("SignInScreen — Apple SSO", () => {
  let dismissAll: jest.Mock;
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

  it('renders the "Continue with Apple" button on iOS', async () => {
    mockStartSSOFlow.mockResolvedValue({});

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignInScreen));
    });
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Continue with Apple");
  });

  it("calls startSSOFlow with strategy:oauth_apple", async () => {
    mockStartSSOFlow.mockResolvedValue({
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

    expect(mockStartSSOFlow).toHaveBeenCalledTimes(1);
    const call = mockStartSSOFlow.mock.calls[0][0];
    expect(call.strategy).toBe("oauth_apple");
  });

  it("calls setActive and dismissAll when Apple SSO returns a session", async () => {
    const setActive = jest.fn().mockResolvedValue(undefined);
    mockStartSSOFlow.mockResolvedValue({
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
    expect(dismissAll).toHaveBeenCalled();
  });

  it("does NOT show an error when the Apple sheet is dismissed (ERR_CANCELED)", async () => {
    // Apple fires { code: "ERR_CANCELED" } when the native sheet is dismissed.
    mockStartSSOFlow.mockRejectedValue({ code: "ERR_CANCELED" });

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
    mockStartSSOFlow.mockRejectedValue(new Error("Network request failed"));

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

  it("shows a notice when Apple SSO resolves with null session", async () => {
    mockStartSSOFlow.mockResolvedValue({
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
    expect(json).toContain("Apple sign-in could not be completed");
    expect(dismissAll).not.toHaveBeenCalled();
    expect(btn.props.disabled).toBe(false);
  });
});

// ─── sign-up screen ──────────────────────────────────────────────────────────

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

  it('renders the "Continue with Apple" button on iOS', async () => {
    mockStartSSOFlow.mockResolvedValue({});

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(SignUpScreen));
    });
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Continue with Apple");
  });

  it("calls startSSOFlow with strategy:oauth_apple", async () => {
    mockStartSSOFlow.mockResolvedValue({
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

    expect(mockStartSSOFlow).toHaveBeenCalledTimes(1);
    const call = mockStartSSOFlow.mock.calls[0][0];
    expect(call.strategy).toBe("oauth_apple");
  });

  it("calls setActive and navigates to root when Apple SSO returns a session", async () => {
    const setActive = jest.fn().mockResolvedValue(undefined);
    mockStartSSOFlow.mockResolvedValue({
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
    mockStartSSOFlow.mockRejectedValue({ code: "ERR_CANCELED" });

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
    mockStartSSOFlow.mockRejectedValue(new Error("access_denied"));

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

  it("shows a notice when Apple SSO resolves with null session", async () => {
    mockStartSSOFlow.mockResolvedValue({
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
    expect(json).toContain("Apple sign-in could not be completed");
    expect(replace).not.toHaveBeenCalled();
    expect(btn.props.disabled).toBe(false);
  });
});
