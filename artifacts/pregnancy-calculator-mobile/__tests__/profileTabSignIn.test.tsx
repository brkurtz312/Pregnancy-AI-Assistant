import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { act, create, type ReactTestInstance } from "react-test-renderer";

jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(),
}));

jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

jest.mock("@workspace/api-client-react", () => ({
  useGetProfile: jest.fn(() => ({ data: undefined, isLoading: false })),
  useUpdateProfile: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
  useListContacts: jest.fn(() => ({ data: undefined })),
  useCreateContact: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
  useUpdateContact: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
  useDeleteContact: jest.fn(() => ({ mutateAsync: jest.fn() })),
  getGetProfileQueryKey: jest.fn(() => ["profile"]),
  getListContactsQueryKey: jest.fn(() => ["contacts"]),
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

jest.mock("@/hooks/usePass", () => ({
  usePass: () => ({
    hasPass: false,
    redeemCode: jest.fn(),
    isRedeeming: false,
  }),
}));

jest.mock("@/lib/phone", () => ({
  formatPhone: (v: string) => v,
}));

jest.mock("@/contexts/SettingsContext", () => ({
  useSettings: () => ({
    themeAuto: true,
    themeMode: "light",
    setThemeAuto: jest.fn(),
    setThemeMode: jest.fn(),
  }),
}));

jest.mock("@/lib/pregnancy-math", () => ({
  formatDate: jest.fn(() => "Jan 1, 2025"),
  getGestationalAgeAtDate: jest.fn(() => ({ weeks: 20, days: 3 })),
}));

jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));

import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";

import ProfileScreen from "../app/(tabs)/profile";

const mockUseAuth = useAuth as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;

function renderScreen() {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(ProfileScreen));
  });
  return renderer;
}

describe("Profile tab — sign-in gate", () => {
  beforeEach(() => {
    mockUseRouter.mockReturnValue({ push: jest.fn() });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the sign-in prompt when the user is not authenticated", async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false });

    const renderer = renderScreen();
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Sign in to view your info");
  });

  it("does not render the profile form when the user is not authenticated", async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false });

    const renderer = renderScreen();
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("My Calling List");
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

    const renderer = renderScreen();
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("Sign in to view your info");
  });

  it("renders the profile form when the user is authenticated", async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: true });

    const renderer = renderScreen();
    await act(async () => {});

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("My Calling List");
  });
});
