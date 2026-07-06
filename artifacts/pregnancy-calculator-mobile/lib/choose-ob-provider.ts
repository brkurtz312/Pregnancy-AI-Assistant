export interface ObProviderResource {
  name: string;
  detail: string;
  url?: string;
}

export const OB_PROVIDER_HIGHLIGHTS: string[] = [
  "Ob-gyns are physicians trained in both routine and high-risk pregnancy, labor, and surgery (including cesareans). They're a good fit if you have a medical condition, a prior complicated pregnancy, or want one clinician who can handle anything that comes up.",
  "Certified nurse-midwives (CNMs) are advanced-practice clinicians who specialize in low-risk pregnancy and birth, often with more time per visit and a strong focus on unmedicated or minimal-intervention labor. They partner with an ob-gyn for backup if complications arise.",
  "Family medicine physicians can provide prenatal care and, in some practices, attend deliveries — a good option if you'd like the same doctor to also care for your baby after birth.",
  "Maternal-fetal medicine (MFM) specialists are ob-gyns with extra training in high-risk pregnancy. You may see one for a portion of your care (a consult or co-managed visits) if you have a health condition, are carrying multiples, or a scan shows a concern — you don't need to choose between MFM and your regular provider.",
  "Check that the provider is in-network with your insurance and delivers at a hospital or birth center that's covered and reasonably close to home.",
  "Ask who covers for your provider when they're off duty, and how many other clinicians in the practice you might meet before delivery — many practices rotate coverage, so you could be delivered by someone other than your usual provider.",
  "Notice how the practice communicates: do they answer questions thoroughly, respect your birth preferences, and make you feel heard? A good fit matters as much as credentials, since you'll be seeing this person regularly for months.",
  "It's okay to switch providers during pregnancy if something isn't working — most records transfer easily, especially early on.",
];

export const OB_PROVIDER_QUESTIONS: string[] = [
  "What's your philosophy on labor interventions, pain relief, and cesareans?",
  "How many other providers are in your practice, and could any of them deliver my baby instead of you?",
  "Which hospital or birth center do you deliver at, and is it in-network?",
  "How do you handle after-hours questions or emergencies?",
  "What's a typical visit schedule, and how much time is spent with me at each visit?",
  "Do you support a birth plan, doula involvement, or specific requests like delayed cord clamping?",
  "How do you coordinate with a maternal-fetal medicine specialist if a complication comes up?",
];

export const OB_PROVIDER_RESOURCES: ObProviderResource[] = [
  {
    name: "ACOG Patient FAQ — Having a Baby: Choosing Your Health Care Provider",
    detail: "acog.org/womens-health/faqs/having-a-baby",
    url: "https://www.acog.org/womens-health/faqs/having-a-baby",
  },
  {
    name: "ACOG — Find an Ob-Gyn",
    detail: "acog.org/find-an-ob-gyn",
    url: "https://www.acog.org/find-an-ob-gyn",
  },
  {
    name: "American College of Nurse-Midwives — Find a Midwife",
    detail: "midwife.org/find-a-midwife",
    url: "https://www.midwife.org/find-a-midwife",
  },
  {
    name: "Your insurance plan directory",
    detail:
      "Confirm in-network status and covered hospitals before your first visit.",
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
        <p class="sub">Educational information to help you evaluate prenatal care providers. This is not medical advice.</p>

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
