import React, { useState } from "react";
import { act, create } from "react-test-renderer";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#fff",
    card: "#fff",
    border: "#eee",
    primary: "#ff69b4",
    foreground: "#000",
    mutedForeground: "#666",
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { WhatsNewModal } from "../components/WhatsNewModal";

const UNKNOWN_VERSION = "99.99.99";

describe("WhatsNewModal — missing version entry", () => {
  it("calls onDismiss immediately when the version has no WHATS_NEW entry", async () => {
    const onDismiss = jest.fn();

    act(() => {
      create(
        React.createElement(WhatsNewModal, {
          version: UNKNOWN_VERSION,
          visible: true,
          onDismiss,
        }),
      );
    });

    await act(async () => {});

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("visible becomes false after the auto-dismiss path runs", async () => {
    let capturedVisible = true;

    function Wrapper() {
      const [visible, setVisible] = useState(true);
      capturedVisible = visible;
      return React.createElement(WhatsNewModal, {
        version: UNKNOWN_VERSION,
        visible,
        onDismiss: () => setVisible(false),
      });
    }

    act(() => {
      create(React.createElement(Wrapper));
    });

    await act(async () => {});

    expect(capturedVisible).toBe(false);
  });
});
