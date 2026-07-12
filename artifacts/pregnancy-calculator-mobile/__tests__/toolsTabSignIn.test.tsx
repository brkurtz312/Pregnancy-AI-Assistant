import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { act, create, type ReactTestInstance } from "react-test-renderer";

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

jest.mock("@clerk/expo", () => ({
  useUser: jest.fn(),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useRouter: jest.fn(),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium", Heavy: "Heavy" },
  NotificationFeedbackType: { Success: "Success" },
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

jest.mock("@workspace/api-client-react", () => ({
  useListSymptoms: jest.fn(() => ({ data: undefined, isLoading: false, refetch: jest.fn() })),
  useCreateSymptom: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false })),
  useDeleteSymptom: jest.fn(() => ({ mutateAsync: jest.fn() })),
  useListKickSessions: jest.fn(() => ({ data: undefined, isLoading: false, refetch: jest.fn() })),
  useCreateKickSession: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false })),
  useUpdateKickSession: jest.fn(() => ({ mutateAsync: jest.fn() })),
  useDeleteKickSession: jest.fn(() => ({ mutateAsync: jest.fn() })),
  useListContractions: jest.fn(() => ({ data: undefined, isLoading: false, refetch: jest.fn() })),
  useCreateContraction: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false })),
  useDeleteContraction: jest.fn(() => ({ mutateAsync: jest.fn() })),
}));

jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#fff",
    card: "#fff",
    border: "#eee",
    primary: "#ff69b4",
    primaryForeground: "#fff",
    foreground: "#000",
    mutedForeground: "#666",
    muted: "#f5f5f5",
    accent: "#f0f0f0",
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/lib/haptics", () => ({
  impact: jest.fn(),
  notification: jest.fn(),
}));

import { useUser } from "@clerk/expo";
import { useRouter } from "expo-router";

import ToolsScreen from "../app/(tabs)/tools";

const mockUseUser = useUser as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;

function renderScreen() {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(ToolsScreen));
  });
  return renderer;
}

describe("Tools tab — sign-in gate", () => {
  beforeEach(() => {
    mockUseRouter.mockReturnValue({ push: jest.fn() });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the sign-in prompt when the user is not authenticated", async () => {
    mockUseUser.mockReturnValue({ isSignedIn: false });

    const renderer = renderScreen();
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Sign in to use Tools");
  });

  it("does not render the tools UI when the user is not authenticated", async () => {
    mockUseUser.mockReturnValue({ isSignedIn: false });

    const renderer = renderScreen();
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Pregnancy Tools");
  });

  it("calls router.push('/(auth)/sign-in') when the Sign In button is pressed", async () => {
    const push = jest.fn();
    mockUseUser.mockReturnValue({ isSignedIn: false });
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
    mockUseUser.mockReturnValue({ isSignedIn: true });

    const renderer = renderScreen();
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Sign in to use Tools");
  });

  it("renders the tools UI when the user is authenticated", async () => {
    mockUseUser.mockReturnValue({ isSignedIn: true });

    const renderer = renderScreen();
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Pregnancy Tools");
  });
});
