export type Test = {
  time: string;
  tests: string;
  why: string;
};

export const TIMELINE: Test[] = [
  {
    time: "Before 8 weeks",
    tests: "Pregnancy confirmation, dating ultrasound when needed",
    why: "Confirms viability and helps establish the due date so later testing can be timed correctly.",
  },
  {
    time: "8–12 weeks",
    tests:
      "CBC, blood type/Rh, antibody screen, HIV, hepatitis B, hepatitis C, syphilis, rubella, varicella, urine culture, gonorrhea/chlamydia",
    why: "Looks for anemia, infection, immunity, and blood factors that may affect the pregnancy or baby.",
  },
  {
    time: "9+ weeks",
    tests: "Cell-free DNA screening, if desired and appropriate",
    why: "Screens for common chromosomal conditions such as trisomy 21, 18, and 13.",
  },
  {
    time: "Early pregnancy",
    tests: "Carrier screening, if not previously done",
    why: "Checks whether a parent carries certain inherited conditions.",
  },
  {
    time: "20–22 weeks",
    tests: "Anatomy ultrasound",
    why: "Evaluates fetal anatomy, growth, and placental location.",
  },
  {
    time: "24–28 weeks",
    tests: "Gestational diabetes screening",
    why: "Looks for diabetes that develops during pregnancy.",
  },
  {
    time: "Around 28 weeks",
    tests:
      "Repeat CBC, HIV, syphilis; repeat type and screen with RhoGAM if Rh negative",
    why: "Rechecks for anemia and infection and helps prevent Rh sensitization in Rh-negative patients.",
  },
  {
    time: "27–36 weeks",
    tests: "Tdap vaccine",
    why: "Helps protect the newborn from pertussis after birth.",
  },
  {
    time: "32–36 weeks",
    tests: "RSV vaccine in appropriate seasonal circumstances",
    why: "Helps reduce the baby's risk of serious RSV illness after birth.",
  },
  {
    time: "36–37 weeks",
    tests: "Group B strep testing",
    why: "Identifies who should receive antibiotics during labor to help protect the newborn.",
  },
];

export const FAQS: { q: string; a: string }[] = [
  {
    q: "Why are so many blood tests done early?",
    a: "Many important conditions in pregnancy do not cause symptoms at first. Early testing helps identify problems while there is time to treat them or plan care safely.",
  },
  {
    q: "Are all genetic tests required?",
    a: "No. Some genetic tests are optional, and patients can decide how much information they want. Screening and diagnostic testing each have benefits, limits, and different purposes.",
  },
  {
    q: "Will I need more testing than this?",
    a: "Possibly. Some pregnancies need extra monitoring, while others follow the routine schedule. Your care team can explain which tests apply to your pregnancy and why.",
  },
];

export const VISIT_QUESTIONS = [
  "Which tests are routine for my pregnancy?",
  "Are any optional genetic tests right for me?",
  "Will I need any extra monitoring later in pregnancy?",
  "What should I expect during my next ultrasound or lab visit?",
  "Are there vaccines I should receive during this pregnancy?",
];

/**
 * Parses the loose, human-written week-range strings used in `TIMELINE`
 * (e.g. "8–12 weeks", "Before 8 weeks", "9+ weeks", "Around 28 weeks") into a
 * numeric [start, end] week range. Falls back to an open range when nothing
 * can be parsed, so unusual entries are never silently dropped.
 */
function parseWeekRange(time: string): [number, number] {
  const nums = (time.match(/\d+/g) ?? []).map(Number);
  if (/before/i.test(time)) return [0, nums[0] ?? 0];
  if (/\+/.test(time)) return [nums[0] ?? 0, 999];
  if (/around/i.test(time)) {
    const n = nums[0] ?? 0;
    return [Math.max(0, n - 2), n + 2];
  }
  if (nums.length >= 2) return [nums[0], nums[1]];
  if (nums.length === 1) return [nums[0], nums[0]];
  return [0, 999];
}

/**
 * Returns timeline entries relevant to a given gestational week: anything
 * already in range, plus items coming up within the next ~3 weeks, so a
 * patient can see both "what's happening now" and "what's coming next".
 */
export function getTimelineForWeeks(weeks: number): Test[] {
  return TIMELINE.filter((t) => {
    const [lo, hi] = parseWeekRange(t.time);
    return weeks >= lo - 1 && weeks <= hi + 3;
  });
}
