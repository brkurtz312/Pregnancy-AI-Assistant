/**
 * Watch weekly tips — unit tests
 *
 * Coverage
 * ────────
 * 1. getWeeklyTips — representative weeks (8, 20, 36):
 *    • Returns 3–5 tips
 *    • Tip text content matches fetalDevelopmentData for that week
 *    • Every tip carries the correct `week` field
 *
 * 2. getWeeklyTips — out-of-range week (e.g. 0):
 *    • Returns the generic fallback tips (still 3 items)
 *
 * 3. Due-date change drives updated tips:
 *    • calculateByDueDate(dueDate) → gestationalWeek
 *    • A different due date produces a different gestationalWeek
 *    • getWeeklyTips(week) returns tips whose first tip text contains the
 *      size/sizeComparison values from fetalDevelopmentData for that week,
 *      confirming the memo re-computes with the new week's content when the
 *      profile due date changes.
 */

import { getWeeklyTips } from "../lib/watch-tips";
import { fetalDevelopmentData } from "../lib/fetal-development";
import { calculateByDueDate } from "../lib/pregnancy-math";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PREGNANCY_DAYS = 280;

/**
 * Build a due date that puts today at exactly `targetWeek` gestational weeks.
 *
 * Gestation = 280 days, so LMP = dueDate − 280 days, and today's GA in whole
 * weeks = floor((today − LMP) / 7).  We want that to equal targetWeek.
 *
 * dueDate = today + (280 − targetWeek × 7) days
 */
function dueDateForWeek(targetWeek: number): Date {
  return new Date(Date.now() + (PREGNANCY_DAYS - targetWeek * 7) * MS_PER_DAY);
}

// ─── 1. getWeeklyTips — representative weeks ─────────────────────────────────

describe("getWeeklyTips — week 8 (first trimester)", () => {
  const week = 8;
  const data = fetalDevelopmentData[week]!;
  let tips: ReturnType<typeof getWeeklyTips>;

  beforeEach(() => {
    tips = getWeeklyTips(week);
  });

  it("returns between 3 and 5 tips", () => {
    expect(tips.length).toBeGreaterThanOrEqual(3);
    expect(tips.length).toBeLessThanOrEqual(5);
  });

  it("every tip has the correct week field", () => {
    tips.forEach((tip) => {
      expect(tip.week).toBe(week);
    });
  });

  it("every tip has a non-empty emoji and text", () => {
    tips.forEach((tip) => {
      expect(typeof tip.emoji).toBe("string");
      expect(tip.emoji.length).toBeGreaterThan(0);
      expect(typeof tip.text).toBe("string");
      expect(tip.text.length).toBeGreaterThan(0);
    });
  });

  it("first tip contains the size comparison from fetal-development data", () => {
    const sizeTip = tips[0];
    expect(sizeTip.text).toContain(data.size);
    expect(sizeTip.text).toContain(data.sizeComparison);
  });

  it("second tip contains the first development milestone", () => {
    const devTip = tips[1];
    expect(devTip.text).toBe(data.development[0]);
  });

  it("third tip contains the first mother-change entry", () => {
    const motherTip = tips[2];
    expect(motherTip.text).toBe(data.motherChanges[0]);
  });
});

describe("getWeeklyTips — week 20 (anatomy-scan week)", () => {
  const week = 20;
  const data = fetalDevelopmentData[week]!;
  let tips: ReturnType<typeof getWeeklyTips>;

  beforeEach(() => {
    tips = getWeeklyTips(week);
  });

  it("returns between 3 and 5 tips", () => {
    expect(tips.length).toBeGreaterThanOrEqual(3);
    expect(tips.length).toBeLessThanOrEqual(5);
  });

  it("every tip has the correct week field", () => {
    tips.forEach((tip) => {
      expect(tip.week).toBe(week);
    });
  });

  it("first tip contains size and comparison from fetal-development data", () => {
    expect(tips[0].text).toContain(data.size);
    expect(tips[0].text).toContain(data.sizeComparison);
  });

  it("second tip matches first development milestone", () => {
    expect(tips[1].text).toBe(data.development[0]);
  });

  it("third tip matches first mother-change entry", () => {
    expect(tips[2].text).toBe(data.motherChanges[0]);
  });

  it("includes comingUp text when available", () => {
    if (data.comingUp) {
      const comingUpTip = tips.find((t) => t.text === data.comingUp);
      expect(comingUpTip).toBeDefined();
    }
  });
});

