/**
 * Birth plan PDF export — server-data regression tests
 *
 * Confirms that answers returned from GET /api/tools/birth-plan (all field
 * types: string, boolean, string[]) produce a non-empty, well-structured HTML
 * document when passed to buildBirthPlanHtml().
 *
 * Edge cases tested:
 *   • null answers  — server returns { answers: null } (no data saved yet)
 *   • partial answers — only a subset of fields filled in
 *   • full answers — every field type present: text, textarea, boolean,
 *                    single-choice, multi-choice
 *
 * buildBirthPlanHtml() is a pure function, so no network or native-module
 * mocking is required.
 */

import {
  buildBirthPlanHtml,
  BIRTH_PLAN_SECTIONS,
  type BirthPlanAnswers,
} from "@/lib/birth-plan";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Count how many section headings appear in the output. */
function countSectionHeadings(html: string): number {
  return (html.match(/<h2>/g) ?? []).length;
}

/** Extract every answer cell text (the <span class="a"> content). */
function extractAnswers(html: string): string[] {
  return [...html.matchAll(/<span class="a">([^<]*)<\/span>/g)].map(
    (m) => m[1],
  );
}

// ─── null answers (server returns { answers: null }) ─────────────────────────

describe("buildBirthPlanHtml — null answers (no data saved yet)", () => {
  let html: string;

  beforeAll(() => {
    // Simulate what the screen does when serverAnswers === null and there is
    // also no local cache: it falls back to an empty object {}.
    html = buildBirthPlanHtml({});
  });

  it("returns a non-empty string", () => {
    expect(html.length).toBeGreaterThan(0);
  });

  it("contains the document skeleton (html / head / body tags)", () => {
    expect(html).toMatch(/<html>/);
    expect(html).toMatch(/<\/html>/);
    expect(html).toMatch(/<body>/);
  });

  it("renders all four section headings", () => {
    expect(countSectionHeadings(html)).toBe(BIRTH_PLAN_SECTIONS.length);
  });

  it("renders a dash placeholder for every unanswered field", () => {
    const answers = extractAnswers(html);
    // Every answer should be the blank-placeholder em-dash
    expect(answers.every((a) => a === "—")).toBe(true);
  });

  it("includes the ACOG disclaimer text", () => {
    expect(html).toMatch(/ACOG/);
  });
});

// ─── partial answers ─────────────────────────────────────────────────────────

describe("buildBirthPlanHtml — partial answers (subset of fields filled)", () => {
  // Mimic a realistic subset that might come back from the server: a couple of
  // text fields + one boolean + one single-choice + one multi-choice, with the
  // rest absent (undefined / missing key).
  const partial: BirthPlanAnswers = {
    yourName: "Jane Smith",
    moveAroundDuringLabor: true,
    ivPreference: "heparin_lock",
    laborComfortOptions: ["birthing_ball", "warm_shower_bath"],
  };

  let html: string;

  beforeAll(() => {
    html = buildBirthPlanHtml(partial);
  });

  it("returns a non-empty string", () => {
    expect(html.length).toBeGreaterThan(0);
  });

  it("renders all four section headings", () => {
    expect(countSectionHeadings(html)).toBe(BIRTH_PLAN_SECTIONS.length);
  });

  it("renders the text field value", () => {
    expect(html).toContain("Jane Smith");
  });

  it("renders the boolean field as 'Yes'", () => {
    expect(html).toContain("Yes");
  });

  it("resolves the single-choice value to its label", () => {
    expect(html).toContain(
      "A heparin or saline lock (access to a vein without a fluid bag)",
    );
  });

  it("resolves multi-choice values to comma-separated labels", () => {
    expect(html).toContain("A birthing ball");
    expect(html).toContain("A warm shower or bath during labor");
  });

  it("renders dash for unanswered fields", () => {
    const answers = extractAnswers(html);
    expect(answers.some((a) => a === "—")).toBe(true);
  });
});

// ─── full server-shaped answers ───────────────────────────────────────────────

