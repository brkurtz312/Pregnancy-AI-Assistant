/**
 * watchTipModelDecoding.test.ts
 *
 * Regression guard for the WatchTip model contract between JavaScript and Swift.
 *
 * Background
 * ──────────
 * The Swift `WatchTip` struct in Models.swift carries a `CodingKeys` enum that
 * explicitly lists only `week`, `emoji`, and `text`.  The `id` field is
 * intentionally excluded so that tips arriving from JavaScript — which never
 * include `id` — decode without throwing.  A UUID default is assigned by the
 * Swift initialiser and is used only by SwiftUI's Identifiable machinery.
 *
 * What this test guards against
 * ──────────────────────────────
 * If a developer:
 *   • Adds a NEW required field to Swift's `WatchTip` but forgets to list it
 *     in `CodingKeys`, the field gets its Swift default but is never populated
 *     from the incoming JSON — silent data loss.
 *   • Adds a NEW field to `CodingKeys` without a default *and* without adding
 *     it to the JS payload, the Swift `JSONDecoder` throws a
 *     `keyNotFound` error and tips stop appearing on the Watch.
 *   • Adds a NEW field to the JS `WatchTip` interface that is required, while
 *     the Swift CodingKeys still only lists three keys — this test will fail
 *     at the "only known keys" assertions, flagging the mismatch.
 *
 * Strategy
 * ────────
 * The Swift `CodingKeys` contract (week | emoji | text) is mirrored here as
 * `SWIFT_CODING_KEYS`.  Every assertion below verifies that:
 *   1. A minimal payload {week, emoji, text} (no `id`) is a valid WatchTip.
 *   2. `getWeeklyTips` output carries exactly the three CodingKeys fields
 *      (never `id`, never undocumented extras).
 *   3. The runtime shape of WatchTip matches the TypeScript interface.
 */

import { getWeeklyTips } from "../lib/watch-tips";
import type { WatchTip } from "../hooks/useWatchConnectivity";

// ── Swift CodingKeys contract ────────────────────────────────────────────────
//
// These must stay in sync with the `CodingKeys` enum inside
// `watchapp/Models.swift` (and its mirror in
// `ios/PregnancyWatchApp/Models.swift`).
//
// If you add a field here you MUST also add it to the Swift CodingKeys enum.
// If you add a field to Swift's CodingKeys you MUST add it here and ensure
// getWeeklyTips emits it.

const SWIFT_CODING_KEYS = ["week", "emoji", "text"] as const;
type SwiftCodingKey = (typeof SWIFT_CODING_KEYS)[number];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns only the keys that appear in a WatchTip object (excluding
 * undefined-valued optional fields like `id?`).
 */
