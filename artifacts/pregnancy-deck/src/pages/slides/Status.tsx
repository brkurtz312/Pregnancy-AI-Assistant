export default function Status() {
  const items = [
    "Backend published — reconcile flow live in production",
    "iOS build delivered to TestFlight via EAS",
    "App Store submission underway",
  ];

  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{ backgroundColor: "#fbfcfc", fontFamily: "'Inter', sans-serif" }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -55%)",
          width: "60vw",
          height: "60vw",
          borderRadius: "50%",
          border: "0.2vw solid #2a7b7b",
          opacity: 0.1,
        }}
      />

      <div
        style={{
          padding: "7vh 8vw 10vh 8vw",
          height: "90vh",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ width: "5vw", height: "0.5vh", backgroundColor: "#2a7b7b", marginBottom: "3vh" }} />
        <h2
          style={{
            fontSize: "5vw",
            fontWeight: 700,
            color: "#1a1a2e",
            margin: 0,
            lineHeight: 1.04,
            letterSpacing: "-0.02em",
          }}
        >
          Where it stands
        </h2>
        <p style={{ fontSize: "3vw", fontWeight: 400, color: "#4a4a68", margin: "2.4vh 0 0 0", lineHeight: 1.4, maxWidth: "62vw" }}>
          Live in production and on its way to the App Store.
        </p>

        <div style={{ marginTop: "5vh", width: "70vw" }}>
          {items.map((text, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                textAlign: "left",
                marginBottom: i < items.length - 1 ? "2.6vh" : 0,
              }}
            >
              <div
                style={{
                  width: "3.4vw",
                  height: "3.4vw",
                  borderRadius: "50%",
                  backgroundColor: "#2a7b7b",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "2.2vw",
                  fontWeight: 700,
                  flexShrink: 0,
                  marginRight: "1.8vw",
                }}
              >
                ✓
              </div>
              <span style={{ fontSize: "3vw", fontWeight: 500, color: "#1a1a2e", lineHeight: 1.3 }}>
                {text}
              </span>
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
        <div style={{ fontSize: "2.2vw", fontWeight: 500, color: "#ffffff", opacity: 0.8 }}>08</div>
      </div>
    </div>
  );
}
