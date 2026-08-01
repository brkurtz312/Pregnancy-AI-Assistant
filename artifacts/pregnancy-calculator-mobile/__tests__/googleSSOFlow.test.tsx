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
    mockStartSSOFlow.mockRejectedValue(new Error("redirect_uri_mismatch"));

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
    mockStartSSOFlow.mockRejectedValue(new Error("access_denied"));

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
});
