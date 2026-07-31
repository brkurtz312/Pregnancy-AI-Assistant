/**
 * Learn tab search — paid-pass integration tests.
 *
 * Exercises the full search flow inside a rendered LearnScreen session where:
 *   • the user is signed in (mocked via @clerk/expo useAuth)
 *   • the user holds an active reviewer pass (mocked via @/hooks/usePass)
 *
 * Why: the unit tests in learnDeepLinks.test.ts verify the content data in
 * isolation. This file verifies that the search UI itself works correctly
 * under a paid-user session — so if gating logic or a session-scoped filter
 * were ever added to the Learn tab, CI would catch any regression immediately.
 *
 * Covers:
 *   1. Search bar is visible when the component mounts.
 *   2. Typing a Video Vault keyword returns Video Vault result cards.
 *   3. Typing a Support Person keyword returns Support Person result cards.
 *   4. Typing a Healthy Pregnancy keyword returns Healthy Pregnancy result cards.
 *   5. Each result card exposes an onPress handler (is tappable).
 *   6. Tapping a result card calls router.push with a non-empty route.
 *   7. Clearing the search input restores the browse view.
 *
 * Test strategy
 * ─────────────
 * • Render the real LearnScreen component via react-test-renderer.
 * • Simulate auth state by mocking @clerk/expo and @/hooks/usePass.
 * • Simulate typing via TextInput.onChangeText.
 * • Assert result cards appear for the queried section and are pressable.
 */

import React from "react";
import { TextInput, TouchableOpacity } from "react-native";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { flushAsync } from "../test-helpers/testUtils";

jest.setTimeout(15000);

// ── Standard screen mocks ─────────────────────────────────────────────────────

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

// ── Paid-user auth mocks ──────────────────────────────────────────────────────
//
// LearnScreen does not currently read auth or pass state, so these mocks
// establish the "paid user session" context. If gating logic is ever added to
// the Learn tab search, these mocks ensure the tests continue to exercise the
// paid-user path correctly rather than falling into a signed-out or unpaid
// branch.

jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(),
}));

jest.mock("@/hooks/usePass", () => ({
  usePass: jest.fn(),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { router } from "expo-router";
import { useAuth } from "@clerk/expo";
import { usePass } from "@/hooks/usePass";
import { VIDEO_VAULT_TOPICS } from "@/lib/video-vault";
import { SUPPORT_PERSON_VOLUMES } from "@/lib/support-person-survival";
import { HEALTHY_PREGNANCY_TOPICS } from "@/lib/healthy-pregnancy-topics";
import LearnScreen from "../app/(tabs)/learn";

const mockUseAuth = useAuth as jest.Mock;
const mockUsePass = usePass as jest.Mock;
const mockPush = router.push as jest.Mock;

// ── Shared paid-user state ────────────────────────────────────────────────────

function setupPaidUser() {
  mockUseAuth.mockReturnValue({
    isSignedIn: true,
    userId: "user_paid_test_001",
  });
  mockUsePass.mockReturnValue({
    hasPass: true,
    isLoading: false,
    isError: false,
  });
}

// ── Render helper ─────────────────────────────────────────────────────────────

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

/**
 * Find result-card TouchableOpacity elements.
 * In search mode the tree contains:
 *   (a) X clear button  — has `hitSlop` prop, no `activeOpacity`
 *   (b) result cards    — have `activeOpacity={0.8}`, no `hitSlop`
 * ResourceCards (browse mode) are not rendered while a query is active.
 */
function findResultCards(
  renderer: ReturnType<typeof create>,
): ReactTestInstance[] {
  return renderer.root
    .findAllByType(TouchableOpacity)
    .filter((t) => t.props.activeOpacity === 0.8 && t.props.hitSlop == null);
}

// ── 1. Search bar visibility ──────────────────────────────────────────────────

describe("Learn tab — search bar (paid user)", () => {
  beforeEach(() => {
    setupPaidUser();
    mockPush.mockClear();
  });

  it("renders a TextInput search bar on mount", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    const inputs = renderer.root.findAllByType(TextInput);
    expect(inputs.length).toBeGreaterThan(0);

    // The search input has the expected placeholder text.
    const searchInput = inputs.find((i) =>
      (i.props.placeholder as string)?.includes("Search"),
    );
    expect(searchInput).toBeDefined();
    expect(searchInput!.props.value).toBe("");
  });
});

// ── 2. Video Vault section search ─────────────────────────────────────────────

describe("Learn tab — Video Vault search (paid user)", () => {
  beforeEach(() => {
    setupPaidUser();
    mockPush.mockClear();
  });

  it("returns at least one Video Vault result card for a known topic keyword", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    // "fetal" matches the first Video Vault topic title "Fetal Development Month by Month"
    await typeQuery(renderer, "fetal");

    const cards = findResultCards(renderer);
    expect(cards.length).toBeGreaterThan(0);

    // At least one card should label a video vault topic.
    const tree = JSON.stringify(renderer.toJSON());
    expect(tree).toContain("VIDEO VAULT");
  });

  it("every Video Vault result card has an onPress handler", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    // Pick the first Video Vault topic title as the keyword for a precise hit.
    const firstTopic = VIDEO_VAULT_TOPICS[0];
    await typeQuery(renderer, firstTopic.title.toLowerCase().slice(0, 6));

    const cards = findResultCards(renderer);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(typeof card.props.onPress).toBe("function");
    }
  });

  it("tapping a Video Vault result card calls router.push with a non-empty route", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    await typeQuery(renderer, "fetal");
    const cards = findResultCards(renderer);
    expect(cards.length).toBeGreaterThan(0);

    await act(async () => {
      cards[0].props.onPress();
    });
    await flushAsync(3);

    expect(mockPush).toHaveBeenCalledTimes(1);
    const calledWith = String((mockPush.mock.calls[0] as [unknown])[0]);
    expect(calledWith.length).toBeGreaterThan(0);
    expect(calledWith).toContain("/video-vault");
  });
});

