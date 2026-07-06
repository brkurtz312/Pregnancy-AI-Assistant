export interface ChildbirthPrepResource {
  name: string;
  detail: string;
  url?: string;
}

export const CHILDBIRTH_PREP_HANDOUT = {
  title: "Preparing for Childbirth",
  file: "childbirth-preparation.pdf",
  asset: require("@/assets/docs/childbirth-preparation.pdf"),
};

export const CHILDBIRTH_METHOD_HIGHLIGHTS: string[] = [
  'There\'s no single "right" method — Lamaze, the Bradley Method, HypnoBirthing, and hospital-based classes all have loyal fans and can all lead to a wonderful birth. Pick the one that fits your personality, budget, and the kind of birth you want.',
  "Lamaze is evidence-based and built around the Six Healthy Birth Practices — movement, continuous support, and working with your body — and supports both medicated and unmedicated births. Typical format: 6–12 hours total.",
  "The Bradley Method centers on a partner-coached, unmedicated birth with deep relaxation, nutrition, and exercise. It's the biggest time commitment — 12 weekly classes in the last trimester.",
  "HypnoBirthing (the Mongan Method) teaches self-hypnosis, guided visualization, and slow breathing to reduce fear and pain. It works alongside a hospital birth and doesn't replace your medical care.",
  "Hospital or birth-center classes are the most practical option — you learn the actual routines, policies, and pain-relief options at your delivery facility, and usually get a tour of labor and delivery. Often the most affordable, and many are covered by insurance.",
  "Online and self-paced classes are a good fit for an unpredictable schedule, living at a distance, or an experienced parent wanting a refresher. Plan an in-person facility tour separately if you can.",
  "Start looking around 20–24 weeks. Most classes are scheduled to finish 3–4 weeks before your due date.",
  "Ask who is teaching — credentials like LCCE, CBE, RN, or CD tell you the instructor has been trained and evaluated.",
  "Many classes also cover breastfeeding, newborn care, infant CPR, and car-seat safety — sometimes bundled in, sometimes separate. Check what's included before you sign up.",
];

export const CHILDBIRTH_PREP_RESOURCES: ChildbirthPrepResource[] = [
  {
    name: "ACOG — Preparing for Labor FAQ",
    detail: "acog.org — how to tell when labor begins",
    url: "https://www.acog.org/womens-health/faqs/how-to-tell-when-labor-begins",
  },
  {
    name: "ACOG — Approaches to Limit Intervention During Labor and Birth",
    detail:
      "Committee Opinion 766: movement, hydration, doulas, shared decisions",
    url: "https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2019/02/approaches-to-limit-intervention-during-labor-and-birth",
  },
  {
    name: "Lamaze International",
    detail: "The Six Healthy Birth Practices and class finder",
    url: "https://www.lamaze.org/childbirth-practices",
  },
  {
    name: "The Bradley Method",
    detail: "Class finder and info on partner-coached childbirth",
    url: "https://www.bradleymethod.com",
  },
  {
    name: "HypnoBirthing (Mongan Method)",
    detail: "Practitioner finder and program information",
    url: "https://www.hypnobirthing.com",
  },
  {
    name: "DONA International",
    detail:
      "Certifying body for doulas; locator for certified birth and postpartum doulas",
    url: "https://www.dona.org",
  },
  {
    name: "Your ob-gyn office",
    detail:
      "We're happy to talk through class options and share what other patients have liked.",
  },
];

/**
 * Builds a Google search URL to find childbirth-preparation classes near a
 * patient's ZIP code, opened via the OS browser.
 */
export function buildLocalClassesSearchUrl(zipCode: string): string {
  const q = `childbirth classes near ${zipCode}`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/**
 * Builds a Google search URL scoped to a delivery facility's own site,
 * looking for its Women's Services / childbirth-class offerings.
 */
export function buildFacilityClassesSearchUrl(facilityName: string): string {
  const q = `${facilityName} women's services childbirth classes`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resourceListHtml(resources: ChildbirthPrepResource[]): string {
  return resources
    .map(
      (r) =>
        `<div class="row"><span class="rname">${escapeHtml(r.name)}</span><span class="rdetail">${escapeHtml(r.detail)}</span></div>`,
    )
    .join("");
}

/**
 * Builds an HTML document summarizing childbirth-preparation methods and
 * trusted resources, for use with expo-print to generate a PDF the patient
 * can save, print, or review.
 */
export function buildChildbirthPrepResourceHtml(): string {
  const highlightsHtml = CHILDBIRTH_METHOD_HIGHLIGHTS.map(
    (h) => `<li>${escapeHtml(h)}</li>`,
  ).join("");

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 28px; color: #222; }
          h1 { font-size: 22px; margin-bottom: 2px; }
          .sub { color: #666; font-size: 12px; margin-bottom: 16px; }
          h2 { font-size: 15px; margin-top: 20px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
          ul { margin: 0 0 8px; padding-left: 18px; font-size: 12.5px; line-height: 1.6; }
          .row { display: flex; flex-direction: column; gap: 1px; font-size: 12.5px; line-height: 1.5; padding: 5px 0; border-bottom: 1px dotted #eee; }
          .rname { font-weight: 600; }
          .rdetail { color: #444; }
          .footer { margin-top: 28px; font-size: 10px; color: #999; }
        </style>
      </head>
      <body>
        <h1>Preparing for Childbirth — My Resource Summary</h1>
        <p class="sub">Based on ACOG and childbirth-education guidance. This is educational information, not medical advice.</p>

        <h2>What to know</h2>
        <ul>${highlightsHtml}</ul>

        <h2>Trusted resources</h2>
        ${resourceListHtml(CHILDBIRTH_PREP_RESOURCES)}

        <p class="footer">Generated in the Pregnancy Assistant app. Not medical advice; always discuss your individual care with your ob-gyn.</p>
      </body>
    </html>
  `;
}
