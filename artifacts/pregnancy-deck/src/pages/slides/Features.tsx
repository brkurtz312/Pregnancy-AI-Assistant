export default function Features() {
  const cards = [
    { n: "01", title: "Tracking", body: "Week-by-week due-date tracking." },
    {
      n: "02",
      title: "AI assistant",
      body: "Plain-language pregnancy answers.",
    },
    { n: "03", title: "Safety first", body: "Always: consult your clinician." },
  ];

  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{ backgroundColor: "#fbfcfc", fontFamily: "'Inter', sans-serif" }}
    >
      <div
        style={{
          position: "absolute",
          bottom: "4vh",
          left: "-16vw",
          width: "40vw",
          height: "40vw",
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
          02 · FEATURES
        </div>
        <h2
          style={{
            fontSize: "4.2vw",
            fontWeight: 700,
            color: "#1a1a2e",
            margin: "1.6vh 0 0 0",
            lineHeight: 1.05,
            letterSpacing: "-0.015em",
          }}
        >
          What it does
        </h2>

        <div style={{ display: "flex", gap: "2.6vw", marginTop: "4vh" }}>
          {cards.map((c) => (
            <div
              key={c.n}
              style={{
                flex: 1,
                backgroundColor: "#f5f8f8",
                borderRadius: "1vw",
                padding: "3.4vh 2vw",
                boxSizing: "border-box",
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
                  fontSize: "2.4vw",
                  fontWeight: 700,
                  color: "#ffffff",
                }}
              >
                {c.n}
              </div>
              <div
                style={{
                  fontSize: "3vw",
                  fontWeight: 600,
                  color: "#1a1a2e",
                  marginTop: "2.4vh",
                }}
              >
                {c.title}
              </div>
              <p
                style={{
                  fontSize: "3vw",
                  fontWeight: 400,
                  color: "#4a4a68",
                  margin: "1.4vh 0 0 0",
                  lineHeight: 1.35,
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
          03
        </div>
      </div>
    </div>
  );
}
