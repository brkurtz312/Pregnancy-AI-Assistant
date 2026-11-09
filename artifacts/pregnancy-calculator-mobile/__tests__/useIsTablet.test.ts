/**
 * Unit tests for useIsTablet — verifies the hook's width-threshold logic
 * against a mocked useWindowDimensions so a change to the comparison or
 * source dimensions is caught.
 */

// Only useWindowDimensions is needed from react-native here; a minimal factory
// avoids loading the full native-module stack in Jest.
const mockWidth = { value: 390 };

jest.mock("react-native", () => ({
  useWindowDimensions: () => ({
    width: mockWidth.value,
    height: 844,
    scale: 1,
    fontScale: 1,
  }),
}));

import React from "react";
import { act, create } from "react-test-renderer";
import { useIsTablet } from "../hooks/useIsTablet";

// Render-harness that exposes the hook result as a plain text node
function TabletDetector() {
  const isTablet = useIsTablet();
  // Use a native string element so the test renderer serialises it without
  // needing a full react-native View.
  return React.createElement(
    "text" as unknown as React.ElementType,
    null,
    isTablet ? "tablet" : "phone",
  );
}

function renderDetector() {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(TabletDetector));
  });
  return JSON.stringify(renderer.toJSON());
}

describe("useIsTablet — hook rendered with mocked useWindowDimensions", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns true for iPad landscape 1024 pt wide", () => {
    mockWidth.value = 1024;
    expect(renderDetector()).toContain("tablet");
  });

  it("returns true at exactly 768 pt — the minimum iPad width", () => {
    mockWidth.value = 768;
    expect(renderDetector()).toContain("tablet");
  });

  it("returns true for iPad Pro landscape 1366 pt wide", () => {
    mockWidth.value = 1366;
    expect(renderDetector()).toContain("tablet");
  });

  it("returns true at exactly 600 pt — the tablet threshold", () => {
    mockWidth.value = 600;
    expect(renderDetector()).toContain("tablet");
  });

  it("returns false at 599 pt — one point below the tablet threshold", () => {
    mockWidth.value = 599;
    expect(renderDetector()).toContain("phone");
  });

  it("returns true for iPhone Duo unfolded inner screen (~669 pt)", () => {
    mockWidth.value = 669;
    expect(renderDetector()).toContain("tablet");
  });

  it("returns false for iPhone Duo folded outer screen (~466 pt)", () => {
    mockWidth.value = 466;
    expect(renderDetector()).toContain("phone");
  });

  it("returns false for iPhone 16 Pro 393 pt wide", () => {
    mockWidth.value = 393;
    expect(renderDetector()).toContain("phone");
  });

  it("returns false for iPhone SE 375 pt wide", () => {
    mockWidth.value = 375;
    expect(renderDetector()).toContain("phone");
  });

  it("returns false for iPad in narrow Split View (320 pt)", () => {
    mockWidth.value = 320;
    expect(renderDetector()).toContain("phone");
  });

  it("re-evaluates correctly when width changes (simulated rotation or unfolding)", () => {
    mockWidth.value = 466;
    expect(renderDetector()).toContain("phone");

    mockWidth.value = 1024;
    expect(renderDetector()).toContain("tablet");
  });
});
