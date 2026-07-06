export default function PrenatalTestingIntro() {
  const cards = [
    {
      n: "01",
      title: "What testing does",
      body: "Checks health, finds common problems early, and helps guide safe care for mother and baby.",
    },
    {
      n: "02",
      title: "When it happens",
      body: "Some tests are routine for most pregnancies, while others are offered only when history, symptoms, or earlier results call for more evaluation.",
    },
    {
      n: "03",
      title: "Why timing matters",
      body: "Many prenatal tests are most helpful during certain weeks, so accurate dating helps place each test at the right time.",
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
          top: "-10vw",
          right: "-8vw",
          width: "28vw",
          height: "28vw",
          borderRadius: "50%",
          backgroundColor: "#2a7b7b",
          opacity: 0.08,
        }}
      />

      <div
        style={{
          position: "absolute",
          bottom: "10vh",
          left: "-14vw",
          width: "34vw",
          height: "34vw",
          borderRadius: "50%",
          border: "0.2vw solid #2a7b7b",
          opacity: 0.1,
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
          09 · PRENATAL TESTING
        </div>

        <h2
          style={{
            fontSize: "4vw",
            fontWeight: 700,
            color: "#1a1a2e",
            margin: "1.4vh 0 0 0",
            lineHeight: 1.05,
            letterSpacing: "-0.015em",
            maxWidth: "70vw",
          }}
        >
          A simple guide to what testing is done during pregnancy and why it matters
        </h2>

        <p
          style={{
            fontSize: "2.1vw",
            color: "#4a4a68",
            margin: "2.2vh 0 0 0",
            lineHeight: 1.45,
            maxWidth: "72vw",
          }}
        >
          Prenatal testing helps watch over both patient and baby throughout pregnancy. Most tests are done to provide reassurance, identify common concerns early, and guide safe pregnancy and delivery planning.
        </p>

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
                minHeight: "34vh",
              }}
            >
              <div
                style={{
                  width: "4vw",
                  height: "4vw",
                  borderRadius: "0.9vw",
                  backgroundColor: "#2a7b7b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "2.2vw",
                  fontWeight: 700,
                  color: "#ffffff",
                }}
              >
                {c.n}
              </div>

              <div
                style={{
                  fontSize: "2.2vw",
                  fontWeight: 600,
                  color: "#1a1a2e",
                  marginTop: "2.1vh",
                  lineHeight: 1.15,
                }}
              >
                {c.title}
              </div>

              <p
                style={{
                  fontSize: "1.7vw",
                  fontWeight: 400,
                  color: "#4a4a68",
                  margin: "1.3vh 0 0 0",
                  lineHeight: 1.4,
                }}
              >
                {c.body}
              </p>
            </div>
          ))}
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
          09
        </div>
      </div>
    </div>
  );
}
