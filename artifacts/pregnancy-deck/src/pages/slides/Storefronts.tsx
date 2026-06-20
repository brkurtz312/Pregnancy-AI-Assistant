export default function Storefronts() {
  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{ backgroundColor: "#fbfcfc", fontFamily: "'Inter', sans-serif" }}
    >
      <div
        style={{
          position: "absolute",
          top: "-30vh",
          right: "-16vw",
          width: "46vw",
          height: "46vw",
          borderRadius: "50%",
          border: "0.2vw solid #2a7b7b",
          opacity: 0.12,
        }}
      />

      <div style={{ padding: "7vh 8vw", height: "90vh", boxSizing: "border-box" }}>
        <div style={{ fontSize: "2.2vw", fontWeight: 700, color: "#2a7b7b", letterSpacing: "0.16em" }}>
          04 · MONETIZATION
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
          Two storefronts, one pass
        </h2>

        <div style={{ display: "flex", gap: "4vw", marginTop: "4.5vh" }}>
          <div
            style={{
              flex: 1,
              backgroundColor: "#f5f8f8",
              borderRadius: "1vw",
              padding: "3.4vh 2.4vw",
              boxSizing: "border-box",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "2.2vw", fontWeight: 700, color: "#2a7b7b", letterSpacing: "0.14em" }}>
              STRIPE
            </div>
            <div style={{ fontSize: "3vw", fontWeight: 600, color: "#1a1a2e", marginTop: "1.2vh" }}>
              Web checkout
            </div>
            <p style={{ fontSize: "3vw", fontWeight: 400, color: "#4a4a68", margin: "1.2vh 0 0 0", lineHeight: 1.35 }}>
              Pay by card in-browser.
            </p>
          </div>

          <div
            style={{
              flex: 1,
              backgroundColor: "#f5f8f8",
              borderRadius: "1vw",
              padding: "3.4vh 2.4vw",
              boxSizing: "border-box",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "2.2vw", fontWeight: 700, color: "#2a7b7b", letterSpacing: "0.14em" }}>
              REVENUECAT
            </div>
            <div style={{ fontSize: "3vw", fontWeight: 600, color: "#1a1a2e", marginTop: "1.2vh" }}>
              iOS in-app purchase
            </div>
            <p style={{ fontSize: "3vw", fontWeight: 400, color: "#4a4a68", margin: "1.2vh 0 0 0", lineHeight: 1.35 }}>
              App Store billing.
            </p>
          </div>
        </div>

        <div style={{ textAlign: "center", fontSize: "3.4vw", fontWeight: 700, color: "#2a7b7b", marginTop: "2.6vh", lineHeight: 1 }}>
          ↓
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginTop: "2.2vh" }}>
          <div
            style={{
              backgroundColor: "#2a7b7b",
              borderRadius: "999px",
              padding: "2.6vh 4vw",
              boxSizing: "border-box",
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: "3vw", fontWeight: 600, color: "#ffffff" }}>
              Full Pregnancy Pass — one unlock for both
            </span>
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
        <div style={{ fontSize: "2.2vw", fontWeight: 500, color: "#ffffff", opacity: 0.8 }}>05</div>
      </div>
    </div>
  );
}
