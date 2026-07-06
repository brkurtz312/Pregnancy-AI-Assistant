export default function PrenatalTestingMid() {
  const cards = [
    {
      n: "20–22 wks",
      title: "Anatomy ultrasound",
      body: "Most patients have a standard anatomy scan to evaluate fetal anatomy, growth, and placental location.",
    },
    {
      n: "24–28 wks",
      title: "Gestational diabetes screening",
      body: "A 1-hour glucose challenge test is usually done to detect diabetes that develops during pregnancy.",
    },
    {
      n: "Around 28 wks",
      title: "Repeat third-trimester labs",
      body: "Repeat CBC, HIV, and syphilis screening help reassess anemia and infection later in pregnancy.",
    },
  ];

  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{ backgroundColor: "#fbfcfc", fontFamily: "'Inter', sans-serif" }}
    >
      <div
        style={{
          position: "absolute",
          bottom: "16vh",
          right: "-12vw",
          width: "34vw",
          height: "34vw",
          borderRadius: "50%",
          backgroundColor: "#2a7b7b",
          opacity: 0.06,
        }}
      />

      <div
        style={{ padding: "7vh 8vw", height: "90vh", boxSizing: "border-box" }}
      >
        <div
          style={{
            fontSize: "2.2vw",
            fontWeight: 700,
            color: "#2a7b7b",
            letterSpacing: "0.16em",
          }}
        >
          11 · MID-PREGNANCY
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
          Mid-pregnancy testing looks at fetal anatomy, glucose, and repeat
          maternal labs
        </h2>

        <div style={{ display: "flex", gap: "2vw", marginTop: "4vh" }}>
          {cards.map((c) => (
            <div
              key={c.n}
              style={{
                flex: 1,
                backgroundColor: "#f5f8f8",
                borderRadius: "1vw",
                padding: "3vh 1.8vw",
                boxSizing: "border-box",
                minHeight: "36vh",
              }}
            >
              <div
                style={{
                  fontSize: "1.45vw",
                  fontWeight: 700,
                  color: "#2a7b7b",
                  letterSpacing: "0.08em",
                }}
              >
                {c.n.toUpperCase()}
              </div>

              <div
                style={{
                  fontSize: "2.2vw",
                  fontWeight: 600,
                  color: "#1a1a2e",
                  marginTop: "1.3vh",
                  lineHeight: 1.14,
                }}
              >
                {c.title}
              </div>

              <p
                style={{
                  fontSize: "1.62vw",
                  fontWeight: 400,
                  color: "#4a4a68",
                  margin: "1.5vh 0 0 0",
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
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "2vw",
            marginTop: "3vh",
          }}
        >
          <div
            style={{
              backgroundColor: "#eef5f5",
              borderRadius: "1vw",
              padding: "2.2vh 1.6vw",
            }}
          >
            <div
              style={{ fontSize: "1.85vw", fontWeight: 600, color: "#1a1a2e" }}
            >
              If Rh negative
            </div>
            <p
              style={{
                fontSize: "1.5vw",
                color: "#4a4a68",
                margin: "0.8vh 0 0 0",
                lineHeight: 1.4,
              }}
            >
              A repeat type and screen is usually drawn and RhoGAM is given at
              about 28 weeks when the earlier antibody screen was negative.
            </p>
          </div>

          <div
            style={{
              backgroundColor: "#eef5f5",
              borderRadius: "1vw",
              padding: "2.2vh 1.6vw",
            }}
          >
            <div
              style={{ fontSize: "1.85vw", fontWeight: 600, color: "#1a1a2e" }}
            >
              If higher risk
            </div>
            <p
              style={{
                fontSize: "1.5vw",
                color: "#4a4a68",
                margin: "0.8vh 0 0 0",
                lineHeight: 1.4,
              }}
            >
              Some pregnancies need a more detailed anatomy scan or additional
              fetal assessment based on age, diabetes, multiples, prior results,
              or a suspected fetal abnormality.
            </p>
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
        <div
          style={{
            fontSize: "2.2vw",
            fontWeight: 500,
            color: "#ffffff",
            letterSpacing: "0.05em",
          }}
        >
          Pregnancy AI Assistant
        </div>
        <div
          style={{
            fontSize: "2.2vw",
            fontWeight: 500,
            color: "#ffffff",
            opacity: 0.8,
          }}
        >
          11
        </div>
      </div>
    </div>
  );
}
