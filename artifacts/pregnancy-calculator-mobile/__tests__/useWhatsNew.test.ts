import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "2.0.0" } },
}));

import { useWhatsNew } from "../hooks/useWhatsNew";

const STORAGE_KEY = "whats_new_last_seen_version";

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

function mountHook() {
  const result: { current: ReturnType<typeof useWhatsNew> } = {
    current: { visible: false, dismiss: async () => {} },
  };
  let renderer: ReturnType<typeof create>;

  function Wrapper() {
    result.current = useWhatsNew();
    return null;
  }

  act(() => {
    renderer = create(React.createElement(Wrapper));
  });

  return {
    result,
    unmount: () => renderer?.unmount(),
  };
}

describe("useWhatsNew — show once per version", () => {
  it("shows the sheet on first launch when the version has not been seen before", async () => {
    const { result } = mountHook();

    await act(async () => {});

    expect(result.current.visible).toBe(true);
  });

  it("writes the current version to AsyncStorage after dismiss()", async () => {
    const { result } = mountHook();

    await act(async () => {});
    expect(result.current.visible).toBe(true);

    await act(async () => {
      await result.current.dismiss();
    });

    expect(result.current.visible).toBe(false);
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    expect(stored).toBe("2.0.0");
  });

  it("does NOT show the sheet on second launch when the same version was already dismissed", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, "2.0.0");

    const { result } = mountHook();

    await act(async () => {});

    expect(result.current.visible).toBe(false);
  });

  it("shows the sheet again when the stored version is older than the current version", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, "1.0.0");

    const { result } = mountHook();

    await act(async () => {});

    expect(result.current.visible).toBe(true);
  });

  it("full flow: first launch shows modal, dismiss persists it, second launch hides it", async () => {
    const { result: first, unmount } = mountHook();

    await act(async () => {});
    expect(first.current.visible).toBe(true);

    await act(async () => {
      await first.current.dismiss();
    });
    expect(first.current.visible).toBe(false);

    act(() => {
      unmount();
    });

    const { result: second } = mountHook();
    await act(async () => {});
    expect(second.current.visible).toBe(false);
  });
});
