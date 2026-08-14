/**
 * gestureBackNavConfig.test.ts
 *
 * Integration-level navigator-config check: confirms that the root Stack
 * navigator wrapping session-history.tsx has no option that would suppress
 * focus events on gesture-based back navigation (iOS swipe-back gesture,
 * Android system back button / back gesture).
 *
 * Background
 * ──────────
 * expo-router's useFocusEffect fires via the underlying React Navigation focus
 * event, which is emitted whenever a screen transitions into the "focused"
 * state.  React Navigation fires this event regardless of what triggered the
 * back navigation:
 *
 *   • In-app back button  (router.back() / BackHandler)
 *   • iOS edge-swipe gesture  (interactivePopGestureRecognizer)
 *   • Android system back button or back gesture
 *
 * The two navigator options that can break this guarantee are:
 *
 *   1. gestureEnabled: false — disables the iOS swipe-back gesture entirely
 *      so the user can never trigger a gesture-based back transition.
 *
 *   2. presentation: "fullScreenModal" — on iOS this disables the edge-swipe
 *      gesture and therefore suppresses the gesture-back focus event.
 *
 * This file reads the root _layout.tsx source and asserts that neither option
 * is applied to session-history globally or per-screen.
 *
 * The unit-level tests in kickHistoryFocusRefetch.test.tsx and
 * contractionHistoryFocusRefetch.test.tsx (Section D in each) complement this
 * check by exercising the actual useFocusEffect callback under the gesture-back
 * label.
 */

import * as fs from "fs";
import * as path from "path";

const LAYOUT_PATH = path.resolve(__dirname, "../app/_layout.tsx");

describe("Navigator config — session-history gesture-back focus suppression", () => {
  let layoutSource: string;

  beforeAll(() => {
    layoutSource = fs.readFileSync(LAYOUT_PATH, "utf-8");
  });

  // ── Sanity ─────────────────────────────────────────────────────────────────

  it("loads _layout.tsx", () => {
    expect(layoutSource.length).toBeGreaterThan(0);
  });

  // ── session-history has no explicit Stack.Screen entry ─────────────────────

  it("session-history is not explicitly listed in the Stack (inherits safe default card presentation)", () => {
    // When a route has no explicit Stack.Screen entry it inherits the root
    // screenOptions, which here is only { headerShown: false }.  React
    // Navigation's native-stack default presentation is "card", which:
    //   • enables the iOS edge-swipe gesture
    //   • responds to the Android system back gesture
    //   • fires the focus event on the returning screen on every back nav
    //
    // If an explicit entry is added later it must use presentation: "card"
    // (never fullScreenModal or gestureEnabled: false) to preserve this
    // behaviour.
    const sessionHistoryBlocks = layoutSource
      .split("Stack.Screen")
      .filter((block) => block.includes("session-history"));

    expect(sessionHistoryBlocks.length).toBe(0);
  });

  // ── No per-screen gesture suppressor for session-history ───────────────────

  it("no Stack.Screen block for session-history contains gestureEnabled: false", () => {
    const sessionHistoryBlocks = layoutSource
      .split("Stack.Screen")
      .filter((block) => block.includes("session-history"));

    for (const block of sessionHistoryBlocks) {
      expect(block).not.toMatch(/gestureEnabled\s*:\s*false/);
    }
  });

  it("no Stack.Screen block for session-history uses fullScreenModal presentation", () => {
    // fullScreenModal disables the iOS swipe-back gesture; the user would need
    // an explicit in-app back action for the previous screen to regain focus.
    const sessionHistoryBlocks = layoutSource
      .split("Stack.Screen")
      .filter((block) => block.includes("session-history"));

    for (const block of sessionHistoryBlocks) {
      expect(block).not.toContain("fullScreenModal");
    }
  });

  // ── No global gesture suppressor in root screenOptions ─────────────────────

  it("the root Stack screenOptions do not contain gestureEnabled: false", () => {
    // A global suppressor would disable gestures for every screen including
    // session-history, breaking gesture-back focus events app-wide.
    expect(layoutSource).not.toMatch(
      /screenOptions\s*=\s*\{[^}]*gestureEnabled\s*:\s*false/,
    );
  });

  it("the root Stack screenOptions do not set fullScreenModal as the default presentation", () => {
    expect(layoutSource).not.toMatch(
      /screenOptions\s*=\s*\{[^}]*fullScreenModal/,
    );
  });

  // ── Positive confirmation: (auth) and onboarding use fullScreenModal ────────

  it("fullScreenModal is used only for (auth) and onboarding — not for any card-navigation screen", () => {
    // This asserts that fullScreenModal is intentionally scoped to the two
    // sign-in/onboarding flows, providing a baseline that it is not applied
    // broadly.  If this count ever changes, the navigator-config intent should
    // be reviewed.
    const fullScreenModalOccurrences = (
      layoutSource.match(/fullScreenModal/g) ?? []
    ).length;

    // Exactly two Stack.Screen entries use fullScreenModal: (auth) and onboarding.
    expect(fullScreenModalOccurrences).toBe(2);
  });
});
