import { useState, useEffect } from "react";

const MATERNAL_URL = "https://maternal-development.pplx.app";
const FETAL_URL = "https://fetal-development.pplx.app";

function ViewerNav({ current }) {
  const otherUrl = `${MATERNAL_URL}#stage=${current}`;
  return (
    <div style={{
      width: "100%", background: "#0b0e17",
      borderBottom: "1px solid rgba(78,205,196,0.12)",
      display: "flex", justifyContent: "center", padding: "10px 24px",
    }}>
      <div style={{
        display: "flex", gap: 6, alignItems: "center",
        background: "rgba(255,255,255,0.04)", borderRadius: 8,
        padding: "4px", border: "1px solid rgba(78,205,196,0.15)"
      }}>
        {/* Active pill */}
        <span style={{
          padding: "6px 18px", borderRadius: 6, fontSize: "0.72rem",
          letterSpacing: "0.1em", textTransform: "uppercase",
          fontFamily: "Arial, sans-serif", fontWeight: 600,
          background: "#4ecdc4", color: "#07090f", cursor: "default",
          userSelect: "none",
        }}>Fetal View</span>
        {/* Inactive pill — link to maternal */}
        <a href={otherUrl} style={{
          padding: "6px 18px", borderRadius: 6, fontSize: "0.72rem",
          letterSpacing: "0.1em", textTransform: "uppercase",
          fontFamily: "Arial, sans-serif", fontWeight: 500,
          color: "#7abcb4", textDecoration: "none",
          transition: "background 0.2s, color 0.2s",
        }}
          onMouseEnter={e => { e.target.style.background = "rgba(78,205,196,0.12)"; e.target.style.color = "#4ecdc4"; }}
          onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.color = "#7abcb4"; }}
        >Maternal View</a>
      </div>
    </div>
  );
}

const STAGES = [
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
  },
];

const IMAGES = [
  "/images/stage1-zygote.webp",
  "/images/stage2-blastocyst.webp",
  "/images/stage3-week6.webp",
  "/images/stage4-week10.webp",
  "/images/stage5-week14.webp",
  "/images/stage6-week20.webp",
  "/images/stage7-week28.webp",
  "/images/stage8-week40.webp",
];

const ALT_TEXT = [
  "3D render of a human zygote with zona pellucida and pronuclei in uterine environment",
  "3D render of a human blastocyst showing trophoblast cells and inner cell mass",
  "3D render of a 6-week embryo in C-shape with heart bulge and limb buds",
  "3D render of a 10-week fetus in fetal position inside the uterus",
  "3D render of a 14-week fetus with lanugo and umbilical cord in amniotic fluid",
  "3D render of a 20-week fetus with vernix coating in womb environment",
  "3D render of a 28-week fetus with fat deposits and open eyes in uterus",
  "3D render of a full-term 40-week fetus in vertex position inside uterus",
];

