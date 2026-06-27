import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { act, create, type ReactTestInstance } from "react-test-renderer";

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(),
}));

jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "Light" },
  NotificationFeedbackType: { Success: "Success", Warning: "Warning" },
}));

jest.mock("@workspace/api-client-react", () => ({
  useGetProfile: jest.fn(),
  useUpdateProfile: jest.fn(),
  getGetProfileQueryKey: jest.fn(() => ["profile"]),
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
    accent: "#f0f0f0",
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/components/AccountButton", () => ({
  AccountButton: () => null,
}));

jest.mock("@/components/AiAssistant", () => ({
  AiAssistant: () => null,
}));

jest.mock("@/lib/fetal-development", () => ({
  getWeeklyDevelopment: jest.fn(() => ({
    week: 10,
    size: "prune",
    sizeComparison: "a prune",
    development: ["growing"],
    motherChanges: ["tired"],
    comingUp: "more growth",
  })),
}));

jest.mock("@/lib/fetal-images", () => ({
  getFetalImage: jest.fn(() => 1),
}));

jest.mock("@/lib/pregnancy-math", () => ({
  calculateByDueDate: jest.fn(),
  calculateByLMP: jest.fn(),
  calculateByConceptionDate: jest.fn(),
  calculateByUltrasound: jest.fn(),
  formatDate: jest.fn(() => "Jan 1, 2025"),
  formatGestationalAge: jest.fn(() => "10 weeks 0 days"),
  getMilestones: jest.fn(() => ({
    endFirstTrimester: new Date("2025-03-01"),
    endSecondTrimester: new Date("2025-06-01"),
  })),
}));

jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");

import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useGetProfile, useUpdateProfile } from "@workspace/api-client-react";

import CalculatorScreen from "../app/(tabs)/index";

const mockUseAuth = useAuth as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;
const mockUseGetProfile = useGetProfile as jest.Mock;
const mockUseUpdateProfile = useUpdateProfile as jest.Mock;

function renderScreen() {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(CalculatorScreen));
  });
  return renderer;
}

describe("Home tab — sign-in gate", () => {
  beforeEach(() => {
    mockUseGetProfile.mockReturnValue({ data: undefined });
    mockUseUpdateProfile.mockReturnValue({ mutate: jest.fn() });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the sign-in prompt card when the user is not authenticated", async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false });
    mockUseRouter.mockReturnValue({ push: jest.fn() });

    const renderer = renderScreen();
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Sign in to get started");
  });

  it("does not render the calculator UI when the user is not authenticated", async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false });
    mockUseRouter.mockReturnValue({ push: jest.fn() });

    const renderer = renderScreen();
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("CALCULATE BY");
  });

  it("calls router.push('/(auth)/sign-in') when the Sign In button is pressed", async () => {
    const push = jest.fn();
    mockUseAuth.mockReturnValue({ isSignedIn: false });
    mockUseRouter.mockReturnValue({ push });

    const renderer = renderScreen();
    await act(async () => {});

    const root = renderer.root;

    // Find the Text node with "Sign In" content
    const signInTextNode = root
      .findAllByType(Text)
      .find((t) => t.props.children === "Sign In");
    expect(signInTextNode).toBeDefined();

    // Walk up to the nearest TouchableOpacity ancestor
    let node: ReactTestInstance | null | undefined = signInTextNode;
    let signInBtn: ReactTestInstance | undefined;
    while (node?.parent) {
      node = node.parent;
      if (node.type === TouchableOpacity) {
        signInBtn = node;
        break;
      }
    }

    expect(signInBtn).toBeDefined();
    await act(async () => {
      signInBtn!.props.onPress();
    });

    expect(push).toHaveBeenCalledWith("/(auth)/sign-in");
  });

  it("does not render the sign-in prompt card when the user is authenticated", async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: true });
    mockUseRouter.mockReturnValue({ push: jest.fn() });

    const renderer = renderScreen();
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Sign in to get started");
  });

  it("renders the calculator UI when the user is authenticated", async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: true });
    mockUseRouter.mockReturnValue({ push: jest.fn() });

    const renderer = renderScreen();
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("CALCULATE BY");
  });
});
