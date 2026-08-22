import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { act, create } from "react-test-renderer";

jest.mock("@clerk/expo", () => ({
  useClerk: jest.fn(),
  useSignIn: jest.fn(),
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
    destructive: "#e53e3e",
  }),
}));

import { useClerk, useSignIn } from "@clerk/expo";
import { useRouter } from "expo-router";

import ForgotPasswordScreen from "../app/(auth)/forgot-password";

const mockUseClerk = useClerk as jest.Mock;
const mockUseSignIn = useSignIn as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;

function buttonWithLabel(renderer: ReturnType<typeof create>, label: string) {
  const text = renderer.root
    .findAllByType(Text)
    .find((node) => node.props.children === label);
  expect(text).toBeDefined();

  let node = text?.parent;
  while (node?.parent) {
    if (node.type === TouchableOpacity) return node;
    node = node.parent;
  }
  throw new Error(`Could not find button for ${label}`);
}

describe("Password recovery", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("sends a reset code, verifies it, updates the password, and activates the new session", async () => {
    const createSignIn = jest.fn(() => Promise.resolve({ error: null }));
    const sendCode = jest.fn(() => Promise.resolve({ error: null }));
    const verifyCode = jest.fn(() => Promise.resolve({ error: null }));
    const submitPassword = jest.fn(() => Promise.resolve({ error: null }));
    const replace = jest.fn();
    const setActive = jest.fn(() => Promise.resolve());
    const finalize = jest.fn(async ({ navigate }) => {
      await navigate({ session: { id: "reset-session" } });
      return { error: null };
    });

    mockUseRouter.mockReturnValue({
      back: jest.fn(),
      replace,
    });
    mockUseClerk.mockReturnValue({ setActive });
    mockUseSignIn.mockReturnValue({
      signIn: {
        create: createSignIn,
        resetPasswordEmailCode: {
          sendCode,
          verifyCode,
          submitPassword,
        },
        status: "complete",
        finalize,
      },
      errors: { fields: {} },
      fetchStatus: "idle",
    });

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(ForgotPasswordScreen));
    });

    await act(async () => {
      renderer.root
        .findByProps({ testID: "password-reset-email" })
        .props.onChangeText("reviewer@example.com");
    });
    await act(async () => {
      await buttonWithLabel(renderer, "Send Reset Code").props.onPress();
    });
    expect(createSignIn).toHaveBeenCalledWith({
      identifier: "reviewer@example.com",
    });
    expect(sendCode).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(renderer.toJSON())).toContain("Check your email");

    await act(async () => {
      renderer.root
        .findByProps({ testID: "password-reset-code" })
        .props.onChangeText("123456");
    });
    await act(async () => {
      await buttonWithLabel(renderer, "Verify Code").props.onPress();
    });
    expect(verifyCode).toHaveBeenCalledWith({ code: "123456" });
    expect(JSON.stringify(renderer.toJSON())).toContain(
      "Choose a new password",
    );

    await act(async () => {
      renderer.root
        .findByProps({ testID: "password-reset-new-password" })
        .props.onChangeText("NewPassword123!");
    });
    await act(async () => {
      await buttonWithLabel(renderer, "Update Password").props.onPress();
    });
    expect(submitPassword).toHaveBeenCalledWith({
      password: "NewPassword123!",
      signOutOfOtherSessions: true,
    });
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(setActive).toHaveBeenCalledWith({ session: "reset-session" });
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("requires an email address before requesting a reset", async () => {
    mockUseRouter.mockReturnValue({ back: jest.fn(), replace: jest.fn() });
    mockUseClerk.mockReturnValue({ setActive: jest.fn() });
    mockUseSignIn.mockReturnValue({
      signIn: { create: jest.fn() },
      errors: { fields: {} },
      fetchStatus: "idle",
    });

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(ForgotPasswordScreen));
    });

    await act(async () => {
      buttonWithLabel(renderer, "Send Reset Code").props.onPress();
    });

    expect(JSON.stringify(renderer.toJSON())).toContain(
      "Enter your email address first.",
    );
  });
});
