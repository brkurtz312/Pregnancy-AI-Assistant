import AsyncStorage from "@react-native-async-storage/async-storage";

export const BF_CHECKIN_STORAGE_KEY = "@breastfeeding_checkin_v1";

export type YesNo = "yes" | "no" | undefined;

export interface BfCheckin {
  wantsResources: YesNo;
  zip?: string;
  generatedAt?: string;
}

function defaultCheckin(): BfCheckin {
  return { wantsResources: undefined, zip: "" };
}

export async function loadBfCheckin(): Promise<BfCheckin> {
  const raw = await AsyncStorage.getItem(BF_CHECKIN_STORAGE_KEY);
  if (!raw) return defaultCheckin();
  try {
    return { ...defaultCheckin(), ...(JSON.parse(raw) as BfCheckin) };
  } catch {
    return defaultCheckin();
  }
}

/** Clears the breastfeeding check-in on sign-out. Best-effort. */
export async function clearBfCheckinCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(BF_CHECKIN_STORAGE_KEY);
  } catch {
    /* best-effort */
  }
}

export async function saveBfCheckin(checkin: BfCheckin): Promise<void> {
  await AsyncStorage.setItem(BF_CHECKIN_STORAGE_KEY, JSON.stringify(checkin));
}

export async function markBfSummaryGenerated(
  checkin: BfCheckin,
): Promise<BfCheckin> {
  const next = { ...checkin, generatedAt: new Date().toISOString() };
  await saveBfCheckin(next);
  return next;
}

export const BF_HIGHLIGHTS: string[] = [
  "Breastfeeding is a learned skill for both you and your baby — most mothers run into some kind of bump early on (a tricky latch, tender nipples, worries about supply), and almost all of these are fixable with small adjustments and the right support.",
  "ACOG recommends exclusive breastfeeding for about the first 6 months, continued breastfeeding alongside solid foods through the first year, and continuing for 2 years or beyond if desired. Any amount of breastfeeding is beneficial — the goal isn't perfection.",
  "Feed on demand, watching for hunger cues (sucking on hands, rooting) rather than waiting for a schedule. Newborns typically nurse 8–12 times in 24 hours.",
  "A good latch is the single most important thing to get right — it should tug but never pinch or hurt. If it hurts, unlatch and try again.",
  "Know your baby is getting enough milk by tracking wet diapers (6+ per day after the first few days), regular bowel movements, and steady weight gain — not by how many ounces you can see.",
  "Common challenges — sore nipples, engorgement, plugged ducts, and low-supply worries — are all common, temporary, and treatable. Mastitis (fever plus a red, painful area) needs a same-day call to your ob-gyn.",
  "You can absolutely continue breastfeeding after returning to work or school — federal law requires most employers to provide pumping breaks and a private space.",
];

export interface BfResource {
  name: string;
  detail: string;
  url?: string;
}

export const BF_CALLOUT_REASONS: string[] = [
  "Fever, chills, or flu-like symptoms",
  "A red, warm, or painful area on the breast",
  "Cracked, bleeding, or severely painful nipples",
  "A firm lump that does not go away with 24–48 hours of frequent nursing and massage",
  "Concern that your baby is not getting enough milk (few wet diapers, poor weight gain, hard to wake)",
  "Pain that is making you dread feedings, or feelings of sadness or hopelessness lasting more than 2 weeks",
  "Any question that is making you anxious, even if you're not sure it's a real problem",
];

export const BF_NATIONAL_RESOURCES: BfResource[] = [
  {
    name: "ACOG Patient FAQ — Breastfeeding Your Baby",
    detail: "acog.org/womens-health/faqs/breastfeeding-your-baby",
    url: "https://www.acog.org/womens-health/faqs/breastfeeding-your-baby",
  },
  {
    name: "National Breastfeeding Helpline (HRSA / Office on Women's Health)",
    detail:
      "Call 1-800-994-9662 (Mon–Fri, 8 a.m.–8 p.m. CT) — free, confidential, English & Spanish.",
  },
  {
    name: "La Leche League USA",
    detail: "24/7 peer support and local meetings — lllusa.org",
    url: "https://www.lllusa.org",
  },
  {
    name: "Find an IBCLC (Board-Certified Lactation Consultant)",
    detail: "uslca.org/resources/find-an-ibclc",
    url: "https://uslca.org/resources/find-an-ibclc",
  },
  {
    name: "LactMed — safety of medications while breastfeeding",
    detail: "ncbi.nlm.nih.gov/books/NBK501922",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK501922",
  },
];

