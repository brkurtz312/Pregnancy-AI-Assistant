/**
 * Learn tab search — expired / unpaid pass tests.
 *
 * Exercises the full search flow inside a rendered LearnScreen session where:
 *   • the user is signed in (mocked via @clerk/expo useAuth)
 *   • the user's pass has expired — hasPass: false (mocked via @/hooks/usePass)
 *
 * Why: LearnScreen does not currently gate the search bar or results behind an
 * active pass. These tests confirm that behaviour and act as a CI canary: if a
 * future change accidentally restricts the search (e.g. hides the bar or
 * suppresses results) for users whose pass has lapsed, these tests will fail
 * immediately rather than going undetected until a user reports it.
 *
 * The module-level mock for @/hooks/usePass means that if LearnScreen (or any
 * component it renders) ever imports usePass, the test tree will see
 * hasPass: false — giving accurate expired-pass coverage from that point
 * forward without needing to update the mock setup.
 *
 * Covers:
 *   1. Search bar is visible when the component mounts (expired pass).
 *   2. Typing a Video Vault keyword returns Video Vault result cards.
 *   3. Typing a Support Person keyword returns Support Person result cards.
 *   4. Typing a Healthy Pregnancy keyword returns Healthy Pregnancy result cards.
 *   5. Every result card exposes an onPress handler (is tappable).
 *   6. Tapping a result card calls router.push with a non-empty route.
 *   7. Clearing the search input restores the browse view.
 *
 * Test strategy
 * ─────────────
 * • Render the real LearnScreen component via react-test-renderer.
 * • Simulate expired-pass auth state by mocking @clerk/expo and @/hooks/usePass
 *   with hasPass: false at the module level so any import inside the tree is
 *   intercepted.
 * • Simulate typing via TextInput.onChangeText.
 * • Assert result cards appear and are pressable.
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

// ── Expired-pass auth mocks ───────────────────────────────────────────────────
//
// Both hooks are mocked at module level so that any component in the render
// tree that imports them — now or after a future refactor — receives the
// expired-pass context automatically.  usePass returns hasPass: false,
// which is the state a signed-in user is in after their subscription lapses.

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
import { SUPPORT_PERSON_VOLUMES } from "@/lib/support-person-survival";
import LearnScreen from "../app/(tabs)/learn";

const mockUseAuth = useAuth as jest.Mock;
const mockUsePass = usePass as jest.Mock;
const mockPush = router.push as jest.Mock;

// ── Expired-pass state ────────────────────────────────────────────────────────

function setupExpiredPassUser() {
  mockUseAuth.mockReturnValue({
    isSignedIn: true,
    userId: "user_expired_pass_001",
  });
  // hasPass: false represents a signed-in user whose pass has lapsed or who
  // has never purchased.  This is distinct from isLoading:true (pending query)
  // or a signed-out user.
  mockUsePass.mockReturnValue({
    hasPass: false,
    isLoading: false,
    isError: false,
  });
}

// ── Render helpers ────────────────────────────────────────────────────────────

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
 */
function findResultCards(
  renderer: ReturnType<typeof create>,
): ReactTestInstance[] {
  return renderer.root
    .findAllByType(TouchableOpacity)
    .filter((t) => t.props.activeOpacity === 0.8 && t.props.hitSlop == null);
}

// ── 1. Search bar visibility ──────────────────────────────────────────────────

describe("Learn tab — search bar (expired/unpaid pass)", () => {
  beforeEach(() => {
    setupExpiredPassUser();
    mockPush.mockClear();
  });

  it("renders a TextInput search bar on mount when pass has expired", async () => {
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

// ── 2. Video Vault search ─────────────────────────────────────────────────────

describe("Learn tab — Video Vault search (expired/unpaid pass)", () => {
  beforeEach(() => {
    setupExpiredPassUser();
    mockPush.mockClear();
  });

  it("returns Video Vault result cards for a known keyword when pass has expired", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    await typeQuery(renderer, "fetal");

    const cards = findResultCards(renderer);
    expect(cards.length).toBeGreaterThan(0);

    const tree = JSON.stringify(renderer.toJSON());
    expect(tree).toContain("VIDEO VAULT");
  });

  it("every Video Vault result card has an onPress handler when pass has expired", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    await typeQuery(renderer, "fetal");

    const cards = findResultCards(renderer);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(typeof card.props.onPress).toBe("function");
    }
  });

  it("tapping a Video Vault result card calls router.push when pass has expired", async () => {
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

// ── 3. Support Person search ──────────────────────────────────────────────────

describe("Learn tab — Support Person search (expired/unpaid pass)", () => {
  beforeEach(() => {
    setupExpiredPassUser();
    mockPush.mockClear();
  });

  it("returns Support Person result cards for a known keyword when pass has expired", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    const vol = SUPPORT_PERSON_VOLUMES.find((v) => v.volumeNumber === 1)!;
    const keyword = vol.handoutTitle.toLowerCase().slice(0, 5);
    await typeQuery(renderer, keyword);

    const cards = findResultCards(renderer);
    expect(cards.length).toBeGreaterThan(0);

    const tree = JSON.stringify(renderer.toJSON());
    expect(tree).toContain("SUPPORT PERSON");
  });

  it("tapping a Support Person result card calls router.push when pass has expired", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    const vol = SUPPORT_PERSON_VOLUMES.find((v) => v.volumeNumber === 1)!;
    const keyword = vol.handoutTitle.toLowerCase().slice(0, 5);
    await typeQuery(renderer, keyword);

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

// ── 4. Healthy Pregnancy search ───────────────────────────────────────────────

describe("Learn tab — Healthy Pregnancy search (expired/unpaid pass)", () => {
  beforeEach(() => {
    setupExpiredPassUser();
    mockPush.mockClear();
  });

  it("returns Healthy Pregnancy result cards for a known keyword when pass has expired", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    await typeQuery(renderer, "nutrition");

    const cards = findResultCards(renderer);
    expect(cards.length).toBeGreaterThan(0);

    const tree = JSON.stringify(renderer.toJSON());
    expect(tree).toContain("HEALTHY PREGNANCY");
  });

  it("tapping a Healthy Pregnancy result card calls router.push when pass has expired", async () => {
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

// ── 5. Cross-section coverage ─────────────────────────────────────────────────

describe("Learn tab — cross-section search (expired/unpaid pass)", () => {
  beforeEach(() => {
    setupExpiredPassUser();
    mockPush.mockClear();
  });

  it("a broad search returns results across all three sections when pass has expired", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    await typeQuery(renderer, "pregnancy");

    const tree = JSON.stringify(renderer.toJSON());
    expect(tree).toContain("VIDEO VAULT");
    expect(tree).toContain("SUPPORT PERSON");
    expect(tree).toContain("HEALTHY PREGNANCY");
  });

  it("result count text is rendered and reflects a positive number when pass has expired", async () => {
    const renderer = renderScreen();
    await flushAsync(3);

    await typeQuery(renderer, "pregnancy");

    const tree = JSON.stringify(renderer.toJSON());
    // The result-count line reads: `N result(s) for "..."`.
    expect(tree).toMatch(/result.+for/);
  });
});

// ── 6. Clear search restores browse view ──────────────────────────────────────

describe("Learn tab — search clear (expired/unpaid pass)", () => {
  beforeEach(() => {
    setupExpiredPassUser();
    mockPush.mockClear();
  });

  it("clearing the query restores the default browse view when pass has expired", async () => {
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
