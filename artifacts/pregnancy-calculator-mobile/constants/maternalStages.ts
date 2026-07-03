export interface MaternalStage {
  weekLabel: string;
  title: string;
  desc: string;
  maternal: string[];
  uterusFundus: string;
  organChanges: string;
  image: number;
}

export const MATERNAL_STAGES: MaternalStage[] = [
  {
    weekLabel: "Weeks 1–2",
    title: "Pre-Pregnancy Baseline",
    desc: "The uterus is pear-shaped, approximately 7 cm long, nestled in the pelvis between the bladder anteriorly and rectum posteriorly. The endometrium is preparing through the menstrual cycle. Fertilization occurs in the fallopian tube, and the zygote begins its 4–5 day journey toward implantation.",
    maternal: [
      "Uterus weighs ~60g, cavity volume ~5 mL",
      "Endometrium thickening under estrogen influence",
      "Ovulation triggers from the dominant follicle",
      "Fallopian tube cilia propel zygote toward uterus",
    ],
    uterusFundus: "Deep in pelvis",
    organChanges: "None yet",
    image: require("@/assets/maternal/stage1-wk2.webp"),
  },
  {
    weekLabel: "Weeks 3–4",
    title: "Implantation",
    desc: "The blastocyst burrows into the posterior endometrial wall around day 9–10. Human chorionic gonadotropin (hCG) begins rising, signaling the corpus luteum to maintain progesterone production. The uterus remains normal in size but the endometrium transforms into the decidua.",
    maternal: [
      "hCG detected in blood as early as day 8–10",
      "Decidua basalis, capsularis, and parietalis form",
      "Uterine blood supply begins increasing",
      "Progesterone prevents menstruation and uterine contractions",
    ],
    uterusFundus: "Deep in pelvis",
    organChanges: "Minimal — decidualization only",
    image: require("@/assets/maternal/stage2-wk4.webp"),
  },
  {
    weekLabel: "Weeks 5–8",
    title: "Early Organogenesis",
    desc: "The uterus begins softening and enlarging, reaching the size of a large egg by week 8. Goodell's sign (cervical softening) and Hegar's sign (isthmic softening) are detectable on exam. The vascular supply increases dramatically — uterine blood flow increases 10-fold by the end of the first trimester.",
    maternal: [
      "Uterus enlarges from 60g to ~120g by week 8",
      "Cervix softens (Goodell's sign) and develops a bluish hue (Chadwick's sign)",
      "Nausea peaks as hCG rises — typically 6–10 weeks",
      "Bladder displaced slightly but still fully pelvic",
    ],
    uterusFundus: "Still in pelvis",
    organChanges: "Bladder mildly displaced",
    image: require("@/assets/maternal/stage3-wk6.webp"),
  },
  {
    weekLabel: "Weeks 9–12",
    title: "First Trimester Close",
    desc: "The uterus rises above the pubic symphysis by week 12, becoming palpable abdominally for the first time. The placenta assumes full endocrine control from the corpus luteum (luteoplacental shift). Cardiac output has increased ~30–40% and blood volume begins expanding.",
    maternal: [
      "Fundus palpable at pubic symphysis ~week 12",
      "Luteoplacental shift: placenta takes over progesterone production",
      "Blood volume expansion begins (will reach +40–50% at term)",
      "GFR increases 50% — frequent urination common",
    ],
    uterusFundus: "At pubic symphysis",
    organChanges: "Bladder compressed; intestines beginning to shift",
    image: require("@/assets/maternal/stage4-wk10.webp"),
  },
  {
    weekLabel: "Weeks 13–16",
    title: "Second Trimester Begins",
    desc: "The uterus is now clearly abdominal, and the characteristic pregnancy silhouette begins. The round ligaments stretch and may cause sharp lateral pelvic pain. Braxton Hicks contractions may begin. The maternal GI tract is progressively displaced superiorly and laterally.",
    maternal: [
      "Fundus midway between symphysis and umbilicus by week 16",
      "Round ligament pain common as uterus rises",
      "Intestines displaced superiorly and laterally",
      "Maternal weight gain accelerates: ~1 lb/week",
    ],
    uterusFundus: "Between symphysis and umbilicus",
    organChanges: "Bowel loops displaced superiorly",
    image: require("@/assets/maternal/stage5-wk14.webp"),
  },
  {
    weekLabel: "Weeks 17–24",
    title: "Mid-Pregnancy Growth",
    desc: "The fundus reaches the umbilicus at week 20 — a landmark used clinically. The uterus now rises above the umbilicus toward the liver. The maternal diaphragm begins to be pushed upward. Quickening typically occurs between weeks 18–22 in first pregnancies.",
    maternal: [
      "Fundus at umbilicus at week 20 (fundal height = gestational age in cm)",
      "Uterus rotates dextrorotated due to sigmoid colon",
      "Diaphragm elevation begins — shortness of breath may start",
      "Maternal plasma volume peaks at ~150% of pre-pregnancy",
    ],
    uterusFundus: "At umbilicus (week 20)",
    organChanges: "Stomach and liver displaced upward",
    image: require("@/assets/maternal/stage6-wk20.webp"),
  },
  {
    weekLabel: "Weeks 25–32",
    title: "Third Trimester",
    desc: "Rapid fetal growth drives significant maternal organ displacement. The stomach and liver are pushed against the diaphragm, causing heartburn and shortness of breath. The lumbar lordosis increases markedly to compensate for the anterior shift in center of gravity.",
    maternal: [
      "Fundus between umbilicus and xiphoid",
      "Stomach compressed — reflux and heartburn intensify",
      "Diaphragm elevated 4 cm — reduced lung capacity",
      "Cardiac output at maximum: +40–50% above baseline",
    ],
    uterusFundus: "Between umbilicus and xiphoid",
    organChanges: "Stomach, liver, and diaphragm maximally displaced",
    image: require("@/assets/maternal/stage7-wk28.webp"),
  },
  {
    weekLabel: "Weeks 38–40",
    title: "Full Term",
    desc: "At term the uterus weighs ~1,100g and holds approximately 5 liters of total contents. Lightening (fetal head engagement into the pelvis) typically occurs 2–4 weeks before delivery in primiparas, relieving upper abdominal pressure but increasing pelvic pressure.",
    maternal: [
      "Fundus at xiphoid; lightening drops it 2–4 cm pre-labor",
      "Fetal head engages (station 0) in the pelvis",
      "Bladder capacity severely reduced — urinary frequency returns",
      "Cervical ripening: softening, effacement, and early dilation",
    ],
    uterusFundus: "At xiphoid (pre-lightening)",
    organChanges: "All organs maximally displaced; returns postpartum",
    image: require("@/assets/maternal/stage8-wk40.webp"),
  },
];