export const BF_LOCAL_DIRECTORIES: BfResource[] = [
  {
    name: "La Leche League — Find a Local Group",
    detail:
      "lllusa.org/find-support — search by your zip code for nearby peer-support meetings and leaders.",
    url: "https://lllusa.org/find-support",
  },
  {
    name: "Find an IBCLC Near You",
    detail:
      "uslca.org/resources/find-an-ibclc — search the directory by your zip code for a board-certified lactation consultant near you.",
    url: "https://uslca.org/resources/find-an-ibclc",
  },
  {
    name: "WIC Breastfeeding Support",
    detail:
      "wicbreastfeeding.fns.usda.gov — enter your zip code to find your local WIC office, which offers free breastfeeding support and peer counselors.",
    url: "https://wicbreastfeeding.fns.usda.gov",
  },
  {
    name: "211",
    detail:
      "Call or text 211, or visit 211.org and enter your zip code for local health, lactation, and family support services.",
    url: "https://211.org",
  },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resourceListHtml(resources: BfResource[]): string {
  return resources
    .map(
      (r) =>
        `<div class="row"><span class="rname">${escapeHtml(r.name)}</span><span class="rdetail">${escapeHtml(r.detail)}</span></div>`,
    )
    .join("");
}

/**
 * Builds an HTML document summarizing breastfeeding highlights, when-to-call
 * guidance, and (if provided) a zip-personalized list of resource
 * directories, for use with expo-print to generate a PDF the patient can
 * save, print, or review with her provider.
 */
export function buildBreastfeedingResourceHtml(checkin: BfCheckin): string {
  const zip = checkin.zip?.trim();
  const highlightsHtml = BF_HIGHLIGHTS.map(
    (h) => `<li>${escapeHtml(h)}</li>`,
  ).join("");
  const calloutHtml = BF_CALLOUT_REASONS.map(
    (h) => `<li>${escapeHtml(h)}</li>`,
  ).join("");

  const localSectionHtml =
    checkin.wantsResources === "yes"
      ? `
        <h2>Local resources${zip ? ` near ${escapeHtml(zip)}` : ""}</h2>
        <p class="intro">These directories let you search by zip code${zip ? ` (yours: ${escapeHtml(zip)})` : ""} for lactation consultants, peer-support groups, and free breastfeeding help near you.</p>
        ${resourceListHtml(BF_LOCAL_DIRECTORIES)}
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
          .callout { border: 1.5px solid #b5651d; border-radius: 8px; padding: 12px 14px; margin-bottom: 18px; background: #fdf3ea; }
          .callout h2 { margin: 0 0 6px; font-size: 14px; color: #b5651d; border: none; padding: 0; }
          h2 { font-size: 15px; margin-top: 20px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
          .intro { font-size: 12px; color: #666; margin: 0 0 8px; }
          ul { margin: 0 0 8px; padding-left: 18px; font-size: 12.5px; line-height: 1.6; }
          .row { display: flex; flex-direction: column; gap: 1px; font-size: 12.5px; line-height: 1.5; padding: 5px 0; border-bottom: 1px dotted #eee; }
          .rname { font-weight: 600; }
          .rdetail { color: #444; }
          .footer { margin-top: 28px; font-size: 10px; color: #999; }
        </style>
      </head>
      <body>
        <h1>Breastfeeding — My Resource Summary</h1>
        <p class="sub">Based on ACOG patient guidance on breastfeeding. This is educational information, not a diagnosis or medical advice.</p>

        <div class="callout">
          <h2>Call your ob-gyn the same day if you notice</h2>
          <ul>${calloutHtml}</ul>
        </div>

        <h2>What to know</h2>
        <ul>${highlightsHtml}</ul>

        <h2>National support</h2>
        ${resourceListHtml(BF_NATIONAL_RESOURCES)}

        ${localSectionHtml}

        <p class="footer">Generated in the Pregnancy Assistant app. Not medical advice; always discuss questions about breastfeeding with your ob-gyn or a lactation consultant.</p>
      </body>
    </html>
  `;
}
