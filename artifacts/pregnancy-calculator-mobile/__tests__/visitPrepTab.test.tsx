import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
  router: { push: jest.fn() },
}));

jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#fff",
    card: "#f9f9f9",
    border: "#eee",
    primary: "#ff69b4",
    primaryForeground: "#fff",
    foreground: "#000",
    mutedForeground: "#666",
    muted: "#f5f5f5",
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import GetReadyScreen from "../app/(tabs)/visit-prep";

function renderScreen() {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(GetReadyScreen));
  });
  return renderer;
}

describe("Visit Prep tab — no auth gate required", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the main screen content without requiring authentication", async () => {
    const renderer = renderScreen();
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Get Ready");
  });

  it("does not render any sign-in prompt (tab is intentionally public)", async () => {
    const renderer = renderScreen();
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Sign in");
  });

  it("renders the 'Choose a Section' call-to-action button", async () => {
    const renderer = renderScreen();
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Choose a Section");
  });
});
