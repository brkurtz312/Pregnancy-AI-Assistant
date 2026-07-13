/**
 * Gestational-age-based content for appointment reminders and the
 * "Preparing for Your Office Visit" screen.
 *
 * Each entry covers a gestational-week range and describes what the provider
 * is likely to discuss or perform at that visit.
 */

export interface VisitExpectation {
  weekRange: [number, number];
  label: string;
  highlights: string[];
  tip: string;
}

export const VISIT_EXPECTATIONS: VisitExpectation[] = [
  {
    weekRange: [4, 9],
    label: "First Prenatal Visit",
    highlights: [
      "Confirm pregnancy and calculate your due date",
      "Complete health history and physical exam",
      "Order first trimester blood work (blood type, Rh factor, CBC, STI screens)",
      "Discuss prenatal vitamins and nutrition",
      "Answer your questions about the coming months",
    ],
    tip: "Bring a list of all medications, supplements, and vitamins you currently take.",
  },
  {
    weekRange: [10, 13],
    label: "First Trimester Wrap-Up",
    highlights: [
      "Review first trimester blood work results",
      "Discuss NIPT or nuchal translucency screening options",
      "Listen to the fetal heartbeat",
      "Discuss any first-trimester symptoms",
      "Talk about genetic counseling if relevant",
    ],
    tip: "This is a great time to ask about safe exercises and any travel plans.",
  },
  {
    weekRange: [14, 17],
    label: "Second Trimester Check-In",
    highlights: [
      "Review NIPT or first-trimester screening results",
      "Measure fundal height and listen to heartbeat",
      "Discuss quad screen (maternal serum AFP) if desired",
      "Talk about common second-trimester symptoms",
    ],
    tip: "Ask about the anatomy ultrasound typically scheduled around 18–20 weeks.",
  },
  {
    weekRange: [18, 21],
    label: "Anatomy Ultrasound Visit",
    highlights: [
      "Mid-pregnancy anatomy ultrasound",
      "Confirm fetal development and placental position",
      "Possible gender reveal if you'd like to know",
      "Review any ultrasound findings",
    ],
    tip: "Drink water before the ultrasound for better imaging. Bring your partner or support person!",
  },
  {
    weekRange: [22, 25],
    label: "Mid-Second Trimester Visit",
    highlights: [
      "Measure fundal height",
      "Check fetal heartbeat",
      "Discuss the glucose challenge test coming up at 24–28 weeks",
      "Talk about round ligament pain or Braxton Hicks contractions",
    ],
    tip: "A good time to start researching childbirth classes in your area.",
  },
  {
    weekRange: [26, 29],
    label: "Glucose Screening & Third Trimester Prep",
    highlights: [
      "One-hour glucose challenge test (gestational diabetes screening)",
      "Rh-negative mothers may receive Rh immune globulin (Rhogam)",
      "Discuss signs and symptoms of preterm labor",
      "Review your birth plan preferences",
      "Discuss kick counting",
    ],
    tip: "Don't fast before the standard one-hour glucose test unless told otherwise.",
  },
  {
    weekRange: [30, 33],
    label: "Third Trimester Check-In",
    highlights: [
      "Measure fundal height and check fetal position",
      "Discuss birth plan and delivery preferences",
      "Review any glucose test results",
      "Talk about when to head to the hospital",
      "Discuss swelling, heartburn, and other late-pregnancy discomforts",
    ],
    tip: "Start thinking about your hospital bag and who will be in the delivery room with you.",
  },
  {
    weekRange: [34, 35],
    label: "Late Third Trimester Visit",
    highlights: [
      "Check fetal position and presentation",
      "Discuss signs of true labor vs. Braxton Hicks",
      "Review birth plan with your provider",
      "Talk about when to call or come in",
      "Discuss cord blood banking if interested",
    ],
    tip: "Pack your hospital bag if you haven't already — 36 weeks is a great milestone.",
  },
  {
    weekRange: [36, 36],
    label: "Group B Strep Test Visit",
    highlights: [
      "Group B Strep (GBS) swab test",
      "Review hospital admission process",
      "Discuss signs of labor and when to call your provider",
      "Weekly appointments begin now",
    ],
    tip: "GBS results are usually ready within a few days — ask your provider to share them.",
  },
  {
    weekRange: [37, 40],
    label: "Weekly Visits — Almost There",
    highlights: [
      "Check fetal position, heartbeat, and amniotic fluid",
      "Cervical exam if you consent",
      "Discuss labor signs: contractions, water breaking, bloody show",
      "Review your birth plan one more time",
      "Talk about induction options if approaching 41 weeks",
    ],
    tip: "Write down your questions as they come up — every week brings new ones at this stage!",
  },
  {
    weekRange: [41, 42],
    label: "Post-Dates Monitoring",
    highlights: [
      "Non-stress test (NST) or biophysical profile to check baby's wellbeing",
      "Discuss induction options and timing",
      "Review risks and benefits of going past your due date",
    ],
    tip: "Stay in close contact with your provider. Induction is common and safe at this stage.",
  },
];

/**
 * Returns the best-matching visit expectation for the given gestational week.
 */
export function getVisitExpectation(
  gestationalWeeks: number,
): VisitExpectation {
  const match = VISIT_EXPECTATIONS.find(
    (e) =>
      gestationalWeeks >= e.weekRange[0] && gestationalWeeks <= e.weekRange[1],
  );
  if (match) return match;
  if (gestationalWeeks < 4) return VISIT_EXPECTATIONS[0]!;
  return VISIT_EXPECTATIONS[VISIT_EXPECTATIONS.length - 1]!;
}
