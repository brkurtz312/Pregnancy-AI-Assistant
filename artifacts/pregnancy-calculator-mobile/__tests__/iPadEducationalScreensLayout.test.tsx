/**
 * Task 584 — iPad wide-layout verification for educational screens
 *
 * Task #515 wrapped 39 educational/detail screens with <ResponsiveContainer>
 * to cap content at 680 pt on iPad. This suite guards against regressions in
 * the component or its usages:
 *
 *  1. ResponsiveContainer + real useIsTablet — driven by a mocked
 *     useWindowDimensions, asserts the tablet branch centres content and
 *     applies maxWidth 680, while the phone branch renders a plain
 *     full-width View (including iPad Split View narrow widths).
 *  2. Representative screens (hp-warning-signs, prenatal-care,
 *     labor-delivery, postpartum, video-vault) rendered at an iPad-sized
 *     viewport — asserts the 680 pt max-width + centring wrapper is present
 *     and content still renders.
 *  3. The same screens at an iPhone-sized viewport — asserts NO max-width
 *     constraint or centring wrapper is applied (full-width, normal padding).
 */

import React from "react";
import { act, create } from "react-test-renderer";

// ─── viewport control: mock useWindowDimensions used by useIsTablet ────────

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })),
}));

const mockDims = (
  jest.requireMock("react-native/Libraries/Utilities/useWindowDimensions") as {
    default: jest.Mock;
  }
).default;

const IPAD = { width: 1024, height: 768, scale: 2, fontScale: 1 };
const IPHONE = { width: 390, height: 844, scale: 3, fontScale: 1 };
const SPLIT_VIEW_NARROW = { width: 678, height: 768, scale: 2, fontScale: 1 };

// ─── RN + Expo infrastructure mocks ─────────────────────────────────────────

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(async () => ({})),
}));

jest.mock("expo-asset", () => ({
  Asset: { fromModule: jest.fn(() => ({ downloadAsync: jest.fn() })) },
}));

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "/tmp/",
  copyAsync: jest.fn(async () => {}),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(async () => {}),
}));

// PDF asset require() inside hp-warning-signs
jest.mock(
  "@/assets/docs/warning-signs-pregnancy.pdf",
  () => "warning-signs.pdf",
  { virtual: true },
);

jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#fff",
    card: "#fff",
    border: "#eee",
    primary: "#e86cad",
    primaryForeground: "#fff",
    foreground: "#000",
    mutedForeground: "#666",
    muted: "#f5f5f5",
    accent: "#f0f0f0",
  }),
}));

jest.mock("@/components/AskCard", () => ({ AskCard: () => null }));

// ─── imports (after mocks) ──────────────────────────────────────────────────

import { ResponsiveContainer } from "../components/ResponsiveContainer";
import HpWarningSignsScreen from "../app/hp-warning-signs";
import PrenatalCareScreen from "../app/prenatal-care";
import LaborDeliveryScreen from "../app/labor-delivery";
import PostpartumScreen from "../app/postpartum";
import VideoVaultScreen from "../app/video-vault";
import { Text } from "react-native";

// ─── helpers ────────────────────────────────────────────────────────────────

function renderTree(element: React.ReactElement): string {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(element);
  });
  const json = JSON.stringify(renderer.toJSON());
  act(() => {
    renderer.unmount();
  });
  return json;
}

const hasMaxWidth = (json: string) => json.includes('"maxWidth":680');
const hasCentringWrapper = (json: string) =>
  json.includes('"alignItems":"center","flex":1') ||
  json.includes('"flex":1,"alignItems":"center"');

// ─── 1. ResponsiveContainer + real useIsTablet ──────────────────────────────

