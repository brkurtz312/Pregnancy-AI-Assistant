export default function Title() {
  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{ backgroundColor: "#fbfcfc", fontFamily: "'Inter', sans-serif" }}
    >
      <div
        style={{
          position: "absolute",
          top: "-24vh",
          right: "-13vw",
          width: "56vw",
          height: "56vw",
          borderRadius: "50%",
          border: "0.2vw solid #2a7b7b",
          opacity: 0.18,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "9vh",
          left: "8vw",
          fontSize: "2.2vw",
          fontWeight: 700,
          color: "#2a7b7b",
          letterSpacing: "0.2em",
        }}
      >
        PROJECT SHOWCASE
      </div>

      <div
        style={{
          padding: "8vh 8vw",
          height: "90vh",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div style={{ position: "relative", zIndex: 1, maxWidth: "84vw" }}>
          <h1
            style={{
              fontSize: "7vw",
              fontWeight: 700,
              color: "#1a1a2e",
              margin: 0,
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
            }}
          >
            Pregnancy AI Assistant
          </h1>
          <div style={{ display: "flex", alignItems: "flex-start", marginTop: "5vh" }}>
            <div
              style={{
                width: "5vw",
                height: "0.5vh",
                backgroundColor: "#2a7b7b",
                marginRight: "2vw",
                marginTop: "2.4vh",
                flexShrink: 0,
              }}
            />
            <p
              style={{
                fontSize: "3vw",
                fontWeight: 400,
                color: "#4a4a68",
                margin: 0,
                maxWidth: "62vw",
                lineHeight: 1.45,
              }}
            >
              A cross-platform pregnancy companion — AI guidance on web and iOS,
              backed by one shared account.
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
        <div style={{ fontSize: "2.2vw", fontWeight: 500, color: "#ffffff", letterSpacing: "0.05em" }}>
          Pregnancy AI Assistant
        </div>
        <div style={{ fontSize: "2.2vw", fontWeight: 500, color: "#ffffff", opacity: 0.8 }}>
          Portfolio · 2026
        </div>
      </div>
    </div>
  );
}
