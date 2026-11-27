export type BirthPlanFieldType =
  | "text"
  | "textarea"
  | "boolean"
  | "single"
  | "multi";

export interface BirthPlanOption {
  value: string;
  label: string;
}

export interface BirthPlanField {
  id: string;
  label: string;
  type: BirthPlanFieldType;
  options?: BirthPlanOption[];
  placeholder?: string;
  helper?: string;
}

export interface BirthPlanSection {
  id: string;
  title: string;
  intro?: string;
  fields: BirthPlanField[];
}

export type BirthPlanValue = string | string[] | boolean | undefined;
export type BirthPlanAnswers = Record<string, BirthPlanValue>;

const BIRTH_PLAN_KEY = "pregnancy_birth_plan_v1";

export const BIRTH_PLAN_SECTIONS: BirthPlanSection[] = [
  {
    id: "about",
    title: "About You",
    fields: [
      { id: "yourName", label: "Your name", type: "text" },
      { id: "obGynName", label: "Name of your ob-gyn", type: "text" },
      {
        id: "babyDoctorName",
        label: "Name of your baby's doctor",
        type: "text",
      },
      {
        id: "childbirthPrep",
        label: "Type of childbirth preparation",
        type: "text",
        placeholder: "e.g. Lamaze class, hospital tour",
      },
    ],
  },
  {
    id: "labor",
    title: "Labor",
    intro: "Choose as many as you wish.",
    fields: [
      {
        id: "moveAroundDuringLabor",
        label: "I would like to be able to move around as I wish during labor.",
        type: "boolean",
      },
      {
        id: "drinkFluidsDuringLabor",
        label: "I would like to be able to drink fluids during labor.",
        type: "boolean",
      },
      {
        id: "ivPreference",
        label: "I prefer",
        type: "single",
        options: [
          { value: "iv", label: "An IV line for fluids and medications" },
          {
            value: "heparin_lock",
            label:
              "A heparin or saline lock (access to a vein without a fluid bag)",
          },
          { value: "no_preference", label: "I don't have a preference" },
        ],
      },
      {
        id: "peopleDuringLabor",
        label: "People I'd like with me during labor",
        type: "textarea",
        helper:
          "Check your hospital or birth center's policy on how many people may be in the room.",
      },
      {
        id: "traineesPresent",
        label:
          "OK for people in training (medical students or residents) to be present during labor and delivery?",
        type: "single",
        options: [
          { value: "ok", label: "It's OK" },
          { value: "not_ok", label: "Not OK" },
        ],
      },
      {
        id: "laborComfortOptions",
        label: "I'd like to try the following if available",
        type: "multi",
        options: [
          { value: "birthing_ball", label: "A birthing ball" },
          { value: "birthing_stool", label: "A birthing stool" },
          { value: "birthing_chair", label: "A birthing chair" },
          { value: "squat_bar", label: "A squat bar" },
          {
            value: "warm_shower_bath",
            label: "A warm shower or bath during labor",
          },
        ],
      },
      {
        id: "anesthesia",
        label: "Anesthesia options",
        type: "single",
        options: [
          {
            value: "none_unless_requested",
            label:
              "I do not want anesthesia offered unless I specifically request it.",
          },
          {
            value: "want_anesthesia",
            label: "I would like anesthesia. Please discuss the options.",
          },
          {
            value: "unsure",
            label: "I'm not sure. Please discuss the options with me.",
          },
        ],
      },
    ],
  },
  {
    id: "delivery",
    title: "Delivery",
    fields: [
      {
        id: "peopleDuringDelivery",
        label: "People I'd like with me during delivery",
        type: "textarea",
        helper: "Check your hospital or birth center's policy.",
      },
      {
        id: "avoidEpisiotomy",
        label: "I prefer to avoid an episiotomy unless necessary.",
        type: "boolean",
      },
      {
        id: "cordBloodStorage",
        label:
          "I have made prior arrangements for storing umbilical cord blood.",
        type: "boolean",
      },
      {
        id: "vaginalBirthOptions",
        label: "For a vaginal birth, I would like",
        type: "multi",
        options: [
          { value: "mirror", label: "To use a mirror to see the birth" },
          {
            value: "partner_support_pushing",
            label: "My labor partner to help support me during pushing",
          },
          {
            value: "quiet_room",
            label: "The room to be as quiet as possible",
          },
          {
            value: "support_cut_cord",
            label: "One of my support people to cut the umbilical cord",
          },
          { value: "dim_lights", label: "The lights to be dimmed" },
          {
            value: "video_photos",
            label: "A support person to take video or pictures of the birth",
          },
          {
            value: "baby_on_chest",
            label: "My baby put directly onto my chest after delivery",
          },
          {
            value: "early_breastfeeding",
            label: "To begin breastfeeding as soon as possible after birth",
          },
        ],
      },
      {
        id: "cesareanSupportPerson",
        label: "In the event of a cesarean, I'd like this person present",
        type: "text",
      },
      {
        id: "seeBabyBeforeEyeDrops",
        label: "I would like to see my baby before eye drops are given.",
        type: "boolean",
      },
      {
        id: "supportHoldBaby",
        label:
          "I would like a support person to hold the baby if I am not able to.",
        type: "boolean",
      },
      {
        id: "supportGoToNursery",
        label:
          "I would like a support person to go with my baby to the nursery.",
        type: "boolean",
      },
      {
        id: "supportKnowShots",
        label:
          "I would like my support person to know what shots my newborn receives.",
        type: "boolean",
      },
    ],
  },
  {
    id: "babyCare",
    title: "Baby Care Plan",
    fields: [
      {
        id: "feedingPlan",
        label: "Feeding the baby",
        type: "single",
        options: [
          { value: "breastfeed", label: "Breastfeed exclusively" },
          { value: "bottle", label: "Bottle-feed" },
          {
            value: "combination",
            label: "Combine breastfeeding and bottle-feeding",
          },
        ],
      },
      {
        id: "okToOffer",
        label: "It's OK to offer my baby",
        type: "multi",
        options: [
          { value: "pacifier", label: "A pacifier" },
          { value: "sugar_water", label: "Sugar water" },
          { value: "formula", label: "Formula" },
          { value: "none", label: "None of the above" },
        ],
      },
      {
        id: "roomingIn",
        label: "Nursery and rooming-in (if available)",
        type: "single",
        options: [
          {
            value: "room_always",
            label: "In my room with me at all times",
          },
          {
            value: "room_except_asleep",
            label: "In my room except when I am asleep",
          },
          {
            value: "nursery_for_feedings",
            label: "In the nursery but brought to me for feedings",
          },
          {
            value: "decide_later",
            label: "I don't know yet — decide after birth",
          },
        ],
      },
      {
        id: "circumcision",
        label:
          "If my baby is a boy, I would like him circumcised at the hospital or birth center.",
        type: "boolean",
      },
    ],
  },
];

