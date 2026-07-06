import AsyncStorage from "@react-native-async-storage/async-storage";

export const PPD_CHECKIN_STORAGE_KEY = "@ppd_checkin_v1";

export type YesNo = "yes" | "no" | undefined;

export interface PpdCheckin {
  concerned: YesNo;
  wantsResources: YesNo;
  zip?: string;
  generatedAt?: string;
}

function defaultCheckin(): PpdCheckin {
  return { concerned: undefined, wantsResources: undefined, zip: "" };
}

export async function loadPpdCheckin(): Promise<PpdCheckin> {
  const raw = await AsyncStorage.getItem(PPD_CHECKIN_STORAGE_KEY);
  if (!raw) return defaultCheckin();
  try {
    return { ...defaultCheckin(), ...(JSON.parse(raw) as PpdCheckin) };
  } catch {
    return defaultCheckin();
  }
}

export async function savePpdCheckin(checkin: PpdCheckin): Promise<void> {
  await AsyncStorage.setItem(PPD_CHECKIN_STORAGE_KEY, JSON.stringify(checkin));
}

export async function markPpdSummaryGenerated(
  checkin: PpdCheckin,
): Promise<PpdCheckin> {
  const next = { ...checkin, generatedAt: new Date().toISOString() };
  await savePpdCheckin(next);
  return next;
}

export const PPD_HIGHLIGHTS: string[] = [
  "Postpartum depression (PPD) is a common, treatable medical condition — it usually starts 1–3 weeks after delivery but can begin any time in the first year. It is not your fault and not a sign of weakness.",
  '"Baby blues" (mild tearfulness that fades within 1–2 weeks) is different from PPD, which is more intense, lasts longer than 2 weeks, and interferes with daily life or caring for your baby.',
  "Watch for: persistent sadness or hopelessness, anxiety or irritability, feeling disconnected from the baby, trouble sleeping or eating, and difficulty concentrating.",
  "Urgent warning signs — thoughts of harming yourself or the baby, or hearing/seeing things others don't — need help right away; postpartum psychosis is rare but is a medical emergency.",
  "Treatment works. Most patients feel meaningfully better within weeks using a combination of counseling (like CBT or IPT) and, when needed, medication such as SSRIs or the PPD-specific medication zuranolone.",
  'You do not need to wait for your postpartum visit. Call your ob-gyn\'s office any time and say: "I think I may have postpartum depression and I need to be seen."',
];

export interface PpdResource {
  name: string;
  detail: string;
}

export const PPD_CRISIS_RESOURCES: PpdResource[] = [
  {
    name: "In an emergency",
    detail: "Call 911 or go to the nearest emergency room right away.",
  },
  {
    name: "988 Suicide & Crisis Lifeline",
    detail: "Call or text 988 — free, confidential, 24/7, English & Spanish.",
  },
  {
    name: "Postpartum Support International (PSI) HelpLine",
    detail:
      'Call 1-800-944-4773, or text "HELP" to 800-944-4773 (English) or 971-203-7773 (Spanish).',
  },
  {
    name: "National Maternal Mental Health Hotline",
    detail: "Call or text 1-833-TLC-MAMA (1-833-852-6262) — free, 24/7.",
  },
];

export const PPD_NATIONAL_RESOURCES: PpdResource[] = [
  {
    name: "ACOG — Postpartum Depression Patient FAQ",
    detail: "acog.org/womens-health/faqs/postpartum-depression",
  },
  {
    name: "Edinburgh Postnatal Depression Scale (EPDS) screening",
    detail:
      "A short, validated 10-question screening tool. Take it online and bring your score to your visit: postpartum.net/professionals/screening",
  },
  {
    name: "Postpartum Support International — Get Help",
    detail: "postpartum.net/get-help",
  },
];

