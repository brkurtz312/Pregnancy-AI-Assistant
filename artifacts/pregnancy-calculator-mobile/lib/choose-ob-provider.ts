export interface ObProviderResource {
  name: string;
  detail: string;
  url?: string;
}

export const OB_PROVIDER_HIGHLIGHTS: string[] = [
  "Obstetrician–Gynecologist (ob-gyn): a medical doctor (MD or DO) with 4 years of medical school plus a 4-year residency in obstetrics and gynecology, board-certified by the American Board of Obstetrics and Gynecology (ABOG). Ob-gyns handle average- and high-risk pregnancy, vaginal and cesarean delivery, and complications — required if you may need a cesarean or develop complications.",
  "Maternal–Fetal Medicine (MFM) specialist: an ob-gyn with an additional 2–3 year fellowship in high-risk pregnancy. Most patients keep their regular ob-gyn and add an MFM to the team for conditions like diabetes, high blood pressure, prior serious complications, multiples, or fetal concerns.",
  "Family medicine doctor (with obstetric training): provides prenatal visits and vaginal delivery for uncomplicated pregnancies, often continuing to care for the baby afterward — a good fit if an ob-gyn is available for backup and cesarean delivery. Ask directly whether they attend deliveries or refer out.",
  'Midwives care for average-risk pregnancy through labor, delivery, and postpartum, usually as part of a team with ob-gyns. Not all midwifery credentials are equivalent: ACOG supports Certified Nurse-Midwives (CNMs) and Certified Midwives (CMs), both certified by the American Midwifery Certification Board (AMCB), and endorses the International Confederation of Midwives (ICM) Global Standards as the minimum baseline. ACOG does not support midwives who don\'t meet these standards, including uncertified or "lay" midwives.',
  "Physician backup matters. Even a healthy pregnancy can turn quickly, so know: who covers when your provider is off duty, which hospital they deliver at, whether an ob-gyn is immediately available for emergencies, and — for home or birth-center plans — whether there's a written transfer arrangement with a hospital.",
  "The delivery facility matters as much as the provider. Hospitals are rated in four levels of maternal care (Level I–IV) based on capability. Ask about 24/7 anesthesia, NICU level, on-call MFM availability, and policies on labor support, VBAC, and family-centered cesarean.",
  "To find a provider: ask your primary care doctor or trusted people you know for recommendations, use your insurance plan's \"find a doctor\" tool to confirm in-network status, check your preferred hospital's provider directory, or — for high-risk pregnancy — use the Society for Maternal-Fetal Medicine's specialist directory.",
  "Quick matching guide: healthy average-risk pregnancy → ob-gyn, family medicine doctor, or CNM/CM with ob-gyn backup. Prior cesarean hoping for VBAC, a medical condition, multiples, or a prior serious complication → an ob-gyn, usually with MFM consultation or co-management.",
];

export const OB_PROVIDER_QUESTIONS: string[] = [
  "What are your training and credentials, and are you board-certified (ABOG for ob-gyns; AMCB or ICM standards for midwives)?",
  "How many people are in your call group, and might I see someone else at delivery?",
  "Which hospital do you deliver at, and what level of maternal care does it provide?",
  "For a midwife or family medicine provider: who is your backup ob-gyn, and how quickly can an emergency cesarean be started?",
  "Is there 24/7 anesthesia, a NICU, and an MFM specialist available if needed?",
  "How do you feel about a birth plan, doula involvement, VBAC, or family-centered cesarean?",
  "What is your cesarean rate, and when do you typically recommend one?",
  "Can I take a tour of the labor-and-delivery unit?",
];

export const OB_PROVIDER_RESOURCES: ObProviderResource[] = [
  {
    name: "ACOG — Prenatal Care (patient FAQ)",
    detail: "acog.org/womens-health/faqs/prenatal-care",
    url: "https://www.acog.org/womens-health/faqs/prenatal-care",
  },
  {
    name: "ACOG — Find an Ob-Gyn",
    detail: "acog.org/womens-health/find-an-ob-gyn",
    url: "https://www.acog.org/womens-health/find-an-ob-gyn",
  },
  {
    name: "ACOG — Midwifery Policy & Positions",
    detail: "acog.org/advocacy/policy-priorities/midwifery",
    url: "https://www.acog.org/advocacy/policy-priorities/midwifery",
  },
  {
    name: "SMFM — Find an MFM Specialist",
    detail: "smfm.org · directory linked from ACOG's Find an Ob-Gyn page",
    url: "https://www.smfm.org",
  },
  {
    name: "American Midwifery Certification Board (AMCB) — verify a CNM or CM",
    detail: "amcbmidwife.org",
    url: "https://www.amcbmidwife.org",
  },
  {
    name: "Your ob-gyn office",
    detail:
      "Call any time — questions about who to see are part of your prenatal care.",
  },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resourceListHtml(resources: ObProviderResource[]): string {
  return resources
    .map(
      (r) =>
        `<div class="row"><span class="rname">${escapeHtml(r.name)}</span><span class="rdetail">${escapeHtml(r.detail)}</span></div>`,
    )
    .join("");
}

/**
 * Builds an HTML document summarizing how to choose an ob-gyn provider,
 * good questions to ask, and trusted resources, for use with expo-print
 * to generate a PDF the patient can save, print, or review.
 */
export function buildObProviderResourceHtml(): string {
  const highlightsHtml = OB_PROVIDER_HIGHLIGHTS.map(
    (h) => `<li>${escapeHtml(h)}</li>`,
  ).join("");
  const questionsHtml = OB_PROVIDER_QUESTIONS.map(
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
          .callout { border: 1.5px solid #3f7ab5; border-radius: 8px; padding: 12px 14px; margin-bottom: 18px; background: #eef4fa; }
          .callout h2 { margin: 0 0 6px; font-size: 14px; color: #3f7ab5; border: none; padding: 0; }
          h2 { font-size: 15px; margin-top: 20px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
          ul { margin: 0 0 8px; padding-left: 18px; font-size: 12.5px; line-height: 1.6; }
          .row { display: flex; flex-direction: column; gap: 1px; font-size: 12.5px; line-height: 1.5; padding: 5px 0; border-bottom: 1px dotted #eee; }
          .rname { font-weight: 600; }
          .rdetail { color: #444; }
          .footer { margin-top: 28px; font-size: 10px; color: #999; }
        </style>
      </head>
      <body>
        <h1>Choosing an OB Provider — My Resource Summary</h1>
        <p class="sub">Based on ACOG patient guidance on choosing a pregnancy provider. This is educational information, not medical advice.</p>

        <div class="callout">
          <h2>Good questions to ask a potential provider</h2>
          <ul>${questionsHtml}</ul>
        </div>

        <h2>What to know</h2>
        <ul>${highlightsHtml}</ul>

        <h2>Trusted resources</h2>
        ${resourceListHtml(OB_PROVIDER_RESOURCES)}

        <p class="footer">Generated in the Pregnancy Assistant app. Not medical advice; always discuss your individual care with your ob-gyn.</p>
      </body>
    </html>
  `;
}
