export default function Stack() {
  const rows = [
    { title: "Monorepo", body: "One shared pnpm workspace." },
    { title: "Backend", body: "Express 5 + Postgres via Drizzle." },
    { title: "Security", body: "Entitlements checked server-side." },
  ];

  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{ backgroundColor: "#fbfcfc", fontFamily: "'Inter', sans-serif" }}
    >
      <div style={{ padding: "7vh 8vw", height: "90vh", boxSizing: "border-box" }}>
        <div style={{ fontSize: "2.2vw", fontWeight: 700, color: "#2a7b7b", letterSpacing: "0.16em" }}>
          06 · ARCHITECTURE
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
          Under the hood
        </h2>

        <div style={{ display: "flex", gap: "5vw", marginTop: "5vh", alignItems: "stretch" }}>
          <div style={{ flex: 1.15 }}>
            {rows.map((r, i) => (
              <div
                key={r.title}
                style={{
                  borderBottom: i < rows.length - 1 ? "0.12vw solid #e2e8f0" : "none",
                  padding: i === 0 ? "0 0 2.2vh 0" : "2.2vh 0",
                }}
              >
                <div style={{ fontSize: "3vw", fontWeight: 600, color: "#1a1a2e" }}>{r.title}</div>
                <p style={{ fontSize: "3vw", fontWeight: 400, color: "#4a4a68", margin: "0.6vh 0 0 0", lineHeight: 1.3 }}>
                  {r.body}
                </p>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1.6vh", justifyContent: "center" }}>
            <div style={{ display: "flex", gap: "1.4vw" }}>
              <div
                style={{
                  flex: 1,
                  backgroundColor: "#2a7b7b",
                  borderRadius: "0.7vw",
                  padding: "2.4vh 1vw",
                  textAlign: "center",
                  fontSize: "2.4vw",
                  fontWeight: 600,
                  color: "#ffffff",
                }}
              >
                Web
              </div>
              <div
                style={{
                  flex: 1,
                  backgroundColor: "#2a7b7b",
                  borderRadius: "0.7vw",
                  padding: "2.4vh 1vw",
                  textAlign: "center",
                  fontSize: "2.4vw",
                  fontWeight: 600,
                  color: "#ffffff",
                }}
              >
                iOS
              </div>
            </div>
            <div
              style={{
                backgroundColor: "#1a1a2e",
                borderRadius: "0.7vw",
                padding: "2.6vh 1vw",
                textAlign: "center",
                fontSize: "2.6vw",
                fontWeight: 600,
                color: "#ffffff",
              }}
            >
              api-server (Express)
            </div>
            <div
              style={{
                backgroundColor: "#f5f8f8",
                border: "0.12vw solid #e2e8f0",
                borderRadius: "0.7vw",
                padding: "2.6vh 1vw",
                textAlign: "center",
                fontSize: "2.4vw",
                fontWeight: 500,
                color: "#4a4a68",
              }}
            >
              lib/* — db · api-spec · client
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
        <div style={{ fontSize: "2.2vw", fontWeight: 500, color: "#ffffff", letterSpacing: "0.05em" }}>
          Pregnancy AI Assistant
        </div>
        <div style={{ fontSize: "2.2vw", fontWeight: 500, color: "#ffffff", opacity: 0.8 }}>07</div>
      </div>
    </div>
  );
}