export default function App() {
  const getInitialStage = () => {
    const hash = window.location.hash;
    const match = hash.match(/#stage=(\d+)/);
    if (match) {
      const idx = parseInt(match[1], 10);
      return Math.min(Math.max(idx, 0), STAGES.length - 1);
    }
    return 0;
  };

  const [current, setCurrent] = useState(getInitialStage);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(true);

  // Keep hash in sync as user navigates
  useEffect(() => {
    window.location.hash = `stage=${current}`;
  }, [current]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setCurrent(prev => {
        if (prev >= STAGES.length - 1) { setPlaying(false); return prev; }
        return prev + 1;
      });
    }, 7000);
    return () => clearInterval(t);
  }, [playing]);

  function goTo(idx) {
    if (idx === current) return;
    setVisible(false);
    setTimeout(() => { setCurrent(idx); setVisible(true); }, 320);
  }

  const s = STAGES[current];

  return (
    <div style={{
      minHeight: "100vh", background: "#07090f", color: "#e8eeec",
      fontFamily: "Georgia, serif", display: "flex", flexDirection: "column", alignItems: "center"
    }}>
      <ViewerNav current={current} />
      <div style={{
        width: "100%", maxWidth: 900, padding: "26px 28px 14px",
        borderBottom: "1px solid rgba(78,205,196,0.15)", textAlign: "center"
      }}>
        <h1 style={{
          fontFamily: "Georgia, serif", fontWeight: 300,
          fontSize: "clamp(1.4rem,4vw,2.1rem)", letterSpacing: "0.05em", color: "#eef4f2", margin: 0
        }}>The Beginning of Life</h1>
        <p style={{
          fontSize: "0.68rem", letterSpacing: "0.22em", textTransform: "uppercase",
          color: "#7abcb4", marginTop: 6, fontFamily: "Arial, sans-serif"
        }}>Human Fetal Development · Conception to Birth</p>
        <div style={{ display: "flex", gap: 5, justifyContent: "center", marginTop: 14 }}>
          {STAGES.map((_, i) => (
            <div key={i} onClick={() => goTo(i)} style={{
              height: 4, borderRadius: 2, cursor: "pointer",
              width: i === current ? 44 : 28,
              background: i === current ? "#4ecdc4" : i < current ? "rgba(78,205,196,0.50)" : "rgba(78,205,196,0.16)",
              transition: "all 0.3s"
            }} />
          ))}
        </div>
      </div>

      <div style={{
        flex: 1, width: "100%", maxWidth: 900, padding: "22px 28px",
        display: "flex", alignItems: "center", gap: 36,
        flexWrap: "wrap", justifyContent: "center"
      }}>
        {/* Realistic Image */}
        <div style={{
          flexShrink: 0, width: 280, height: 280,
          borderRadius: "50%", overflow: "hidden",
          boxShadow: "0 0 56px rgba(78,205,196,0.18), 0 0 110px rgba(78,205,196,0.07), inset 0 0 0 1px rgba(78,205,196,0.22)",
          border: "1px solid rgba(78,205,196,0.28)",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.35s ease",
          background: "#0d1117",
        }}>
          <img
            src={IMAGES[current]}
            alt={ALT_TEXT[current]}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        </div>

        {/* Text */}
        <div style={{
          flex: "1 1 300px", minWidth: 260,
          opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(10px)",
          transition: "opacity 0.35s ease, transform 0.35s ease"
        }}>
          <div style={{
            fontSize: "0.64rem", letterSpacing: "0.22em", textTransform: "uppercase",
            color: "#4ecdc4", marginBottom: 8, fontFamily: "Arial, sans-serif"
          }}>{s.weekLabel}</div>
          <h2 style={{
            fontFamily: "Georgia, serif", fontWeight: 400,
            fontSize: "clamp(1.3rem,3vw,1.85rem)", lineHeight: 1.25,
            color: "#f2f7f5", margin: "0 0 14px"
          }}>{s.title}</h2>
          <p style={{
            fontSize: "0.9rem", lineHeight: 1.85, color: "#ccddd8",
            marginBottom: 16, fontFamily: "Arial, sans-serif"
          }}>{s.desc}</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {s.milestones.map((m, i) => (
              <li key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                fontSize: "0.84rem", color: "#b8d4ce", fontFamily: "Arial, sans-serif", lineHeight: 1.5
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", background: "#4ecdc4",
                  marginTop: "0.42em", flexShrink: 0
                }} />
                {m}
              </li>
            ))}
          </ul>
          <div style={{
            marginTop: 16, fontSize: "0.75rem", color: "#5db0a6",
            fontFamily: "Arial, sans-serif", letterSpacing: "0.04em"
          }}>Size: <span style={{ color: "#7eccc4" }}>{s.size}</span></div>
        </div>
      </div>

      <div style={{
        width: "100%", maxWidth: 900, padding: "14px 28px 26px",
        borderTop: "1px solid rgba(78,205,196,0.12)",
        display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <button onClick={() => goTo(current - 1)} disabled={current === 0} style={{
          background: "none", border: "1px solid rgba(78,205,196,0.28)", color: "#7ed9c8",
          fontFamily: "Arial, sans-serif", fontSize: "0.8rem", letterSpacing: "0.1em",
          padding: "10px 22px", borderRadius: 3, cursor: current === 0 ? "default" : "pointer",
          opacity: current === 0 ? 0.22 : 1, transition: "all 0.2s"
        }}>← Previous</button>

        <button onClick={() => setPlaying(p => !p)} style={{
          background: "none", border: "none", color: playing ? "#4ecdc4" : "#7a9e98",
          fontFamily: "Arial, sans-serif", fontSize: "0.72rem", letterSpacing: "0.14em",
          textTransform: "uppercase", cursor: "pointer", display: "flex", alignItems: "center", gap: 8
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: playing ? "#4ecdc4" : "#7a9e98", display: "inline-block"
          }} />
          {playing ? "Pause" : "Autoplay"}
        </button>

        <button onClick={() => goTo(current + 1)} disabled={current === STAGES.length - 1} style={{
          background: "none", border: "1px solid rgba(78,205,196,0.28)", color: "#7ed9c8",
          fontFamily: "Arial, sans-serif", fontSize: "0.8rem", letterSpacing: "0.1em",
          padding: "10px 22px", borderRadius: 3, cursor: current === STAGES.length - 1 ? "default" : "pointer",
          opacity: current === STAGES.length - 1 ? 0.22 : 1, transition: "all 0.2s"
        }}>Next →</button>
      </div>
    </div>
  );
}
