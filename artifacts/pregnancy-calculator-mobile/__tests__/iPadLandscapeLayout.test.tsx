/**
 * Task 490 — iPad landscape layout verification
 *
 * Three layers of coverage:
 *  1. TabLayout integration — renders app/(tabs)/_layout.tsx with a mocked
 *     expo-router <Tabs> that captures the props it receives, then asserts
 *     the tablet and phone branches set the correct tabBarPosition and tabBar.
 *  2. IPadSidebar — all six tabs render with correct labels / icons, and
 *     navigation.navigate fires (or is suppressed) correctly.
 *  3. Portrait / phone branch sanity — native bottom bar is wired correctly.
 */

import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";

// ─── capture props passed to <Tabs> by TabLayout ───────────────────────────

const capturedTabsProps: { current: Record<string, unknown> | null } = {
  current: null,
};

jest.mock("expo-router", () => {
  function Tabs(props: Record<string, unknown>) {
    capturedTabsProps.current = props;
    return null;
  }
  Tabs.Screen = () => null;
  return { Tabs };
});

// ─── stable shared deps ────────────────────────────────────────────────────

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
    muted: "#f5f5f5",
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// useIsTablet is controlled per-test; the real IPadSidebar is intentionally
// NOT mocked so we can inspect its rendered output in the sidebar suites.
jest.mock("@/hooks/useIsTablet", () => ({
  useIsTablet: jest.fn(),
}));

// ─── imports (after mocks) ─────────────────────────────────────────────────

import { useIsTablet } from "../hooks/useIsTablet";
import { IPadSidebar } from "../components/IPadSidebar";
import TabLayout from "../app/(tabs)/_layout";

const mockUseIsTablet = useIsTablet as jest.Mock;

// ─── helpers ───────────────────────────────────────────────────────────────

function makeSidebarProps(focusedIndex = 0) {
  return {
    state: {
      routes: [
        { key: "index-key", name: "index" },
        { key: "tools-key", name: "tools" },
        { key: "ask-key", name: "ask" },
        { key: "learn-key", name: "learn" },
        { key: "visit-prep-key", name: "visit-prep" },
        { key: "profile-key", name: "profile" },
      ],
      index: focusedIndex,
    },
    navigateToTab: jest.fn(),
  };
}

/** Finds nav-item pressable nodes regardless of how jest-expo transforms Pressable. */
function findNavPressables(
  renderer: ReturnType<typeof create>,
): ReactTestInstance[] {
  return renderer.root.findAll(
    (node) => typeof node.props.onPress === "function",
  );
}

// ─── 1. TabLayout — tablet branch (useIsTablet = true) ────────────────────

