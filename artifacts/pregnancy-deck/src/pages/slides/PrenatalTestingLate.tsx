export default function PrenatalTestingLate() {
  const cards = [
    {
      title: "27–36 weeks",
      body: "Tdap is recommended during each pregnancy to help protect the newborn from pertussis after birth.",
    },
    {
      title: "32–36 weeks",
      body: "RSV vaccination may be discussed for eligible patients expected to deliver during RSV season.",
    },
    {
      title: "36–37 weeks",
      body: "Group B strep testing helps identify who should receive antibiotics during labor to reduce newborn infection risk.",
    },
  ];

  const extras = [
    "Some pregnancies need repeat ultrasounds later in pregnancy.",
    "High-risk patients may need NST or biophysical profile testing.",
    "Extra monitoring may be used for hypertension, diabetes, fetal growth concerns, decreased fetal movement, or abnormal earlier results.",
  ];

  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{ backgroundColor: "#fbfcfc", fontFamily: "'Inter', sans-serif" }}
    >
      <div
        style={{
          position: "absolute",
          top: "-8vw",
          left: "-8vw",
          width: "24vw",
          height: "24vw",
          borderRadius: "50%",
          backgroundColor: "#2a7b7b",
          opacity: 0.06,
        }}
      />

      <div style={{ padding: "7vh 8vw", height: "90vh", boxSizing: "border-box" }}>
        <div
          style={{
            fontSize: "2.2vw",
            fontWeight: 700,
            color: "#2a7b7b",
            letterSpacing: "0.16em",
          }}
        >
          12 · LATE PREGNANCY
        </div>

        <h2
          style={{
            fontSize: "4vw",
            fontWeight: 700,
            color: "#1a1a2e",
            margin: "1.4vh 0 0 0",
            lineHeight: 1.05,
            letterSpacing: "-0.015em",
          }}
        >
          Late testing helps prepare for labor, newborn protection, and added monitoring when needed
        </h2>

        <div style={{ display: "flex", gap: "2vw", marginTop: "4vh" }}>
          {cards.map((c, index) => (
            <div
              key={c.title}
              style={{
                flex: 1,
                backgroundColor: "#f5f8f8",
                borderRadius: "1vw",
                padding: "3vh 1.8vw",
                boxSizing: "border-box",
                minHeight: "30vh",
              }}
            >
              <div
                style={{
                  fontSize: "1.45vw",
                  fontWeight: 700,
                  color: "#2a7b7b",
                  letterSpacing: "0.1em",
                }}
              >
                STEP 0{index + 1}
              </div>

              <div
                style={{
                  fontSize: "2.15vw",
                  fontWeight: 600,
                  color: "#1a1a2e",
                  marginTop: "1.2vh",
                  lineHeight: 1.14,
                }}
              >
                {c.title}
              </div>

              <p
                style={{
                  fontSize: "1.58vw",
                  fontWeight: 400,
                  color: "#4a4a68",
                  margin: "1.4vh 0 0 0",
                  lineHeight: 1.42,
                }}
              >
                {c.body}
              </p>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: "3vh",
            backgroundColor: "#eef5f5",
            borderRadius: "1vw",
            padding: "2.4vh 1.8vw",
          }}
        >
          <div style={{ fontSize: "1.95vw", fontWeight: 600, color: "#1a1a2e" }}>
            When extra testing is needed
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1vh", marginTop: "1.3vh" }}>
            {extras.map((item) => (
              <div
                key={item}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.8vw",
                  fontSize: "1.48vw",
                  color: "#4a4a68",
                  lineHeight: 1.4,
                }}
              >
                <span style={{ color: "#2a7b7b", fontWeight: 700 }}>•</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100vw",
          height: "10vh",
          backgroundColor: "#2a7b7b",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 8vw",
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontSize: "2.2vw", fontWeight: 500, color: "#ffffff", letterSpacing: "0.05em" }}>
          Pregnancy AI Assistant
        </div>
        <div style={{ fontSize: "2.2vw", fontWeight: 500, color: "#ffffff", opacity: 0.8 }}>
          12
        </div>
      </div>
    </div>
  );
}
