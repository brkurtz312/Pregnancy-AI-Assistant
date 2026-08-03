/**
 * getWeeklyTips — maternal-change branching unit tests
 *
 * Verifies the position-5 (index 4) slot behaviour:
 *
 *   (a) Week with ≥2 maternal bullets → second bullet at index 4
 *   (b) Week with exactly 1 maternal bullet → comingUp text at index 4
 *   (c) Week outside the data set → three generic fallback tips
 *
 * Real fetal-development data is replaced by controlled stubs so the tests
 * remain stable regardless of content edits.
 */

import { getWeeklyTips } from "../lib/watch-tips";

// ── Controlled stub data ───────────────────────────────────────────────────────

const TWO_MOTHER_WEEK = 88; // sentinel week — not in real data
const ONE_MOTHER_WEEK = 89;
const NO_DATA_WEEK = 0; // genuinely outside the real data set

jest.mock("../lib/fetal-development", () => ({
  fetalDevelopmentData: {
    /** Week 88 — has two maternal-change bullets */
    88: {
      week: 88,
      size: "test-size",
      sizeComparison: "a test fruit",
      development: ["Dev milestone A", "Dev milestone B"],
      motherChanges: ["Mother change first", "Mother change second"],
      comingUp: "Coming-up preview text",
    },
    /** Week 89 — has only one maternal-change bullet */
    89: {
      week: 89,
      size: "test-size-2",
      sizeComparison: "another test fruit",
      development: ["Dev milestone C", "Dev milestone D"],
      motherChanges: ["Only mother change"],
      comingUp: "Fallback coming-up text",
    },
  },
}));

// ── (a) Two maternal bullets ──────────────────────────────────────────────────

describe("getWeeklyTips — week with two maternal bullets", () => {
  let tips: ReturnType<typeof getWeeklyTips>;

  beforeEach(() => {
    tips = getWeeklyTips(TWO_MOTHER_WEEK);
  });

  it("returns exactly 5 tips", () => {
    expect(tips).toHaveLength(5);
  });

  it("every tip carries the correct week field", () => {
    tips.forEach((tip) => {
      expect(tip.week).toBe(TWO_MOTHER_WEEK);
    });
  });

  it("tip at index 4 is the second maternal change, not the coming-up preview", () => {
    expect(tips[4].text).toBe("Mother change second");
  });

  it("tip at index 4 is NOT the coming-up preview text", () => {
    expect(tips[4].text).not.toBe("Coming-up preview text");
  });

  it("tip at index 2 is the first maternal change", () => {
    expect(tips[2].text).toBe("Mother change first");
  });
});

// ── (b) One maternal bullet → falls back to comingUp ─────────────────────────

describe("getWeeklyTips — week with one maternal bullet (comingUp fallback)", () => {
  let tips: ReturnType<typeof getWeeklyTips>;

  beforeEach(() => {
    tips = getWeeklyTips(ONE_MOTHER_WEEK);
  });

  it("returns exactly 5 tips", () => {
    expect(tips).toHaveLength(5);
  });

  it("every tip carries the correct week field", () => {
    tips.forEach((tip) => {
      expect(tip.week).toBe(ONE_MOTHER_WEEK);
    });
  });

  it("tip at index 4 is the comingUp preview when only one maternal bullet exists", () => {
    expect(tips[4].text).toBe("Fallback coming-up text");
  });

  it("tip at index 2 is the only maternal change", () => {
    expect(tips[2].text).toBe("Only mother change");
  });

  it("the second maternal change does NOT appear anywhere in the tip list", () => {
    const texts = tips.map((t) => t.text);
    // There is no second maternal change for this week — confirm it is absent
    expect(texts).not.toContain("Mother change second");
  });
});

// ── (c) No data → three generic fallback tips ─────────────────────────────────

describe("getWeeklyTips — out-of-range week (no data)", () => {
  it("returns exactly 3 tips for week 0", () => {
    expect(getWeeklyTips(NO_DATA_WEEK)).toHaveLength(3);
  });

  it("every fallback tip carries the requested week number", () => {
    const tips = getWeeklyTips(NO_DATA_WEEK);
    tips.forEach((tip) => {
      expect(tip.week).toBe(NO_DATA_WEEK);
    });
  });

  it("fallback tips contain the expected universal health reminders", () => {
    const tips = getWeeklyTips(NO_DATA_WEEK);
    const texts = tips.map((t) => t.text);
    // The generic tips mention hydration and gentle exercise
    expect(texts.some((t) => /hydrat/i.test(t))).toBe(true);
    expect(texts.some((t) => /walk/i.test(t))).toBe(true);
  });
});
