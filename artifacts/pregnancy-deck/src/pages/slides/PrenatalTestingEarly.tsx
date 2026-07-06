export default function PrenatalTestingEarly() {
  const cards = [
    {
      title: "Before 8 weeks",
      body: "Pregnancy confirmation and, when needed, an ultrasound help confirm viability and establish an accurate due date so later testing is timed correctly.",
    },
    {
      title: "8–12 weeks",
      body: "Early prenatal labs commonly include CBC, blood type and Rh, antibody screen, HIV, hepatitis B and C, syphilis, rubella, varicella, urine culture, and gonorrhea/chlamydia testing.",
    },
    {
      title: "After 9 weeks",
      body: "Optional genetic screening may include cell-free DNA testing for common chromosomal conditions and carrier screening for inherited disorders.",
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
          top: "8vh",
          right: "-10vw",
          width: "24vw",
          height: "24vw",
          borderRadius: "50%",
          border: "0.2vw solid #2a7b7b",
          opacity: 0.1,
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
          10 · EARLY PREGNANCY
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
          The first trimester focuses on dating, baseline labs, and screening
          choices
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
                minHeight: "39vh",
              }}
            >
              <div
                style={{
                  fontSize: "1.5vw",
                  fontWeight: 700,
                  color: "#2a7b7b",
                  letterSpacing: "0.12em",
                }}
              >
                0{index + 1}
              </div>

              <div
                style={{
                  fontSize: "2.25vw",
                  fontWeight: 600,
                  color: "#1a1a2e",
                  marginTop: "1.2vh",
                  lineHeight: 1.12,
                }}
              >
                {c.title}
              </div>

              <p
                style={{
                  fontSize: "1.68vw",
                  fontWeight: 400,
                  color: "#4a4a68",
                  margin: "1.6vh 0 0 0",
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
            marginTop: "3.2vh",
            backgroundColor: "#eef5f5",
            borderLeft: "0.45vw solid #2a7b7b",
            borderRadius: "0.9vw",
            padding: "2.2vh 1.6vw",
          }}
        >
          <div
            style={{
              fontSize: "1.9vw",
              fontWeight: 600,
              color: "#1a1a2e",
            }}
          >
            Also considered early when indicated
          </div>
          <p
            style={{
              fontSize: "1.55vw",
              color: "#4a4a68",
              margin: "0.8vh 0 0 0",
              lineHeight: 1.4,
            }}
          >
            Some patients may also need cervical cancer screening, hemoglobin
            A1C for possible pregestational diabetes, thyroid testing, TB
            screening, or baseline preeclampsia-related labs depending on
            history and risk factors.
          </p>
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
          10
        </div>
      </div>
    </div>
  );
}