export const PPD_LOCAL_DIRECTORIES: PpdResource[] = [
  {
    name: "PSI Local Support Directory",
    detail:
      "psidirectory.com — search by your zip code for local support groups, therapists, and psychiatrists who specialize in perinatal mental health.",
  },
  {
    name: "SAMHSA FindTreatment.gov",
    detail:
      "findtreatment.gov — federal treatment locator; enter your zip code to find nearby mental health providers.",
  },
  {
    name: "HRSA Find a Health Center",
    detail:
      "findahealthcenter.hrsa.gov — enter your zip code to find low-cost/sliding-scale clinics near you.",
  },
  {
    name: "211",
    detail:
      "Call or text 211, or visit 211.org and enter your zip code for local health, housing, and support services.",
  },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resourceListHtml(resources: PpdResource[]): string {
  return resources
    .map(
      (r) =>
        `<div class="row"><span class="rname">${escapeHtml(r.name)}</span><span class="rdetail">${escapeHtml(r.detail)}</span></div>`,
    )
    .join("");
}

/**
 * Builds an HTML document summarizing crisis resources, highlights, and
 * (if provided) a zip-personalized list of resource directories, for use
 * with expo-print to generate a PDF the patient can save, print, or review
 * with her provider.
 */
export function buildPostpartumResourceHtml(checkin: PpdCheckin): string {
  const zip = checkin.zip?.trim();
  const highlightsHtml = PPD_HIGHLIGHTS.map(
    (h) => `<li>${escapeHtml(h)}</li>`,
  ).join("");

  const localSectionHtml =
    checkin.wantsResources === "yes"
      ? `
        <h2>Local resources${zip ? ` near ${escapeHtml(zip)}` : ""}</h2>
        <p class="intro">These directories let you search by zip code${zip ? ` (yours: ${escapeHtml(zip)})` : ""} for support groups, therapists, and low-cost clinics near you.</p>
        ${resourceListHtml(PPD_LOCAL_DIRECTORIES)}
      `
      : "";

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 28px; color: #222; }
          h1 { font-size: 22px; margin-bottom: 2px; }
          .sub { color: #666; font-size: 12px; margin-bottom: 16px; }
          .crisis { border: 1.5px solid #c0392b; border-radius: 8px; padding: 12px 14px; margin-bottom: 18px; background: #fdf1f0; }
          .crisis h2 { margin: 0 0 6px; font-size: 14px; color: #c0392b; border: none; padding: 0; }
          h2 { font-size: 15px; margin-top: 20px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
          .intro { font-size: 12px; color: #666; margin: 0 0 8px; }
          ul { margin: 0 0 8px; padding-left: 18px; font-size: 12.5px; line-height: 1.6; }
          .row { display: flex; flex-direction: column; gap: 1px; font-size: 12.5px; line-height: 1.5; padding: 5px 0; border-bottom: 1px dotted #eee; }
          .rname { font-weight: 600; }
          .rdetail { color: #444; }
          .checkin { font-size: 12.5px; margin-top: 4px; color: #444; }
          .footer { margin-top: 28px; font-size: 10px; color: #999; }
        </style>
      </head>
      <body>
        <h1>Postpartum Depression — My Resource Summary</h1>
        <p class="sub">Based on ACOG patient guidance on postpartum depression. This is educational information, not a diagnosis or medical advice.</p>

        <div class="crisis">
          <h2>If you are in crisis, get help right now</h2>
          ${resourceListHtml(PPD_CRISIS_RESOURCES)}
          <p class="checkin">Please also let your ob-gyn know how you're feeling — do not wait for your next appointment.</p>
        </div>

        <h2>What to know</h2>
        <ul>${highlightsHtml}</ul>

        ${
          checkin.concerned
            ? `<h2>Your check-in</h2><p class="checkin">You indicated you ${checkin.concerned === "yes" ? "are" : "are not currently"} concerned about postpartum depression symptoms.${checkin.concerned === "yes" ? " Please tell your ob-gyn how you're feeling as soon as possible." : ""}</p>`
            : ""
        }

        <h2>National support</h2>
        ${resourceListHtml(PPD_NATIONAL_RESOURCES)}

        ${localSectionHtml}

        <p class="footer">Generated in the Pregnancy Assistant app. Not medical advice; always discuss how you're feeling with your ob-gyn or another healthcare professional.</p>
      </body>
    </html>
  `;
}
