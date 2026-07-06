export interface IadResource {
  name: string;
  detail: string;
}

export const IAD_HIGHLIGHTS: string[] = [
  "There's no single right time to resume sex. Many ob-gyns suggest waiting about 6 weeks after either a vaginal or cesarean birth, so bleeding can stop and healing can finish — but your body sets the real timeline.",
  "About 57% of women are sexually active again by 6 weeks postpartum — but many wait longer, and that's just as normal. Your postpartum visit is the ideal time to check healing and confirm you're ready.",
  "Lower desire, vaginal dryness, and some discomfort at first are all expected — not signs something is wrong. About 4 in 10 women have pain with sex at 3 months postpartum, improving for almost everyone over time.",
  "Vaginal dryness is common while breastfeeding, since estrogen drops and reduces natural lubrication. Lubricant, vaginal moisturizers, longer foreplay, and (if needed) low-dose vaginal estrogen all help.",
  "Pain with sex (dyspareunia) is common and almost always treatable — pelvic floor physical therapy is one of the most effective treatments. Please tell your ob-gyn; it's a normal part of postpartum care to discuss.",
  "You don't have to jump to intercourse. Cuddling, kissing, massage, and other closeness are all valid ways to reconnect while your body keeps healing.",
  "You can get pregnant before your first postpartum period — sometimes as early as 3 weeks if not breastfeeding. Have a birth control plan in place before resuming sex.",
  "Low desire, feeling disconnected, or crying during/after sex can sometimes signal postpartum depression or anxiety. This is worth mentioning to your ob-gyn — effective help is available.",
];

export const IAD_CALLOUT_REASONS: string[] = [
  "You're still bleeding heavily or passing clots",
  "Stitches or a cesarean incision feel painful, red, warm, or are draining",
  "You have a fever, foul-smelling discharge, or belly pain",
  "You had a significant tear or repair that hasn't been checked yet",
  "You simply feel unsure — a quick call can put your mind at ease",
];

export const IAD_NATIONAL_RESOURCES: IadResource[] = [
  {
    name: "ACOG Patient FAQ — Your Sexual Health",
    detail: "acog.org/womens-health/faqs/your-sexual-health",
  },
  {
    name: "ACOG — A Partner's Guide to Pregnancy",
    detail: "acog.org/womens-health/faqs/a-partners-guide-to-pregnancy",
  },
  {
    name: "ACOG — Postpartum Birth Control",
    detail: "acog.org/womens-health/faqs/postpartum-birth-control",
  },
  {
    name: "Postpartum Support International",
    detail:
      'Helpline 1-800-944-4773 · text "HELP" to 800-944-4773 · postpartum.net',
  },
  {
    name: "Find a pelvic floor physical therapist",
    detail: "ptl.womenshealthapta.org",
  },
  {
    name: "AASECT — find a certified sex therapist",
    detail: "aasect.org/referral-directory",
  },
  {
    name: "Your ob-gyn office",
    detail: "Call any time — sexual health is part of your postpartum care.",
  },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resourceListHtml(resources: IadResource[]): string {
  return resources
    .map(
      (r) =>
        `<div class="row"><span class="rname">${escapeHtml(r.name)}</span><span class="rdetail">${escapeHtml(r.detail)}</span></div>`,
    )
    .join("");
}

/**
 * Builds an HTML document summarizing intimacy-after-delivery highlights,
 * when-to-call guidance, and trusted resources, for use with expo-print to
 * generate a PDF the patient can save, print, or review with her provider.
 */
export function buildIntimacyResourceHtml(): string {
  const highlightsHtml = IAD_HIGHLIGHTS.map(
    (h) => `<li>${escapeHtml(h)}</li>`,
  ).join("");
  const calloutHtml = IAD_CALLOUT_REASONS.map(
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
          .callout { border: 1.5px solid #b5548a; border-radius: 8px; padding: 12px 14px; margin-bottom: 18px; background: #fbeff5; }
          .callout h2 { margin: 0 0 6px; font-size: 14px; color: #b5548a; border: none; padding: 0; }
          h2 { font-size: 15px; margin-top: 20px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
          ul { margin: 0 0 8px; padding-left: 18px; font-size: 12.5px; line-height: 1.6; }
          .row { display: flex; flex-direction: column; gap: 1px; font-size: 12.5px; line-height: 1.5; padding: 5px 0; border-bottom: 1px dotted #eee; }
          .rname { font-weight: 600; }
          .rdetail { color: #444; }
          .footer { margin-top: 28px; font-size: 10px; color: #999; }
        </style>
      </head>
      <body>
        <h1>Intimacy After Delivery — My Resource Summary</h1>
        <p class="sub">Based on ACOG patient guidance on sex and intimacy after birth. This is educational information, not a diagnosis or medical advice.</p>

        <div class="callout">
          <h2>Call before resuming sex if</h2>
          <ul>${calloutHtml}</ul>
        </div>

        <h2>What to know</h2>
        <ul>${highlightsHtml}</ul>

        <h2>Trusted resources</h2>
        ${resourceListHtml(IAD_NATIONAL_RESOURCES)}

        <p class="footer">Generated in the Pregnancy Assistant app. Not medical advice; always discuss your individual care with your ob-gyn.</p>
      </body>
    </html>
  `;
}
