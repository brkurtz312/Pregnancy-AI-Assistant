/**
 * Video Vault deep-link — rendered component tests.
 *
 * Verifies the runtime behaviour of VideoVaultScreen when a `topic` URL param
 * is present, covering both first load and the re-navigation case where the
 * screen is already mounted and `useLocalSearchParams` delivers a new value.
 *
 * Test strategy
 * ─────────────
 * • TopicCard renders its video list (topicBody) only when `open === true`.
 * • So a card that received `initialOpen={true}` will include its video titles
 *   in the rendered tree; a closed card will not.
 * • We assert open/closed by checking whether a video title from the target
 *   topic appears in `JSON.stringify(renderer.toJSON())`.
 * • Re-navigation is simulated by updating the `useLocalSearchParams` mock and
 *   calling `renderer.update(<VideoVaultScreen />)` — React reconciles in-place,
 *   preserving existing component state, so the `useEffect([initialOpen])`
 *   added to TopicCard is the only mechanism that can open the new card.
 *
 * Timer handling
 * ──────────────
 * VideoVaultScreen renders a FlatList (source-filter chips). VirtualizedList
 * schedules a setTimeout internally to update cell rendering; when real timers
 * are used that callback fires after the test environment is torn down, which
 * causes Jest to throw "Cannot log after tests are done" and exit 1 even though
 * every assertion passes. useFakeTimersWithScheduler() fakes setTimeout while
 * leaving setImmediate and nextTick intact so React's scheduler keeps working.
 * flushAsync() is used after each render to advance the faked clock by 0 ms
 * (enough for React's internal readiness check) and drain any pending effects.
 */

import React from "react";
import { act, create } from "react-test-renderer";
import {
  flushAsync,
  useFakeTimersWithScheduler,
} from "../test-helpers/testUtils";

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: jest.fn(),
  router: { back: jest.fn() },
}));

jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(),
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
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/components/AskCard", () => ({
  AskCard: () => null,
}));

import { useLocalSearchParams } from "expo-router";
import { VIDEO_VAULT_TOPICS } from "@/lib/video-vault";
import VideoVaultScreen from "../app/video-vault";

const mockParams = useLocalSearchParams as jest.Mock;

function renderScreen() {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(VideoVaultScreen));
  });
  return renderer;
}

const topic0 = VIDEO_VAULT_TOPICS[0];
const topic1 = VIDEO_VAULT_TOPICS[1];
const videoTitle0 = topic0.videos[0].title;
const videoTitle1 = topic1.videos[0].title;

describe("VideoVaultScreen — initialOpen via deepLinkTopicId (first load)", () => {
  useFakeTimersWithScheduler();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("opens the matching topic card when a topic param is provided", async () => {
    mockParams.mockReturnValue({ topic: topic0.id });

    const renderer = renderScreen();
    await flushAsync();

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain(videoTitle0);
  });

  it("does not open other topic cards when a specific topic param is provided", async () => {
    mockParams.mockReturnValue({ topic: topic0.id });

    const renderer = renderScreen();
    await flushAsync();

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain(videoTitle1);
  });

  it("opens topic[1] and keeps topic[0] closed when topic[1] is the target", async () => {
    mockParams.mockReturnValue({ topic: topic1.id });

    const renderer = renderScreen();
    await flushAsync();

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain(videoTitle1);
    expect(json).not.toContain(videoTitle0);
  });

  it("keeps all topic cards closed when no topic param is provided", async () => {
    mockParams.mockReturnValue({});

    const renderer = renderScreen();
    await flushAsync();

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain(videoTitle0);
    expect(json).not.toContain(videoTitle1);
  });

  it("keeps all topic cards closed when the param does not match any topic ID", async () => {
    mockParams.mockReturnValue({ topic: "non-existent-topic-id-99999" });

    const renderer = renderScreen();
    await flushAsync();

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain(videoTitle0);
    expect(json).not.toContain(videoTitle1);
  });

  it("renders all topic titles in the tree regardless of which card is open", async () => {
    mockParams.mockReturnValue({ topic: topic0.id });

    const renderer = renderScreen();
    await flushAsync();

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain(topic0.title);
    expect(json).toContain(topic1.title);
  });
});

describe("VideoVaultScreen — re-navigation while screen is already mounted", () => {
  useFakeTimersWithScheduler();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("opens the new topic when the deep-link param changes from one topic to another", async () => {
    mockParams.mockReturnValue({ topic: topic0.id });
    const renderer = renderScreen();
    await flushAsync();

    const jsonBefore = JSON.stringify(renderer.toJSON());
    expect(jsonBefore).toContain(videoTitle0);
    expect(jsonBefore).not.toContain(videoTitle1);

    mockParams.mockReturnValue({ topic: topic1.id });
    await act(async () => {
      jest.advanceTimersByTime(0);
      renderer.update(React.createElement(VideoVaultScreen));
    });
    await flushAsync();

    const jsonAfter = JSON.stringify(renderer.toJSON());
    expect(jsonAfter).toContain(videoTitle1);
  });

  it("opens the correct topic when navigating from no param to a topic param", async () => {
    mockParams.mockReturnValue({});
    const renderer = renderScreen();
    await flushAsync();

    const jsonBefore = JSON.stringify(renderer.toJSON());
    expect(jsonBefore).not.toContain(videoTitle0);

    mockParams.mockReturnValue({ topic: topic0.id });
    await act(async () => {
      jest.advanceTimersByTime(0);
      renderer.update(React.createElement(VideoVaultScreen));
    });
    await flushAsync();

    const jsonAfter = JSON.stringify(renderer.toJSON());
    expect(jsonAfter).toContain(videoTitle0);
  });

  it("opens the new topic when navigating from one to another then back to the first", async () => {
    mockParams.mockReturnValue({ topic: topic0.id });
    const renderer = renderScreen();
    await flushAsync();

    mockParams.mockReturnValue({ topic: topic1.id });
    await act(async () => {
      jest.advanceTimersByTime(0);
      renderer.update(React.createElement(VideoVaultScreen));
    });
    await flushAsync();

    const jsonMid = JSON.stringify(renderer.toJSON());
    expect(jsonMid).toContain(videoTitle1);

    mockParams.mockReturnValue({ topic: topic0.id });
    await act(async () => {
      jest.advanceTimersByTime(0);
      renderer.update(React.createElement(VideoVaultScreen));
    });
    await flushAsync();

    const jsonFinal = JSON.stringify(renderer.toJSON());
    expect(jsonFinal).toContain(videoTitle0);
  });
});