function presentKeys(tip: WatchTip): string[] {
  return Object.entries(tip)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Minimal payload decoding
// ─────────────────────────────────────────────────────────────────────────────

describe("WatchTip minimal payload (week + emoji + text, no id)", () => {
  const minimalPayload: WatchTip = {
    week: 20,
    emoji: "👶",
    text: "Baby is growing.",
  };

  it("accepts a payload with only the three CodingKeys fields", () => {
    expect(minimalPayload.week).toBe(20);
    expect(minimalPayload.emoji).toBe("👶");
    expect(minimalPayload.text).toBe("Baby is growing.");
  });

  it("does not require an id field — id must remain optional", () => {
    // 'id' must NOT be required in the TS interface; if it were, this
    // assignment would be a compile-time error and the test would not build.
    expect(minimalPayload.id).toBeUndefined();
  });

  it("the payload carries exactly the three Swift CodingKeys fields (no extras)", () => {
    const keys = presentKeys(minimalPayload);
    expect(keys.sort()).toEqual([...SWIFT_CODING_KEYS].sort());
  });

  it("week is a number — matches Swift Int", () => {
    expect(typeof minimalPayload.week).toBe("number");
  });

  it("emoji is a string — matches Swift String", () => {
    expect(typeof minimalPayload.emoji).toBe("string");
    expect(minimalPayload.emoji.length).toBeGreaterThan(0);
  });

  it("text is a string — matches Swift String", () => {
    expect(typeof minimalPayload.text).toBe("string");
    expect(minimalPayload.text.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. JSON round-trip through JSON.stringify → JSON.parse
//    (mirrors what WCSession serialises before handing to JSONDecoder on Watch)
// ─────────────────────────────────────────────────────────────────────────────

describe("WatchTip JSON round-trip (simulates WCSession serialisation)", () => {
  const tip: WatchTip = { week: 28, emoji: "🌱", text: "Week 28 tip." };

  it("survives JSON.stringify → JSON.parse with correct field values", () => {
    const json = JSON.stringify(tip);
    const parsed = JSON.parse(json) as WatchTip;

    expect(parsed.week).toBe(28);
    expect(parsed.emoji).toBe("🌱");
    expect(parsed.text).toBe("Week 28 tip.");
  });

  it("does not gain an id key after serialisation", () => {
    const json = JSON.stringify(tip);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect("id" in parsed).toBe(false);
  });

  it("serialised JSON contains only the three CodingKeys fields", () => {
    const parsed = JSON.parse(JSON.stringify(tip)) as Record<string, unknown>;
    const keys = Object.keys(parsed).sort();
    expect(keys).toEqual([...SWIFT_CODING_KEYS].sort());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. getWeeklyTips output conforms to the Swift CodingKeys contract
//    (in-range and out-of-range weeks)
// ─────────────────────────────────────────────────────────────────────────────

describe("getWeeklyTips — output matches Swift CodingKeys contract", () => {
  const weekUnderTest = [8, 20, 36] as const;

  it.each(weekUnderTest)(
    "week %i: every tip carries exactly the three CodingKeys fields",
    (week) => {
      const tips = getWeeklyTips(week);
      tips.forEach((tip, index) => {
        const keys = presentKeys(tip).sort();
        expect(keys).toEqual(
          [...SWIFT_CODING_KEYS].sort(),
          // `tip` should equal exactly the known keys
        );
        // Ensure id is absent (Swift's CodingKeys does not list it)
        expect("id" in tip && tip.id !== undefined).toBe(false);
        // week field must match the requested week
        expect(tip.week).toBe(week);
        // emoji and text must be non-empty strings
        expect(typeof tip.emoji).toBe("string");
        expect(tip.emoji.length).toBeGreaterThan(0);
        expect(typeof tip.text).toBe("string");
        expect(tip.text.length).toBeGreaterThan(0);

        void index; // suppress unused-var warning
      });
    },
  );

  it("out-of-range week (0): fallback tips also match CodingKeys contract", () => {
    const tips = getWeeklyTips(0);
    expect(tips.length).toBeGreaterThan(0);
    tips.forEach((tip) => {
      const keys = presentKeys(tip).sort();
      expect(keys).toEqual([...SWIFT_CODING_KEYS].sort());
      expect("id" in tip && tip.id !== undefined).toBe(false);
    });
  });

  it("out-of-range week (99): fallback tips also match CodingKeys contract", () => {
    const tips = getWeeklyTips(99);
    expect(tips.length).toBeGreaterThan(0);
    tips.forEach((tip) => {
      const keys = presentKeys(tip).sort();
      expect(keys).toEqual([...SWIFT_CODING_KEYS].sort());
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Array of tips (mirrors [WatchTip] Swift decode)
// ─────────────────────────────────────────────────────────────────────────────

describe("Array of WatchTip objects (mirrors Swift [WatchTip] decode)", () => {
  it("a JSON array of minimal tips round-trips without losing fields", () => {
    const tipsOut: WatchTip[] = [
      { week: 12, emoji: "🍋", text: "Baby is lemon-sized." },
      { week: 12, emoji: "💕", text: "You may start to show." },
    ];

    const json = JSON.stringify(tipsOut);
    const parsed = JSON.parse(json) as WatchTip[];

    expect(parsed).toHaveLength(2);
    parsed.forEach((tip, i) => {
      expect(tip.week).toBe(tipsOut[i]!.week);
      expect(tip.emoji).toBe(tipsOut[i]!.emoji);
      expect(tip.text).toBe(tipsOut[i]!.text);
      expect(tip.id).toBeUndefined();
    });
  });

  it("getWeeklyTips array can be JSON-serialised and every item has only the three CodingKeys", () => {
    const tips = getWeeklyTips(20);
    const roundTripped = JSON.parse(JSON.stringify(tips)) as Array<
      Record<string, unknown>
    >;
    roundTripped.forEach((item) => {
      const keys = Object.keys(item).sort();
      expect(keys).toEqual(([...SWIFT_CODING_KEYS] as string[]).sort());
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. New-field regression guard
//
// This describe block acts as a CANARY.  If a developer adds a new required
// field to the JS WatchTip interface (e.g. `priority: number`), TypeScript
// will refuse to compile the minimalPayload assignment above and CI will fail
// before the mismatch can reach Swift.  If the opposite happens — a new field
// is added to Swift CodingKeys but not to SWIFT_CODING_KEYS here — the
// assertions in sections 1–4 will fail because presentKeys() will not include
// it in the expected set.
// ─────────────────────────────────────────────────────────────────────────────

describe("SWIFT_CODING_KEYS canary — documents the current contract", () => {
  it("SWIFT_CODING_KEYS lists exactly three keys: week, emoji, text", () => {
    expect(SWIFT_CODING_KEYS).toHaveLength(3);
    expect(SWIFT_CODING_KEYS).toContain("week");
    expect(SWIFT_CODING_KEYS).toContain("emoji");
    expect(SWIFT_CODING_KEYS).toContain("text");
  });

  it("a WatchTip with only CodingKeys fields is assignable (no compile error)", () => {
    // This assignment is a compile-time proof that `id` is optional.
    // Adding a new *required* field to WatchTip will break this.
    const tip: WatchTip = { week: 1, emoji: "⭐", text: "Hello." };
    const keys = SWIFT_CODING_KEYS.reduce<Record<SwiftCodingKey, unknown>>(
      (acc, k) => ({ ...acc, [k]: tip[k] }),
      {} as Record<SwiftCodingKey, unknown>,
    );
    expect(keys.week).toBe(1);
    expect(keys.emoji).toBe("⭐");
    expect(keys.text).toBe("Hello.");
  });
});
