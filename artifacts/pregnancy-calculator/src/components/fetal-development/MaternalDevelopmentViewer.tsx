import { useState, useEffect } from "react";

const STAGES = [
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
    image: "/images/maternal/stage1-wk2.webp",
    alt: "Sagittal cross-section of female pelvis showing non-pregnant uterus and pelvic anatomy",
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
    image: "/images/maternal/stage2-wk4.webp",
    alt: "Sagittal cross-section showing early implantation in uterine endometrium at weeks 3-4",
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
    image: "/images/maternal/stage3-wk6.webp",
    alt: "Sagittal cross-section showing 6-week embryo inside early enlarged uterus",
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
    image: "/images/maternal/stage4-wk10.webp",
    alt: "Sagittal cross-section showing 10-week fetus with uterus rising above pubic symphysis",
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
    image: "/images/maternal/stage5-wk14.webp",
    alt: "Sagittal cross-section showing 14-week fetus with uterus in lower abdomen",
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
    image: "/images/maternal/stage6-wk20.webp",
    alt: "Sagittal cross-section showing 20-week fetus with uterus at umbilical level",
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
    image: "/images/maternal/stage7-wk28.webp",
    alt: "Sagittal cross-section showing 28-week fetus with uterus displacing abdominal organs",
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
    image: "/images/maternal/stage8-wk40.webp",
    alt: "Sagittal cross-section showing full-term 40-week fetus in vertex position",
  },
];

export function MaternalDevelopmentViewer() {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(true);

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
          The Maternal Body
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
          Anatomical Cross-Section · Conception to Birth
        </p>
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
        {/* Image — portrait ratio for cross-sections */}
        <div
          style={{
            flexShrink: 0,
            width: 220,
            borderRadius: 10,
            overflow: "hidden",
            boxShadow:
              "0 0 48px rgba(78,205,196,0.14), 0 0 90px rgba(78,205,196,0.06)",
            border: "1px solid rgba(78,205,196,0.25)",
            opacity: visible ? 1 : 0,
            transition: "opacity 0.35s ease",
            background: "#0d1117",
          }}
        >
          <img
            src={s.image}
            alt={s.alt}
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>

        {/* Text */}
        <div
          style={{
            flex: "1 1 260px",
            minWidth: 220,
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
              margin: "0 0 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {s.maternal.map((m, i) => (
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
              borderTop: "1px solid rgba(78,205,196,0.12)",
              paddingTop: 12,
              display: "flex",
              flexDirection: "column",
              gap: 5,
            }}
          >
            <div
              style={{
                fontSize: "0.74rem",
                color: "#5db0a6",
                fontFamily: "Arial, sans-serif",
              }}
            >
              Fundal height:{" "}
              <span style={{ color: "#7eccc4" }}>{s.uterusFundus}</span>
            </div>
            <div
              style={{
                fontSize: "0.74rem",
                color: "#5db0a6",
                fontFamily: "Arial, sans-serif",
              }}
            >
              Organ displacement:{" "}
              <span style={{ color: "#7eccc4" }}>{s.organChanges}</span>
            </div>
          </div>
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
