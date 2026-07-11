import React, { useState } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";

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
import { WHATS_NEW } from "../constants/whatsNew";

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

describe("WhatsNewModal — version-to-content lookup", () => {
  it("renders the headline and first item title for each version entry", () => {
    const versions = Object.entries(WHATS_NEW);
    expect(versions.length).toBeGreaterThan(0);

    for (const [version, entry] of versions) {
      const onDismiss = jest.fn();
      let renderer!: ReactTestRenderer;

      act(() => {
        renderer = create(
          React.createElement(WhatsNewModal, {
            version,
            visible: true,
            onDismiss,
          }),
        );
      });

      const json = JSON.stringify(renderer.toJSON());
      expect(json).toContain(entry.headline);
      expect(json).toContain(entry.items[0].title);
      expect(onDismiss).not.toHaveBeenCalled();
    }
  });

  it("shows the specified version's content, not the latest version's content", () => {
    const versions = Object.keys(WHATS_NEW);
    expect(versions.length).toBeGreaterThan(1);

    const [versionA, versionB] = versions;
    const entryA = WHATS_NEW[versionA];
    const entryB = WHATS_NEW[versionB];

    const onDismiss = jest.fn();
    let renderer!: ReactTestRenderer;

    act(() => {
      renderer = create(
        React.createElement(WhatsNewModal, {
          version: versionA,
          visible: true,
          onDismiss,
        }),
      );
    });

    const json = JSON.stringify(renderer.toJSON());

    expect(json).toContain(entryA.items[0].title);
    if (entryA.items[0].title !== entryB.items[0].title) {
      expect(json).not.toContain(entryB.items[0].title);
    }
  });

  it("shows no content and calls onDismiss for an unknown version", async () => {
    const onDismiss = jest.fn();
    let renderer!: ReactTestRenderer;

    act(() => {
      renderer = create(
        React.createElement(WhatsNewModal, {
          version: UNKNOWN_VERSION,
          visible: true,
          onDismiss,
        }),
      );
    });

    await act(async () => {});

    expect(renderer.toJSON()).toBeNull();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
