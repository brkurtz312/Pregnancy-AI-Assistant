export interface PainResource {
  name: string;
  detail: string;
}

export const PAIN_HIGHLIGHTS: string[] = [
  'There is no "right" way to get through labor. Asking for pain relief is reason enough to receive it — no particular amount of cervical dilation or pain is required, and using medication doesn\'t make labor "less natural" or raise your chance of a cesarean.',
  "Analgesia lessens pain but you can still feel sensation; anesthesia blocks feeling, including pain, in part or all of the body. You can start with movement and breathing and add nitrous oxide or an epidural later — you can change your mind at any point in labor.",
  "Non-medication coping includes movement and position changes, warm water or a shower on the low back, counter-pressure and massage, and slow breathing — continuous support from a partner or doula is linked to shorter labors and higher satisfaction.",
  'Nitrous oxide ("laughing gas") is a self-controlled mask you breathe in before a contraction and remove after — it eases anxiety and takes the edge off pain, is considered safe, and wears off within a minute or two.',
  "Systemic opioids (IV or injection) dull pain and are usually avoided within about an hour of expected delivery because they can slow the baby's breathing — a good option if an epidural isn't possible or isn't enough on its own.",
  "Epidurals, spinals, and combined spinal-epidurals (regional anesthesia) provide the most complete pain relief while you stay awake and alert. ACOG's 2024 guideline recommends offering neuraxial anesthesia for pain relief at any stage of labor.",
  "Common epidural side effects are usually mild and treatable (itching, shivering, a temporary blood pressure drop, patchy numbness); serious complications are rare. Epidurals do not cause long-term back pain, a higher cesarean rate, or autism.",
  "Modern low-dose epidurals do not increase your chance of a cesarean birth. They can lengthen the pushing stage slightly, but they don't change whether you have a vaginal birth.",
];

export const PAIN_TALK_EARLY: string[] = [
  "Bleeding disorders, or taking blood thinners",
  "Certain heart conditions",
  "Liver disease or serious kidney problems",
  "Previous back surgery, scoliosis, or spinal hardware",
  "Serious allergies to anesthetic or opioid medications",
  "A very low platelet count or an active skin infection over the low back",
  "Anxiety about needles, procedures, or a past traumatic birth — tell us, we can help",
];

export const PAIN_NATIONAL_RESOURCES: PainResource[] = [
  {
    name: "ACOG — Thinking About Childbirth Without Pain Medication",
    detail:
      "acog.org — patient article on preparing to labor without medication",
  },
  {
    name: "ACOG Explains: Inducing Labor (video)",
    detail: "acog.org/womens-health/videos/inducing-labor",
  },
  {
    name: "ACOG Explains: Postpartum Recovery (video)",
    detail: "acog.org/womens-health/videos/postpartum-recovery",
  },
  {
    name: "ACOG — Labor, Delivery, and Postpartum hub",
    detail: "acog.org/womens-health/pregnancy/labor-and-delivery",
  },
  {
    name: "Society for Obstetric Anesthesia & Perinatology (SOAP) — Information for Mothers",
    detail: "soap.org/information-for-mothers",
  },
  {
    name: "SOAP — Labor Epidurals: Your Questions Answered (patient PDF)",
    detail: "soap.org — labor epidurals: your questions answered",
  },
  {
    name: "The Painless Push (SOAP-endorsed patient site on labor epidurals)",
    detail: "thepainlesspush.com",
  },
  {
    name: "Babies After 35 — Pain Control During Labor and Delivery (podcast/video with OB & anesthesiologist)",
    detail: "babiesafter35.com — pain control during labor and delivery",
  },
  {
    name: "Patient-Education Animation — Labor and Vaginal Birth (Nucleus Medical Media)",
    detail: "youtube.com — labor and vaginal birth animation",
  },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resourceListHtml(resources: PainResource[]): string {
  return resources
    .map(
      (r) =>
        `<div class="row"><span class="rname">${escapeHtml(r.name)}</span><span class="rdetail">${escapeHtml(r.detail)}</span></div>`,
    )
    .join("");
}

/**
 * Builds an HTML document summarizing labor pain-relief highlights, health
 * conditions to flag early, and trusted resources, for use with expo-print
 * to generate a PDF the patient can save, print, or review with her provider.
 */
export function buildPainManagementResourceHtml(): string {
  const highlightsHtml = PAIN_HIGHLIGHTS.map(
    (h) => `<li>${escapeHtml(h)}</li>`,
  ).join("");
  const talkEarlyHtml = PAIN_TALK_EARLY.map(
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
          .callout { border: 1.5px solid #8a5fb3; border-radius: 8px; padding: 12px 14px; margin-bottom: 18px; background: #f3eefa; }
          .callout h2 { margin: 0 0 6px; font-size: 14px; color: #8a5fb3; border: none; padding: 0; }
          h2 { font-size: 15px; margin-top: 20px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
          ul { margin: 0 0 8px; padding-left: 18px; font-size: 12.5px; line-height: 1.6; }
          .row { display: flex; flex-direction: column; gap: 1px; font-size: 12.5px; line-height: 1.5; padding: 5px 0; border-bottom: 1px dotted #eee; }
          .rname { font-weight: 600; }
          .rdetail { color: #444; }
          .footer { margin-top: 28px; font-size: 10px; color: #999; }
        </style>
      </head>
      <body>
        <h1>Pain Management in Labor — My Resource Summary</h1>
        <p class="sub">Based on ACOG and SOAP patient guidance on pain relief during labor. This is educational information, not a diagnosis or medical advice.</p>

        <div class="callout">
          <h2>Talk to your care team early if any of these apply to you</h2>
          <ul>${talkEarlyHtml}</ul>
        </div>

        <h2>What to know</h2>
        <ul>${highlightsHtml}</ul>

        <h2>Trusted resources</h2>
        ${resourceListHtml(PAIN_NATIONAL_RESOURCES)}

        <p class="footer">Generated in the Pregnancy Assistant app. Not medical advice; always discuss your individual care with your ob-gyn.</p>
      </body>
    </html>
  `;
}
