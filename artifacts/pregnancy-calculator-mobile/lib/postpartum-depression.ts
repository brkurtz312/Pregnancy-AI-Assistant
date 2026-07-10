import AsyncStorage from "@react-native-async-storage/async-storage";

export const PPD_CHECKIN_STORAGE_KEY = "@ppd_checkin_v1";
export const PHQ9_STORAGE_KEY = "@phq9_answers_v1";

// ─── PHQ-9 ────────────────────────────────────────────────────────────────────

export const PHQ9_QUESTIONS: string[] = [
  "Little interest or pleasure in doing things",
  "Feeling down, depressed, or hopeless",
  "Trouble falling or staying asleep, or sleeping too much",
  "Feeling tired or having little energy",
  "Poor appetite or overeating",
  "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
  "Trouble concentrating on things, such as reading or watching TV",
  "Moving or speaking so slowly that others could notice — or being so fidgety or restless that you've been moving around more than usual",
  "Thoughts that you would be better off dead, or thoughts of hurting yourself in some way",
];

export const PHQ9_OPTIONS = [
  { label: "Not at all", value: 0 },
  { label: "Several days", value: 1 },
  { label: "More than half the days", value: 2 },
  { label: "Nearly every day", value: 3 },
] as const;

export type Phq9Answers = (number | undefined)[];

export interface Phq9Category {
  label: string;
  color: string;
  urgency: "minimal" | "mild" | "moderate" | "moderately_severe" | "severe";
  recommendation: string;
  action: string;
}

export function getPhq9Category(score: number): Phq9Category {
  if (score <= 4) {
    return {
      label: "Minimal or no depression",
      color: "#27ae60",
      urgency: "minimal",
      recommendation:
        "Your score suggests minimal to no depression symptoms — this is reassuring. Continue to check in with yourself over the coming weeks. Let your ob-gyn know at your next visit, especially if anything changes.",
      action: "Mention at your next routine visit",
    };
  }
  if (score <= 9) {
    return {
      label: "Mild depression",
      color: "#f39c12",
      urgency: "mild",
      recommendation:
        "Your score suggests mild depressive symptoms. Consider talking with your ob-gyn at your next visit, or sooner if these symptoms are affecting your day-to-day life or your ability to care for your baby.",
      action: "Bring this up at your next visit or sooner if needed",
    };
  }
  if (score <= 14) {
    return {
      label: "Moderate depression",
      color: "#e67e22",
      urgency: "moderate",
      recommendation:
        "Your score suggests moderate depression. Effective treatments are available and work well. Please contact your ob-gyn soon — you do not need to wait for a scheduled appointment. Call the office and let them know you need to discuss how you are feeling.",
      action:
        "Contact your ob-gyn soon — don't wait for your next scheduled visit",
    };
  }
  if (score <= 19) {
    return {
      label: "Moderately severe depression",
      color: "#e74c3c",
      urgency: "moderately_severe",
      recommendation:
        'Your score suggests moderately severe depression. Please reach out to your ob-gyn as soon as possible. Call the office today and say: "I think I may have postpartum depression and I need to be seen." You do not have to wait — help is available.',
      action: "Call your ob-gyn today",
    };
  }
  return {
    label: "Severe depression",
    color: "#c0392b",
    urgency: "severe",
    recommendation:
      "Your score suggests severe depression. Please seek care today. Call your ob-gyn's office right now, or go to the nearest emergency room if you are having thoughts of harming yourself or your baby. You are not alone, and treatment works.",
    action: "Seek care today — call your ob-gyn or go to the ER",
  };
}

export function scorePhq9(answers: Phq9Answers): number {
  return answers.reduce<number>((sum, a) => sum + (a ?? 0), 0);
}

export function phq9Complete(answers: Phq9Answers): boolean {
  return answers.length === 9 && answers.every((a) => a !== undefined);
}

export async function loadPhq9Answers(): Promise<Phq9Answers> {
  const raw = await AsyncStorage.getItem(PHQ9_STORAGE_KEY);
  if (!raw) return Array<undefined>(9).fill(undefined);
  try {
    return JSON.parse(raw) as Phq9Answers;
  } catch {
    return Array<undefined>(9).fill(undefined);
  }
}

export async function savePhq9Answers(answers: Phq9Answers): Promise<void> {
  await AsyncStorage.setItem(PHQ9_STORAGE_KEY, JSON.stringify(answers));
}

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
  url?: string;
}

export const PPD_CRISIS_RESOURCES: PpdResource[] = [
  {
    name: "In an emergency",
    detail: "Call 911 or go to the nearest emergency room right away.",
  },
  {
    name: "988 Suicide & Crisis Lifeline",
    detail: "Call or text 988 — free, confidential, 24/7, English & Spanish.",
    url: "https://988lifeline.org",
  },
  {
    name: "Postpartum Support International (PSI) HelpLine",
    detail:
      'Call 1-800-944-4773, or text "HELP" to 800-944-4773 (English) or 971-203-7773 (Spanish).',
    url: "https://postpartum.net",
  },
  {
    name: "National Maternal Mental Health Hotline",
    detail: "Call or text 1-833-TLC-MAMA (1-833-852-6262) — free, 24/7.",
    url: "https://mchb.hrsa.gov/programs-impact/programs/mental-health/national-maternal-mental-health-hotline",
  },
];

export const PPD_NATIONAL_RESOURCES: PpdResource[] = [
  {
    name: "ACOG — Postpartum Depression Patient FAQ",
    detail: "acog.org/womens-health/faqs/postpartum-depression",
    url: "https://www.acog.org/womens-health/faqs/postpartum-depression",
  },
  {
    name: "Edinburgh Postnatal Depression Scale (EPDS) screening",
    detail:
      "A short, validated 10-question screening tool. Take it online and bring your score to your visit: postpartum.net/professionals/screening",
    url: "https://postpartum.net/professionals/screening",
  },
  {
    name: "Postpartum Support International — Get Help",
    detail: "postpartum.net/get-help",
    url: "https://postpartum.net/get-help",
  },
];

export const PPD_LOCAL_DIRECTORIES: PpdResource[] = [
  {
    name: "PSI Local Support Directory",
    detail:
      "psidirectory.com — search by your zip code for local support groups, therapists, and psychiatrists who specialize in perinatal mental health.",
    url: "https://psidirectory.com",
  },
  {
    name: "SAMHSA FindTreatment.gov",
    detail:
      "findtreatment.gov — federal treatment locator; enter your zip code to find nearby mental health providers.",
    url: "https://findtreatment.gov",
  },
  {
    name: "HRSA Find a Health Center",
    detail:
      "findahealthcenter.hrsa.gov — enter your zip code to find low-cost/sliding-scale clinics near you.",
    url: "https://findahealthcenter.hrsa.gov",
  },
  {
    name: "211",
    detail:
      "Call or text 211, or visit 211.org and enter your zip code for local health, housing, and support services.",
    url: "https://211.org",
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
