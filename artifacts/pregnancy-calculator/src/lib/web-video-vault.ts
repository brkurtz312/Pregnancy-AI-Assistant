export interface VideoVaultVideo {
  title: string;
  url: string;
  source: string;
  language?: string;
  verified: boolean;
}

export interface VideoVaultTopic {
  id: string;
  number: number;
  title: string;
  icon: string;
  videos: VideoVaultVideo[];
}

function yt(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}
function ytSearch(q: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}
function ytChannel(handle: string): string {
  return `https://www.youtube.com/@${handle}`;
}
function ytPlaylist(id: string): string {
  return `https://www.youtube.com/playlist?list=${id}`;
}

export const VIDEO_VAULT_TOPICS: VideoVaultTopic[] = [
  {
    id: "fetal-development",
    number: 1,
    title: "Fetal Development Month by Month",
    icon: "🌱",
    videos: [
      { title: "How Your Baby Grows — Month 1", url: ytSearch("March of Dimes How Your Baby Grows Month 1"), source: "March of Dimes", verified: false },
      { title: "How Your Baby Grows — Month 2", url: yt("txYJDGKNauw"), source: "March of Dimes", verified: true },
      { title: "How Your Baby Grows — Month 3", url: yt("3yHptMXSJY0"), source: "March of Dimes", verified: true },
      { title: "How Your Baby Grows — Month 4", url: yt("UOkFP2hb_YU"), source: "March of Dimes", verified: true },
      { title: "How Your Baby Grows — Month 5", url: yt("YCsne3IrhJ8"), source: "March of Dimes", verified: true },
      { title: "How Your Baby Grows — Month 6", url: yt("1s3E0LL8pVo"), source: "March of Dimes", verified: true },
      { title: "How Your Baby Grows — Month 7", url: ytSearch("March of Dimes How Your Baby Grows Month 7"), source: "March of Dimes", verified: false },
      { title: "How Your Baby Grows — Month 8", url: ytSearch("March of Dimes How Your Baby Grows Month 8"), source: "March of Dimes", verified: false },
      { title: "How Your Baby Grows — Month 9", url: yt("ynWnRBUDJeA"), source: "March of Dimes", verified: true },
      { title: "Cómo crece su bebé — Mes 1 (Spanish)", url: yt("waAD9VomuA8"), source: "March of Dimes", language: "Spanish", verified: true },
      { title: "Cómo crece su bebé — Mes 2–8 (Spanish)", url: ytChannel("marchofdimes"), source: "March of Dimes", language: "Spanish", verified: false },
    ],
  },
  {
    id: "preconception",
    number: 2,
    title: "Preconception & Early Pregnancy",
    icon: "🤰",
    videos: [
      { title: "Ovulation and Pregnancy", url: ytSearch("March of Dimes Ovulation and Pregnancy"), source: "March of Dimes", verified: false },
      { title: "La Ovulación (Spanish)", url: ytSearch("March of Dimes La Ovulación embarazo"), source: "March of Dimes", language: "Spanish", verified: false },
      { title: "Your First Trimester", url: ytSearch("AAP Your First Trimester pregnancy"), source: "AAP", verified: false },
      { title: "The Road to Babyville", url: ytSearch("NICHD Road to Babyville pregnancy"), source: "NICHD", verified: false },
      { title: "ACOG Explains: Infertility Tests and Treatment", url: ytSearch("ACOG Explains Infertility Tests Treatment"), source: "ACOG", verified: false },
    ],
  },
  {
    id: "prenatal-care",
    number: 3,
    title: "Prenatal Care & Healthy Pregnancy",
    icon: "💊",
    videos: [
      { title: "Healthy Pregnancy Tips", url: ytSearch("CDC Healthy Pregnancy Tips"), source: "CDC", verified: false },
      { title: "Folic Acid and You — Your Healthy Pregnancy", url: ytSearch("CDC Folic Acid Your Healthy Pregnancy"), source: "CDC", verified: false },
      { title: "Exercise During Pregnancy", url: ytSearch("March of Dimes Exercise During Pregnancy"), source: "March of Dimes", verified: false },
      { title: "Term Talk — The New Definition of Full-Term Pregnancy", url: ytSearch("NICHD Term Talk New Definition Full-Term Pregnancy"), source: "NICHD", verified: false },
      { title: "ACOG Explains: Prenatal Genetic Testing", url: yt("MhWpmZIsZxw"), source: "ACOG", verified: true },
      { title: "ACOG explica: Pruebas genéticas prenatales (Spanish)", url: yt("tLhdxFDqEHI"), source: "ACOG", language: "Spanish", verified: true },
      { title: "Anatomy Ultrasound", url: ytSearch("SMFM Anatomy Ultrasound pregnancy patient"), source: "SMFM", verified: false },
    ],
  },
  {
    id: "vaccines",
    number: 4,
    title: "Vaccines in Pregnancy",
    icon: "💉",
    videos: [
      { title: "ACOG Explains: Vaccines During Pregnancy", url: yt("JhiC8nJPXiU"), source: "ACOG", verified: true },
      { title: "ACOG explica: Vacunas durante el embarazo (Spanish)", url: ytSearch("ACOG explica Vacunas durante el embarazo"), source: "ACOG", language: "Spanish", verified: false },
      { title: "Get Your Recommended Vaccines During Pregnancy", url: ytSearch("ACOG Get Your Recommended Vaccines During Pregnancy"), source: "ACOG", verified: false },
      { title: "Recommended Flu Vaccine During Pregnancy", url: ytSearch("ACOG Recommended Flu Vaccine During Pregnancy"), source: "ACOG", verified: false },
      { title: "Recommended Tdap Vaccine During Pregnancy", url: ytSearch("ACOG Recommended Tdap Vaccine During Pregnancy"), source: "ACOG", verified: false },
      { title: "Recommended COVID-19 Vaccine During Pregnancy", url: ytSearch("ACOG Recommended COVID-19 Vaccine During Pregnancy"), source: "ACOG", verified: false },
      { title: "Vacuna COVID-19 durante el embarazo (Spanish)", url: ytSearch("ACOG Vacuna COVID-19 durante el embarazo"), source: "ACOG", language: "Spanish", verified: false },
      { title: "Vaccinations During Pregnancy", url: ytSearch("SMFM Vaccinations During Pregnancy patient"), source: "SMFM", verified: false },
      { title: "Vaccinating Pregnant Women Protects Moms and Babies", url: ytSearch("CDC Vaccinating Pregnant Women Protects Moms Babies"), source: "CDC", verified: false },
      { title: "Pregnant? Help Protect Your Baby from Whooping Cough", url: ytSearch("CDC Pregnant Help Protect Baby Whooping Cough"), source: "CDC", verified: false },
      { title: "Flu Vaccine Information for Pregnant Women and Children", url: ytSearch("CDC Flu Vaccine Information Pregnant Women Children"), source: "CDC", verified: false },
      { title: "Maternal RSV Vaccine: What Patients Need to Know", url: yt("JDtpNu0-Ruw"), source: "SMFM", verified: true },
      { title: "Vacuna materna contra el RSV (Spanish)", url: ytSearch("SMFM Vacuna materna RSV pacientes"), source: "SMFM", language: "Spanish", verified: false },
      { title: "Maternal RSV Vaccine Safety", url: ytSearch("SMFM Maternal RSV Vaccine Safety"), source: "SMFM", verified: false },
      { title: "RSV Vaccine Safety (Spanish)", url: ytSearch("SMFM Vacuna RSV seguridad Spanish"), source: "SMFM", language: "Spanish", verified: false },
      { title: "Maternal RSV Vaccine Timing", url: ytSearch("SMFM Maternal RSV Vaccine Timing"), source: "SMFM", verified: false },
      { title: "RSV Vaccine Timing (Spanish)", url: ytSearch("SMFM Vacuna RSV momento Spanish"), source: "SMFM", language: "Spanish", verified: false },
      { title: "Maternal RSV Vaccine (overview)", url: ytSearch("SMFM Maternal RSV Vaccine overview patient"), source: "SMFM", verified: false },
    ],
  },
  {
    id: "infections",
    number: 5,
    title: "Infections in Pregnancy",
    icon: "🦠",
    videos: [
      { title: "ACOG Explains: Preventing Infections in Pregnancy", url: ytSearch("ACOG Explains Preventing Infections in Pregnancy"), source: "ACOG", verified: false },
    ],
  },
  {
    id: "hypertension",
    number: 6,
    title: "Hypertension & Preeclampsia",
    icon: "🩺",
    videos: [
      { title: "Taking Accurate Blood Pressure Readings", url: ytSearch("SMFM Taking Accurate Blood Pressure Readings pregnancy"), source: "SMFM", verified: false },
      { title: "Toma precisa de la presión arterial (Spanish)", url: ytSearch("SMFM Toma precisa presión arterial embarazo"), source: "SMFM", language: "Spanish", verified: false },
      { title: "Blood Pressure Readings (Chinese subtitles)", url: ytSearch("SMFM Blood Pressure Readings pregnancy Chinese subtitles"), source: "SMFM", verified: false },
      { title: "Blood Pressure Readings (Korean subtitles)", url: ytSearch("SMFM Blood Pressure Readings pregnancy Korean subtitles"), source: "SMFM", verified: false },
      { title: "Blood Pressure Readings (Tagalog subtitles)", url: ytSearch("SMFM Blood Pressure Readings pregnancy Tagalog subtitles"), source: "SMFM", verified: false },
      { title: "Blood Pressure Readings (Vietnamese subtitles)", url: ytSearch("SMFM Blood Pressure Readings pregnancy Vietnamese subtitles"), source: "SMFM", verified: false },
      { title: "Taking BP to Act Quickly & Advocate for You and Your Baby", url: ytSearch("SMFM blood pressure act quickly advocate pregnancy"), source: "SMFM", verified: false },
      { title: "Actuar rápido y abogar por usted y su bebé (Spanish)", url: ytSearch("SMFM actuar rápido abogar presión arterial embarazo"), source: "SMFM", language: "Spanish", verified: false },
      { title: "High BP with Symptoms & Seeking Immediate Medical Help", url: ytSearch("SMFM High Blood Pressure Symptoms Seeking Medical Help pregnancy"), source: "SMFM", verified: false },
      { title: "High BP with Symptoms & Seeking Help (Spanish)", url: ytSearch("SMFM alta presión síntomas ayuda médica embarazo"), source: "SMFM", language: "Spanish", verified: false },
    ],
  },
  {
    id: "bleeding-preterm",
    number: 7,
    title: "Bleeding, Preterm Labor & Warning Signs",
    icon: "⚠️",
    videos: [
      { title: "Bleeding and Spotting During Pregnancy", url: ytSearch("March of Dimes Bleeding Spotting During Pregnancy"), source: "March of Dimes", verified: false },
      { title: "Sangrado y manchado — primer trimestre (Spanish)", url: ytSearch("March of Dimes Sangrado manchado primer trimestre"), source: "March of Dimes", language: "Spanish", verified: false },
      { title: "Señales del Parto Prematuro (Spanish)", url: ytSearch("March of Dimes Señales Parto Prematuro"), source: "March of Dimes", language: "Spanish", verified: false },
    ],
  },
  {
    id: "mental-health",
    number: 8,
    title: "Mental Health in Pregnancy",
    icon: "🧠",
    videos: [
      { title: "ACOG Explains: Mental Health and Pregnancy", url: yt("0WCwC-3nTdg"), source: "ACOG", verified: true },
      { title: "ACOG explica: Salud mental y embarazo (Spanish)", url: ytSearch("ACOG explica Salud mental embarazo"), source: "ACOG", language: "Spanish", verified: false },
    ],
  },
  {
    id: "medications",
    number: 9,
    title: "Medications & Exposures",
    icon: "🧪",
    videos: [
      { title: "Acetaminophen Use in Breastfeeding (Ep. 38)", url: ytSearch("MotherToBaby podcast Acetaminophen Breastfeeding episode 38"), source: "MotherToBaby", verified: false },
      { title: "Postpartum Depression & Anxiety Medications (Ep. 42)", url: ytSearch("MotherToBaby podcast Postpartum Depression Anxiety Medications episode 42"), source: "MotherToBaby", verified: false },
      { title: "Melatonin in Pregnancy and Breastfeeding (Ep. 43)", url: ytSearch("MotherToBaby podcast Melatonin Pregnancy Breastfeeding episode 43"), source: "MotherToBaby", verified: false },
      { title: "Yeast Infection Treatments During Pregnancy (Ep. 44)", url: yt("ZLrYnWXH8zI"), source: "MotherToBaby", verified: true },
      { title: "GLP-1 Medications in Pregnancy and Breastfeeding (Ep. 84)", url: yt("S48rxTI-T84"), source: "MotherToBaby", verified: true },
      { title: "Alcohol During Breastfeeding", url: ytSearch("MotherToBaby Alcohol During Breastfeeding"), source: "MotherToBaby", verified: false },
      { title: "Lead and Pregnancy/Breastfeeding", url: ytSearch("MotherToBaby Lead Pregnancy Breastfeeding"), source: "MotherToBaby", verified: false },
      { title: "COVID-19 in Pregnancy (2023)", url: ytSearch("MotherToBaby COVID-19 Pregnancy 2023"), source: "MotherToBaby", verified: false },
      { title: "COVID-19 Vaccines in Pregnancy & Breastfeeding — FAQs", url: ytSearch("MotherToBaby COVID-19 Vaccines Pregnancy Breastfeeding FAQs"), source: "MotherToBaby", verified: false },
      { title: "MotherToBaby Pregnancy Studies Overview", url: ytSearch("MotherToBaby Pregnancy Studies overview"), source: "MotherToBaby", verified: false },
    ],
  },
  {
    id: "labor-delivery",
    number: 10,
    title: "Labor & Delivery",
    icon: "🏥",
    videos: [
      { title: "The 3 Stages of Labor", url: ytSearch("NICHD The 3 Stages of Labor"), source: "NICHD", verified: false },
      { title: "Las 3 etapas del trabajo de parto (Spanish)", url: ytSearch("NICHD Las 3 etapas del trabajo de parto"), source: "NICHD", language: "Spanish", verified: false },
      { title: "ACOG Explains: Inducing Labor", url: ytSearch("ACOG Explains Inducing Labor"), source: "ACOG", verified: false },
    ],
  },
  {
    id: "postpartum-recovery",
    number: 11,
    title: "Postpartum Recovery",
    icon: "💛",
    videos: [
      { title: "ACOG Explains: Postpartum Recovery", url: yt("YzRN4ygMQng"), source: "ACOG", verified: true },
      { title: "ACOG explica: Recuperación posparto (Spanish)", url: ytSearch("ACOG explica Recuperación posparto"), source: "ACOG", language: "Spanish", verified: false },
    ],
  },
  {
    id: "postpartum-warning",
    number: 12,
    title: "Postpartum Warning Signs",
    icon: "🚨",
    videos: [
      { title: "What Are POST-BIRTH Warning Signs", url: yt("ro55tjjZkyg"), source: "AWHONN", verified: true },
      { title: "POST-BIRTH Warning Signs — Arabic", url: ytPlaylist("PLRvEM6DQj4YrCbgSZQfjcFF6wCx8g4O4_"), source: "AWHONN", language: "Arabic", verified: false },
      { title: "POST-BIRTH Warning Signs — French", url: yt("JXngLGHPJxs"), source: "AWHONN", language: "French", verified: true },
      { title: "POST-BIRTH Warning Signs — Haitian Creole", url: ytSearch("AWHONN POST-BIRTH Warning Signs Haitian Creole"), source: "AWHONN", language: "Haitian Creole", verified: false },
      { title: "Sarah's Story — POST-BIRTH Warning Signs", url: yt("SQW41jhNY1w"), source: "AWHONN", verified: true },
      { title: "AWHONN Postpartum Hemorrhage Project", url: yt("jjy2Uevf7MM"), source: "AWHONN", verified: true },
      { title: "Quantification of Blood Loss", url: yt("F_ac-aCbEn0"), source: "AWHONN", verified: true },
      { title: "CDC Hear Her: Dr. Wanda Barfield PSA", url: yt("JeHyF4Xt6Ok"), source: "CDC", verified: true },
      { title: "Hear Sanari's Story", url: ytSearch("CDC Hear Her Sanari Story maternal warning signs"), source: "CDC", verified: false },
      { title: "Hear Allyson Felix's Story", url: yt("zG_W5Q9NbCE"), source: "CDC", verified: true },
    ],
  },
  {
    id: "newborn-care",
    number: 13,
    title: "Newborn Care",
    icon: "👶",
    videos: [
      { title: "Your Newborn", url: ytSearch("AAP Your Newborn pediatrics"), source: "AAP", verified: false },
      { title: "Preparing My Home For My New Baby", url: ytSearch("AAP Preparing My Home For My New Baby"), source: "AAP", verified: false },
      { title: "Preparing for Baby and Choosing Safe Sleep Products", url: ytSearch("AAP Preparing for Baby Choosing Safe Sleep Products"), source: "AAP", verified: false },
      { title: "5 Baby Massage Strokes to Soothe Colic", url: yt("zSTZ_2ECpSE"), source: "AAP", verified: true },
    ],
  },
  {
    id: "newborn-bonding",
    number: 14,
    title: "Newborn Bonding & Postpartum Adjustment",
    icon: "🤱",
    videos: [
      { title: "What if It's Not Love at First Sight With Your Baby?", url: ytSearch("AAP What if Its Not Love at First Sight Baby"), source: "AAP", verified: false },
      { title: "The First Year Is Hard — Surviving Baby's Early Months", url: ytSearch("AAP The First Year Is Hard Surviving Baby Early Months"), source: "AAP", verified: false },
      { title: "Baby Bonding Basics — Building Trust, Love & Connection", url: ytSearch("AAP Baby Bonding Basics Building Trust Love Connection"), source: "AAP", verified: false },
      { title: "How Babies Learn to Communicate", url: ytSearch("AAP How Babies Learn to Communicate"), source: "AAP", verified: false },
    ],
  },
  {
    id: "breastfeeding",
    number: 15,
    title: "Breastfeeding & Infant Feeding",
    icon: "🍼",
    videos: [
      { title: "How to Give My Baby the Best Start in Life", url: ytSearch("AAP How to Give My Baby the Best Start in Life"), source: "AAP", verified: false },
      { title: "How Should I Feed My Baby?", url: ytSearch("AAP How Should I Feed My Baby"), source: "AAP", verified: false },
      { title: "Responsive Feeding", url: ytSearch("AAP Responsive Feeding"), source: "AAP", verified: false },
      { title: "Feeding Baby the Best Way — Responsive Feeding Tips", url: ytSearch("AAP Feeding Baby Best Way Responsive Feeding Tips"), source: "AAP", verified: false },
      { title: "Breastfeeding + Going Back to Work", url: ytSearch("AAP Breastfeeding Going Back to Work"), source: "AAP", verified: false },
      { title: "Should You Stash Breast Milk?", url: ytSearch("AAP Should You Stash Breast Milk"), source: "AAP", verified: false },
      { title: "Breastfeeding Problems? Tongue Tie Might Not Be the Reason", url: yt("sYn4ItEWucQ"), source: "AAP", verified: true },
      { title: "Is Tongue-Tie Surgery Right for Your Baby?", url: yt("dHwsOMmXjGQ"), source: "AAP", verified: true },
      { title: "Tongue Tie Release — Making an Informed Decision", url: yt("uAXGb3Z6Ofo"), source: "AAP", verified: true },
    ],
  },
  {
    id: "safe-sleep",
    number: 16,
    title: "Safe Sleep / SIDS Prevention",
    icon: "😴",
    videos: [
      { title: "Safe Sleep for Your Baby (full length)", url: yt("29sLucYtvpA"), source: "NICHD", verified: true },
      { title: "Safe Sleep for Your Baby — 60 seconds", url: yt("Rs9Jw3uIoaU"), source: "NICHD", verified: true },
      { title: "Sueño seguro para su bebé (Spanish)", url: yt("RCbgFgUW0QU"), source: "NICHD", language: "Spanish", verified: true },
      { title: "Breastfeed Your Baby to Reduce Risk of SIDS", url: yt("k17j9aJs90w"), source: "NICHD", verified: true },
      { title: "Safe Sleep for Grandparents & Caregivers", url: yt("7cXwlpSJL08"), source: "NICHD", verified: true },
      { title: "Sueño seguro para los abuelos (Spanish)", url: ytSearch("NICHD Sueño seguro abuelos bebé"), source: "NICHD", language: "Spanish", verified: false },
      { title: "Safely Keeping Baby Warm", url: ytSearch("NICHD Safely Keeping Baby Warm safe sleep"), source: "NICHD", verified: false },
      { title: "5 Safe Sleep Essentials for Your Baby", url: yt("NXmjGbBLP60"), source: "AAP", verified: true },
      { title: "Safe Sleep for Babies", url: ytSearch("AAP Safe Sleep for Babies SIDS prevention"), source: "AAP", verified: false },
      { title: "Help Your Baby Sleep Safely so You Can Sleep Soundly", url: ytSearch("AAP Help Your Baby Sleep Safely Sleep Soundly"), source: "AAP", verified: false },
      { title: "Maintaining Safe Sleep When Baby is Congested", url: yt("44PYQ6iFoGg"), source: "AAP", verified: true },
      { title: "Nursing Pillows — Why They're Unsafe for Sleeping Babies", url: yt("V17Vm1YRrbw"), source: "AAP", verified: true },
      { title: "Talking With Families About Bed Sharing", url: ytSearch("AAP Talking With Families About Bed Sharing"), source: "AAP", verified: false },
    ],
  },
];

export const VIDEO_VAULT_SOURCES = [
  "All",
  "ACOG",
  "SMFM",
  "AAP",
  "NICHD",
  "CDC",
  "March of Dimes",
  "MotherToBaby",
  "AWHONN",
];

export const VIDEO_VAULT_SOURCE_COLORS: Record<string, string> = {
  ACOG: "#8b5cf6",
  SMFM: "#3b82f6",
  AAP: "#22c55e",
  NICHD: "#6366f1",
  CDC: "#ef4444",
  "March of Dimes": "#f97316",
  MotherToBaby: "#14b8a6",
  AWHONN: "#ec4899",
};

export function getVideoVaultTotals() {
  const totalVideos = VIDEO_VAULT_TOPICS.reduce(
    (s, t) => s + t.videos.length,
    0,
  );
  const verifiedCount = VIDEO_VAULT_TOPICS.reduce(
    (s, t) => s + t.videos.filter((v) => v.verified).length,
    0,
  );
  return {
    totalVideos,
    verifiedCount,
    topicCount: VIDEO_VAULT_TOPICS.length,
  };
}
