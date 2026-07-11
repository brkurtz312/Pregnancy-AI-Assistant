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
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

jest.mock("@workspace/api-client-react", () => ({
  useGetProfile: jest.fn(),
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

jest.mock("@/lib/pregnancy-math", () => ({
  calculateByDueDate: jest.fn(),
}));

import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useGetProfile } from "@workspace/api-client-react";

import AskScreen from "../app/(tabs)/ask";

const mockUseAuth = useAuth as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;
const mockUseGetProfile = useGetProfile as jest.Mock;

function renderScreen() {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(AskScreen));
  });
  return renderer;
}

describe("AI tab — sign-in gate", () => {
  beforeEach(() => {
    mockUseGetProfile.mockReturnValue({ data: undefined });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the sign-in prompt when the user is not authenticated", async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false });
    mockUseRouter.mockReturnValue({ push: jest.fn() });

    const renderer = renderScreen();
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Sign in to ask questions");
  });

  it("does not render the AI assistant UI when the user is not authenticated", async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false });
    mockUseRouter.mockReturnValue({ push: jest.fn() });

    const renderer = renderScreen();
    await act(async () => {});

    const root = renderer.root;
    const { AiAssistant } = require("@/components/AiAssistant");

    const aiNodes = root.findAllByType(AiAssistant);
    expect(aiNodes).toHaveLength(0);
  });

  it("calls router.push('/(auth)/sign-in') when the Sign In button is pressed", async () => {
    const push = jest.fn();
    mockUseAuth.mockReturnValue({ isSignedIn: false });
    mockUseRouter.mockReturnValue({ push });

    const renderer = renderScreen();
    await act(async () => {});

    const root = renderer.root;

    const signInTextNode = root
      .findAllByType(Text)
      .find((t) => t.props.children === "Sign In");
    expect(signInTextNode).toBeDefined();

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

  it("does not render the sign-in prompt when the user is authenticated", async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: true });
    mockUseRouter.mockReturnValue({ push: jest.fn() });

    const renderer = renderScreen();
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Sign in to ask questions");
  });

  it("renders the AI assistant when the user is authenticated", async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: true });
    mockUseRouter.mockReturnValue({ push: jest.fn() });

    const renderer = renderScreen();
    await act(async () => {});

    const root = renderer.root;
    const { AiAssistant } = require("@/components/AiAssistant");

    const aiNodes = root.findAllByType(AiAssistant);
    expect(aiNodes).toHaveLength(1);
  });
});