describe("getWeeklyTips — week 36 (late third trimester)", () => {
  const week = 36;
  const data = fetalDevelopmentData[week]!;
  let tips: ReturnType<typeof getWeeklyTips>;

  beforeEach(() => {
    tips = getWeeklyTips(week);
  });

  it("returns between 3 and 5 tips", () => {
    expect(tips.length).toBeGreaterThanOrEqual(3);
    expect(tips.length).toBeLessThanOrEqual(5);
  });

  it("every tip has the correct week field", () => {
    tips.forEach((tip) => {
      expect(tip.week).toBe(week);
    });
  });

  it("first tip contains size and comparison from fetal-development data", () => {
    expect(tips[0].text).toContain(data.size);
    expect(tips[0].text).toContain(data.sizeComparison);
  });

  it("second tip matches first development milestone", () => {
    expect(tips[1].text).toBe(data.development[0]);
  });

  it("third tip matches first mother-change entry", () => {
    expect(tips[2].text).toBe(data.motherChanges[0]);
  });
});

// ─── 2. getWeeklyTips — out-of-range fallback ────────────────────────────────

describe("getWeeklyTips — out-of-range week (fallback)", () => {
  it("returns exactly 3 generic tips for week 0", () => {
    const tips = getWeeklyTips(0);
    expect(tips).toHaveLength(3);
  });

  it("fallback tips still carry the requested week number", () => {
    const tips = getWeeklyTips(0);
    tips.forEach((tip) => {
      expect(tip.week).toBe(0);
    });
  });

  it("returns exactly 3 generic tips for week 99 (past term)", () => {
    const tips = getWeeklyTips(99);
    expect(tips).toHaveLength(3);
  });
});

// ─── 3. Due-date change drives updated tips ───────────────────────────────────
//
// Simulates the profile.dueDate → gestationalWeek → watchTips data flow:
//   • calculateByDueDate(dueDate) resolves the current gestational week
//   • getWeeklyTips(gestationalWeek) returns tips keyed to that week
//   • Changing the due date produces a different gestational week and therefore
//     different tip content — confirming the useMemo in tools.tsx will
//     recompute correctly after an ultrasound dating update.

describe("due-date change produces updated tips", () => {
  it("two due dates 4 weeks apart produce different gestational weeks", () => {
    const dueDate1 = dueDateForWeek(20);
    const dueDate2 = dueDateForWeek(24);

    const week1 = calculateByDueDate(dueDate1).currentGestationalAgeWeeks;
    const week2 = calculateByDueDate(dueDate2).currentGestationalAgeWeeks;

    expect(week1).not.toBe(week2);
  });

  it("tips returned for week 20 differ from tips returned for week 24", () => {
    const tipsWeek20 = getWeeklyTips(20);
    const tipsWeek24 = getWeeklyTips(24);

    const texts20 = tipsWeek20.map((t) => t.text);
    const texts24 = tipsWeek24.map((t) => t.text);
    expect(texts20).not.toEqual(texts24);
  });

  it("after a due-date update the tips reflect the new week's fetal-development data", () => {
    // Simulate the original due date (week 20)
    const originalDueDate = dueDateForWeek(20);
    const originalWeek =
      calculateByDueDate(originalDueDate).currentGestationalAgeWeeks;

    // User visits OB and gets re-dated by ultrasound: 4 weeks further along
    const updatedDueDate = dueDateForWeek(24);
    const updatedWeek =
      calculateByDueDate(updatedDueDate).currentGestationalAgeWeeks;

    expect(updatedWeek).toBeGreaterThan(originalWeek);

    // Tips computed with the updated week match that week's data
    const updatedTips = getWeeklyTips(updatedWeek);
    const updatedData = fetalDevelopmentData[updatedWeek];

    if (updatedData) {
      expect(updatedTips[0].text).toContain(updatedData.size);
      expect(updatedTips[1].text).toBe(updatedData.development[0]);
    } else {
      // Fallback path — still returns 3 tips for the right week
      expect(updatedTips).toHaveLength(3);
      updatedTips.forEach((tip) => expect(tip.week).toBe(updatedWeek));
    }
  });

  it("decreasing gestational age (later due date after correction) still produces correct tips", () => {
    // Some corrections push the due date forward → smaller gestational week
    const originalDueDate = dueDateForWeek(24);
    const correctedDueDate = dueDateForWeek(20);

    const originalWeek =
      calculateByDueDate(originalDueDate).currentGestationalAgeWeeks;
    const correctedWeek =
      calculateByDueDate(correctedDueDate).currentGestationalAgeWeeks;

    expect(correctedWeek).toBeLessThan(originalWeek);

    const correctedTips = getWeeklyTips(correctedWeek);
    const correctedData = fetalDevelopmentData[correctedWeek];

    if (correctedData) {
      expect(correctedTips[0].text).toContain(correctedData.size);
      expect(correctedTips[1].text).toBe(correctedData.development[0]);
    } else {
      expect(correctedTips).toHaveLength(3);
    }
  });
});
