/**
 * Visit Prep sub-screens: Prenatal Care, Labor & Delivery, Postpartum
 *
 * All three screens are purely informational navigation menus that surface
 * static topic cards. They do not load user-specific data (no saved notes,
 * no checklists persisted per account, no auth-gated API calls), so no
 * sign-in gate is needed or present — exactly like the Visit Prep tab itself.
 *
 * These tests confirm that each screen:
 *   1. Renders its content without a sign-in prompt, and
 *   2. Does not render any sign-in gate (gate intentionally absent).
 */

import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
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

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

jest.mock("@/components/AskCard", () => ({
  AskCard: () => null,
}));

import PrenatalCareScreen from "../app/prenatal-care";
import LaborDeliveryScreen from "../app/labor-delivery";
import PostpartumScreen from "../app/postpartum";

function renderScreen(Component: React.ComponentType) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(Component));
  });
  return renderer;
}

// ---------------------------------------------------------------------------
// Prenatal Care
// ---------------------------------------------------------------------------

describe("Prenatal Care sub-screen — no auth gate required", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the screen title without requiring authentication", async () => {
    const renderer = renderScreen(PrenatalCareScreen);
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Prenatal Care");
  });

  it("does not render a sign-in prompt (screen is intentionally public)", async () => {
    const renderer = renderScreen(PrenatalCareScreen);
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Sign in");
  });
});

// ---------------------------------------------------------------------------
// Labor & Delivery
// ---------------------------------------------------------------------------

describe("Labor & Delivery sub-screen — no auth gate required", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the screen title without requiring authentication", async () => {
    const renderer = renderScreen(LaborDeliveryScreen);
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Labor and Delivery");
  });

  it("does not render a sign-in prompt (screen is intentionally public)", async () => {
    const renderer = renderScreen(LaborDeliveryScreen);
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Sign in");
  });
});

// ---------------------------------------------------------------------------
// Postpartum
// ---------------------------------------------------------------------------

describe("Postpartum sub-screen — no auth gate required", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the screen title without requiring authentication", async () => {
    const renderer = renderScreen(PostpartumScreen);
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Postpartum");
  });

  it("does not render a sign-in prompt (screen is intentionally public)", async () => {
    const renderer = renderScreen(PostpartumScreen);
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Sign in");
  });
});
