export interface LniResource {
  name: string;
  detail: string;
}

export const LNI_HIGHLIGHTS: string[] = [
  "Every labor is different. Most people give birth between 38 and 41 weeks, and there's no way to predict exactly when yours will start — labor can begin on its own or need help from medication or a procedure.",
  'Early signs your body is getting ready include lightening ("the baby dropped"), losing the mucus plug ("bloody show"), your water breaking, and contractions — you may notice one, several, or none of these before labor begins.',
  "True labor contractions get stronger, longer, and closer together over time and don't ease with rest. False labor (Braxton Hicks) is irregular, doesn't build, and often eases with rest, water, or a change in position.",
  "Labor has three stages: early labor (cervix opens 0–6 cm, often manageable at home), active labor (6–10 cm, when most people head to the hospital), and pushing/birth — followed by delivery of the placenta.",
  "A labor induction uses medication or a procedure to start labor before it begins on its own. It may be recommended for medical reasons (post-term, water broken without labor, preeclampsia, diabetes, growth concerns) or chosen electively at 39 weeks.",
  "For a healthy first-time parent carrying one baby, ACOG notes an elective induction at 39 weeks may actually lower the chance of a cesarean and reduce preeclampsia — but induction should not happen before 39 weeks.",
  "Induction methods include cervical ripening (medication, a balloon catheter, or laminaria), membrane stripping, oxytocin (Pitocin) through an IV, and breaking the water (amniotomy) — often combined depending on where you're starting.",
  "You can still use pain relief options — nitrous oxide, IV medication, an epidural — during an induction, on your own schedule. If it doesn't work and both of you are doing well, you may be sent home to try again another day.",
];

export const LNI_CALLOUT_REASONS: string[] = [
  "Your water breaks — even if you're not having contractions yet",
  'Contractions are 5 minutes apart, lasting 1 minute, for 1 hour (the "5-1-1" rule)',
  "You have heavy vaginal bleeding — more than spotting",
  "Your baby is moving less than usual",
  "You have constant, severe pain with no relief between contractions",
  "You feel something in your vagina that could be the umbilical cord — call 911 and lie down",
  "You are less than 37 weeks and think you're in labor",
];

export const LNI_NATIONAL_RESOURCES: LniResource[] = [
  {
    name: "ACOG Patient FAQ — How to Tell When Labor Begins",
    detail: "acog.org/womens-health/faqs/how-to-tell-when-labor-begins",
  },
  {
    name: "ACOG Patient FAQ — Labor Induction",
    detail: "acog.org/womens-health/faqs/labor-induction",
  },
  {
    name: "ACOG Patient FAQ — Induction of Labor at 39 Weeks",
    detail: "acog.org/womens-health/faqs/induction-of-labor-at-39-weeks",
  },
  {
    name: "ACOG Explains: Inducing Labor (video)",
    detail: "acog.org/womens-health/videos/inducing-labor",
  },
  {
    name: "ACOG — Labor, Delivery, and Postpartum Care (patient hub)",
    detail: "acog.org/womens-health/pregnancy/labor-and-delivery",
  },
  {
    name: "Your ob-gyn office",
    detail:
      "Call any time, day or night, when you think labor may be starting.",
  },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resourceListHtml(resources: LniResource[]): string {
  return resources
    .map(
      (r) =>
        `<div class="row"><span class="rname">${escapeHtml(r.name)}</span><span class="rdetail">${escapeHtml(r.detail)}</span></div>`,
    )
    .join("");
}

/**
 * Builds an HTML document summarizing natural/induced labor highlights,
 * when-to-call guidance, and trusted resources, for use with expo-print to
 * generate a PDF the patient can save, print, or review with her provider.
 */
export function buildLaborNaturalInducedResourceHtml(): string {
  const highlightsHtml = LNI_HIGHLIGHTS.map(
    (h) => `<li>${escapeHtml(h)}</li>`,
  ).join("");
  const calloutHtml = LNI_CALLOUT_REASONS.map(
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
          .callout { border: 1.5px solid #3a6ea5; border-radius: 8px; padding: 12px 14px; margin-bottom: 18px; background: #eef4fa; }
          .callout h2 { margin: 0 0 6px; font-size: 14px; color: #3a6ea5; border: none; padding: 0; }
          h2 { font-size: 15px; margin-top: 20px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
          ul { margin: 0 0 8px; padding-left: 18px; font-size: 12.5px; line-height: 1.6; }
          .row { display: flex; flex-direction: column; gap: 1px; font-size: 12.5px; line-height: 1.5; padding: 5px 0; border-bottom: 1px dotted #eee; }
          .rname { font-weight: 600; }
          .rdetail { color: #444; }
          .footer { margin-top: 28px; font-size: 10px; color: #999; }
        </style>
      </head>
      <body>
        <h1>Labor: Natural or Induced — My Resource Summary</h1>
        <p class="sub">Based on ACOG patient guidance on labor and induction. This is educational information, not a diagnosis or medical advice.</p>

        <div class="callout">
          <h2>Call us or head to the hospital if</h2>
          <ul>${calloutHtml}</ul>
        </div>

        <h2>What to know</h2>
        <ul>${highlightsHtml}</ul>

        <h2>Trusted resources</h2>
        ${resourceListHtml(LNI_NATIONAL_RESOURCES)}

        <p class="footer">Generated in the Pregnancy Assistant app. Not medical advice; always discuss your individual care with your ob-gyn.</p>
      </body>
    </html>
  `;
}
