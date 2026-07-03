export interface ClinicalParam {
  label: string;
  value: string;
}

export interface ClinicalData {
  summary: string;
  params: ClinicalParam[];
  action?: string;
}

export interface FetalStage {
  weekLabel: string;
  title: string;
  desc: string;
  milestones: string[];
  size: string;
  image: number;
  clinical: ClinicalData;
}

export const FETAL_STAGES: FetalStage[] = [
  {
    weekLabel: "Weeks 1–2",
    title: "Fertilization & Implantation",
    desc: "A single sperm penetrates the egg, uniting 23 chromosomes from each parent into one unique human genome. The zygote begins dividing as it travels down the fallopian tube, becoming a blastocyst that burrows into the uterine lining by day 9–10.",
    milestones: [
      "Complete genetic blueprint established at fertilization",
      "Rapid cell division: 2 → 4 → 8 → 16 cells",
      "Blastocyst implants in the endometrium",
      "Placental development begins immediately",
    ],
    size: "~0.1 mm",
    image: require("@/assets/fetal/stage1-zygote.webp"),
    clinical: {
      summary:
        "Pre-implantation phase — no sonographic findings expected. Establish LMP and calculate EDD. If hCG rising without visible IUP, serial monitoring for ectopic.",
      params: [
        { label: "US Findings", value: "None — pre-implantation" },
        { label: "Gestational Sac", value: "Not visible until 4.5–5 wks TVS" },
        { label: "Endometrium", value: "Thickening; normal echogenicity" },
        {
          label: "hCG Discriminatory",
          value: "≥1,000 mIU/mL → IUP must be visible",
        },
      ],
      action: "Confirm LMP · Calculate EDD · Baseline hCG if indicated",
    },
  },
  {
    weekLabel: "Weeks 3–4",
    title: "Embryonic Disc",
    desc: "Three primary germ layers — ectoderm, mesoderm, and endoderm — organize and establish the head-to-tail axis. The neural plate begins folding to form the brain and spinal cord. A primitive heart tube appears and starts beating around day 22.",
    milestones: [
      "Gastrulation establishes all three germ layers",
      "Neural tube begins folding closed",
      "First heartbeat detectable (~day 22)",
      "Yolk sac provides early nourishment",
    ],
    size: "~2 mm",
    image: require("@/assets/fetal/stage2-blastocyst.webp"),
    clinical: {
      summary:
        "Gestational sac first visible ~4.5–5 wks TVS. MSD grows ~1 mm/day. Yolk sac not yet seen at 3–4 wks — appears when MSD ≥8–10 mm.",
      params: [
        { label: "MSD at 4 wks", value: "2–5 mm" },
        { label: "MSD at 5 wks", value: "6–16 mm (mean 10 mm)" },
        { label: "MSD Growth Rate", value: "~1.0–1.13 mm/day" },
        {
          label: "MSD Dating Formula",
          value: "MSD (mm) + 30 = days of pregnancy",
        },
        {
          label: "Failure: No Embryo",
          value: "MSD ≥25 mm → diagnostic failure",
        },
        { label: "Suspicious", value: "MSD 16–24 mm without embryo" },
      ],
      action:
        "MSD ≥25 mm + no embryo = anembryonic pregnancy. hCG ≥1,000 + no IUP = rule out ectopic.",
    },
  },
  {
    weekLabel: "Weeks 5–8",
    title: "Organogenesis",
    desc: "All major organ systems begin forming during this critical window. Limb buds emerge and develop into paddle-shaped hands with distinct finger rays. Facial features coalesce — eyes migrate forward, nose and lips take shape. By week 8 the embryo is recognizably human.",
    milestones: [
      "Heart chambers form; rate reaches ~150 bpm",
      "Brain divides into forebrain, midbrain, hindbrain",
      "Limb buds elongate into arms and legs",
      "Liver, kidneys, and lungs begin forming",
    ],
    size: "~8 mm · ~1g",
    image: require("@/assets/fetal/stage3-week6.webp"),
    clinical: {
      summary:
        "Cardiac activity expected when CRL ≥5 mm (~6–6.5 wks). Yolk sac normal 3–5 mm; >7 mm before 9 wks suspicious. Dating by CRL accurate to ±3–5 days (7–13+6 wks).",
      params: [
        { label: "CRL 6.0 wks", value: "4.5 mm" },
        { label: "CRL 6.5 wks", value: "6.5 mm" },
        { label: "CRL 7.0 wks", value: "9.2 mm" },
        { label: "CRL 8.0 wks", value: "15 mm" },
        { label: "Yolk Sac (6 wks)", value: "~3.0 mm (normal 2–5 mm)" },
        { label: "Yolk Sac (8 wks)", value: "~4.7 mm (normal 3–6 mm)" },
        {
          label: "Small Sac Sign",
          value: "MSD − CRL <5 mm → poor prognosis",
        },
        { label: "Cardiac Activity", value: "Required at CRL ≥7 mm (TVS)" },
      ],
      action:
        "No cardiac activity at CRL ≥7 mm = embryonic demise. CRL ≥5 mm without cardiac activity = suspicious; repeat in 7 days.",
    },
  },
  {
    weekLabel: "Weeks 9–12",
    title: "Early Fetal Period",
    desc: "Now called a fetus, external genitalia begin differentiating. The fetus can flex its fingers, make breathing movements, and swallow amniotic fluid. Facial muscles allow primitive expressions. The placenta assumes full hormonal control of the pregnancy.",
    milestones: [
      "All organs present — growth and refinement begin",
      "Sex differentiation begins around week 9",
      "Fingerprints forming by week 12",
      "First trimester screening window",
    ],
    size: "~6 cm · ~14g",
    image: require("@/assets/fetal/stage4-week10.webp"),
    clinical: {
      summary:
        "NT screening window: CRL 45–84 mm (11w3d–13w6d). Combined first-trimester screen: NT + PAPP-A + free β-hCG. Detection rate ~85–90% for T21.",
      params: [
        { label: "CRL 9.0 wks", value: "22–23 mm" },
        { label: "CRL 10.0 wks", value: "31 mm" },
        { label: "CRL 11.0 wks", value: "41–44 mm" },
        { label: "CRL 12.0 wks", value: "52–57 mm" },
        { label: "NT Window", value: "CRL 45–84 mm (11w3d–13w6d)" },
        { label: "NT Normal", value: "<3.0 mm (clinical cutoff)" },
        {
          label: "NT High Risk",
          value: ">3.5 mm → chromosomal/structural workup",
        },
        {
          label: "Yolk Sac Peak",
          value: "~5.9 mm at 10 wks; regresses after",
        },
      ],
      action:
        "Offer combined 1st trimester screen 11–13+6 wks. NT ≥3 mm → genetic counseling + cell-free DNA or CVS.",
    },
  },
  {
    weekLabel: "Weeks 13–16",
    title: "Quickening Approaches",
    desc: "The fetus grows rapidly and movements become coordinated. Lanugo — fine downy hair — covers the body. The skeleton transitions from cartilage to bone. The auditory ossicles harden, allowing the fetus to begin detecting sounds from the outside world.",
    milestones: [
      "Meconium begins forming in the intestines",
      "Eyes can detect light through closed lids",
      "Coordinated sucking and swallowing movements",
      "Bone ossification accelerates throughout skeleton",
    ],
    size: "~16 cm · ~100g",
    image: require("@/assets/fetal/stage5-week14.webp"),
    clinical: {
      summary:
        "Biometry begins (BPD, HC, AC, FL). HC most predictive 14–22 wks. Nuchal fold measured 16–24 wks; ≥6 mm (18–24 wks) = T21 soft marker. High-risk cervical length screening starts.",
      params: [
        { label: "BPD 14 wks", value: "25 mm" },
        { label: "BPD 16 wks", value: "32 mm" },
        { label: "HC 14 wks", value: "~115 mm" },
        { label: "FL (from 14 wks)", value: "~12 mm at 14 wks" },
        {
          label: "Nuchal Fold Normal",
          value: "<5 mm (16–18 wks) · <6 mm (18–24 wks)",
        },
        { label: "Nuchal Fold Abnormal", value: "≥6 mm → T21 soft marker" },
        {
          label: "Cervical Length",
          value: "<25 mm = increased PTB risk (high-risk pts)",
        },
      ],
      action:
        "Begin biometry dating if not established. CL screening 16–24 wks for prior PTB, short-CX history, or twins.",
    },
  },
  {
    weekLabel: "Weeks 17–24",
    title: "Viability Threshold",
    desc: "Lung alveoli and surfactant production begin — the key milestone for survival outside the womb. The brain undergoes explosive growth, developing gyri and sulci. Vernix caseosa coats the skin for protection. Mothers feel distinct kicks and rolls.",
    milestones: [
      "Surfactant production begins — critical for breathing",
      "Rapid cerebral cortex development",
      "Sleep-wake cycles become detectable",
      "Viability threshold reached at ~24 weeks",
    ],
    size: "~30 cm · ~600g",
    image: require("@/assets/fetal/stage6-week20.webp"),
    clinical: {
      summary:
        "Standard anatomy scan 18–22 wks (ACOG). Viability ~24 wks. Fundus at umbilicus at 20 wks; FH (cm) ≈ GA (wks) from 20–36 wks. UA S/D ratio 50th %ile = 4.0 at 20 wks.",
      params: [
        { label: "BPD 20 wks", value: "46–48 mm" },
        { label: "HC 20 wks", value: "~175 mm" },
        { label: "AC 20 wks", value: "~149 mm" },
        { label: "FL 20 wks", value: "~32 mm" },
        { label: "Anatomy Scan", value: "18–22 wks (optimal single exam)" },
        { label: "UA S/D (20 wks)", value: "50th %ile = 4.0" },
        { label: "Ventriculomegaly", value: "Lateral ventricle atrium ≥10 mm" },
        { label: "Renal Pyelectasis", value: "AP pelvis ≥7 mm (2nd tri)" },
        { label: "Nuchal Fold", value: "≥6 mm = T21 soft marker" },
        {
          label: "Cervical Length",
          value: "<25 mm → progesterone (universal screen)",
        },
      ],
      action:
        "Schedule anatomy scan 18–22 wks. CL <25 mm → progesterone supplementation. Viability counseling at 24 wks.",
    },
  },
  {
    weekLabel: "Weeks 25–32",
    title: "Brain & Lung Maturation",
    desc: "The brain more than doubles in weight during this period. Eyes open and close; the fetus responds to light and sound with purposeful movements. Fat deposits build under the skin, rounding the body's contours. Most organ systems reach functional maturity.",
    milestones: [
      "Eyes open for the first time (around week 26)",
      "REM sleep observed — early dream activity",
      "Maternal immune antibodies begin transferring",
      "Brown fat deposits develop for thermoregulation",
    ],
    size: "~38 cm · ~1.5 kg",
    image: require("@/assets/fetal/stage7-week28.webp"),
    clinical: {
      summary:
        "Growth surveillance with EFW and biometry. UA Doppler S/D >4 abnormal at 28–34 wks. SGA = EFW <10th %ile. Absent or reversed end-diastolic flow = severe fetal compromise.",
      params: [
        { label: "BPD 28 wks", value: "71–72 mm" },
        { label: "HC 28 wks", value: "250–270 mm" },
        { label: "AC 28 wks", value: "220–250 mm" },
        { label: "FL 28 wks", value: "52–55 mm" },
        { label: "BPD 32 wks", value: "80–85 mm" },
        { label: "AC 32 wks", value: "260–280 mm" },
        { label: "UA S/D 28–34 wks", value: "Abnormal >4.0" },
        { label: "SGA Threshold", value: "EFW <10th %ile" },
        { label: "Severe SGA", value: "EFW <3rd %ile" },
        { label: "Dating Accuracy", value: "±21 days at 28+ wks" },
      ],
      action:
        "Growth scan q3–4 wks if IUGR concern. UA AEDF or REDF → hospitalize, expedite delivery planning.",
    },
  },
  {
    weekLabel: "Weeks 33–40",
    title: "Ready for the World",
    desc: "The fetus turns head-down (vertex presentation) and descends into the pelvis. Lung surfactant reaches full maturity. The final weeks add approximately 200g per week in fat and muscle. At 40 weeks, a full-term newborn weighs ~3.4 kg and is ready for independent life.",
    milestones: [
      "Head engages in the maternal pelvis",
      "Lanugo mostly shed; vernix becomes thin",
      "Full neurological and respiratory maturity",
      "Birth: ~3.4 kg, ~50 cm length",
    ],
    size: "~50 cm · ~3.4 kg",
    image: require("@/assets/fetal/stage8-week40.webp"),
    clinical: {
      summary:
        "Term assessment: AFI 5–25 cm normal, EFW ~3,200–3,600 g (±15%), UA S/D ~2.18 at 40 wks. Confirm cephalic presentation and engagement. BPD unreliable for dating at term (moulding).",
      params: [
        { label: "EFW at Term", value: "~3,200–3,600 g (Hadlock ±15%)" },
        { label: "AFI Normal", value: "5–25 cm" },
        { label: "Oligohydramnios", value: "AFI <5 cm" },
        { label: "Polyhydramnios", value: "AFI >25 cm" },
        { label: "UA S/D at 40 wks", value: "~2.18 (50th %ile) · RI ~0.65" },
        { label: "BPD at 40 wks", value: "~94 mm (not for dating)" },
        { label: "Dating Accuracy", value: "±3–4 wks at term biometry" },
        { label: "Macrosomia", value: "EFW >4,000–4,500 g" },
      ],
      action:
        "Confirm vertex presentation. Oligohydramnios <5 cm → BPP, delivery planning. Macrosomia >4,500 g → elective C/S discussion.",
    },
  },
];
