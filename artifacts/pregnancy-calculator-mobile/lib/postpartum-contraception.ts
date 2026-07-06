export interface PcResource {
  name: string;
  detail: string;
}

export const PC_HIGHLIGHTS: string[] = [
  "You can get pregnant very soon after delivery — sometimes before your first period returns and often before you feel ready for another baby. Planning a method ahead of time, ideally while still pregnant, gives you control over your timing.",
  "ACOG recommends waiting at least 18 months between pregnancies for the best health outcomes for you and your next baby — a short interval under 6 months raises the risk of preterm birth and low birth weight.",
  "If you're not breastfeeding, ovulation can happen as early as 3 weeks after delivery. If you're breastfeeding, it's often delayed but usually returns by about 6 months — either way, ovulation happens before your first period.",
  "All birth control methods are considered safe while breastfeeding. Only estrogen-containing methods (the combined pill, patch, and ring) are best delayed a few weeks so they don't affect your milk supply while it's getting established.",
  "IUDs and the implant (LARC) are the most effective reversible options — over 99% effective — and can often be placed right after delivery, before you leave the hospital.",
  "Progestin-only pills and the Depo-Provera shot are safe to start right away, even while breastfeeding. Combined estrogen methods should wait 3 weeks (not breastfeeding) or 4–6 weeks (breastfeeding).",
  "Sterilization (tubal ligation or vasectomy) is permanent — if there's any chance you might want another pregnancy later, a LARC method (IUD or implant) is just as effective and fully reversible.",
  "Emergency contraception (levonorgestrel pill, ella, or a copper IUD) can prevent pregnancy after unprotected sex or a method failure — call your ob-gyn right away if you think you need it, don't wait.",
];

export const PC_CALLOUT_REASONS: string[] = [
  "Sudden severe pain in your chest, leg, or belly, or trouble breathing (possible blood clot)",
  "Severe headache, sudden vision changes, weakness or numbness on one side",
  "Heavy vaginal bleeding — soaking a pad an hour for 2 hours in a row",
  "Fever above 100.4°F (38°C), chills, or foul-smelling vaginal discharge",
  "Missing IUD strings, or feeling the IUD in the vagina or cervix",
  "You think your method has failed and you may be pregnant",
];

export const PC_NATIONAL_RESOURCES: PcResource[] = [
  {
    name: "ACOG Patient FAQ — Postpartum Birth Control",
    detail: "acog.org/womens-health/faqs/postpartum-birth-control",
  },
  {
    name: "ACOG Patient FAQ — Birth Control (all methods)",
    detail: "acog.org/womens-health/faqs/birth-control",
  },
  {
    name: "ACOG Patient FAQ — Sterilization for Women and Men",
    detail: "acog.org/womens-health/faqs/sterilization-for-women-and-men",
  },
  {
    name: "Bedsider — independent method finder",
    detail:
      "bedsider.org — compare methods side by side and find a clinic near you.",
  },
  {
    name: "Reproductive Health National Training Center",
    detail: "rhntc.org",
  },
  {
    name: "Your ob-gyn office",
    detail:
      "Call any time you have a question — do not wait for your next visit.",
  },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resourceListHtml(resources: PcResource[]): string {
  return resources
    .map(
      (r) =>
        `<div class="row"><span class="rname">${escapeHtml(r.name)}</span><span class="rdetail">${escapeHtml(r.detail)}</span></div>`,
    )
    .join("");
}

/**
 * Builds an HTML document summarizing postpartum contraception highlights,
 * when-to-call guidance, and trusted resources, for use with expo-print to
 * generate a PDF the patient can save, print, or review with her provider.
 */
export function buildContraceptionResourceHtml(): string {
  const highlightsHtml = PC_HIGHLIGHTS.map(
    (h) => `<li>${escapeHtml(h)}</li>`,
  ).join("");
  const calloutHtml = PC_CALLOUT_REASONS.map(
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
          .callout { border: 1.5px solid #6a4fa0; border-radius: 8px; padding: 12px 14px; margin-bottom: 18px; background: #f4f0fb; }
          .callout h2 { margin: 0 0 6px; font-size: 14px; color: #6a4fa0; border: none; padding: 0; }
          h2 { font-size: 15px; margin-top: 20px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
          ul { margin: 0 0 8px; padding-left: 18px; font-size: 12.5px; line-height: 1.6; }
          .row { display: flex; flex-direction: column; gap: 1px; font-size: 12.5px; line-height: 1.5; padding: 5px 0; border-bottom: 1px dotted #eee; }
          .rname { font-weight: 600; }
          .rdetail { color: #444; }
          .footer { margin-top: 28px; font-size: 10px; color: #999; }
        </style>
      </head>
      <body>
        <h1>Postpartum Contraception — My Resource Summary</h1>
        <p class="sub">Based on ACOG patient guidance on birth control after delivery. This is educational information, not a diagnosis or medical advice.</p>

        <div class="callout">
          <h2>Call the office right away if you notice</h2>
          <ul>${calloutHtml}</ul>
        </div>

        <h2>What to know</h2>
        <ul>${highlightsHtml}</ul>

        <h2>Trusted resources</h2>
        ${resourceListHtml(PC_NATIONAL_RESOURCES)}

        <p class="footer">Generated in the Pregnancy Assistant app. Not medical advice; always discuss your contraception plan with your ob-gyn.</p>
      </body>
    </html>
  `;
}