// ── 3. Support Person section search ─────────────────────────────────────────

describe("Learn tab — Support Person search (paid user)", () => {
  beforeEach(() => {
    setupPaidUser();
    mockPush.mockClear();
  });

  it("returns at least one Support Person result card for a known keyword", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    // SUPPORT_PERSON_VOLUMES[0].handoutTitle = "We Can Do This."
    const vol1 = SUPPORT_PERSON_VOLUMES.find((v) => v.volumeNumber === 1)!;
    // Use a distinctive substring from the handout title.
    const keyword = vol1.handoutTitle.toLowerCase().slice(0, 5); // "we ca"
    await typeQuery(renderer, keyword);

    const cards = findResultCards(renderer);
    expect(cards.length).toBeGreaterThan(0);

    const tree = JSON.stringify(renderer.toJSON());
    expect(tree).toContain("SUPPORT PERSON");
  });

  it("every Support Person result card has an onPress handler", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    const vol = SUPPORT_PERSON_VOLUMES[0];
    await typeQuery(renderer, vol.handoutTitle.toLowerCase().slice(0, 5));

    const cards = findResultCards(renderer);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(typeof card.props.onPress).toBe("function");
    }
  });

  it("tapping a Support Person result card calls router.push with a non-empty route", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    const vol = SUPPORT_PERSON_VOLUMES[0];
    await typeQuery(renderer, vol.handoutTitle.toLowerCase().slice(0, 5));

    const cards = findResultCards(renderer);
    expect(cards.length).toBeGreaterThan(0);

    await act(async () => {
      cards[0].props.onPress();
    });
    await flushAsync(3);

    expect(mockPush).toHaveBeenCalledTimes(1);
    const calledWith = String((mockPush.mock.calls[0] as [unknown])[0]);
    expect(calledWith.length).toBeGreaterThan(0);
    expect(calledWith).toContain("support-person");
  });
});

// ── 4. Healthy Pregnancy section search ───────────────────────────────────────

describe("Learn tab — Healthy Pregnancy search (paid user)", () => {
  beforeEach(() => {
    setupPaidUser();
    mockPush.mockClear();
  });

  it("returns at least one Healthy Pregnancy result card for a known keyword", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    // HEALTHY_PREGNANCY_TOPICS[2].title = "Nutrition & Weight Gain"
    const nutritionTopic = HEALTHY_PREGNANCY_TOPICS.find((t) =>
      t.title.toLowerCase().includes("nutrition"),
    )!;
    expect(nutritionTopic).toBeDefined();

    await typeQuery(renderer, "nutrition");

    const cards = findResultCards(renderer);
    expect(cards.length).toBeGreaterThan(0);

    const tree = JSON.stringify(renderer.toJSON());
    expect(tree).toContain("HEALTHY PREGNANCY");
  });

  it("every Healthy Pregnancy result card has an onPress handler", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    await typeQuery(renderer, "nutrition");

    const cards = findResultCards(renderer);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(typeof card.props.onPress).toBe("function");
    }
  });

  it("tapping a Healthy Pregnancy result card calls router.push with a non-empty route", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    await typeQuery(renderer, "nutrition");

    const cards = findResultCards(renderer);
    expect(cards.length).toBeGreaterThan(0);

    await act(async () => {
      cards[0].props.onPress();
    });
    await flushAsync(3);

    expect(mockPush).toHaveBeenCalledTimes(1);
    const calledWith = String((mockPush.mock.calls[0] as [unknown])[0]);
    expect(calledWith.length).toBeGreaterThan(0);
    expect(calledWith).toContain("/hp-");
  });
});

// ── 5. All-three-section coverage with a broad keyword ────────────────────────

