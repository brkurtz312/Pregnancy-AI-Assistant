export interface ComplicationResource {
  name: string;
  detail: string;
  url?: string;
}

export const COMPLICATION_HIGHLIGHTS: string[] = [
  "Preeclampsia is high blood pressure that develops after 20 weeks, sometimes with protein in the urine or signs of organ strain. It's usually caught through routine blood pressure checks and urine tests at prenatal visits — one reason regular visits matter even when you feel fine.",
  "Gestational diabetes is high blood sugar that develops during pregnancy, usually found with a glucose screening test around 24–28 weeks. It's managed with diet, monitoring, and sometimes medication, and typically resolves after delivery.",
  "Preterm labor is regular contractions that start opening the cervix before 37 weeks. Recognizing the warning signs early gives the best chance to slow or stop labor and, if needed, get medications on board that help the baby's lungs and brain.",
  "Placenta previa (the placenta covering the cervix) and placental abruption (the placenta separating early) are usually found or monitored by ultrasound and can cause bleeding — both are reasons your care team may recommend extra monitoring or a planned cesarean.",
  "Gestational hypertension is elevated blood pressure without the other features of preeclampsia; it still needs closer monitoring since it can progress.",
  "Intrauterine growth restriction (IUGR) means the baby is measuring smaller than expected for their gestational age; it's tracked with growth ultrasounds and sometimes extra monitoring in the third trimester.",
  "Rh incompatibility (when your blood type is Rh-negative and the baby's is Rh-positive) is checked with an early blood test and managed with a preventive medication (Rhogam) — it's routine, not an emergency.",
  "Most pregnancy complications are found through routine screening, not symptoms — this is exactly why keeping your prenatal appointments matters, even when you feel completely fine.",
];

export const COMPLICATION_CALLOUT_REASONS: string[] = [
  "Severe or persistent headache that doesn't improve with rest or fluids",
  "Vision changes — blurriness, spots, or flashing lights",
  "Sudden swelling of the face, hands, or feet",
  "Upper abdominal pain, especially under the ribs on the right side",
  "Vaginal bleeding or fluid leaking",
  "Regular contractions or pelvic pressure before 37 weeks",
  "A noticeable decrease in your baby's movement",
  "Severe abdominal pain, or fever over 100.4°F (38°C)",
];

export const COMPLICATION_RESOURCES: ComplicationResource[] = [
  {
    name: "ACOG Patient FAQ — Preeclampsia and High Blood Pressure During Pregnancy",
    detail:
      "acog.org/womens-health/faqs/preeclampsia-and-high-blood-pressure-during-pregnancy",
    url: "https://www.acog.org/womens-health/faqs/preeclampsia-and-high-blood-pressure-during-pregnancy",
  },
  {
    name: "ACOG Patient FAQ — Gestational Diabetes",
    detail: "acog.org/womens-health/faqs/gestational-diabetes",
    url: "https://www.acog.org/womens-health/faqs/gestational-diabetes",
  },
  {
    name: "ACOG Patient FAQ — Preterm (Premature) Labor and Birth",
    detail: "acog.org/womens-health/faqs/preterm-premature-labor-and-birth",
    url: "https://www.acog.org/womens-health/faqs/preterm-premature-labor-and-birth",
  },
  {
    name: "ACOG — Pregnancy Complications (patient hub)",
    detail: "acog.org/womens-health/pregnancy/pregnancy-complications",
    url: "https://www.acog.org/womens-health/pregnancy/pregnancy-complications",
  },
  {
    name: "Your ob-gyn office",
    detail:
      "Call any time you're worried — it's always okay to check, even for something that turns out to be nothing.",
  },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resourceListHtml(resources: ComplicationResource[]): string {
  return resources
    .map(
      (r) =>
        `<div class="row"><span class="rname">${escapeHtml(r.name)}</span><span class="rdetail">${escapeHtml(r.detail)}</span></div>`,
    )
    .join("");
}

/**
 * Builds an HTML document summarizing common pregnancy complications,
 * when-to-call guidance, and trusted resources, for use with expo-print
 * to generate a PDF the patient can save, print, or review with her provider.
 */
export function buildComplicationsResourceHtml(): string {
  const highlightsHtml = COMPLICATION_HIGHLIGHTS.map(
    (h) => `<li>${escapeHtml(h)}</li>`,
  ).join("");
  const calloutHtml = COMPLICATION_CALLOUT_REASONS.map(
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
          .callout { border: 1.5px solid #b5474a; border-radius: 8px; padding: 12px 14px; margin-bottom: 18px; background: #faeeee; }
          .callout h2 { margin: 0 0 6px; font-size: 14px; color: #b5474a; border: none; padding: 0; }
          h2 { font-size: 15px; margin-top: 20px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
          ul { margin: 0 0 8px; padding-left: 18px; font-size: 12.5px; line-height: 1.6; }
          .row { display: flex; flex-direction: column; gap: 1px; font-size: 12.5px; line-height: 1.5; padding: 5px 0; border-bottom: 1px dotted #eee; }
          .rname { font-weight: 600; }
          .rdetail { color: #444; }
          .footer { margin-top: 28px; font-size: 10px; color: #999; }
        </style>
      </head>
      <body>
        <h1>Complications of Pregnancy — My Resource Summary</h1>
        <p class="sub">Educational information about common pregnancy complications. This is not a diagnosis or medical advice.</p>

        <div class="callout">
          <h2>Call your ob-gyn or go to the ER right away if you notice</h2>
          <ul>${calloutHtml}</ul>
        </div>

        <h2>What to know</h2>
        <ul>${highlightsHtml}</ul>

        <h2>Trusted resources</h2>
        ${resourceListHtml(COMPLICATION_RESOURCES)}

        <p class="footer">Generated in the Pregnancy Assistant app. Not medical advice; always discuss your individual care with your ob-gyn.</p>
      </body>
    </html>
  `;
}
