/**
 * LearnScreen — search query reset tests (component-level).
 *
 * Verifies that `handleResultPress` in app/(tabs)/learn.tsx:
 *   1. Calls `router.push` with the expected route
 *   2. Clears the query (setQuery("")) so the search results disappear
 *   3. Restores the default browse view (ResourceCard grid)
 *
 * Coverage: all three section types — VideoVault, SupportPerson, HealthyPregnancy.
 *
 * Also verifies that component remount (navigate-away-and-back) starts with an
 * empty query and the default browse view, not leftover filtered results.
 *
 * Test strategy
 * ─────────────
 * • Render the actual LearnScreen component via react-test-renderer.
 * • Simulate typing via TextInput.onChangeText → triggers query state update.
 * • Assert search-mode UI: JSON tree contains "results for" text.
 * • Find a result-card TouchableOpacity and call onPress() → handleResultPress.
 * • Assert browse-mode UI restored: JSON tree contains "Fetal & Maternal
 *   Development" (ResourceCard title, only visible in browse view).
 * • Assert router.push was called with the expected route.
 *
 * Identifying result cards
 * ────────────────────────
 * In search mode the rendered TouchableOpacity elements are:
 *   (a) X clear button  — has `hitSlop` prop, no `activeOpacity`
 *   (b) result cards    — have `activeOpacity={0.8}`, no `hitSlop`
 * ResourceCards (browse mode) are not rendered while trimmed is non-empty,
 * so all activeOpacity=0.8 / no-hitSlop touchables are result cards.
 */

import React from "react";
import { TextInput, TouchableOpacity } from "react-native";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import {
  flushAsync,
  useFakeTimersWithScheduler,
} from "../test-helpers/testUtils";

jest.setTimeout(15000);

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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

import { router } from "expo-router";
import { VIDEO_VAULT_TOPICS } from "@/lib/video-vault";
import { SUPPORT_PERSON_VOLUMES } from "@/lib/support-person-survival";
import { HEALTHY_PREGNANCY_TOPICS } from "@/lib/healthy-pregnancy-topics";
import LearnScreen from "../app/(tabs)/learn";

const mockPush = router.push as jest.Mock;

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderScreen(): ReturnType<typeof create> {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(LearnScreen));
  });
  return renderer;
}

async function typeQuery(
  renderer: ReturnType<typeof create>,
  query: string,
): Promise<void> {
  const input = renderer.root.findByType(TextInput);
  await act(async () => {
    input.props.onChangeText(query);
  });
  await flushAsync(3);
}

/** Find result-card TouchableOpacity elements (activeOpacity=0.8, no hitSlop). */
function findResultCards(
  renderer: ReturnType<typeof create>,
): ReactTestInstance[] {
  return renderer.root
    .findAllByType(TouchableOpacity)
    .filter((t) => t.props.activeOpacity === 0.8 && t.props.hitSlop == null);
}

// Text present only in browse view (ResourceCard title, only rendered when query is empty)
const BROWSE_MARKER = "Fetal & Maternal Development";

/** Returns the current value of the search TextInput. */
function getInputValue(renderer: ReturnType<typeof create>): string {
  return renderer.root.findByType(TextInput).props.value as string;
}

// ─── Initial state ────────────────────────────────────────────────────────────

describe("LearnScreen — initial state", () => {
  useFakeTimersWithScheduler();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the browse view (no search results) on first mount", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    expect(getInputValue(renderer)).toBe("");
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain(BROWSE_MARKER);
  });

  it("typing a query switches away from the browse view", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    const topic = VIDEO_VAULT_TOPICS[0];
    await typeQuery(renderer, topic.title);

    // Query is now set — browse view (ResourceCard grid) is hidden
    expect(getInputValue(renderer)).toBe(topic.title);
    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain(BROWSE_MARKER);
  });
});

// ─── VideoVault: handleResultPress resets search state ───────────────────────

describe("LearnScreen — VideoVault result press clears query and restores browse view", () => {
  useFakeTimersWithScheduler();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("pressing a VideoVault result calls router.push with /video-vault?topic=<id>", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    const topic = VIDEO_VAULT_TOPICS[0];
    await typeQuery(renderer, topic.title);

    const resultCards = findResultCards(renderer);
    expect(resultCards.length).toBeGreaterThan(0);

    await act(async () => {
      resultCards[0].props.onPress();
    });
    await flushAsync(3);

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("/video-vault?topic="),
    );
  });

  it("pressing a VideoVault result clears the query (search results disappear)", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    const topic = VIDEO_VAULT_TOPICS[0];
    await typeQuery(renderer, topic.title);

    const resultCards = findResultCards(renderer);
    expect(resultCards.length).toBeGreaterThan(0);

    // Confirm we are in search mode before pressing: query is non-empty, browse view hidden
    expect(getInputValue(renderer)).toBe(topic.title);
    expect(JSON.stringify(renderer.toJSON())).not.toContain(BROWSE_MARKER);

    await act(async () => {
      resultCards[0].props.onPress();
    });
    await flushAsync(3);

    // After press: query cleared
    expect(getInputValue(renderer)).toBe("");
  });

  it("pressing a VideoVault result restores the default browse view", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    const topic = VIDEO_VAULT_TOPICS[0];
    await typeQuery(renderer, topic.title);

    const resultCards = findResultCards(renderer);
    await act(async () => {
      resultCards[0].props.onPress();
    });
    await flushAsync(3);

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain(BROWSE_MARKER);
  });
});

// ─── SupportPerson: handleResultPress resets search state ────────────────────

