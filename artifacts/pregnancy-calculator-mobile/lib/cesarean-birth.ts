export interface CesareanResource {
  name: string;
  detail: string;
  url?: string;
}

export const CESAREAN_HIGHLIGHTS: string[] = [
  "About 1 in 3 babies born in the U.S. is delivered by cesarean. It can be planned in advance or happen unexpectedly during labor — both are safe, common operations, and either way, it's still your birth.",
  "A cesarean birth is the delivery of a baby through incisions in the belly and uterus. It's major surgery, but usually done with regional anesthesia so you're awake and comfortable while your baby is born.",
  "Common reasons for a cesarean include labor not progressing, concern for the baby's heart rate or the cord, the baby's position (breech or transverse), multiples, placenta problems, a very large baby, certain maternal conditions, or prior uterine surgery.",
  'Anesthesia is usually a spinal block (most planned cesareans), an epidural (can "top up" a labor epidural), or a combined spinal-epidural. General anesthesia is reserved for true emergencies. With regional anesthesia, you\'re awake and your partner is usually with you.',
  'On the day of surgery: an IV, urinary catheter, and compression sleeves are placed before anesthesia. The baby is usually born within 5–10 minutes of the first cut, and the whole operation typically takes 45–60 minutes. Ask about "family-centered" or "gentle" cesarean options.',
  "Hospital stay is typically 2–4 days. The catheter and IV usually come out within 12–24 hours, walking is encouraged the first day, and pain is managed with scheduled medication. Full healing of the incision and uterus takes about 6 weeks.",
  'Cesarean birth does not mean less bonding, less breastfeeding success, or a "lesser" birth — with support, families do just as well after cesareans as after vaginal births.',
  "If you've had a cesarean before, a vaginal birth after cesarean (VBAC) may be possible in a future pregnancy, depending on your scar type, how many cesareans you've had, the original reason, and whether your hospital can support it.",
];

export const CESAREAN_CALLOUT_REASONS: string[] = [
  "Fever over 100.4°F (38°C), or chills",
  "Increasing pain that isn't improving day by day",
  "Redness, warmth, drainage, or opening of the incision",
  "Heavy bleeding — soaking a pad in an hour, or passing large clots",
  "Foul-smelling vaginal discharge",
  "Leg pain, swelling, or warmth (possible blood clot)",
  "Chest pain or shortness of breath — call 911; possible blood clot in the lung",
  "Persistent sadness, anxiety, or scary thoughts",
];

export const CESAREAN_NATIONAL_RESOURCES: CesareanResource[] = [
  {
    name: "ACOG Patient FAQ — Cesarean Birth",
    detail: "acog.org/womens-health/faqs/cesarean-birth",
    url: "https://www.acog.org/womens-health/faqs/cesarean-birth",
  },
  {
    name: "ACOG Patient FAQ — Vaginal Birth After Cesarean (VBAC)",
    detail: "acog.org/womens-health/faqs/vaginal-birth-after-cesarean-delivery",
    url: "https://www.acog.org/womens-health/faqs/vaginal-birth-after-cesarean-delivery",
  },
  {
    name: "ACOG Patient FAQ — Postpartum Pain Management",
    detail: "acog.org/womens-health/faqs/postpartum-pain-management",
    url: "https://www.acog.org/womens-health/faqs/postpartum-pain-management",
  },
  {
    name: "ACOG — Labor, Delivery, and Postpartum Care (patient hub)",
    detail: "acog.org/womens-health/pregnancy/labor-and-delivery",
    url: "https://www.acog.org/womens-health/pregnancy/labor-and-delivery",
  },
  {
    name: "Your ob-gyn office",
    detail:
      "Call any time in recovery with questions — this is what we're here for.",
  },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resourceListHtml(resources: CesareanResource[]): string {
  return resources
    .map(
      (r) =>
        `<div class="row"><span class="rname">${escapeHtml(r.name)}</span><span class="rdetail">${escapeHtml(r.detail)}</span></div>`,
    )
    .join("");
}

/**
 * Builds an HTML document summarizing cesarean birth highlights, when-to-call
 * guidance, and trusted resources, for use with expo-print to generate a PDF
 * the patient can save, print, or review with her provider.
 */
export function buildCesareanBirthResourceHtml(): string {
  const highlightsHtml = CESAREAN_HIGHLIGHTS.map(
    (h) => `<li>${escapeHtml(h)}</li>`,
  ).join("");
  const calloutHtml = CESAREAN_CALLOUT_REASONS.map(
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
        <h1>What About a Cesarean — My Resource Summary</h1>
        <p class="sub">Based on ACOG patient guidance on cesarean birth. This is educational information, not a diagnosis or medical advice.</p>

        <div class="callout">
          <h2>Call your ob-gyn right away if</h2>
          <ul>${calloutHtml}</ul>
        </div>

        <h2>What to know</h2>
        <ul>${highlightsHtml}</ul>

        <h2>Trusted resources</h2>
        ${resourceListHtml(CESAREAN_NATIONAL_RESOURCES)}

        <p class="footer">Generated in the Pregnancy Assistant app. Not medical advice; always discuss your individual care with your ob-gyn.</p>
      </body>
    </html>
  `;
}
