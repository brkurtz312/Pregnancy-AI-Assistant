import { useState, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClinicalParam {
  label: string;
  value: string;
}

interface ClinicalData {
  summary: string;
  params: ClinicalParam[];
  action?: string;
}

interface Stage {
  weekLabel: string;
  title: string;
  desc: string;
  milestones: string[];
  size: string;
  image: string;
  alt: string;
  clinical: ClinicalData;
}

// ─── ClinicalDrawer Component ─────────────────────────────────────────────────

interface ClinicalDrawerProps {
  data: ClinicalData;
  open: boolean;
  onToggle: () => void;
}

function ClinicalDrawer({ data, open, onToggle }: ClinicalDrawerProps) {
  return (
    <div style={{ marginTop: 18, width: "100%" }}>
      {/* Toggle button */}
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "none",
          border: `1px solid ${open ? "rgba(78,205,196,0.55)" : "rgba(78,205,196,0.28)"}`,
          borderRadius: 4,
          padding: "7px 14px",
          cursor: "pointer",
          color: open ? "#4ecdc4" : "#7abcb4",
          fontFamily: "Arial, sans-serif",
          fontSize: "0.72rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          transition: "all 0.22s",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.borderColor = "rgba(78,205,196,0.7)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.borderColor = open
            ? "rgba(78,205,196,0.55)"
            : "rgba(78,205,196,0.28)")
        }
      >
        {/* Stethoscope icon */}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
          <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
          <circle cx="20" cy="10" r="2" />
        </svg>
        Clinical Reference
        {/* Chevron */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transition: "transform 0.22s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expandable panel */}
      <div
        style={{
          overflow: "hidden",
          maxHeight: open ? "600px" : "0px",
          opacity: open ? 1 : 0,
          transition: "max-height 0.38s ease, opacity 0.28s ease",
        }}
      >
        <div
          style={{
            marginTop: 10,
            background: "rgba(78,205,196,0.05)",
            border: "1px solid rgba(78,205,196,0.18)",
            borderRadius: 6,
            padding: "14px 16px",
          }}
        >
          {/* Summary line */}
          <p
            style={{
              fontFamily: "Arial, sans-serif",
              fontSize: "0.82rem",
              color: "#b0d4ce",
              lineHeight: 1.7,
              margin: "0 0 12px",
              borderBottom: "1px solid rgba(78,205,196,0.1)",
              paddingBottom: 10,
            }}
          >
            {data.summary}
          </p>

          {/* Key parameters grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "8px 16px",
            }}
          >
            {data.params.map((p, i) => (
              <div
                key={i}
                style={{ display: "flex", flexDirection: "column", gap: 2 }}
              >
                <span
                  style={{
                    fontFamily: "Arial, sans-serif",
                    fontSize: "0.62rem",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    color: "#4ecdc4",
                    opacity: 0.8,
                  }}
                >
                  {p.label}
                </span>
                <span
                  style={{
                    fontFamily: "Arial, sans-serif",
                    fontSize: "0.82rem",
                    color: "#d4eae6",
                    lineHeight: 1.4,
                  }}
                >
                  {p.value}
                </span>
              </div>
            ))}
          </div>

          {/* Action note */}
          {data.action && (
            <div
              style={{
                marginTop: 12,
                paddingTop: 10,
                borderTop: "1px solid rgba(78,205,196,0.1)",
                fontFamily: "Arial, sans-serif",
                fontSize: "0.78rem",
                color: "#7abcb4",
                lineHeight: 1.6,
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <span style={{ color: "#4ecdc4", flexShrink: 0, marginTop: 1 }}>
                ⚑
              </span>
              {data.action}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stage Data ───────────────────────────────────────────────────────────────

const STAGES: Stage[] = [
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
    image: "/images/fetal/stage1-zygote.webp",
    alt: "3D render of a human zygote with zona pellucida and pronuclei in uterine environment",
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
    image: "/images/fetal/stage2-blastocyst.webp",
    alt: "3D render of a human blastocyst showing trophoblast cells and inner cell mass",
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
    image: "/images/fetal/stage3-week6.webp",
    alt: "3D render of a 6-week embryo in C-shape with heart bulge and limb buds",
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
    image: "/images/fetal/stage4-week10.webp",
    alt: "3D render of a 10-week fetus in fetal position inside the uterus",
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
    image: "/images/fetal/stage5-week14.webp",
    alt: "3D render of a 14-week fetus with lanugo and umbilical cord in amniotic fluid",
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
    image: "/images/fetal/stage6-week20.webp",
    alt: "3D render of a 20-week fetus with vernix coating in womb environment",
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
    image: "/images/fetal/stage7-week28.webp",
    alt: "3D render of a 28-week fetus with fat deposits and open eyes in uterus",
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
    image: "/images/fetal/stage8-week40.webp",
    alt: "3D render of a full-term 40-week fetus in vertex position inside uterus",
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

// ─── Main Component ───────────────────────────────────────────────────────────

export function FetalDevelopmentViewer() {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setCurrent((prev) => {
        if (prev >= STAGES.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 7000);
    return () => clearInterval(t);
  }, [playing]);

  // Close drawer when navigating to a new stage
  useEffect(() => {
    setDrawerOpen(false);
  }, [current]);

  function goTo(idx: number) {
    if (idx === current) return;
    setVisible(false);
    setTimeout(() => {
      setCurrent(idx);
      setVisible(true);
    }, 320);
  }

  const s = STAGES[current];

  return (
    <div
      style={{
        background: "#07090f",
        color: "#e8eeec",
        fontFamily: "Georgia, serif",
        borderRadius: "1.25rem",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "26px 28px 14px",
          borderBottom: "1px solid rgba(78,205,196,0.15)",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontFamily: "Georgia, serif",
            fontWeight: 300,
            fontSize: "clamp(1.2rem,4vw,1.85rem)",
            letterSpacing: "0.05em",
            color: "#eef4f2",
            margin: 0,
          }}
        >
          The Beginning of Life
        </h2>
        <p
          style={{
            fontSize: "0.65rem",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "#7abcb4",
            marginTop: 6,
            fontFamily: "Arial, sans-serif",
          }}
        >
          Human Fetal Development · Conception to Birth
        </p>

        {/* Progress dots */}
        <div
          style={{
            display: "flex",
            gap: 5,
            justifyContent: "center",
            marginTop: 14,
          }}
        >
          {STAGES.map((_, i) => (
            <div
              key={i}
              onClick={() => goTo(i)}
              style={{
                height: 4,
                borderRadius: 2,
                cursor: "pointer",
                width: i === current ? 44 : 28,
                background:
                  i === current
                    ? "#4ecdc4"
                    : i < current
                      ? "rgba(78,205,196,0.50)"
                      : "rgba(78,205,196,0.16)",
                transition: "all 0.3s",
              }}
            />
          ))}
        </div>
      </div>

      {/* Stage content */}
      <div
        style={{
          padding: "22px 28px",
          display: "flex",
          alignItems: "flex-start",
          gap: 36,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {/* Image */}
        <div
          style={{
            flexShrink: 0,
            width: 240,
            height: 240,
            borderRadius: "50%",
            overflow: "hidden",
            boxShadow:
              "0 0 56px rgba(78,205,196,0.18), 0 0 110px rgba(78,205,196,0.07), inset 0 0 0 1px rgba(78,205,196,0.22)",
            border: "1px solid rgba(78,205,196,0.28)",
            opacity: visible ? 1 : 0,
            transition: "opacity 0.35s ease",
            background: "#0d1117",
            alignSelf: "flex-start",
            marginTop: 4,
          }}
        >
          <img
            src={s.image}
            alt={s.alt}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        </div>

        {/* Text + Clinical Drawer */}
        <div
          style={{
            flex: "1 1 280px",
            minWidth: 240,
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(10px)",
            transition: "opacity 0.35s ease, transform 0.35s ease",
          }}
        >
          <div
            style={{
              fontSize: "0.62rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#4ecdc4",
              marginBottom: 8,
              fontFamily: "Arial, sans-serif",
            }}
          >
            {s.weekLabel}
          </div>
          <h3
            style={{
              fontFamily: "Georgia, serif",
              fontWeight: 400,
              fontSize: "clamp(1.2rem,3vw,1.65rem)",
              lineHeight: 1.25,
              color: "#f2f7f5",
              margin: "0 0 14px",
            }}
          >
            {s.title}
          </h3>
          <p
            style={{
              fontSize: "0.88rem",
              lineHeight: 1.85,
              color: "#ccddd8",
              marginBottom: 16,
              fontFamily: "Arial, sans-serif",
            }}
          >
            {s.desc}
          </p>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {s.milestones.map((m, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  fontSize: "0.83rem",
                  color: "#b8d4ce",
                  fontFamily: "Arial, sans-serif",
                  lineHeight: 1.5,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#4ecdc4",
                    marginTop: "0.42em",
                    flexShrink: 0,
                  }}
                />
                {m}
              </li>
            ))}
          </ul>
          <div
            style={{
              marginTop: 16,
              fontSize: "0.74rem",
              color: "#5db0a6",
              fontFamily: "Arial, sans-serif",
              letterSpacing: "0.04em",
            }}
          >
            Size: <span style={{ color: "#7eccc4" }}>{s.size}</span>
          </div>

          {/* ── Clinical Info Drawer ── */}
          <ClinicalDrawer
            data={s.clinical}
            open={drawerOpen}
            onToggle={() => setDrawerOpen((o) => !o)}
          />
        </div>
      </div>

      {/* Footer nav */}
      <div
        style={{
          padding: "14px 28px 26px",
          borderTop: "1px solid rgba(78,205,196,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <button
          onClick={() => goTo(current - 1)}
          disabled={current === 0}
          style={{
            background: "none",
            border: "1px solid rgba(78,205,196,0.28)",
            color: "#7ed9c8",
            fontFamily: "Arial, sans-serif",
            fontSize: "0.8rem",
            letterSpacing: "0.1em",
            padding: "10px 22px",
            borderRadius: 3,
            cursor: current === 0 ? "default" : "pointer",
            opacity: current === 0 ? 0.22 : 1,
            transition: "all 0.2s",
          }}
        >
          ← Previous
        </button>

        <button
          onClick={() => setPlaying((p) => !p)}
          style={{
            background: "none",
            border: "none",
            color: playing ? "#4ecdc4" : "#7a9e98",
            fontFamily: "Arial, sans-serif",
            fontSize: "0.72rem",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: playing ? "#4ecdc4" : "#7a9e98",
              display: "inline-block",
            }}
          />
          {playing ? "Pause" : "Autoplay"}
        </button>

        <button
          onClick={() => goTo(current + 1)}
          disabled={current === STAGES.length - 1}
          style={{
            background: "none",
            border: "1px solid rgba(78,205,196,0.28)",
            color: "#7ed9c8",
            fontFamily: "Arial, sans-serif",
            fontSize: "0.8rem",
            letterSpacing: "0.1em",
            padding: "10px 22px",
            borderRadius: 3,
            cursor: current === STAGES.length - 1 ? "default" : "pointer",
            opacity: current === STAGES.length - 1 ? 0.22 : 1,
            transition: "all 0.2s",
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
