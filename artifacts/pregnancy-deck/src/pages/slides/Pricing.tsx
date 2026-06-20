export default function Pricing() {
  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{ backgroundColor: "#fbfcfc", fontFamily: "'Inter', sans-serif" }}
    >
      <div
        style={{
          position: "absolute",
          top: "-28vh",
          left: "-14vw",
          width: "46vw",
          height: "46vw",
          borderRadius: "50%",
          border: "0.2vw solid #2a7b7b",
          opacity: 0.12,
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
          03 · PRICING
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
          Free to start, $19.99 to go unlimited
        </h2>

        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            marginTop: "5vh",
            gap: "4vw",
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: "2.2vw",
                fontWeight: 700,
                color: "#4a4a68",
                letterSpacing: "0.14em",
              }}
            >
              FREE TIER
            </div>
            <div
              style={{
                fontSize: "12vw",
                fontWeight: 800,
                color: "#1a1a2e",
                lineHeight: 1,
                letterSpacing: "-0.03em",
                marginTop: "1vh",
              }}
            >
              5
            </div>
            <div
              style={{
                fontSize: "3vw",
                fontWeight: 500,
                color: "#4a4a68",
                marginTop: "1.5vh",
              }}
            >
              AI questions per week
            </div>
          </div>

          <div style={{ width: "0.15vw", backgroundColor: "#e2e8f0" }} />

          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: "2.2vw",
                fontWeight: 700,
                color: "#2a7b7b",
                letterSpacing: "0.14em",
              }}
            >
              FULL PREGNANCY PASS
            </div>
            <div
              style={{
                fontSize: "12vw",
                fontWeight: 800,
                color: "#2a7b7b",
                lineHeight: 1,
                letterSpacing: "-0.03em",
                marginTop: "1vh",
              }}
            >
              $19.99
            </div>
            <div
              style={{
                fontSize: "3vw",
                fontWeight: 500,
                color: "#4a4a68",
                marginTop: "1.5vh",
                lineHeight: 1.35,
              }}
            >
              One-time · unlimited AI · no subscription
            </div>
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
          04
        </div>
      </div>
    </div>
  );
}
