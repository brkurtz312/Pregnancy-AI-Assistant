export default function Platforms() {
  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{ backgroundColor: "#fbfcfc", fontFamily: "'Inter', sans-serif" }}
    >
      <div
        style={{
          position: "absolute",
          top: "-30vh",
          right: "-18vw",
          width: "48vw",
          height: "48vw",
          borderRadius: "50%",
          border: "0.2vw solid #2a7b7b",
          opacity: 0.12,
        }}
      />

      <div style={{ padding: "7vh 8vw", height: "90vh", boxSizing: "border-box" }}>
        <div style={{ fontSize: "2.2vw", fontWeight: 700, color: "#2a7b7b", letterSpacing: "0.16em" }}>
          01 · OVERVIEW
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
          One product, two platforms
        </h2>

        <div style={{ display: "flex", gap: "3vw", marginTop: "4vh" }}>
          <div
            style={{
              flex: 1,
              backgroundColor: "#f5f8f8",
              borderRadius: "1vw",
              padding: "3.4vh 2.4vw",
              boxSizing: "border-box",
            }}
          >
            <div style={{ fontSize: "2.2vw", fontWeight: 700, color: "#2a7b7b", letterSpacing: "0.14em" }}>
              WEB
            </div>
            <div style={{ fontSize: "3.2vw", fontWeight: 600, color: "#1a1a2e", marginTop: "1.4vh" }}>
              React + Vite
            </div>
            <p style={{ fontSize: "3vw", fontWeight: 400, color: "#4a4a68", margin: "1.6vh 0 0 0", lineHeight: 1.4 }}>
              Runs in any browser — desktop or mobile.
            </p>
          </div>

          <div
            style={{
              flex: 1,
              backgroundColor: "#f5f8f8",
              borderRadius: "1vw",
              padding: "3.4vh 2.4vw",
              boxSizing: "border-box",
            }}
          >
            <div style={{ fontSize: "2.2vw", fontWeight: 700, color: "#2a7b7b", letterSpacing: "0.14em" }}>
              iOS
            </div>
            <div style={{ fontSize: "3.2vw", fontWeight: 600, color: "#1a1a2e", marginTop: "1.4vh" }}>
              Expo / React Native
            </div>
            <p style={{ fontSize: "3vw", fontWeight: 400, color: "#4a4a68", margin: "1.6vh 0 0 0", lineHeight: 1.4 }}>
              Native iPhone app via the App Store.
            </p>
          </div>
        </div>

        <div
          style={{
            marginTop: "4vh",
            backgroundColor: "#2a7b7b",
            borderRadius: "1vw",
            padding: "3.4vh 3vw",
            boxSizing: "border-box",
          }}
        >
          <p style={{ fontSize: "3vw", fontWeight: 500, color: "#ffffff", margin: 0, lineHeight: 1.4 }}>
            One shared account follows the user across web and iOS.
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
        <div style={{ fontSize: "2.2vw", fontWeight: 500, color: "#ffffff", letterSpacing: "0.05em" }}>
          Pregnancy AI Assistant
        </div>
        <div style={{ fontSize: "2.2vw", fontWeight: 500, color: "#ffffff", opacity: 0.8 }}>02</div>
      </div>
    </div>
  );
}