describe("ResponsiveContainer with real useIsTablet", () => {
  afterEach(() => jest.clearAllMocks());

  it("iPad width (1024 pt): caps content at 680 pt and centres it", () => {
    mockDims.mockReturnValue(IPAD);
    const json = renderTree(
      <ResponsiveContainer>
        <Text>content</Text>
      </ResponsiveContainer>,
    );
    expect(hasMaxWidth(json)).toBe(true);
    expect(json).toContain('"alignItems":"center"');
    expect(json).toContain('"width":"100%"');
    expect(json).toContain("content");
  });

  it("iPad portrait width (768 pt) still gets the tablet constraint", () => {
    mockDims.mockReturnValue({ ...IPAD, width: 768 });
    expect(
      hasMaxWidth(
        renderTree(
          <ResponsiveContainer>
            <Text>content</Text>
          </ResponsiveContainer>,
        ),
      ),
    ).toBe(true);
  });

  it("honours a custom maxWidth on tablet", () => {
    mockDims.mockReturnValue(IPAD);
    const json = renderTree(
      <ResponsiveContainer maxWidth={500}>
        <Text>content</Text>
      </ResponsiveContainer>,
    );
    expect(json).toContain('"maxWidth":500');
  });

  it("iPhone width (390 pt): renders a plain full-width View, no maxWidth", () => {
    mockDims.mockReturnValue(IPHONE);
    const json = renderTree(
      <ResponsiveContainer style={{ paddingHorizontal: 16 }}>
        <Text>content</Text>
      </ResponsiveContainer>,
    );
    expect(json).not.toContain('"maxWidth"');
    expect(json).not.toContain('"alignItems":"center"');
    // normal padding preserved
    expect(json).toContain('"paddingHorizontal":16');
    expect(json).toContain("content");
  });

  it("iPad Split View narrow pane (<768 pt) falls back to phone layout", () => {
    mockDims.mockReturnValue(SPLIT_VIEW_NARROW);
    const json = renderTree(
      <ResponsiveContainer>
        <Text>content</Text>
      </ResponsiveContainer>,
    );
    expect(json).not.toContain('"maxWidth"');
  });

  it("preserves the screen's horizontal padding inside the tablet wrapper", () => {
    mockDims.mockReturnValue(IPAD);
    const json = renderTree(
      <ResponsiveContainer style={{ paddingHorizontal: 16 }}>
        <Text>content</Text>
      </ResponsiveContainer>,
    );
    expect(json).toContain('"paddingHorizontal":16');
    expect(hasMaxWidth(json)).toBe(true);
  });
});

// ─── 2 & 3. Representative educational screens ─────────────────────────────

const SCREENS: Array<{
  name: string;
  Component: React.ComponentType;
  expectText: string;
}> = [
  {
    name: "hp-warning-signs",
    Component: HpWarningSignsScreen,
    expectText: "Warning Signs",
  },
  {
    name: "prenatal-care",
    Component: PrenatalCareScreen,
    expectText: "Prenatal Care",
  },
  {
    name: "labor-delivery",
    Component: LaborDeliveryScreen,
    expectText: "Labor and Delivery",
  },
  { name: "postpartum", Component: PostpartumScreen, expectText: "Postpartum" },
  {
    name: "video-vault",
    Component: VideoVaultScreen,
    expectText: "Video Vault",
  },
];

describe("educational screens on an iPad-sized viewport (1024 pt wide)", () => {
  beforeEach(() => mockDims.mockReturnValue(IPAD));
  afterEach(() => jest.clearAllMocks());

  it.each(SCREENS)(
    "$name: content is centred and constrained to 680 pt",
    ({ Component, expectText }) => {
      const json = renderTree(<Component />);
      expect(hasMaxWidth(json)).toBe(true);
      expect(hasCentringWrapper(json)).toBe(true);
      expect(json).toContain(expectText);
    },
  );
});

describe("educational screens on an iPhone-sized viewport (390 pt wide)", () => {
  beforeEach(() => mockDims.mockReturnValue(IPHONE));
  afterEach(() => jest.clearAllMocks());

  it.each(SCREENS)(
    "$name: full-width with normal padding, no 680 pt cap",
    ({ Component, expectText }) => {
      const json = renderTree(<Component />);
      expect(hasMaxWidth(json)).toBe(false);
      expect(json).toContain('"paddingHorizontal":16');
      expect(json).toContain(expectText);
    },
  );
});