describe("LearnScreen — SupportPerson result press clears query and restores browse view", () => {
  useFakeTimersWithScheduler();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("pressing a SupportPerson result calls router.push with /support-person-vol<N>", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    const vol = SUPPORT_PERSON_VOLUMES[0];
    await typeQuery(renderer, vol.handoutTitle);

    const resultCards = findResultCards(renderer);
    expect(resultCards.length).toBeGreaterThan(0);

    await act(async () => {
      resultCards[0].props.onPress();
    });
    await flushAsync(3);

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("/support-person-vol"),
    );
  });

  it("pressing a SupportPerson result clears the query (search results disappear)", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    const vol = SUPPORT_PERSON_VOLUMES[0];
    await typeQuery(renderer, vol.handoutTitle);

    const resultCards = findResultCards(renderer);
    expect(resultCards.length).toBeGreaterThan(0);

    // Confirm search mode: query non-empty, browse view hidden
    expect(getInputValue(renderer)).toBe(vol.handoutTitle);
    expect(JSON.stringify(renderer.toJSON())).not.toContain(BROWSE_MARKER);

    await act(async () => {
      resultCards[0].props.onPress();
    });
    await flushAsync(3);

    // After press: query cleared
    expect(getInputValue(renderer)).toBe("");
  });

  it("pressing a SupportPerson result restores the default browse view", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    const vol = SUPPORT_PERSON_VOLUMES[0];
    await typeQuery(renderer, vol.handoutTitle);

    const resultCards = findResultCards(renderer);
    await act(async () => {
      resultCards[0].props.onPress();
    });
    await flushAsync(3);

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain(BROWSE_MARKER);
  });
});

// ─── HealthyPregnancy: handleResultPress resets search state ─────────────────

describe("LearnScreen — HealthyPregnancy result press clears query and restores browse view", () => {
  useFakeTimersWithScheduler();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("pressing a HealthyPregnancy result calls router.push with /hp-*", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    const topic = HEALTHY_PREGNANCY_TOPICS[0];
    await typeQuery(renderer, topic.title);

    const resultCards = findResultCards(renderer);
    expect(resultCards.length).toBeGreaterThan(0);

    await act(async () => {
      resultCards[0].props.onPress();
    });
    await flushAsync(3);

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("/hp-"));
  });

  it("pressing a HealthyPregnancy result clears the query (search results disappear)", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    const topic = HEALTHY_PREGNANCY_TOPICS[0];
    await typeQuery(renderer, topic.title);

    const resultCards = findResultCards(renderer);
    expect(resultCards.length).toBeGreaterThan(0);

    // Confirm search mode: query non-empty, browse view hidden
    expect(getInputValue(renderer)).toBe(topic.title);
    expect(JSON.stringify(renderer.toJSON())).not.toContain(BROWSE_MARKER);

    await act(async () => {
      resultCards[0].props.onPress();
    });
    await flushAsync(3);

    // After press: query cleared
    expect(getInputValue(renderer)).toBe("");
  });

  it("pressing a HealthyPregnancy result restores the default browse view", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    const topic = HEALTHY_PREGNANCY_TOPICS[0];
    await typeQuery(renderer, topic.title);

    const resultCards = findResultCards(renderer);
    await act(async () => {
      resultCards[0].props.onPress();
    });
    await flushAsync(3);

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain(BROWSE_MARKER);
  });
});

// ─── Navigate-away-and-back: remount resets state ────────────────────────────

describe("LearnScreen — remount (navigate away and back) resets query", () => {
  useFakeTimersWithScheduler();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("a fresh mount always starts with the browse view, not lingering search results", async () => {
    // First mount: type a query so the screen is in search mode
    const firstMount = renderScreen();
    await flushAsync(3);

    const topic = VIDEO_VAULT_TOPICS[0];
    await typeQuery(firstMount, topic.title);
    // Confirm search mode: query is set, browse view hidden
    expect(getInputValue(firstMount)).toBe(topic.title);
    expect(JSON.stringify(firstMount.toJSON())).not.toContain(BROWSE_MARKER);

    // Unmount (navigate away)
    act(() => {
      firstMount.unmount();
    });

    // Second mount (navigate back): component re-initialises useState("") → browse view
    const secondMount = renderScreen();
    await flushAsync(3);

    expect(getInputValue(secondMount)).toBe("");
    expect(JSON.stringify(secondMount.toJSON())).toContain(BROWSE_MARKER);
  });

  it("remount after a SupportPerson search also starts with the browse view", async () => {
    const vol = SUPPORT_PERSON_VOLUMES[0];

    const firstMount = renderScreen();
    await flushAsync(3);
    await typeQuery(firstMount, vol.handoutTitle);
    expect(getInputValue(firstMount)).toBe(vol.handoutTitle);
    expect(JSON.stringify(firstMount.toJSON())).not.toContain(BROWSE_MARKER);

    act(() => {
      firstMount.unmount();
    });

    const secondMount = renderScreen();
    await flushAsync(3);

    expect(getInputValue(secondMount)).toBe("");
    expect(JSON.stringify(secondMount.toJSON())).toContain(BROWSE_MARKER);
  });

  it("remount after a HealthyPregnancy search also starts with the browse view", async () => {
    const topic = HEALTHY_PREGNANCY_TOPICS[0];

    const firstMount = renderScreen();
    await flushAsync(3);
    await typeQuery(firstMount, topic.title);
    expect(getInputValue(firstMount)).toBe(topic.title);
    expect(JSON.stringify(firstMount.toJSON())).not.toContain(BROWSE_MARKER);

    act(() => {
      firstMount.unmount();
    });

    const secondMount = renderScreen();
    await flushAsync(3);

    expect(getInputValue(secondMount)).toBe("");
    expect(JSON.stringify(secondMount.toJSON())).toContain(BROWSE_MARKER);
  });
});