export function loadBirthPlanAnswers(): BirthPlanAnswers {
  try {
    const raw = localStorage.getItem(BIRTH_PLAN_KEY);
    return raw ? (JSON.parse(raw) as BirthPlanAnswers) : {};
  } catch {
    return {};
  }
}

export function saveBirthPlanAnswers(answers: BirthPlanAnswers): void {
  localStorage.setItem(BIRTH_PLAN_KEY, JSON.stringify(answers));
}

function fieldAnswerText(field: BirthPlanField, value: BirthPlanValue): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field.type === "boolean") return value ? "Yes" : "No";
  if (field.type === "multi" && Array.isArray(value)) {
    if (!value.length) return "—";
    return value
      .map((v) => field.options?.find((o) => o.value === v)?.label ?? v)
      .join(", ");
  }
  if (field.type === "single" && typeof value === "string") {
    return field.options?.find((o) => o.value === value)?.label ?? value;
  }
  return String(value);
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildBirthPlanHtml(answers: BirthPlanAnswers): string {
  const sectionsHtml = BIRTH_PLAN_SECTIONS.map((section) => {
    const rows = section.fields
      .map(
        (field) =>
          `<div class="row"><span class="q">${escapeHtml(field.label)}</span><span class="a">${escapeHtml(fieldAnswerText(field, answers[field.id]))}</span></div>`,
      )
      .join("");
    return `<h2>${escapeHtml(section.title)}</h2>${section.intro ? `<p class="intro">${escapeHtml(section.intro)}</p>` : ""}${rows}`;
  }).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>My Birth Plan</title>
<style>
  body{font-family:-apple-system,Helvetica,Arial,sans-serif;padding:28px;color:#222;}
  h1{font-size:22px;margin-bottom:2px;}
  .sub{color:#666;font-size:12px;margin-bottom:20px;}
  h2{font-size:15px;margin-top:20px;margin-bottom:8px;border-bottom:1px solid #ddd;padding-bottom:4px;}
  .intro{font-size:12px;color:#666;margin:0 0 8px;}
  .row{display:flex;justify-content:space-between;gap:12px;font-size:12.5px;line-height:1.6;padding:3px 0;border-bottom:1px dotted #eee;}
  .q{flex:1.4;}
  .a{flex:1;font-weight:600;text-align:right;}
  .footer{margin-top:28px;font-size:10px;color:#999;}
</style>
</head><body>
<h1>My Birth Plan</h1>
<p class="sub">Based on the ACOG "Sample Birth Plan" patient education document. Review this with your ob-gyn well before your due date — unexpected things can happen, and your safest possible delivery is the shared goal.</p>
${sectionsHtml}
<p class="footer">Generated in the Pregnancy AI Assistant app. Not medical advice; discuss all preferences with your care team.</p>
</body></html>`;
}