describe("buildBirthPlanHtml — full answers (all field types from server)", () => {
  // Build a complete answer set using the exact field IDs and option values
  // defined in BIRTH_PLAN_SECTIONS — this mirrors what the server stores and
  // returns verbatim.
  const full: BirthPlanAnswers = {
    // about
    yourName: "Jane Smith",
    obGynName: "Dr. Lee",
    babyDoctorName: "Dr. Patel",
    childbirthPrep: "Lamaze class",
    // labor
    moveAroundDuringLabor: true,
    drinkFluidsDuringLabor: false,
    ivPreference: "iv",
    peopleDuringLabor: "My partner and my mother",
    traineesPresent: "not_ok",
    laborComfortOptions: ["birthing_ball", "squat_bar"],
    anesthesia: "want_anesthesia",
    // delivery
    peopleDuringDelivery: "Partner only",
    avoidEpisiotomy: true,
    cordBloodStorage: false,
    vaginalBirthOptions: ["mirror", "dim_lights", "baby_on_chest"],
    cesareanSupportPerson: "My partner",
    seeBabyBeforeEyeDrops: true,
    supportHoldBaby: true,
    supportGoToNursery: false,
    supportKnowShots: true,
    // babyCare
    feedingPlan: "breastfeed",
    okToOffer: ["pacifier"],
    roomingIn: "room_always",
    circumcision: false,
  };

  let html: string;

  beforeAll(() => {
    html = buildBirthPlanHtml(full);
  });

  it("returns a non-empty string", () => {
    expect(html.length).toBeGreaterThan(0);
  });

  it("renders all four section headings", () => {
    expect(countSectionHeadings(html)).toBe(BIRTH_PLAN_SECTIONS.length);
  });

  it("no field renders the blank placeholder — every answer is filled", () => {
    const answers = extractAnswers(html);
    expect(answers.every((a) => a !== "—")).toBe(true);
  });

  it("renders text fields verbatim", () => {
    expect(html).toContain("Jane Smith");
    expect(html).toContain("Dr. Lee");
    expect(html).toContain("Lamaze class");
  });

  it("renders 'Yes' for true booleans and 'No' for false booleans", () => {
    expect(html).toContain("Yes");
    expect(html).toContain("No");
  });

  it("resolves single-choice values to human labels", () => {
    expect(html).toContain("An IV line for fluids and medications");
    expect(html).toContain("Not OK");
    expect(html).toContain("I would like anesthesia. Please discuss the options.");
    expect(html).toContain("Breastfeed exclusively");
    expect(html).toContain("In my room with me at all times");
  });

  it("resolves multi-choice arrays to comma-separated labels", () => {
    expect(html).toContain("A birthing ball");
    expect(html).toContain("A squat bar");
    expect(html).toContain("To use a mirror to see the birth");
    expect(html).toContain("The lights to be dimmed");
    expect(html).toContain("My baby put directly onto my chest after delivery");
    expect(html).toContain("A pacifier");
  });

  it("HTML-escapes & < > in text answers", () => {
    // escapeHtml covers the three characters that break HTML content: & < >
    // (double-quote escaping is not needed inside element text nodes)
    const withSpecialChars: BirthPlanAnswers = {
      yourName: 'Jane & <Smith>',
    };
    const escaped = buildBirthPlanHtml(withSpecialChars);
    expect(escaped).toContain("Jane &amp; &lt;Smith&gt;");
    expect(escaped).not.toContain("Jane & <Smith>");
  });
});

// ─── server null-field variants ───────────────────────────────────────────────

describe("buildBirthPlanHtml — server null-field edge cases", () => {
  it("treats explicit null values as unanswered (renders dash)", () => {
    // The server schema allows nullable values; the client normalises them
    // but if a null slips through it must not crash or render 'null'.
    const withNulls = { yourName: null as unknown as string };
    const html = buildBirthPlanHtml(withNulls);
    expect(html).not.toContain(">null<");
    // The field should render as dash (unanswered)
    expect(html).toContain("—");
  });

  it("treats an empty multi-choice array as unanswered (renders dash)", () => {
    const html = buildBirthPlanHtml({ laborComfortOptions: [] });
    expect(html).toContain("—");
  });

  it("treats an empty string text answer as unanswered (renders dash)", () => {
    const html = buildBirthPlanHtml({ yourName: "" });
    expect(html).toContain("—");
  });
});
