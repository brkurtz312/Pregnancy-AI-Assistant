/**
 * Session History — pull-to-refresh tests
 *
 * Confirms that both KickHistoryTab and ContractionHistoryTab render a
 * RefreshControl connected to the correct refetch function, both when
 * sessions exist and when the list is empty.
 */

import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

jest.mock("@clerk/expo", () => ({
  useUser: jest.fn(() => ({ user: { id: "u1" } })),
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "Light" },
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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
    destructive: "#ef4444",
  }),
}));

const mockKickRefetch = jest.fn();
const mockContractionRefetch = jest.fn();

jest.mock("@workspace/api-client-react", () => ({
  useListKickSessions: jest.fn(() => ({
    data: {
      items: [
        {
          id: 1,
          kickCount: 10,
          startedAt: "2026-08-14T10:00:00Z",
          endedAt: "2026-08-14T10:30:00Z",
          notes: null,
        },
      ],
    },
    isFetching: false,
    refetch: mockKickRefetch,
  })),
  useListContractions: jest.fn(() => ({
    data: {
      items: [
        {
          id: 1,
          sessionDate: "2026-08-14",
          startedAt: "2026-08-14T09:00:00Z",
          durationSeconds: 60,
          intervalSeconds: 300,
        },
      ],
    },
    isFetching: false,
    refetch: mockContractionRefetch,
  })),
  useDeleteKickSession: jest.fn(() => ({ mutateAsync: jest.fn() })),
  useDeleteContractionSession: jest.fn(() => ({ mutateAsync: jest.fn() })),
  useUpdateKickSession: jest.fn(() => ({ mutateAsync: jest.fn() })),
}));

import SessionHistoryScreen from "../app/session-history";

type NodeWithProps<P> = { props: P };

function findByTestID(
  instance: ReturnType<typeof create>,
  testID: string,
): unknown {
  return instance.root.findAll(
    (node) => node.props && node.props.testID === testID,
  )[0];
}

describe("SessionHistoryScreen — pull-to-refresh", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders a RefreshControl on the kick-history FlatList when sessions exist", async () => {
    let instance: ReturnType<typeof create> | undefined;
    await act(async () => {
      instance = create(<SessionHistoryScreen />);
    });

    const rc = findByTestID(instance!, "kick-history-refresh-control");
    expect(rc).toBeDefined();
  });

  it("calls kick refetch when the kick RefreshControl fires onRefresh", async () => {
    let instance: ReturnType<typeof create> | undefined;
    await act(async () => {
      instance = create(<SessionHistoryScreen />);
    });

    const rc = instance!.root.findAll(
      (node) =>
        node.props && node.props.testID === "kick-history-refresh-control",
    )[0] as unknown as NodeWithProps<{ onRefresh: () => void }>;

    expect(rc).toBeDefined();
    await act(async () => {
      rc.props.onRefresh();
    });

    expect(mockKickRefetch).toHaveBeenCalled();
  });

  it("renders a RefreshControl on the kick-history FlatList when history is empty", async () => {
    const { useListKickSessions } = jest.requireMock(
      "@workspace/api-client-react",
    ) as {
      useListKickSessions: jest.Mock;
    };

    useListKickSessions.mockReturnValue({
      data: { items: [] },
      isFetching: false,
      refetch: mockKickRefetch,
    });

    let instance: ReturnType<typeof create> | undefined;
    await act(async () => {
      instance = create(<SessionHistoryScreen />);
    });

    const rc = findByTestID(instance!, "kick-history-refresh-control");
    expect(rc).toBeDefined();
  });

  it("renders a RefreshControl on the contraction-history FlatList when sessions exist", async () => {
    let instance: ReturnType<typeof create> | undefined;
    await act(async () => {
      instance = create(<SessionHistoryScreen />);
    });

    // Switch to the contraction tab
    const tabBtn = instance!.root.findAll(
      (node) => node.props && node.props.testID === "tab-btn-contractions",
    )[0] as unknown as NodeWithProps<{ onPress: () => void }>;

    expect(tabBtn).toBeDefined();
    await act(async () => {
      tabBtn.props.onPress();
    });

    const rc = findByTestID(instance!, "contraction-history-refresh-control");
    expect(rc).toBeDefined();
  });

  it("calls contraction refetch when the contraction RefreshControl fires onRefresh", async () => {
    let instance: ReturnType<typeof create> | undefined;
    await act(async () => {
      instance = create(<SessionHistoryScreen />);
    });

    const tabBtn = instance!.root.findAll(
      (node) => node.props && node.props.testID === "tab-btn-contractions",
    )[0] as unknown as NodeWithProps<{ onPress: () => void }>;

    await act(async () => {
      tabBtn.props.onPress();
    });

    const rc = instance!.root.findAll(
      (node) =>
        node.props &&
        node.props.testID === "contraction-history-refresh-control",
    )[0] as unknown as NodeWithProps<{ onRefresh: () => void }>;

    expect(rc).toBeDefined();
    await act(async () => {
      rc.props.onRefresh();
    });

    expect(mockContractionRefetch).toHaveBeenCalled();
  });

  it("renders a RefreshControl on the contraction-history FlatList when history is empty", async () => {
    const { useListContractions } = jest.requireMock(
      "@workspace/api-client-react",
    ) as {
      useListContractions: jest.Mock;
    };

    useListContractions.mockReturnValue({
      data: { items: [] },
      isFetching: false,
      refetch: mockContractionRefetch,
    });

    let instance: ReturnType<typeof create> | undefined;
    await act(async () => {
      instance = create(<SessionHistoryScreen />);
    });

    const tabBtn = instance!.root.findAll(
      (node) => node.props && node.props.testID === "tab-btn-contractions",
    )[0] as unknown as NodeWithProps<{ onPress: () => void }>;

    await act(async () => {
      tabBtn.props.onPress();
    });

    const rc = findByTestID(instance!, "contraction-history-refresh-control");
    expect(rc).toBeDefined();
  });
});