describe("TabLayout — iPad landscape branch (useIsTablet = true)", () => {
  beforeEach(() => {
    capturedTabsProps.current = null;
    mockUseIsTablet.mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("sets tabBarPosition to 'left' so the sidebar sits to the left of the content pane", () => {
    act(() => {
      create(React.createElement(TabLayout));
    });

    expect(capturedTabsProps.current).not.toBeNull();
    const screenOptions = capturedTabsProps.current!.screenOptions as Record<
      string,
      unknown
    >;
    expect(screenOptions.tabBarPosition).toBe("left");
  });

  it("supplies a custom tabBar function (not undefined) for the IPadSidebar", () => {
    act(() => {
      create(React.createElement(TabLayout));
    });

    expect(typeof capturedTabsProps.current!.tabBar).toBe("function");
  });

  it("tabBar function renders IPadSidebar with the navigation props forwarded", () => {
    act(() => {
      create(React.createElement(TabLayout));
    });

    const tabBarFn = capturedTabsProps.current!.tabBar as (
      props: unknown,
    ) => React.ReactElement;
    const navProps = makeSidebarProps();
    const element = tabBarFn(navProps);

    // Must render IPadSidebar specifically — not a generic View or null
    expect(element.type).toBe(IPadSidebar);
    // Navigation state and dispatch must be forwarded to the sidebar
    const props = element.props as { state: unknown; navigateToTab: unknown };
    expect(props.state).toBe(navProps.state);
    expect(props.navigateToTab).toBe(navProps.navigateToTab);
  });

  it("renders all six Tabs.Screen entries — one per tab", () => {
    act(() => {
      create(React.createElement(TabLayout));
    });

    const tabsChildren = React.Children.toArray(
      capturedTabsProps.current!.children as React.ReactNode,
    );
    expect(tabsChildren).toHaveLength(6);
  });
});

// ─── 2. TabLayout — phone / portrait branch (useIsTablet = false) ─────────

describe("TabLayout — phone / portrait branch (useIsTablet = false)", () => {
  beforeEach(() => {
    capturedTabsProps.current = null;
    mockUseIsTablet.mockReturnValue(false);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("sets tabBarPosition to 'bottom' for the native bottom tab bar", () => {
    act(() => {
      create(React.createElement(TabLayout));
    });

    const screenOptions = capturedTabsProps.current!.screenOptions as Record<
      string,
      unknown
    >;
    expect(screenOptions.tabBarPosition).toBe("bottom");
  });

  it("leaves tabBar undefined so the native bottom bar is rendered", () => {
    act(() => {
      create(React.createElement(TabLayout));
    });

    expect(capturedTabsProps.current!.tabBar).toBeUndefined();
  });
});

// ─── 3. IPadSidebar — rendering: all six tabs ─────────────────────────────

describe("IPadSidebar — all six tabs rendered", () => {
  beforeEach(() => {
    mockUseIsTablet.mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function renderSidebar(focusedIndex = 0) {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        React.createElement(IPadSidebar, makeSidebarProps(focusedIndex)),
      );
    });
    return renderer;
  }

  it("renders all six tab labels", () => {
    const json = JSON.stringify(renderSidebar().toJSON());
    expect(json).toContain("Home");
    expect(json).toContain("Tools");
    expect(json).toContain("Ask");
    expect(json).toContain("Learn");
    expect(json).toContain("Get Ready");
    expect(json).toContain("My Info");
  });

  it("renders the app brand header", () => {
    expect(JSON.stringify(renderSidebar().toJSON())).toContain("Pregnancy AI");
  });

  it("renders exactly six pressable nav items", () => {
    expect(findNavPressables(renderSidebar())).toHaveLength(6);
  });

  it("applies the filled icon to the focused Home tab (index 0)", () => {
    expect(JSON.stringify(renderSidebar(0).toJSON())).toContain('"home"');
  });

  it("applies the filled icon to the focused Tools tab (index 1)", () => {
    expect(JSON.stringify(renderSidebar(1).toJSON())).toContain('"heart"');
  });

  it("applies the filled icon to the focused Ask tab (index 2)", () => {
    expect(JSON.stringify(renderSidebar(2).toJSON())).toContain(
      '"chatbubble-ellipses"',
    );
  });

  it("applies the filled icon to the focused Learn tab (index 3)", () => {
    expect(JSON.stringify(renderSidebar(3).toJSON())).toContain('"book"');
  });

  it("applies the filled icon to the focused Get Ready tab (index 4)", () => {
    expect(JSON.stringify(renderSidebar(4).toJSON())).toContain(
      '"checkmark-done"',
    );
  });

  it("applies the filled icon to the focused My Info tab (index 5)", () => {
    expect(JSON.stringify(renderSidebar(5).toJSON())).toContain('"person"');
  });

  it("sidebar has a fixed 220 pt width — not percentage-based", () => {
    expect(JSON.stringify(renderSidebar().toJSON())).toContain('"width":220');
  });

  it("sidebar has a right border separating it from the content pane", () => {
    expect(JSON.stringify(renderSidebar().toJSON())).toContain(
      '"borderRightWidth":1',
    );
  });
});

// ─── 4. IPadSidebar — navigation behaviour ────────────────────────────────

describe("IPadSidebar — navigation behaviour", () => {
  beforeEach(() => {
    mockUseIsTablet.mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("calls navigateToTab with the correct route key for non-focused tabs", () => {
    const navigate = jest.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        React.createElement(IPadSidebar, {
          ...makeSidebarProps(0),
          navigateToTab: navigate,
        }),
      );
    });

    const pressables = findNavPressables(renderer);

    act(() => {
      pressables[1].props.onPress(); // Tools
    });
    expect(navigate).toHaveBeenCalledWith("tools-key");

    act(() => {
      pressables[3].props.onPress(); // Learn
    });
    expect(navigate).toHaveBeenCalledWith("learn-key");

    act(() => {
      pressables[5].props.onPress(); // My Info
    });
    expect(navigate).toHaveBeenCalledWith("profile-key");
  });

  it("does not call navigate when the already-focused tab is pressed", () => {
    const navigate = jest.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        React.createElement(IPadSidebar, {
          ...makeSidebarProps(0),
          navigateToTab: navigate,
        }),
      );
    });

    act(() => {
      findNavPressables(renderer)[0].props.onPress(); // Home (already focused)
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates to all six routes without error when none is focused", () => {
    const navigate = jest.fn();
    const routes = [
      { key: "k0", name: "index" },
      { key: "k1", name: "tools" },
      { key: "k2", name: "ask" },
      { key: "k3", name: "learn" },
      { key: "k4", name: "visit-prep" },
      { key: "k5", name: "profile" },
    ];
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        React.createElement(IPadSidebar, {
          state: { routes, index: 99 },
          navigateToTab: navigate,
        }),
      );
    });

    const pressables = findNavPressables(renderer);
    expect(pressables).toHaveLength(6);
    pressables.forEach((p, i) => {
      act(() => {
        p.props.onPress();
      });
      expect(navigate).toHaveBeenNthCalledWith(i + 1, routes[i].key);
    });
  });
});