describe("Learn tab — cross-section search (paid user)", () => {
  beforeEach(() => {
    setupPaidUser();
    mockPush.mockClear();
  });

  it("a broad search returns results in all three sections", async () => {
    // "pregnancy" appears in content across all three data sources.
    const renderer = renderScreen();
    await flushAsync(3);

    await typeQuery(renderer, "pregnancy");

    const tree = JSON.stringify(renderer.toJSON());

    // All three section headers must be present in the grouped results.
    expect(tree).toContain("VIDEO VAULT");
    expect(tree).toContain("SUPPORT PERSON");
    expect(tree).toContain("HEALTHY PREGNANCY");
  });

  it("result count text is rendered and reflects a positive number", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    await typeQuery(renderer, "pregnancy");

    const tree = JSON.stringify(renderer.toJSON());
    // The result-count line reads: `N result(s) for "..."`.
    expect(tree).toMatch(/result.+for/);
  });
});

// ── 7. Force-quit mid-query: remount resets to empty state ───────────────────
//
// Simulates the user force-quitting the app while a search query is active,
// then relaunching it.  In React Native this corresponds to the component
// being fully unmounted (process terminated) and then remounted from scratch.
//
// Because LearnScreen stores its query in plain React state (useState("")) and
// does not persist it to AsyncStorage or navigation params, the remounted
// screen must always initialise with an empty query and the browse view —
// regardless of what query was active before the unmount.
//
// Covers all three section types so that if any future change adds persistence
// for a specific section, CI will catch it immediately.

describe("Learn tab — force-quit mid-query (VideoVault, paid user)", () => {
  beforeEach(() => {
    setupPaidUser();
    mockPush.mockClear();
  });

  it("remounts with empty query and browse view after force-quit mid Video Vault query", async () => {
    // --- first mount: get into search mode ---
    const first = renderScreen();
    await flushAsync(3);

    await typeQuery(first, "fetal");
    expect(JSON.stringify(first.toJSON())).toContain("VIDEO VAULT");

    // Simulate force-quit: unmount the component.
    act(() => {
      first.unmount();
    });

    // --- second mount: fresh app launch ---
    const second = renderScreen();
    await flushAsync(3);

    const tree = JSON.stringify(second.toJSON());

    // Browse-view cards are rendered; no search results.
    expect(tree).toContain("Fetal & Maternal Development");
    expect(tree).not.toContain("VIDEO VAULT");

    // Search input is empty.
    const input = second.root.findByType(TextInput);
    expect(input.props.value).toBe("");
  });
});

describe("Learn tab — force-quit mid-query (SupportPerson, paid user)", () => {
  beforeEach(() => {
    setupPaidUser();
    mockPush.mockClear();
  });

  it("remounts with empty query and browse view after force-quit mid Support Person query", async () => {
    const vol = SUPPORT_PERSON_VOLUMES[0];
    const keyword = vol.handoutTitle.toLowerCase().slice(0, 5);

    // --- first mount: get into search mode ---
    const first = renderScreen();
    await flushAsync(3);

    await typeQuery(first, keyword);
    expect(JSON.stringify(first.toJSON())).toContain("SUPPORT PERSON");

    // Simulate force-quit: unmount the component.
    act(() => {
      first.unmount();
    });

    // --- second mount: fresh app launch ---
    const second = renderScreen();
    await flushAsync(3);

    const tree = JSON.stringify(second.toJSON());

    expect(tree).toContain("Fetal & Maternal Development");
    expect(tree).not.toContain("SUPPORT PERSON");

    const input = second.root.findByType(TextInput);
    expect(input.props.value).toBe("");
  });
});

describe("Learn tab — force-quit mid-query (HealthyPregnancy, paid user)", () => {
  beforeEach(() => {
    setupPaidUser();
    mockPush.mockClear();
  });

  it("remounts with empty query and browse view after force-quit mid Healthy Pregnancy query", async () => {
    // --- first mount: get into search mode ---
    const first = renderScreen();
    await flushAsync(3);

    await typeQuery(first, "nutrition");
    expect(JSON.stringify(first.toJSON())).toContain("HEALTHY PREGNANCY");

    // Simulate force-quit: unmount the component.
    act(() => {
      first.unmount();
    });

    // --- second mount: fresh app launch ---
    const second = renderScreen();
    await flushAsync(3);

    const tree = JSON.stringify(second.toJSON());

    expect(tree).toContain("Fetal & Maternal Development");
    expect(tree).not.toContain("HEALTHY PREGNANCY");

    const input = second.root.findByType(TextInput);
    expect(input.props.value).toBe("");
  });
});

// ── 6. Clear search restores browse view ─────────────────────────────────────

describe("Learn tab — search clear (paid user)", () => {
  beforeEach(() => {
    setupPaidUser();
    mockPush.mockClear();
  });

  it("clearing the query restores the default browse view", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    // Enter search mode.
    await typeQuery(renderer, "fetal");
    expect(JSON.stringify(renderer.toJSON())).toContain("VIDEO VAULT");

    // Clear the query.
    await act(async () => {
      renderer.root.findByType(TextInput).props.onChangeText("");
    });
    await flushAsync(3);

    // Browse-view marker card is back; section headers are gone.
    const tree = JSON.stringify(renderer.toJSON());
    expect(tree).toContain("Fetal & Maternal Development");
    expect(tree).not.toContain("VIDEO VAULT");
  });
});
