import React from "react";
import { KeyboardAvoidingView, Platform } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { KeyboardAvoidingViewCompat } from "../components/KeyboardAvoidingViewCompat";

// Stand-in for the library's native-backed view; the real one needs the
// KeyboardProvider native module, which does not exist under Jest.
jest.mock("react-native-keyboard-controller", () => ({
  KeyboardAvoidingView: function MockKCKeyboardAvoidingView(props: object) {
    const { createElement } = jest.requireActual("react");
    const RN = jest.requireActual("react-native");
    return createElement(RN.View, props);
  },
}));
const { KeyboardAvoidingView: MockKCKeyboardAvoidingView } = jest.requireMock(
  "react-native-keyboard-controller",
);

const originalOS = Platform.OS;
function setOS(os: string) {
  Object.defineProperty(Platform, "OS", { get: () => os, configurable: true });
}
afterEach(() => setOS(originalOS));

function render(os: string): ReactTestRenderer {
  setOS(os);
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      React.createElement(KeyboardAvoidingViewCompat, {
        style: { flex: 1 },
        keyboardVerticalOffset: 0,
      }),
    );
  });
  return renderer;
}

describe("KeyboardAvoidingViewCompat", () => {
  it("uses keyboard-controller's view with padding on Android", () => {
    const root = render("android").root;
    expect(root.findAllByType(KeyboardAvoidingView)).toHaveLength(0);
    const kc = root.findByType(MockKCKeyboardAvoidingView);
    expect(kc.props.behavior).toBe("padding");
    expect(kc.props.style).toEqual({ flex: 1 });
    expect(kc.props.keyboardVerticalOffset).toBe(0);
  });

  it("keeps React Native's view with padding on iOS", () => {
    const root = render("ios").root;
    expect(root.findAllByType(MockKCKeyboardAvoidingView)).toHaveLength(0);
    const rn = root.findByType(KeyboardAvoidingView);
    expect(rn.props.behavior).toBe("padding");
    expect(rn.props.style).toEqual({ flex: 1 });
  });

  it("keeps React Native's view with no behavior on web", () => {
    const root = render("web").root;
    expect(root.findAllByType(MockKCKeyboardAvoidingView)).toHaveLength(0);
    expect(
      root.findByType(KeyboardAvoidingView).props.behavior,
    ).toBeUndefined();
  });
});
